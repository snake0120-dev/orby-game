import { compileVoxelMap, type VoxelMap } from '../engine/voxelMap';
import type { ZoneSpec } from './spec';

/**
 * 구역 맵을 **개체 단위로** 읽고 다시 합친다.
 *
 * 생성기가 `<구역>-parts.json` 에 **바탕(판)** 과 **개체 목록** 을 따로 담아 둔다.
 * 여기서 둘을 합치면서 패널이 옮긴 만큼 자리를 밀고, 지운 개체는 건너뛴다.
 *
 * 왜 브라우저에서 합치나 — 맵은 한 덩어리로 구워진 복셀이라, 다 구워진 뒤에는
 * "부스 하나만 두 칸 옮기기"가 불가능하다.
 *
 * 2구역용(`src/zone2/parts.ts`)과 **다른 점은 하나** — 양탄자 까는 규칙이다.
 * 2구역은 바닥이 한 층이라 `floorTop` 한 숫자면 됐지만, 3구역은 층이 셋이다.
 */
export interface PartDef {
  id: string;
  no: number;
  kind: string;
  label: string;
  /** 바탕 좌표에서 이 개체가 놓인 자리 (최소 모서리) */
  at: [number, number, number];
  size: [number, number, number];
  rle: number[];
  /** 양탄자를 깔면 안 되는 바닥 칸 (개체 기준 상대 좌표 x0,z0,x1,z1) */
  blocked: [number, number, number, number] | null;
}

/**
 * 걷는 칸을 까는 규칙. **생성기와 글자 그대로 같은 값**을 맵 파일에서 읽는다 —
 * 값이 양쪽에 따로 적혀 있으면 언젠가 어긋나고, 그러면 패널에서 본 것과
 * 여정에서 보는 것이 달라진다.
 */
export interface WalkSpec {
  block: string;
  /** 밟을 수 있는 **바닥** 블록. 이게 없으면 소파·카운터 위까지 양탄자가 깔린다. */
  surfaces: string[];
  /** 층마다 하나씩 — [x0, z0, x1, z1, yMin, yMax] */
  regions: [number, number, number, number, number, number][];
}

export interface PartsFile {
  /** 개체 자리의 지문 — 생성기에 값을 반영하면 바뀐다 */
  stamp: string;
  size: [number, number, number];
  palette: string[];
  walk: WalkSpec;
  spawn: [number, number, number];
  gate: [number, number, number][];
  base: number[];
  parts: PartDef[];
}

/** 개체마다의 편집 — 밀어낸 칸 수와 숨김 여부 */
export interface PartEdit {
  d?: [number, number, number];
  hidden?: boolean;
}
export type Edits = Record<string, PartEdit>;

/** 화면 전체에 걸리는 값 — 비어 있으면 스테이지 파일 값을 그대로 쓴다 */
export interface ViewTune {
  cameraPadding?: number;
  characterScale?: number;
  gradLow?: string;
  gradLowMix?: number;
  gradHigh?: string;
  gradHighMix?: number;
  gradFloor?: number;
  gradSpan?: number;
  /** 카메라를 화면 기준으로 민 거리 (블록) */
  panX?: number;
  panY?: number;
  /** 아이의 1인칭 눈으로 볼 것인가 */
  fpv?: boolean;
  /** 그림자를 드리울 것인가 — 끄면 매 프레임에서 제일 큰 덩어리가 빠진다 (결정 ㉟) */
  shadows?: boolean;
}

/* 풀어 둔 결과를 들고 있는다. 개체를 한 칸 밀 때마다 바탕 65만 칸과 개체 전부를
   다시 푸는 건 그대로 멈칫거림이 된다. */
const cache = new WeakMap<number[], Int16Array>();
const decode = (rle: number[]): Int16Array => {
  let v = cache.get(rle);
  if (!v) { v = rleDecode(rle); cache.set(rle, v); }
  return v;
};

const rleDecode = (rle: number[]): Int16Array => {
  let n = 0;
  for (let i = 1; i < rle.length; i += 2) n += rle[i];
  const out = new Int16Array(n);
  let p = 0;
  for (let i = 0; i < rle.length; i += 2) out.fill(rle[i], p, (p += rle[i + 1]));
  return out;
};

const bare = (n: string) => n.replace('minecraft:', '');

export async function loadParts(spec: ZoneSpec): Promise<PartsFile> {
  const bust = import.meta.env.DEV ? `?t=${Date.now()}` : '';
  const url = `${import.meta.env.BASE_URL}maps/${spec.map}-parts.json${bust}`;
  const res = await fetch(url, import.meta.env.DEV ? { cache: 'no-store' } : undefined);
  if (!res.ok) {
    throw new Error(
      `개체 파일을 못 찾았습니다: maps/${spec.map}-parts.json\n` +
        `  '${spec.generator}' 을 먼저 돌리세요.`,
    );
  }
  return res.json();
}

/** 개체가 지금 놓인 자리 (편집 반영) */
export const placedAt = (p: PartDef, e: Edits): [number, number, number] => {
  const d = e[p.id]?.d ?? [0, 0, 0];
  return [p.at[0] + d[0], p.at[1] + d[1], p.at[2] + d[2]];
};

/**
 * 바탕 + 개체를 합쳐 맵 하나로 만든다.
 *
 * **양탄자는 여기서 다시 깐다.** 생성기가 구워 넣은 걸 그대로 쓰면, 개체를
 * 옮겼을 때 옛 자리에 양탄자가 남고 새 자리는 벽 밑으로 깔려서 길이 엉킨다.
 *
 * 규칙은 생성기(`scripts/lib/zonekit.mjs` 의 `layWalk`)와 같다 —
 * **구역 안에서 제일 위 블록을 찾고, 그게 밟을 수 있는 바닥일 때만** 깐다.
 */
