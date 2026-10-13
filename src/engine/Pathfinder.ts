import { isWalkable, walkYAt, type VoxelMap } from './voxelMap';

export type Cell = [number, number];

/** 한 번에 오르내릴 수 있는 높이(블록). 계단·단차가 이 값 이하면 지나간다. */
export const MAX_STEP = 2;

/** 8방향. 대각선은 양옆이 모두 뚫려 있을 때만 허용한다(모서리 관통 방지). */
const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/** 옥타일 거리 — 8방향 이동에서 admissible한 휴리스틱 */
function heuristic(ax: number, az: number, bx: number, bz: number): number {
  const dx = Math.abs(ax - bx);
  const dz = Math.abs(az - bz);
  return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
}

/**
 * 최소 힙. 맵이 마인크래프트 해상도(수천 칸)로 커지면서
 * 선형 탐색 open set 이 O(n²)로 터진다.
 */
class MinHeap {
  private items: number[] = [];
  private keys: Float32Array;

  constructor(capacity: number) {
    this.keys = new Float32Array(capacity);
  }
  get size() { return this.items.length; }

  push(id: number, key: number) {
    this.keys[id] = key;
    this.items.push(id);
    let i = this.items.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[this.items[p]] <= this.keys[this.items[i]]) break;
      [this.items[p], this.items[i]] = [this.items[i], this.items[p]];
      i = p;
    }
  }

  pop(): number {
    const top = this.items[0];
    const last = this.items.pop()!;
    if (this.items.length > 0) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < this.items.length && this.keys[this.items[l]] < this.keys[this.items[m]]) m = l;
        if (r < this.items.length && this.keys[this.items[r]] < this.keys[this.items[m]]) m = r;
        if (m === i) break;
        [this.items[m], this.items[i]] = [this.items[i], this.items[m]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * A*. 경로를 찾으면 시작칸을 제외한 셀 배열을, 못 찾으면 빈 배열을 반환한다.
 */
export function findPath(map: VoxelMap, from: Cell, to: Cell): Cell[] {
  const [sx, sz] = from;
  const [tx, tz] = to;
  if (!isWalkable(map, tx, tz) || !isWalkable(map, sx, sz)) return [];
  if (sx === tx && sz === tz) return [];

  const w = map.w;
  const n = w * map.d;
  const gScore = new Float32Array(n).fill(Infinity);
  const cameFrom = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);

  const start = sz * w + sx;
  const goal = tz * w + tx;
  gScore[start] = 0;

  const open = new MinHeap(n);
  open.push(start, heuristic(sx, sz, tx, tz));

  while (open.size > 0) {
    const current = open.pop();
    if (current === goal) break;
    if (closed[current]) continue;
    closed[current] = 1;

    const cx = current % w;
    const cz = (current - cx) / w;
    const cy = walkYAt(map, cx, cz);

    for (const [dx, dz, cost] of DIRS) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (!isWalkable(map, nx, nz)) continue;

      // 단차가 크면 못 넘어간다 (벽 위로 뛰어오르는 걸 막는다)
      if (Math.abs(walkYAt(map, nx, nz) - cy) > MAX_STEP) continue;

      // 대각선 모서리 관통 금지: 두 직교 이웃이 모두 열려 있어야 한다
      if (dx !== 0 && dz !== 0) {
        if (!isWalkable(map, cx + dx, cz) || !isWalkable(map, cx, cz + dz)) continue;
        if (Math.abs(walkYAt(map, cx + dx, cz) - cy) > MAX_STEP) continue;
        if (Math.abs(walkYAt(map, cx, cz + dz) - cy) > MAX_STEP) continue;
      }

      const ni = nz * w + nx;
      if (closed[ni]) continue;

      const tentative = gScore[current] + cost;
      if (tentative < gScore[ni]) {
        cameFrom[ni] = current;
        gScore[ni] = tentative;
        open.push(ni, tentative + heuristic(nx, nz, tx, tz));
      }
    }
  }

  if (cameFrom[goal] === -1) return [];

  const path: Cell[] = [];
  for (let i = goal; i !== -1 && i !== start; i = cameFrom[i]) {
    const x = i % w;
    path.push([x, (i - x) / w]);
  }
  return path.reverse();
}

/**
 * 시작칸에서 걸어서 닿을 수 있는 모든 칸 (BFS).
 *
 * 마인크래프트에서 흑요석 한 칸을 빼먹으면 길이 막히는데 눈으로는 안 보인다.
 * 검사기가 이걸로 관문·물건까지 실제로 갈 수 있는지 확인한다.
 */
export function reachableFrom(map: VoxelMap, from: Cell): Uint8Array {
  const w = map.w;
  const seen = new Uint8Array(w * map.d);
  if (!isWalkable(map, from[0], from[1])) return seen;

  const queue: number[] = [from[1] * w + from[0]];
  seen[queue[0]] = 1;

  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    const cx = cur % w;
    const cz = (cur - cx) / w;
    const cy = walkYAt(map, cx, cz);

    for (const [dx, dz] of DIRS) {
      const nx = cx + dx, nz = cz + dz;
      if (!isWalkable(map, nx, nz)) continue;
      if (Math.abs(walkYAt(map, nx, nz) - cy) > MAX_STEP) continue;
      if (dx !== 0 && dz !== 0) {
        if (!isWalkable(map, cx + dx, cz) || !isWalkable(map, cx, cz + dz)) continue;
      }
      const ni = nz * w + nx;
      if (seen[ni]) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return seen;
}
