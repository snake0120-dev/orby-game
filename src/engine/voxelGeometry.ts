/**
 * 맵 → 지오메트리. 렌더 컴포넌트와 분리해 둔다.
 *
 * 배경 구조물(BackdropProp)도 같은 함수로 짓는다. 한 곳에서만 형태를 만들어야
 * 앞 무대와 배경의 생김새가 어긋나지 않는다.
 */
import * as THREE from 'three';
import { VOXEL } from '../theme';
import { isSolid, isWalkable, type StairShape, type VoxelMap } from './voxelMap';

/** 바깥벽을 자르고 남길 밑동 높이(블록) */
const KEEP_BASE = 3;

/**
 * 모서리 그늘(AO) 네 단계.
 *
 * 복셀 씬이 밋밋해 보이는 가장 큰 이유는 **면과 면이 만나는 자리에 그늘이 없어서**다.
 * 방향광만으로는 같은 방향을 보는 면이 전부 같은 밝기가 되어 형태가 안 읽힌다.
 * 꼭짓점마다 주변 블록 수를 세서 색에 곱해두면, 조명과 무관하게 구석이 어두워지고
 * 덩어리의 부피가 살아난다. Monument Valley 의 면 처리도 결국 이 대비다.
 */
const AO = [0.52, 0.7, 0.86, 1];

/**
 * 정육면체 여섯 면.
 *
 * 각 면은 법선 n 과 접선 두 개(u, v)로 정의한다. `u × v = n` 이 되게 골라두면
 * 네 꼭짓점을 (-u-v, u-v, u+v, -u+v) 순서로 찍는 것만으로 항상 바깥을 향한
 * 반시계 감기가 나온다. 면마다 좌표를 손으로 적으면 한두 개가 반드시 뒤집힌다.
 */