export function compose(spec: ZoneSpec, f: PartsFile, edits: Edits): VoxelMap {
  const [W, H, D] = f.size;
  const idx = (x: number, y: number, z: number) => x * H * D + y * D + z;
  const cells = decode(f.base).slice();   // 바탕은 캐시에서 복사만 한다

  const blocks: [number, number, number, number][] = [];
  for (const p of f.parts) {
    if (edits[p.id]?.hidden) continue;
    const [ax, ay, az] = placedAt(p, edits);
    const buf = decode(p.rle);
    const [sw, sh, sd] = p.size;
    for (let x = 0; x < sw; x++) {
      const wx = ax + x;
      if (wx < 0 || wx >= W) continue;
      for (let y = 0; y < sh; y++) {
        const wy = ay + y;
        if (wy < 0 || wy >= H) continue;
        for (let z = 0; z < sd; z++) {
          const wz = az + z;
          if (wz < 0 || wz >= D) continue;
          const v = buf[x * sh * sd + y * sd + z];
          if (v >= 0) cells[idx(wx, wy, wz)] = v;
        }
      }
    }
    if (p.blocked) {
      blocks.push([ax + p.blocked[0], az + p.blocked[1], ax + p.blocked[2], az + p.blocked[3]]);
    }
  }

  const walkId = f.palette.indexOf(f.walk.block);
  if (walkId >= 0) {
    const ok = new Set(f.walk.surfaces.map(bare));
    for (const [x0, z0, x1, z1, yMin, yMax] of f.walk.regions) {
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++)
        for (let z = Math.max(0, z0); z <= Math.min(D - 1, z1); z++) {
          let top = -1;
          for (let y = Math.min(yMax, H - 2); y >= yMin; y--) if (cells[idx(x, y, z)] >= 0) { top = y; break; }
          if (top < 0) continue;
          if (!ok.has(bare(f.palette[cells[idx(x, top, z)]]))) continue;
          if (cells[idx(x, top + 1, z)] >= 0) continue;
          cells[idx(x, top + 1, z)] = walkId;
        }
    }
    /* 유리로 막힌 안쪽 자리. 양탄자를 그대로 두면 검사기가 "갈 수 없는 칸"으로
       잡는다 — 실제로 못 가는 게 맞으니 걷어낸다. 개체를 옮기면 같이 따라간다. */
    for (const [x0, z0, x1, z1] of blocks)
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++)
        for (let z = Math.max(0, z0); z <= Math.min(D - 1, z1); z++)
          for (let y = 0; y < H; y++)
            if (cells[idx(x, y, z)] === walkId) cells[idx(x, y, z)] = -1;
  }

  const mark = (p: [number, number, number], name: string) => {
    const i = f.palette.indexOf(name);
    if (i >= 0) cells[idx(p[0], p[1], p[2])] = i;
  };
  mark(f.spawn, 'minecraft:lime_carpet');
  for (const g of f.gate) mark(g, 'minecraft:red_carpet');

  return compileVoxelMap({
    source: '(개체 패널)', structure: spec.structure,
    size: f.size, palette: f.palette, rle: [], cells,
  });
}

/**
 * 맞춘 자리를 **프로젝트 폴더의 `<구역>-edits.json` 에 적는다** (개발 서버에서만).
 *
 * 패널 값은 브라우저 저장소에만 남아서, 넘기려면 사람이 복사해 붙여야 했다.
 * 보고 있는 브라우저와 확인용 헤드리스 브라우저는 저장소가 따로라 그 복사를
 * 건너뛸 방법이 없었다 — 파일로 떨어뜨리면 둘 다 같은 걸 본다.
 */
export async function saveToFile(
  spec: ZoneSpec, f: PartsFile, edits: Edits, view: ViewTune,
): Promise<void> {
  const moved = f.parts.map((p) => {
    const e = edits[p.id];
    const d = e?.d ?? [0, 0, 0];
    if (!e || (!e.hidden && !d[0] && !d[1] && !d[2])) return null;
    return {
      id: p.id, label: p.label, kind: p.kind,
      지움: !!e.hidden,
      처음자리: p.at,
      지금자리: placedAt(p, edits),
      민칸: d,
    };
  }).filter(Boolean);

  const res = await fetch(spec.editsRoute, {
    method: 'POST',
    body: JSON.stringify(
      { 적은때: new Date().toISOString(), 지문: f.stamp, 전체뷰: view, 바뀐개체: moved },
      null, 2,
    ),
  });
  if (!res.ok) throw new Error(`저장 실패 (${res.status})`);
}

/** 패널에서 옮긴 자리를 생성기에 붙여 넣을 코드 조각으로 */
export function toSnippet(spec: ZoneSpec, f: PartsFile, edits: Edits): string {
  const lines = [`// 개체 패널에서 옮긴 자리 — ${spec.generator} 쪽 값에 반영하세요`];
  let n = 0;
  for (const p of f.parts) {
    const e = edits[p.id];
    if (!e) continue;
    if (e.hidden) { lines.push(`${p.label}  → 지움`); n++; continue; }
    const d = e.d ?? [0, 0, 0];
    if (!d[0] && !d[1] && !d[2]) continue;
    const a = placedAt(p, edits);
    lines.push(`${p.label}  x ${a[0]} · y ${a[1]} · z ${a[2]}   (${d[0] >= 0 ? '+' : ''}${d[0]}, ${d[1] >= 0 ? '+' : ''}${d[1]}, ${d[2] >= 0 ? '+' : ''}${d[2]})`);
    n++;
  }
  return n ? lines.join('\n') : '바꾼 개체가 없습니다.';
}
