/**
 * 구역 생성기 공용 연장
 * ───────────────────────────────────────────────────────────────
 * 2구역(`make-zone2.mjs`)이 혼자 들고 있던 장치를, 3구역이 같이 쓰도록 빼낸 것이다.
 * **2구역 생성기는 건드리지 않았다** — 돌아가는 걸 흔들 이유가 없다.
 *
 *   makeZone({W,H,D})  캔버스 + 개체 녹화기
 *   layWalk()          여러 층짜리 맵의 양탄자 깔기 (`make-stage-maps.mjs` 의 규칙)
 *   countFaces()       엔진과 같은 규칙으로 "드러난 면"을 센다 — GPU 비용의 진짜 척도
 *   countLamps()       4×4×4 묶음마다 켜지는 전구 수 (`voxelMap.ts` 와 같은 규칙)
 *   saveZone()         맵 파일 + 개체 패널 파일을 함께 쓴다
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { rleEncode, rleDecode } from './mapdata.mjs';
import { xyzToIndex } from './mcstructure.mjs';

export const mc = (n) => `minecraft:${n}`;

/** 아무것도 안 그려지는 블록 — 양탄자 마커와 공기. 면을 막지 못한다. */
const INVISIBLE = new Set([
  'black_carpet', 'lime_carpet', 'red_carpet',
  'air', 'structure_void', 'cave_air', 'void_air',
]);
const bare = (n) => String(n).replace('minecraft:', '');
const isGlassName = (n) => bare(n).includes('glass');

/** 진짜 전구 — 이것만 `pointLight` 를 켠다 (`blocks.ts` 의 `isLamp` 와 같은 목록) */
export const LAMPS = new Set(['glowstone', 'sea_lantern', 'lantern', 'lit_redstone_lamp']);

/* ═══ 캔버스 + 개체 녹화 ═══════════════════════════════════════ */

export function makeZone({ W, H, D }) {
  const SIZE = [W, H, D];
  const cells = new Int16Array(W * H * D).fill(-1);
  const palette = [];

  const id = (n) => { const i = palette.indexOf(n); return i >= 0 ? i : palette.push(n) - 1; };
  const inb = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D;

  /* 녹화 중에는 `set`·`clear` 가 판이 아니라 주머니를 본다. 그래서 "통으로 쌓고
     창을 파낸다" 같은 코드를 고치지 않고 그대로 개체로 만들 수 있다. */
  let rec = null;
  const parts = [];
  const key = (x, y, z) => `${x},${y},${z}`;

  const set = (x, y, z, n) => {
    if (!inb(x, y, z)) return;
    if (rec) rec.cells.set(key(x, y, z), id(n));
    else cells[xyzToIndex(x, y, z, SIZE)] = id(n);
  };
  const clear = (x, y, z) => {
    if (!inb(x, y, z)) return;
    if (rec) rec.cells.delete(key(x, y, z));
    else cells[xyzToIndex(x, y, z, SIZE)] = -1;
  };
  const get = (x, y, z) => (inb(x, y, z) ? cells[xyzToIndex(x, y, z, SIZE)] : -1);

  const box = (x0, y0, z0, x1, y1, z1, n) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, n);
  };
  const hollow = (x0, y0, z0, x1, y1, z1) => {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) clear(x, y, z);
  };

  /**
   * 개체 하나를 녹화한다.
   * `blocked` 은 **양탄자를 깔면 안 되는 바닥 칸**(유리로 막힌 안쪽 자리)을
   * 절대 좌표 `[x0,z0,x1,z1]` 로 적는다 — 저장할 땐 개체 기준 상대로 바뀐다.
   */
  const part = (kind, label, draw, blocked = null) => {
    rec = { cells: new Map() };
    draw();
    const got = rec; rec = null;
    if (!got.cells.size) return;

    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -1, y1 = -1, z1 = -1;
    for (const k of got.cells.keys()) {
      const [x, y, z] = k.split(',').map(Number);
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    const size = [x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1];
    const buf = new Int16Array(size[0] * size[1] * size[2]).fill(-1);
    for (const [k, v] of got.cells) {
      const [x, y, z] = k.split(',').map(Number);
      buf[xyzToIndex(x - x0, y - y0, z - z0, size)] = v;
    }
    parts.push({
      id: `${kind}-${parts.filter((q) => q.kind === kind).length + 1}`,
      no: parts.length + 1,
      kind, label,
      at: [x0, y0, z0],
      size,
      rle: rleEncode(Array.from(buf)),
      blocked: blocked ? [blocked[0] - x0, blocked[1] - z0, blocked[2] - x0, blocked[3] - z0] : null,
    });
  };

  /** 개체를 판에 찍어 합친 한 벌을 돌려준다 (게임이 쓰는 맵) */
  const compose = () => {
    const out = Int16Array.from(cells);
    for (const q of parts) {
      const buf = rleDecode(q.rle);
      for (let x = 0; x < q.size[0]; x++)
        for (let y = 0; y < q.size[1]; y++)
          for (let z = 0; z < q.size[2]; z++) {
            const v = buf[xyzToIndex(x, y, z, q.size)];
            if (v >= 0) out[xyzToIndex(q.at[0] + x, q.at[1] + y, q.at[2] + z, SIZE)] = v;
          }
    }
    return out;
  };

  return { SIZE, W, H, D, cells, palette, id, inb, set, clear, get, box, hollow, part, parts, compose };
}

