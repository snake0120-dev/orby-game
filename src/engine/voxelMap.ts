import { isEmissive, isTranslucent, lookupBlock, stripNamespace, type BlockRole } from '../game/blocks';
import { VOXEL } from '../theme';

/** 임포터(scripts/import-mcworld.mjs)가 뱉는 JSON 형식 */
interface RawMap {
  source: string;
  structure: string;
  size: [number, number, number];
  palette: string[];
  /** 팔레트별 블록 상태값 (계단 방향 등). 구버전 맵에는 없다. */
  states?: Record<string, string | number>[];
  /** [값, 반복횟수] 쌍. -1 은 빈칸 */
  rle: number[];
  /**
   * 이미 펼쳐 둔 칸. 있으면 `rle` 대신 이걸 쓴다.
   *
   * 2구역 개체 패널이 브라우저에서 바탕 + 개체를 합쳐 넘길 때 쓴다 —
   * 합친 걸 다시 RLE 로 말았다 푸는 건 56만 칸을 두 번 훑는 헛일이다.
   */
  cells?: Int16Array;
}

/**
 * 계단 블록의 생김새.
 *
 * Bedrock 은 계단 방향을 `weirdo_direction` 으로 준다:
 *   0=동(+X) · 1=서(−X) · 2=남(+Z) · 3=북(−Z)
 * 이 방향 **쪽 절반**이 위로 솟은 단이다 (자바의 facing 과 같은 규약).
 * `upside_down_bit` 이 1이면 위아래가 뒤집혀서 꽉 찬 슬래브가 위로 간다.
 */
export interface StairShape {
  /** 솟은 단이 붙는 축과 방향 */
  axis: 'x' | 'z';
  /** +1 이면 축의 큰 쪽, -1 이면 작은 쪽 */
  side: 1 | -1;
  /** 뒤집힌 계단인가 */
  flipped: boolean;
}

export interface VoxelMap {
  /** x, y, z 크기 (블록 수) */
  w: number;
  h: number;
  d: number;

  palette: string[];
  /** [x*h*d + y*d + z] → 팔레트 인덱스, -1 은 빈칸 */
  cells: Int16Array;
  /** 팔레트 인덱스 → 렌더 색. null 이면 그리지 않는다(마커·공기) */
  colors: (string | null)[];
  /** 팔레트 인덱스 → 유리 계열이라 반투명으로 그릴 것인가 */
  translucent: boolean[];
  /** 팔레트 인덱스 → 스스로 빛나는 블록인가 */
  emissive: boolean[];
  /** 팔레트 인덱스 → 계단이면 그 방향, 아니면 null */
  stairs: (StairShape | null)[];

  /** [z*w + x] → 아이가 발을 딛는 y. 못 걸으면 -1 */
  walkY: Int16Array;
  /** [z*w + x] → 관문 칸이면 1 */
  gate: Uint8Array;
  /** 시작 칸 [x, z] */
  spawn: [number, number] | null;
  /** 물건 자리 ①~④ 의 [x, z]. 없으면 null */
  slots: ([number, number] | null)[];

  /**
   * 빛나는 블록이 뭉쳐 있는 덩어리들의 중심 [x, y, z] (블록 좌표).
   *
   * 램프 한 칸마다 광원을 하나씩 두면 등대 하나에 14개가 붙는다. 셰이더가
   * 광원마다 다시 도는 구조라 그대로 두면 프레임이 떨어진다. 붙어 있는 램프는
   * 어차피 하나의 빛 덩어리로 보이므로 **뭉쳐서 하나로 친다.**
   */
  lamps: [number, number, number][];

  /** blocks.ts 표에 없던 블록 이름들 — 콘솔 경고에 쓴다 */
  unknown: string[];
}

const rleDecode = (rle: number[]): Int16Array => {
  let total = 0;
  for (let i = 1; i < rle.length; i += 2) total += rle[i];
  const out = new Int16Array(total);
  let o = 0;
  for (let i = 0; i < rle.length; i += 2) {
    out.fill(rle[i], o, o + rle[i + 1]);
    o += rle[i + 1];
  }
  return out;
};

const SLOT_ROLES: BlockRole[] = ['slot1', 'slot2', 'slot3', 'slot4'];

/** weirdo_direction → 솟은 단이 붙는 쪽 */
const STAIR_DIR: Record<number, { axis: 'x' | 'z'; side: 1 | -1 }> = {
  0: { axis: 'x', side: 1 },   // 동
  1: { axis: 'x', side: -1 },  // 서
  2: { axis: 'z', side: 1 },   // 남
  3: { axis: 'z', side: -1 },  // 북
};

