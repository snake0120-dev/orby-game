/**
 * 맵 → 지오메트리. 렌더 컴포넌트와 분리해 둔다.
 *
 * 배경 구조물(BackdropProp)도 같은 함수로 짓는다. 한 곳에서만 형태를 만들어야
 * 앞 무대와 배경의 생김새가 어긋나지 않는다.
 */
import * as THREE from 'three';
import { VOXEL } from '../theme';
import { isWalkable, type StairShape, type VoxelMap } from './voxelMap';

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

type Bucket = { pos: number[]; nrm: number[]; col: number[] };

/**
 * 정점 색을 RGB 로 낼지 RGBA 로 낼지.
 * three 는 색 속성의 성분이 4개면 알아서 정점 알파를 켠다. 페이드가 없을 때는
 * 3개로 두어 버퍼를 낭비하지 않는다.
 */
type Alpha = ((y: number) => number) | null;

export interface BuiltGeometry {
  opaque: THREE.BufferGeometry | null;
  glass: THREE.BufferGeometry | null;
  glow: THREE.BufferGeometry | null;
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
): BuiltGeometry {
  return build(map, cutMin, tint, fade, paint, keepDown);
}

function build(
  map: VoxelMap,
  cutMin?: number,
  tint?: Tint,
  fade?: HeightFade,
  paint?: PaintFn,
  keepDown = false,
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

  // 카메라 쪽으로 나아가 봐서 걸을 수 있는 바닥을 만나면 실내, 맵 밖으로 나가면 바깥벽.
  // 높이로 판별하면 카운터 위에 물건 하나 올렸을 때 카운터째 잘린다.
  const isOuterShell = (x: number, z: number): boolean => {
    for (let k = 1; ; k++) {
      const nx = x + k, nz = z + k;
      if (nx >= w || nz >= d) return true;
      if (isWalkable(map, nx, nz)) return false;
    }
  };

  const cutAt = new Int32Array(w * d).fill(h);
  if (keepBase < h) {
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        if (!isOuterShell(x, z)) continue;
        for (let t = keepBase; t < h; t++) {
          if (isWalkable(map, x - t, z - t)) { cutAt[z * w + x] = footY + t; break; }
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

  const buf: Record<'opaque' | 'glass' | 'glow', Bucket> = {
    opaque: { pos: [], nrm: [], col: [] },
    glass: { pos: [], nrm: [], col: [] },
    glow: { pos: [], nrm: [], col: [] },
  };
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

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      for (let z = 0; z < d; z++) {
        const v = at(x, y, z);
        if (!drawn(v) || cut(x, y, z)) continue;

        const isGlass = translucent[v];
        const target = isGlass ? buf.glass : emissive[v] ? buf.glow : buf.opaque;
        c.set(colors[v]!);
        tint?.(c, y);

        // 칠하기는 불투명 블록만 (유리·발광은 원래 색을 지킨다)
        const painted = paint && target === buf.opaque ? paint : undefined;

        // ㄴ자 계단은 큐브가 아니다. 상자 두 개로 따로 그린다.
        const stair = stairs[v];
        if (stair) {
          emitStair(target, c, x, y, z, stair, alphaAt, painted, pc);
          continue;
        }

        for (const { n, u, v: fv } of FACES) {
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

          // 꼭짓점 네 개 + 꼭짓점별 AO
          const q: THREE.Vector3[] = [];
          const shade: number[] = [];
          /* 칸의 월드 좌표는 네 꼭짓점이 같이 쓴다. 안쪽 고리에서 매번
             `new Vector3` 를 만들면 6만 블록짜리 맵에서 수십만 개가 쓰레기가 된다. */
          const cx = x * VOXEL, cy = y * VOXEL, cz = z * VOXEL;
          for (const [du, dv] of CORNERS) {
            p.set(0, 0, 0)
              .addScaledVector(u, du)
              .addScaledVector(fv, dv)
              .add(n)
              .multiplyScalar(VOXEL / 2);
            p.x += cx; p.y += cy; p.z += cz;
            q.push(p.clone());

            // 이 꼭짓점을 둘러싼 세 칸 (전부 면 바깥쪽, 즉 n 방향으로 한 칸 나가서)
            const s1 = blocks(nx + u.x * du, ny + u.y * du, nz + u.z * du);
            const s2 = blocks(nx + fv.x * dv, ny + fv.y * dv, nz + fv.z * dv);
            const cr = blocks(
              nx + u.x * du + fv.x * dv,
              ny + u.y * du + fv.y * dv,
              nz + u.z * du + fv.z * dv,
            );
            // 양 옆이 다 막히면 구석이라 제일 어둡다 (대각선 칸은 볼 필요도 없다)
            shade.push(s1 && s2 ? AO[0] : AO[3 - (+s1 + +s2 + +cr)]);
          }

          // 유리는 AO 를 걸지 않는다 — 투명한 판에 구석 그늘이 생기면 때처럼 보인다
          for (const i of [0, 1, 2, 0, 2, 3]) {
            const k = isGlass ? 1 : shade[i];
            // 칠하기가 켜져 있으면 블록 색 대신 그 색을 쓴다. AO 는 그대로 곱한다 —
            // 구석 그늘까지 사라지면 덩어리가 종이처럼 납작해진다.
            const vc = painted ? (painted(pc, n.x, n.y, n.z, q[i].y), pc) : c;
            target.pos.push(q[i].x, q[i].y, q[i].z);
            target.nrm.push(n.x, n.y, n.z);
            target.col.push(vc.r * k, vc.g * k, vc.b * k);
            if (alphaAt) target.col.push(alphaAt(q[i].y));   // 꼭짓점 높이로
          }
        }
      }
    }
  }

  const toGeometry = (b: Bucket) => {
    if (b.pos.length === 0) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
    // 성분이 4개면 three 가 정점 알파를 켠다 (재질의 transparent 도 같이 켜야 한다)
    const comps = b.col.length / (b.pos.length / 3) >= 4 ? 4 : 3;
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, comps));
    g.computeBoundingSphere();
    return g;
  };

  return {
    opaque: toGeometry(buf.opaque),
    glass: toGeometry(buf.glass),
    glow: toGeometry(buf.glow),
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
      target.pos.push(q[i][0], q[i][1], q[i][2]);
      target.nrm.push(n[0], n[1], n[2]);
      target.col.push(vc.r * k, vc.g * k, vc.b * k);
      if (alpha) target.col.push(alpha(q[i][1]));   // 꼭짓점 높이로
    }
  }
}