const FACES: { n: THREE.Vector3; u: THREE.Vector3; v: THREE.Vector3 }[] = (
  [
    [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
    [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
    [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
    [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
    [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
    [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
  ] as const
).map(([n, u, v]) => ({
  n: new THREE.Vector3(...n),
  u: new THREE.Vector3(...u),
  v: new THREE.Vector3(...v),
}));

/** 꼭짓점 네 개의 (u, v) 부호 — FACES 의 감기 순서와 같아야 한다 */
const CORNERS: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/**
 * 면을 모으는 그릇 — **보통 배열이 아니라 타입 배열**이다.
 *
 * 2구역이면 꼭짓점이 십팔만 개다. 보통 배열에 `push` 로 쌓으면 그 숫자들이
 * 전부 double 로 들어갔다가 `Float32BufferAttribute` 를 만들 때 한 번 더
 * 통째로 옮겨진다 — 면 굽는 시간의 절반이 거기였다. 처음부터 Float32Array 에
 * 자리로 적고, 모자라면 두 배로 늘린다.
 */
interface Bucket {
  pos: Float32Array;
  nrm: Float32Array;
  col: Float32Array;
  /** 넣은 꼭짓점 수 */
  v: number;
  /** 색 성분 수 — 3(RGB) 또는 4(RGBA, 높이 페이드가 켜졌을 때) */
  cs: number;
}

/** 그릇 초기 크기 (꼭짓점) */
const CHUNK = 8192;

const newBucket = (cs: number): Bucket => ({
  pos: new Float32Array(CHUNK * 3),
  nrm: new Float32Array(CHUNK * 3),
  col: new Float32Array(CHUNK * cs),
  v: 0,
  cs,
});

const grow = (b: Bucket) => {
  if ((b.v + 1) * 3 <= b.pos.length) return;
  const cap = b.pos.length;              // 지금 용량(= 꼭짓점 × 3)
  const pos = new Float32Array(cap * 2); pos.set(b.pos); b.pos = pos;
  const nrm = new Float32Array(cap * 2); nrm.set(b.nrm); b.nrm = nrm;
  const col = new Float32Array(b.col.length * 2); col.set(b.col); b.col = col;
};

/** 꼭짓점 하나를 그릇에 적는다 */
const vertex = (
  b: Bucket,
  px: number, py: number, pz: number,
  nx: number, ny: number, nz: number,
  r: number, g: number, bl: number,
  a: number,
) => {
  grow(b);
  const p = b.v * 3;
  b.pos[p] = px; b.pos[p + 1] = py; b.pos[p + 2] = pz;
  b.nrm[p] = nx; b.nrm[p + 1] = ny; b.nrm[p + 2] = nz;
  const c = b.v * b.cs;
  b.col[c] = r; b.col[c + 1] = g; b.col[c + 2] = bl;
  if (b.cs === 4) b.col[c + 3] = a;
  b.v++;
};

/**
 * 정점 색을 RGB 로 낼지 RGBA 로 낼지.
 * three 는 색 속성의 성분이 4개면 알아서 정점 알파를 켠다. 페이드가 없을 때는
 * 3개로 두어 버퍼를 낭비하지 않는다.
 */
type Alpha = ((y: number) => number) | null;

/**
 * 빛나는 블록 한 **색**의 메시.
 *
 * 색마다 따로 내는 이유: three 의 `emissive` 는 재질 하나에 **색 하나**다.
 * 전부 한 덩어리로 묶고 흰 `emissive` 를 걸면 주황 전구든 파란 전구든
 * 전부 하얗게 타오른다 — 실제로 그랬다. 색이 몇 가지 안 되므로
 * (맵 하나에 보통 두셋) 그만큼만 나눠 그린다.
 */
export interface GlowPart {
  /** 팔레트에 적힌 블록 이름 — 어떤 빛인지 구분할 때 쓴다 */
  name: string;
  /** 블록 본래 색 — 이게 그대로 `emissive` 가 된다 */
  color: string;
  geometry: THREE.BufferGeometry;
}

export interface BuiltGeometry {
  opaque: THREE.BufferGeometry | null;
  glass: THREE.BufferGeometry | null;
  glows: GlowPart[];
  /**
   * **천장** (`Stage.ceiling` 위). 따로 내는 이유는 하나다 —
   * 이것만 **그림자를 안 드리우게** 하려고. 천장이 방향광을 막으면 홀이
   * 통째로 깜깜해진다. 아이소에서는 아예 안 만든다(가려서 못 보니까).
   */
  roof: THREE.BufferGeometry | null;
  /** 칸마다 "이 y 부터는 안 그렸다" — 블록 붓의 조준선이 쓴다 (`drawnTop.ts`) */
  cutAt: Int32Array;
}

/**
 * 블록 색을 물들이는 함수.
 *
 * 두 번째 인자는 그 블록의 **높이(블록 단위)** 다. 높이에 따라 색을 바꾸면
 * 개체마다 위아래로 흐르는 그라디언트가 생긴다 — 2구역 미리보기 그림의 색이
 * 단색이 아니라 전부 그라디언트라 넣었다 (`tuneStore.makeTint`).
 */
export type Tint = (c: THREE.Color, y: number) => void;

/**
 * 맵 → 지오메트리 세 벌. 배경 구조물도 같은 함수를 쓴다.
 *
 * `tint` 를 주면 색을 낼 때마다 한 번씩 통과시킨다. 배경에 공기 원근법을
 * 걸 때, 그리고 높이 그라디언트를 걸 때 쓴다 — 같은 코드로 짓고 색만 바꾸면
 * 되니 형태가 어긋날 일이 없다.
 */
/**
 * 높이에 따라 투명해지는 설정.
 *
 * 구조물 밑동을 배경에 녹여 "떠 있는 섬"처럼 보이게 할 때 쓴다. 바닥은 완전히
 * 투명하고 `top` 높이부터 완전히 불투명해진다.
 */
export interface HeightFade {
  /** 이 높이(블록)부터 불투명 */
  top: number;
  /** 0 이면 안 걸린다, 1 이면 바닥이 완전히 투명 */
  strength: number;
}

/**
 * 직접 칠하기 — 마인크래프트 블록 색을 **덮어쓴다.**
 *
 * `tint` 가 원래 색을 물들이는 것이라면 이쪽은 아예 다른 색으로 바꾼다.
 * 꼭짓점마다 한 번씩 불리며, **면 법선과 그 꼭짓점의 높이**를 같이 받는다.
 * 아이소 화면에는 한 블록의 세 면(윗면 +Y · 왼쪽 +Z · 오른쪽 +X)만 보이므로,
 * 법선을 넘겨주면 조명 없이도 면마다 다른 색을 칠해 입체를 세울 수 있다.
 * 높이를 넘겨주면 위아래로 흐르는 그라디언트가 된다.
 *
 * 반환하지 않고 `out` 을 채운다 — 꼭짓점 수십만 개를 도는 자리라
 * 매번 새 Color 를 만들면 그만큼 쓰레기가 쌓인다.
 *
 * **불투명 블록에만 걸린다.** 유리와 발광 블록은 원래 색 그대로 둔다 —
 * 창을 벽 색으로 칠해버리면 창이 창으로 안 읽히고, 조명 블록은 빛의 색이다.
 */
export type PaintFn = (
  out: THREE.Color,
  nx: number,
  ny: number,
  nz: number,
  /** 이 꼭짓점의 월드 높이 (개체 기준, 축척 적용 전) */
  worldY: number,
) => void;

export function buildGeometry(
  map: VoxelMap,
  cutMin?: number,
  tint?: Tint,
  fade?: HeightFade,
  paint?: PaintFn,
  /** 아래를 보는 면도 만들 것인가 — 1인칭처럼 **밑에서 올려다보는** 시점용 */
  keepDown = false,
  /** 천장이 시작하는 높이 (`Stage.ceiling`). 이 위는 `roof` 로 따로 나간다. */
  ceiling?: number,
  /** 천장을 **아예 안 만들 것인가** — 위에서 내려다보는 아이소용 */
  hideCeiling = false,
): BuiltGeometry {
  return build(map, cutMin, tint, fade, paint, keepDown, ceiling, hideCeiling);
}

function build(
  map: VoxelMap,
  cutMin?: number,
  tint?: Tint,
  fade?: HeightFade,
  paint?: PaintFn,
  keepDown = false,
  ceiling?: number,
  hideCeiling = false,
) {
  const { w, h, d, cells, colors, translucent, emissive, stairs } = map;
  const keepBase = cutMin ?? KEEP_BASE;

  const inside = (x: number, y: number, z: number) =>
    x >= 0 && y >= 0 && z >= 0 && x < w && y < h && z < d;
  const at = (x: number, y: number, z: number) =>
    inside(x, y, z) ? cells[x * h * d + y * d + z] : -1;
  const drawn = (v: number) => v >= 0 && colors[v] !== null;

  /* ── 근경 절단: 컬럼마다 "이 높이부터 숨긴다" ──────────── */

  let footY = 1;
  for (let i = 0; i < map.walkY.length; i++) {
    if (map.walkY[i] >= 0) { footY = map.walkY[i]; break; }
  }

  /**
   * 카메라 쪽으로 한 칸씩 나아가 보고, 걸을 수 있는 바닥을 만나면 **실내**다.
   * 높이로 판별하면 카운터 위에 물건 하나 올렸을 때 카운터째 잘린다.
   *
   * **바닥 판이 끊기면 거기서 멈춘다.** 안 멈추면, 방 밖으로 뻗어 나간 통로가
   * 비스듬한 선에 걸려서 "저쪽에 걸을 수 있는 데가 있으니 실내"로 읽힌다 —
   * 2구역에서 앞벽 스물다섯 칸이 안 잘리고 홀을 가렸다. 방에 속한 칸인지는
   * 발 밑에 바닥 판이 있는지로 본다.
   */
  /** 발 밑에 바닥 판이 깔린 칸 — "이 방에 속한다"는 뜻 */
  const onFloor = (x: number, z: number) => isSolid(map, x, footY - 1, z);

  const isOuterShell = (x: number, z: number): boolean => {
    for (let k = 1; ; k++) {
      const nx = x + k, nz = z + k;
      if (nx >= w || nz >= d) return true;
      /* 바닥 판이 끊기면 거기서 멈춘다. **모서리를 비집고 지나가는 것도**
         끊긴 것으로 친다 — 옆 두 칸까지 같이 보는 이유다. 안 그러면 방 밖으로
         뻗어 나간 통로가 비스듬한 선에 걸려서 "저쪽에 걸을 데가 있으니 실내"로
         읽힌다. 2구역에서 통로 어귀의 앞벽이 그래서 안 잘리고 홀을 가렸다. */
      if (!onFloor(nx, nz) || !onFloor(nx - 1, nz) || !onFloor(nx, nz - 1)) return true;
      if (isWalkable(map, nx, nz)) return false;
    }
  };

  /* 천장은 **위에서 보는 눈에만** 안 보이면 된다 (`Stage.ceiling`).
     아이소는 35° 에서 내려다보므로 천장을 덮으면 방 안이 통째로 가린다.
     1인칭에서는 이 값을 안 넘겨서 천장이 그대로 있다 (`VoxelGrid`). */
  const cutAt = new Int32Array(w * d).fill(hideCeiling ? Math.min(ceiling ?? h, h) : h);
  if (keepBase < h) {
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        /* **걸을 수 있는 칸은 벽이 아니다.** 이 줄이 없으면 2구역의 유리 통로가
           통째로 잘린다 — 통로는 한 축으로만 뻗어서, 카메라 쪽으로 비스듬히
           나아가 보면 통로를 벗어나 맵 밖으로 나가 버린다(= 바깥벽으로 읽힌다). */
        if (isWalkable(map, x, z)) continue;
        if (!isOuterShell(x, z)) continue;
        for (let t = keepBase; t < h; t++) {
          if (isWalkable(map, x - t, z - t)) {
            cutAt[z * w + x] = Math.min(cutAt[z * w + x], footY + t);
            break;
          }
        }
      }
    }
  }
  const cut = (x: number, y: number, z: number) => inside(x, y, z) && y >= cutAt[z * w + x];

  /** AO 계산에서 "빛을 막는" 블록 — 불투명한 것만. 유리는 그늘을 안 만든다. */
  const blocks = (x: number, y: number, z: number): boolean => {
    const v = at(x, y, z);
    return drawn(v) && !translucent[v] && !cut(x, y, z);
  };

  /* ── 면 모으기 ─────────────────────────────────────────── */

  /* 색 성분 수는 빌드 내내 같다 — 높이 페이드가 켜져 있으면 알파가 붙는다 */
  const cs = fade && fade.strength > 0 ? 4 : 3;
  const buf: Record<'opaque' | 'glass' | 'roof', Bucket> = {
    opaque: newBucket(cs),
    glass: newBucket(cs),
    roof: newBucket(cs),
  };
  /** 빛나는 블록은 **종류마다** 따로 모은다 (위 `GlowPart`) */
  const glows = new Map<string, Bucket>();
  const glowBucket = (name: string): Bucket => {
    let b = glows.get(name);
    if (!b) { b = newBucket(cs); glows.set(name, b); }
    return b;
  };
  /** 천장 높이 — 이 위의 블록은 `roof` 주머니로 간다 */
  const roofFrom = ceiling ?? Infinity;

  /** 이 블록이 들어갈 주머니 */
  const bucketFor = (v: number, y: number): Bucket =>
    y >= roofFrom ? buf.roof
      : translucent[v] ? buf.glass
      : emissive[v] ? glowBucket(map.palette[v])
      : buf.opaque;
  const c = new THREE.Color();
  // 칠하기 결과를 받는 그릇. 루프 밖에 한 번만 만든다.
  const pc = new THREE.Color();
  const p = new THREE.Vector3();

  /**
   * 월드 높이 → 알파. 페이드가 꺼져 있으면 null (RGB 로 낸다).
   *
   * **블록 단위가 아니라 꼭짓점 단위**로 받는다. 블록마다 하나의 알파를 주면
   * 한 층 전체가 같은 투명도가 되어 계단처럼 끊겨 보인다. 꼭짓점마다 계산하면
   * 래스터라이저가 면 안쪽을 보간해줘서 한 덩어리로 이어진다.
   */
  const alphaAt: Alpha =
    fade && fade.strength > 0
      ? (worldY: number) => {
          const t = Math.min(1, Math.max(0, worldY / VOXEL / Math.max(fade.top, 0.001)));
          // 선형으로 두면 위쪽이 급하게 불투명해진다. 살짝 눕혀야 자연스럽다.
          const eased = t * t * (3 - 2 * t);
          return 1 - (1 - eased) * fade.strength;
        }
      : null;

  /* ── 같은 줄로 이어지는 면은 **한 장으로 잇는다** ──────────
     칸마다 네모 한 장씩 내면 바닥 75×100 이 7,500 장이 된다. 그런데 그중
     대부분은 **색도 그늘(AO)도 똑같은 한 평면**이라, 이어 붙이면 줄당 한 장이다.

     잇는 방향은 **z 하나뿐**이다(안쪽 고리라 이웃이 바로 옆에 있다). 그리고
     세로(y)로는 **일부러 안 잇는다** — 높이 그라디언트(㉖)와 페이드가 꼭짓점
     높이로 계산되는데, 세로로 이으면 그 사이 값이 직선으로 뭉개진다.
     z 로만 이으면 네 꼭짓점의 높이가 그대로라 **결과가 한 픽셀도 안 바뀐다.**

     이을 수 있는 조건: 같은 블록 · 네 꼭짓점의 AO 가 모두 같음 · z 가 이어짐.
     z 를 보는 면(법선 ±z)은 칸마다 평면이 달라서 애초에 못 잇는다. */
  interface Run { z0: number; z1: number; v: number; s: [number, number, number, number] }
  const pend: (Run | null)[] = FACES.map(() => null);
  const shade: [number, number, number, number] = [0, 0, 0, 0];

  /** 모아 둔 한 줄을 네모 한 장으로 낸다 */
  const flush = (fi: number, x: number, y: number) => {
    const run = pend[fi];
    if (!run) return;
    pend[fi] = null;

    const { n, u, v: fv } = FACES[fi];
    const isGlass = translucent[run.v];
    const target = bucketFor(run.v, y);
    c.set(colors[run.v]!);
    tint?.(c, y);
    // 칠하기는 불투명 블록만 (유리·발광은 원래 색을 지킨다)
    const painted = paint && (target === buf.opaque || target === buf.roof) ? paint : undefined;

    const len = run.z1 - run.z0 + 1;
    const cx = x * VOXEL, cy = y * VOXEL, cz = ((run.z0 + run.z1) / 2) * VOXEL;
    const q: THREE.Vector3[] = [];
    for (const [du, dv] of CORNERS) {
      p.set(0, 0, 0)
        .addScaledVector(u, du)
        .addScaledVector(fv, dv)
        .add(n)
        .multiplyScalar(VOXEL / 2);
      p.z *= len;              // 이은 만큼 늘인다 (법선이 ±z 면 len 은 늘 1이다)
      p.x += cx; p.y += cy; p.z += cz;
      q.push(p.clone());
    }

    for (const i of [0, 1, 2, 0, 2, 3]) {
      // 유리는 AO 를 걸지 않는다 — 투명한 판에 구석 그늘이 생기면 때처럼 보인다
      const k = isGlass ? 1 : run.s[i];
      // 칠하기가 켜져 있으면 블록 색 대신 그 색을 쓴다. AO 는 그대로 곱한다 —
      // 구석 그늘까지 사라지면 덩어리가 종이처럼 납작해진다.
      const vc = painted ? (painted(pc, n.x, n.y, n.z, q[i].y), pc) : c;
      vertex(
        target, q[i].x, q[i].y, q[i].z, n.x, n.y, n.z,
        vc.r * k, vc.g * k, vc.b * k,
        alphaAt ? alphaAt(q[i].y) : 1,   // 꼭짓점 높이로
      );
    }
  };

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      for (let z = 0; z < d; z++) {
        const v = at(x, y, z);
        if (!drawn(v) || cut(x, y, z)) continue;

        const isGlass = translucent[v];

        // ㄴ자 계단은 큐브가 아니다. 상자 두 개로 따로 그린다 (이어 붙이지 않는다).
        const stair = stairs[v];
        if (stair) {
          const target = bucketFor(v, y);
          c.set(colors[v]!);
          tint?.(c, y);
          emitStair(target, c, x, y, z, stair,
            alphaAt, paint && (target === buf.opaque || target === buf.roof) ? paint : undefined, pc);
          continue;
        }

        for (let fi = 0; fi < FACES.length; fi++) {
          const { n, u, v: fv } = FACES[fi];
          /* **아래를 보는 면은 아예 안 만든다.**
             아이소 카메라는 고도 35.264°에서 내려다보는 게 고정이라
             (`IsoCamera.tsx`) −Y 면은 어떤 각도에서도 뒤통수를 보인다. 불투명
             재질은 기본이 앞면만 그리므로 GPU 가 어차피 버리던 삼각형이다 —
             아예 안 만들면 그 몫의 정점·버퍼·AO 계산까지 통째로 빠진다.
             2구역에서 면의 27% 였다.

             **유리는 빼놓는다.** 유리는 양면(`DoubleSide`)이라 위에서 들여다보면
             바닥 안쪽이 보인다. 같이 지우면 유리 상자가 속 빈 껍데기가 된다.

             **1인칭도 빼놓는다**(`keepDown`). 아이 눈높이에서는 지붕 처마나
             심사대 상인방의 밑면을 올려다보게 되는데, 없으면 그 자리에 구멍이
             뚫린 것처럼 보인다 — 실제로 그렇게 보였다. */
          if (n.y < 0 && !isGlass && !keepDown) continue;

          const nx = x + n.x, ny = y + n.y, nz = z + n.z;
          const nv = at(nx, ny, nz);

          if (drawn(nv) && !cut(nx, ny, nz)) {
            const nGlass = translucent[nv];
            if (!nGlass) continue;              // 불투명 이웃이 가린다
            if (nGlass === isGlass) continue;   // 같은 종류 — 이음매를 없앤다
          }

          // 꼭짓점 네 개의 AO. 자리는 줄을 다 모은 뒤에 한 번만 계산한다.
          for (let k = 0; k < 4; k++) {
            const du = CORNERS[k][0], dv = CORNERS[k][1];
            // 이 꼭짓점을 둘러싼 세 칸 (전부 면 바깥쪽, 즉 n 방향으로 한 칸 나가서)
            const s1 = blocks(nx + u.x * du, ny + u.y * du, nz + u.z * du);
            const s2 = blocks(nx + fv.x * dv, ny + fv.y * dv, nz + fv.z * dv);
            const cr = blocks(
              nx + u.x * du + fv.x * dv,
              ny + u.y * du + fv.y * dv,
              nz + u.z * du + fv.z * dv,
            );
            // 양 옆이 다 막히면 구석이라 제일 어둡다 (대각선 칸은 볼 필요도 없다)
            shade[k] = s1 && s2 ? AO[0] : AO[3 - (+s1 + +s2 + +cr)];
          }

          const run = pend[fi];
          if (
            n.z === 0 && run && run.z1 === z - 1 && run.v === v &&
            run.s[0] === shade[0] && run.s[1] === shade[1] &&
            run.s[2] === shade[2] && run.s[3] === shade[3]
          ) {
            run.z1 = z;                     // 앞 칸에 이어 붙인다
            continue;
          }
          flush(fi, x, y);
          pend[fi] = { z0: z, z1: z, v, s: [shade[0], shade[1], shade[2], shade[3]] };
          if (n.z !== 0) flush(fi, x, y);   // z 를 보는 면은 이을 수 없다
        }
      }
      // 줄(x, y)이 끝나면 모아 둔 걸 전부 낸다
      for (let fi = 0; fi < FACES.length; fi++) flush(fi, x, y);
    }
  }

  const toGeometry = (b: Bucket) => {
    if (b.v === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(b.pos.subarray(0, b.v * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(b.nrm.subarray(0, b.v * 3), 3));
    // 성분이 4개면 three 가 정점 알파를 켠다 (재질의 transparent 도 같이 켜야 한다)
    g.setAttribute('color', new THREE.BufferAttribute(b.col.subarray(0, b.v * b.cs), b.cs));
    g.computeBoundingSphere();
    return g;
  };

  return {
    opaque: toGeometry(buf.opaque),
    glass: toGeometry(buf.glass),
    glows: [...glows]
      .map(([name, b]) => ({
        name,
        color: colors[map.palette.indexOf(name)] ?? '#ffffff',
        geometry: toGeometry(b),
      }))
      .filter((g): g is GlowPart => g.geometry !== null),
    roof: toGeometry(buf.roof),
    cutAt,
  };
}

/**
 * ㄴ자 계단 하나를 상자 두 개로 그린다.
 *
 *   아래: 칸 전체를 덮는 반높이 슬래브
 *   위:   솟은 단. 방향 축의 절반만 차지한다
 *
 * 이웃 면을 걸러내지 않고 12면을 전부 낸다. 계단은 맵 전체에서 몇백 개뿐이라
 * 삼각형 몇 천 개가 더 늘어도 무의미하고, 가려지는 면은 깊이 버퍼가 알아서
 * 지운다. 걸러내려 들면 부분 높이 상자마다 예외가 붙어 코드만 복잡해진다.
 */
function emitStair(
  target: Bucket,
  color: THREE.Color,
  x: number,
  y: number,
  z: number,
  s: StairShape,
  alpha: Alpha,
  paint?: PaintFn,
  pc?: THREE.Color,
) {
  const V = VOXEL;
  // 셀의 최소 모서리 (블록 중심 기준으로 반 칸 물러난 자리)
  const ox = x * V - V / 2;
  const oy = y * V - V / 2;
  const oz = z * V - V / 2;

  // 뒤집힌 계단은 꽉 찬 슬래브가 위로 간다
  const slabY0 = s.flipped ? oy + V / 2 : oy;
  const stepY0 = s.flipped ? oy : oy + V / 2;

  // 솟은 단이 붙는 절반
  const half = (min: number) => (s.side === 1 ? min + V / 2 : min);
  const stepX0 = s.axis === 'x' ? half(ox) : ox;
  const stepZ0 = s.axis === 'z' ? half(oz) : oz;
  const stepW = s.axis === 'x' ? V / 2 : V;
  const stepD = s.axis === 'z' ? V / 2 : V;

  // 아래쪽 면은 늘 그늘지고 위쪽은 밝다 — 계단에도 최소한의 입체감을 준다
  emitBox(target, color, ox, slabY0, oz, V, V / 2, V, 0.94, alpha, paint, pc);
  emitBox(target, color, stepX0, stepY0, stepZ0, stepW, V / 2, stepD, 1, alpha, paint, pc);
}

/** 축에 정렬된 상자 하나 (여섯 면 전부) */
function emitBox(
  target: Bucket,
  color: THREE.Color,
  x0: number,
  y0: number,
  z0: number,
  sx: number,
  sy: number,
  sz: number,
  shade: number,
  alpha: Alpha,
  paint?: PaintFn,
  pc?: THREE.Color,
) {
  const x1 = x0 + sx, y1 = y0 + sy, z1 = z0 + sz;
  // [법선, 꼭짓점 넷] — 바깥을 향한 반시계 감기
  const quads: [number[], number[][]][] = [
    [[1, 0, 0], [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]]],
    [[-1, 0, 0], [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]]],
    [[0, 1, 0], [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]]],
    [[0, -1, 0], [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]]],
    [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
    [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
  ];
  for (const [n, q] of quads) {
    // 아랫면은 한 단계 더 어둡게 — 방향광만으로는 밑이 뜬다
    const k = shade * (n[1] < 0 ? 0.78 : 1);
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const vc = paint && pc ? (paint(pc, n[0], n[1], n[2], q[i][1]), pc) : color;
      vertex(
        target, q[i][0], q[i][1], q[i][2], n[0], n[1], n[2],
        vc.r * k, vc.g * k, vc.b * k,
        alpha ? alpha(q[i][1]) : 1,   // 꼭짓점 높이로
      );
    }
  }
}