/** 블록 이름 + 상태값 → 계단 모양. 계단이 아니면 null. */
function readStair(
  name: string,
  states?: Record<string, string | number>,
): StairShape | null {
  if (!stripNamespace(name).endsWith('_stairs')) return null;
  // 상태값이 없으면(구버전 맵) 기본 방향으로 둔다 — 통짜 큐브보다는 낫다.
  const dir = STAIR_DIR[Number(states?.weirdo_direction ?? 0)] ?? STAIR_DIR[0];
  return { ...dir, flipped: Number(states?.upside_down_bit ?? 0) === 1 };
}

export function compileVoxelMap(raw: RawMap): VoxelMap {
  const [w, h, d] = raw.size;
  const cells = raw.cells ?? rleDecode(raw.rle);

  const colors: (string | null)[] = [];
  const translucent: boolean[] = [];
  const emissive: boolean[] = [];
  const stairs: (StairShape | null)[] = [];
  const roles: (BlockRole | null)[] = [];
  const unknown: string[] = [];

  raw.palette.forEach((name, i) => {
    const def = lookupBlock(name);
    if (def === null) {
      unknown.push(stripNamespace(name));
      colors[i] = null;   // 모르는 블록은 그리지 않는다 — 경고를 보고 표에 추가하면 된다
      translucent[i] = false;
      emissive[i] = false;
      stairs[i] = null;
      roles[i] = null;
      return;
    }
    colors[i] = def.color ?? null;
    translucent[i] = def.color ? isTranslucent(name) : false;
    emissive[i] = def.color ? isEmissive(name) : false;
    stairs[i] = def.color ? readStair(name, raw.states?.[i]) : null;
    roles[i] = def.role ?? null;
  });

  const walkY = new Int16Array(w * d).fill(-1);
  const gate = new Uint8Array(w * d);
  const slots: ([number, number] | null)[] = [null, null, null, null];
  let spawn: [number, number] | null = null;

  /** 그려지는 블록이 있는 칸. 마커·공기는 없는 것으로 친다(양탄자를 밟고 설 수 있어야 하니까). */
  const solidAt = (x: number, y: number, z: number): boolean => {
    if (x < 0 || y < 0 || z < 0 || x >= w || y >= h || z >= d) return false;
    const v = cells[x * h * d + y * d + z];
    return v >= 0 && colors[v] !== null;
  };

  // 'walk' 마커(흑요석)가 한 칸이라도 있으면 그 방식을 그대로 쓴다. 없으면 지형에서 뽑는다.
  const hasWalkMarker = roles.some((r, i) => r === 'walk' && cells.includes(i));

  /**
   * 보행 영역을 **지형에서** 뽑는다.
   *
   * 규칙: 각 칸에서 제일 아래 있는 블록 위에 설 수 있으면 걸을 수 있다.
   * 바닥은 한 겹이고 벽·가구는 그 위에 쌓이므로, 벽 밑동은 위가 막혀서 자동으로 빠진다.
   * → 마인크래프트에서 "블록을 깐 곳 전체"가 그대로 보행 영역이 된다.
   *   흑요석을 한 칸씩 깔 필요가 없어지고, 한 칸 빠뜨려 길이 막히는 사고도 사라진다.
   */
  if (!hasWalkMarker) {
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        for (let y = 0; y < h; y++) {
          if (!solidAt(x, y, z)) continue;
          if (!solidAt(x, y + 1, z)) walkY[z * w + x] = y + 1;
          break; // 제일 아래 블록만 본다
        }
      }
    }
  }

  /** 색을 나누지 않은 상호작용 지점들. 아래에서 놓인 순서대로 ①②③④ 가 된다. */
  const propCells: [number, number][] = [];

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      for (let z = 0; z < d; z++) {
        const v = cells[x * h * d + y * d + z];
        if (v < 0) continue;
        const role = roles[v];
        if (!role) continue;
        const flat = z * w + x;

        // 마커는 바닥 **위** 칸에 놓는다 = 아이 발이 닿는 높이.
        // 그래서 y 를 그대로 보행 높이로 쓴다.
        switch (role) {
          case 'walk':
            if (walkY[flat] < 0) walkY[flat] = y;
            break;
          case 'spawn':
            walkY[flat] = y;
            spawn = [x, z];
            break;
          case 'gate':
            walkY[flat] = y;
            gate[flat] = 1;
            break;
          case 'prop':
            propCells.push([x, z]);
            break;
          default: {
            // 물건 자리는 걸을 수 없다. 아이는 옆 칸에 서서 만진다.
            const idx = SLOT_ROLES.indexOf(role);
            if (idx >= 0) slots[idx] = [x, z];
          }
        }
      }
    }
  }

  /* ── 빛 덩어리 찾기 ─────────────────────────────────────
     램프 칸을 모아 일정 크기 격자로 묶고, 묶음마다 평균 위치를 낸다.
     격자를 쓰는 이유는 단순해서다 — 정확한 군집화가 필요할 만큼
     램프가 흩어져 있는 맵은 아직 없다. */
  const CLUSTER = 4;
  const buckets = new Map<string, { x: number; y: number; z: number; n: number }>();
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      for (let z = 0; z < d; z++) {
        const v = cells[x * h * d + y * d + z];
        if (v < 0 || !emissive[v]) continue;
        const key = `${Math.floor(x / CLUSTER)},${Math.floor(y / CLUSTER)},${Math.floor(z / CLUSTER)}`;
        const b = buckets.get(key) ?? { x: 0, y: 0, z: 0, n: 0 };
        b.x += x; b.y += y; b.z += z; b.n++;
        buckets.set(key, b);
      }
    }
  }
  const lamps: [number, number, number][] = [...buckets.values()].map((b) => [
    b.x / b.n, b.y / b.n, b.z / b.n,
  ]);

  // 맵을 위에서 내려다본 읽는 순서(위→아래, 왼쪽→오른쪽)로 번호를 매긴다.
  // 색으로 직접 지정한 자리(구버전)가 이미 있으면 그건 건드리지 않고 빈 번호만 채운다.
  propCells.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const cell of propCells) {
    const free = slots.indexOf(null);
    if (free < 0) break; // 4개를 넘는 건 검사기가 알려준다
    slots[free] = cell;
  }

  return { w, h, d, palette: raw.palette, cells, colors, translucent, emissive, stairs, walkY, gate, spawn, slots, lamps, unknown };
}