/* ═══ 걷는 칸 ═════════════════════════════════════════════════
   2구역은 바닥이 한 층뿐이라 "`floorTop` 이 차 있고 위가 비었으면 걷는 칸"이면 됐다.
   3구역은 층이 셋이라 안 된다. 대신 `make-stage-maps.mjs:88` 이 복층 맵 때문에
   이미 만들어 둔 규칙을 쓴다 — **칸마다 제일 위 블록을 찾고, 그게 밟을 수 있는
   바닥 블록일 때만** 양탄자를 깐다. 안 그러면 소파·카운터 위까지 깔린다.

   엔진은 한 칸(x,z)에 **걷는 높이를 하나만** 들고 있다 (`voxelMap.ts:59`).
   그래서 구역끼리 평면에서 겹치면 위층이 통째로 죽는다 — 여기서 미리 잡는다. */

export function checkRegions(regions, { W, D }) {
  const seen = new Int16Array(W * D).fill(-1);
  const bad = [];
  regions.forEach((r, i) => {
    const [x0, z0, x1, z1] = r;
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++)
      for (let z = Math.max(0, z0); z <= Math.min(D - 1, z1); z++) {
        const k = z * W + x;
        if (seen[k] >= 0 && bad.length < 6) bad.push({ a: seen[k], b: i, x, z });
        seen[k] = i;
      }
  });
  return bad;
}

export function layWalk(composed, { SIZE, palette, surfaces, regions, walkName }) {
  const [W, H, D] = SIZE;
  const ok = new Set(surfaces.map(bare));
  const walkId = palette.indexOf(walkName);
  if (walkId < 0) throw new Error(`팔레트에 ${walkName} 이 없다 — 먼저 id() 로 넣어라`);
  const at = (x, y, z) => composed[xyzToIndex(x, y, z, SIZE)];
  let n = 0;
  for (const [x0, z0, x1, z1, yMin, yMax] of regions) {
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++)
      for (let z = Math.max(0, z0); z <= Math.min(D - 1, z1); z++) {
        let top = -1;
        for (let y = Math.min(yMax, H - 2); y >= yMin; y--) if (at(x, y, z) >= 0) { top = y; break; }
        if (top < 0) continue;
        if (!ok.has(bare(palette[at(x, top, z)]))) continue;
        if (at(x, top + 1, z) >= 0) continue;
        composed[xyzToIndex(x, top + 1, z, SIZE)] = walkId;
        n++;
      }
  }
  return n;
}

/* ═══ 비용 재기 ═══════════════════════════════════════════════ */

/**
 * 엔진(`voxelGeometry.ts`)과 **같은 규칙**으로 드러난 면을 센다.
 * 아래를 보는 면은 안 만든다, 이웃이 불투명하면 안 만든다, 유리끼리는 안 만든다.
 * 브라우저를 열기 전에 GPU 비용을 알자는 것이다.
 */
export function countFaces(composed, { SIZE, palette }) {
  const [W, H, D] = SIZE;
  const drawn = palette.map((n) => !INVISIBLE.has(bare(n)));
  const glass = palette.map((n) => isGlassName(n));
  const at = (x, y, z) =>
    (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D ? -1 : composed[xyzToIndex(x, y, z, SIZE)]);
  const N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  let faces = 0;
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++)
      for (let z = 0; z < D; z++) {
        const v = at(x, y, z);
        if (v < 0 || !drawn[v]) continue;
        const g = glass[v];
        for (const [dx, dy, dz] of N) {
          if (dy < 0 && !g) continue;                    // 아래를 보는 면은 안 만든다
          const u = at(x + dx, y + dy, z + dz);
          if (u >= 0 && drawn[u] && (!glass[u] || g)) continue;
          faces++;
        }
      }
  return faces;
}

/** 4×4×4 묶음마다 전구 하나 (`voxelMap.ts:220`). 띠가 길면 여기서 터진다. */
export function countLamps(composed, { SIZE, palette }) {
  const [W, H, D] = SIZE;
  const lamp = palette.map((n) => LAMPS.has(bare(n)));
  const buckets = new Set();
  let cellsLit = 0;
  for (let x = 0; x < W; x++)
    for (let y = 0; y < H; y++)
      for (let z = 0; z < D; z++) {
        const v = composed[xyzToIndex(x, y, z, SIZE)];
        if (v < 0 || !lamp[v]) continue;
        cellsLit++;
        buckets.add(`${x >> 2},${y >> 2},${z >> 2}`);
      }
  return { cells: cellsLit, lamps: buckets.size };
}

