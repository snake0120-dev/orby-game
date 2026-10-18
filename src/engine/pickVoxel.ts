import type * as THREE from 'three';
import { VOXEL } from '../theme';
import { drawnTop } from './drawnTop';
import type { VoxelMap } from './voxelMap';

/**
 * 광선이 **어느 블록의 어느 면**에 맞는지 찾는다 — 마인크래프트의 조준선과 같은 일.
 *
 * 메시에 광선을 쏘지 **않는다.** 복셀 메시는 면 단위로 추려 한 덩어리로 구워져
 * 있어서(`voxelGeometry.ts`), three.js 가 광선을 맞히려면 삼각형 6만 개를 전부
 * 훑어야 한다 — 마우스를 움직이는 동안 매번 그럴 수는 없다.
 *
 * 대신 **격자를 따라 한 칸씩 걸어간다**(Amanatides–Woo). 지나는 칸 수만큼만
 * 보니까 맵이 커져도 비용이 같고, 맞은 면이 어느 쪽인지(= 마지막으로 넘은 축)가
 * 계산 과정에서 그냥 나온다. 그 면 방향이 곧 **새 블록이 놓일 자리**다.
 *
 * 좌표 규약: 블록 (x,y,z) 의 **중심**이 월드 (x·V, y·V, z·V) 다(`toWorld`).
 * 그래서 격자 단위로 바꿀 때 반 칸을 더해야 블록이 [x, x+1] 구간을 차지한다.
 */
export interface VoxelHit {
  /** 광선이 맞은 블록 */
  cell: [number, number, number];
  /** 맞은 면이 바라보는 쪽 — 축 하나만 ±1. 여기에 새 블록을 놓는다. */
  face: [number, number, number];
}

/**
 * 눈에 **보이는** 블록이 있는 칸.
 *
 * 마커·양탄자(색 없음)는 없는 것으로 친다. 그리고 **화면에서 걷어낸 높이**도
 * 없는 것으로 친다(`drawnTop`) — 아이소는 앞벽과 천장을 안 그리는데, 맵에는
 * 그대로 있어서 안 걸러내면 홀 바닥을 가리켰는데 조준선이 안 보이는 천장에
 * 먼저 맞는다.
 */
const seen = (m: VoxelMap, x: number, y: number, z: number): boolean => {
  if (x < 0 || y < 0 || z < 0 || x >= m.w || y >= m.h || z >= m.d) return false;
  if (y >= drawnTop(x, z)) return false;
  const v = m.cells[x * m.h * m.d + y * m.d + z];
  return v >= 0 && m.colors[v] !== null;
};

/** 한 광선이 지날 수 있는 칸 수 상한 — 맵을 가로지르기에 넉넉하다 */
const MAX_STEPS = 2048;

export function pickVoxel(
  m: VoxelMap,
  origin: THREE.Vector3,
  dir: THREE.Vector3,
): VoxelHit | null {
  const o = [origin.x / VOXEL + 0.5, origin.y / VOXEL + 0.5, origin.z / VOXEL + 0.5];
  const d = [dir.x, dir.y, dir.z];
  const size = [m.w, m.h, m.d];

  /* ① 맵 상자에 들어오는 지점까지 건너뛴다.
     아이소 카메라는 맵 한참 밖에 있어서, 한 칸씩 걸으면 들어오기 전에
     수천 번을 헛디딘다. */
  let t0 = 0;
  let t1 = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-12) {
      if (o[i] < 0 || o[i] > size[i]) return null;
      continue;
    }
    const a = (0 - o[i]) / d[i];
    const b = (size[i] - o[i]) / d[i];
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (t1 < t0) return null;

  const start = t0 + 1e-4;
  const cell = [0, 0, 0];
  const step = [0, 0, 0];
  const tDelta = [0, 0, 0];
  const tMax = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    const p = o[i] + d[i] * start;
    cell[i] = Math.min(size[i] - 1, Math.max(0, Math.floor(p)));
    if (Math.abs(d[i]) < 1e-12) {
      step[i] = 0;
      tDelta[i] = Infinity;
      tMax[i] = Infinity;
      continue;
    }
    step[i] = d[i] > 0 ? 1 : -1;
    tDelta[i] = Math.abs(1 / d[i]);
    const edge = step[i] > 0 ? cell[i] + 1 - p : p - cell[i];
    tMax[i] = start + edge * tDelta[i];
  }

  /* ② 한 칸씩 걷는다. 넘은 축을 기억해 두면 그게 맞은 면이다. */
  let axis = 1;   // 첫 칸부터 차 있는 경우(카메라가 블록 안)엔 위쪽 면으로 둔다
  for (let n = 0; n < MAX_STEPS; n++) {
    if (
      cell[0] < 0 || cell[1] < 0 || cell[2] < 0 ||
      cell[0] >= size[0] || cell[1] >= size[1] || cell[2] >= size[2]
    ) return null;

    if (seen(m, cell[0], cell[1], cell[2])) {
      const face: [number, number, number] = [0, 0, 0];
      face[axis] = -(step[axis] || 1);
      return { cell: [cell[0], cell[1], cell[2]], face };
    }

    axis = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : tMax[1] < tMax[2] ? 1 : 2;
    cell[axis] += step[axis];
    tMax[axis] += tDelta[axis];
  }
  return null;
}