export async function loadVoxelMap(file: string): Promise<VoxelMap> {
  // 개발 중에는 캐시를 끊는다. 맵을 다시 임포트했는데 브라우저가 옛 JSON 을
  // 그대로 물고 있으면 "안 바뀌었다"고 한참 헤매게 된다. 전시 빌드에는 안 붙는다.
  const bust = import.meta.env.DEV ? `?t=${Date.now()}` : '';
  const url = `${import.meta.env.BASE_URL}maps/${file}${bust}`;
  const res = await fetch(url, import.meta.env.DEV ? { cache: 'no-store' } : undefined);
  if (!res.ok) {
    throw new Error(
      `맵 파일을 못 찾았습니다: maps/${file}\n` +
        `  .mcworld 를 넣고 'npm run map:import maps/파일.mcworld' 를 돌렸는지 확인하세요.`,
    );
  }
  return compileVoxelMap(await res.json());
}

/* ── 좌표 도우미 ─────────────────────────────────────────── */

export const cellAt = (m: VoxelMap, x: number, y: number, z: number): number =>
  x < 0 || y < 0 || z < 0 || x >= m.w || y >= m.h || z >= m.d
    ? -1
    : m.cells[x * m.h * m.d + y * m.d + z];

/** 그 칸에 뭔가 그려지는 블록이 있는가 (마커는 비어있는 것으로 친다) */
export const isSolid = (m: VoxelMap, x: number, y: number, z: number): boolean => {
  const v = cellAt(m, x, y, z);
  return v >= 0 && m.colors[v] !== null;
};

export const walkYAt = (m: VoxelMap, x: number, z: number): number =>
  x < 0 || z < 0 || x >= m.w || z >= m.d ? -1 : m.walkY[z * m.w + x];

export const isWalkable = (m: VoxelMap, x: number, z: number): boolean =>
  walkYAt(m, x, z) >= 0;

export const isGateCell = (m: VoxelMap, x: number, z: number): boolean =>
  x >= 0 && z >= 0 && x < m.w && z < m.d && m.gate[z * m.w + x] === 1;

/** 그리드 좌표 → 월드 좌표 (블록 중심) */
export const toWorld = (x: number, y: number, z: number): [number, number, number] => [
  x * VOXEL,
  y * VOXEL,
  z * VOXEL,
];

/** 맵 중심의 월드 좌표. 카메라가 바라볼 지점 */
export const mapCenter = (m: VoxelMap): [number, number, number] => [
  ((m.w - 1) / 2) * VOXEL,
  0,
  ((m.d - 1) / 2) * VOXEL,
];