/* ═══ 저장 ════════════════════════════════════════════════════ */

/** 개체 자리의 지문. 생성기에 값을 반영하면 바뀌고, 그러면 브라우저에 남은
    편집을 버리게 해서 "두 배로 밀리는" 사고를 막는다 (`editStore.ts`). */
export const stampOf = (parts) =>
  parts.map((q) => `${q.id}@${q.at.join(',')}`).join('|')
    .split('').reduce((h, ch) => ((h * 31 + ch.charCodeAt(0)) | 0), 7).toString(36);

export async function saveZone(ctx, { name, structure, source, composed, walkSpec, spawn, gate }) {
  await mkdir('public/maps', { recursive: true });
  await writeFile(`public/maps/${name}.json`, JSON.stringify({
    source, structure,
    size: ctx.SIZE,
    palette: ctx.palette,
    rle: rleEncode(Array.from(composed)),
  }));
  await writeFile(`public/maps/${name}-parts.json`, JSON.stringify({
    source: '(생성기 · 개체 단위)',
    structure,
    stamp: stampOf(ctx.parts),
    size: ctx.SIZE,
    palette: ctx.palette,
    walk: walkSpec,           // { block, surfaces, regions } — 브라우저도 이걸 읽어 똑같이 깐다
    spawn, gate,
    base: rleEncode(Array.from(ctx.cells)),
    parts: ctx.parts,
  }));
}

/* ═══ 닿는지 보기 ══════════════════════════════════════════════
   양탄자가 깔렸는데 **거기까지 갈 수 없으면** 검사기가 "갈 수 없는 칸"으로 잡는다
   (여정에 넣을 때 통과해야 하는 여섯 검사 중 하나다). 계단 하나가 한 칸 어긋나도
   위층 전체가 떨어져 나가는데, 화면으로는 멀쩡해 보인다 — 그래서 숫자로 본다.

   엔진과 같은 규칙: 한 번에 2칸까지 오르내리고(`Pathfinder.MAX_STEP`), 8방향이며,
   대각선은 양옆이 모두 뚫려 있을 때만 간다. */
export function reachFrom(composed, { SIZE, palette, walkName, spawn }) {
  const [W, H, D] = SIZE;
  /* 시작·관문 칸도 **걷는 칸이다** — 엔진이 그렇게 센다(`voxelMap.ts` 의 role).
     검은 양탄자만 세면 시작 자리가 섬처럼 떨어져 나와 "아무 데도 못 간다"가 된다. */
  const walkIds = new Set(
    [walkName, mc('lime_carpet'), mc('red_carpet')].map((n) => palette.indexOf(n)).filter((i) => i >= 0),
  );
  const walkY = new Int16Array(W * D).fill(-1);
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++)
      for (let y = 0; y < H; y++)
        if (walkIds.has(composed[xyzToIndex(x, y, z, SIZE)])) { walkY[z * W + x] = y; break; }

  const total = walkY.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0);
  const seen = new Uint8Array(W * D);
  const yAt = (x, z) => (x < 0 || z < 0 || x >= W || z >= D ? -1 : walkY[z * W + x]);
  const start = spawn[0] + spawn[2] * W;
  if (walkY[start] < 0) return { total, reached: 0, missed: total, note: '시작 칸에 양탄자가 없다' };

  const q = [start]; seen[start] = 1; let reached = 1;
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  while (q.length) {
    const cur = q.pop();
    const x = cur % W, z = (cur - x) / W, y = walkY[cur];
    for (const [dx, dz] of DIRS) {
      const nx = x + dx, nz = z + dz;
      const ny = yAt(nx, nz);
      if (ny < 0 || Math.abs(ny - y) > 2) continue;
      if (dx && dz) {                                   // 모서리 관통 방지
        const a = yAt(x + dx, z), b = yAt(x, z + dz);
        if (a < 0 || b < 0 || Math.abs(a - y) > 2 || Math.abs(b - y) > 2) continue;
      }
      const k = nx + nz * W;
      if (seen[k]) continue;
      seen[k] = 1; reached++; q.push(k);
    }
  }
  /* 못 닿은 칸이 어디인지 몇 개만 집어 준다 — 숫자만 보면 어디를 고칠지 모른다 */
  const missed = [];
  for (let z = 0; z < D && missed.length < 8; z++)
    for (let x = 0; x < W && missed.length < 8; x++)
      if (walkY[z * W + x] >= 0 && !seen[x + z * W]) missed.push(`(${x}, ${walkY[z * W + x]}, ${z})`);
  return { total, reached, missed: total - reached, where: missed };
}
