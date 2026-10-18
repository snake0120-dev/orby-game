#!/usr/bin/env node
/**
 * 2구역(입국 수속) 맵 생성기.   node scripts/make-zone2.mjs
 *
 * 3·4구역 생성기(`make-stage-maps.mjs`)와 **일부러 파일을 갈랐다.** 2구역만
 * 가이드 그림 축척으로 짓기 때문에 한 파일에 두면 서로 흔들린다.
 *
 * ══ 가이드를 어떻게 옮겼는가 ═══════════════════════════════════
 * 원본: `2,3,4번 맵 가이드/2번 맵.png` (2497 × 1775)
 *
 * ① **자 잡기.** 계단처럼 깎인 모서리의 한 단을 쟀다. 아이소에서 한 칸 가며
 *    한 칸 오르면 화면에서 (k, −0.577k) 이므로 그 가로 픽셀이 한 블록이다.
 *      → **1블록 = 12.5px**  (문틀 위 틸 상자 높이로 교차 검증: k·1 = 12.6)
 *
 * ② **좌표 읽기.** 판의 왼쪽 꼭짓점(원본 80, 1080)을 원점으로 바닥면 격자를
 *    씌우고 요소마다 바닥 꼭짓점을 역투영했다.
 *      u = x − x_min (화면 오른쪽아래)   v = z_max − z (화면 오른쪽위)
 *
 *      부스 3채   u 25        v 5 · 37 · 70
 *      문틀 8개   u 71        v 2·13·24·35 — (틈 27) — 66·77·88·99
 *      판         u 0..74     v 0..101
 *
 *    이 코드에서는 z 를 뒤집어 쓴다:  z = OFF + (101 − v),  OFF = 30.
 *    먼 쪽(v 큰 쪽)에 다리가 뻗을 자리를 30칸 비워 두기 위해서다.
 *
 * ③ **문틀 방향.** 주황 덩어리 8개의 실루엣에서 꼭대기 점이 폭의 12~14%
 *    지점이었다. 두께가 얇은 쪽이 z 라는 뜻 → 문틀은 **x 로 눕고 구멍은 z 로
 *    뚫린다.** (가로 16 · 두께 3 · 주황 6 + 크림 2)
 *
 * ④ **축척.** 가이드의 한 복셀은 게임의 한 블록보다 3배쯤 작다. 그대로 1:1로
 *    옮기는 대신 **아이 키를 올린다** (`Stage.characterScale`). 절반으로 줄여
 *    지어 봤더니 1복셀짜리 디테일(계단진 처마·크림 띠·밑동 계단)이 통째로
 *    뭉개져서, 세 번 고치는 동안 계속 그림과 멀어졌다.
 *
 * ══ 유리 규칙 ═════════════════════════════════════════════════
 * `GLASS_OPACITY` 가 0.4 고정이라(`VoxelGrid.tsx`) **두 겹부터 불투명해진다.**
 * 통로를 바닥·양옆·지붕 전부 유리로 둘렀다가 흰 홈통이 된 적이 있다.
 * 그래서 비치는 건 **한 겹만** 쓴다 — 통로는 지붕, 부스는 창.
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { rleEncode, rleDecode } from './lib/mapdata.mjs';
import { xyzToIndex } from './lib/mcstructure.mjs';

const mc = (n) => `minecraft:${n}`;

const M = {
  walk:  mc('black_carpet'),
  spawn: mc('lime_carpet'),
  gate:  mc('red_carpet'),
};

const B = {
  mint:  mc('cyan_concrete_powder'),  // 옅은 민트 — 바닥 윗면
  deep:  mc('cyan_terracotta'),       // 민트 — 판 옆·밑동·부스 몸체
  roof:  mc('prismarine'),            // 짙은 민트 — 부스 지붕
  pale:  mc('white_concrete'),        // 흰 — 창틀·난간·통로 바닥
  rib:   mc('smooth_sandstone'),      // 크림 — 통로 연석·갈비
  cream: mc('quartz_block'),          // 크림 — 문틀 처마
  amber: mc('orange_terracotta'),     // 주황 — 문틀 몸통
  teal:  mc('prismarine_bricks'),     // 선명한 틸 — 날개·상자·직원 머리
  glass: mc('white_stained_glass'),   // 유리 — 한 겹만
  sign:  mc('yellow_terracotta'),     // 노란 판 (안 빛난다)
  glow:  mc('glowstone'),             // 진짜 등 — 판 안에 한 칸만
  /* 빛 띠 — **밝게 보이기만 하고 전구는 안 켠다** (`isLamp`, 결정 ㉛).
     벽을 두르는 띠가 400칸인데 글로스톤으로 깔면 전구가 백 개 넘게 켜진다.

     바닥 빛길(ochre)과 **다른 블록**인 게 중요하다. 엔진이 빛 종류마다 메시를
     나누는데, 바닥 길만 아이 둘레에서 켜지고(`Stage.pathGlow`) 벽 띠는 늘
     켜져 있어야 하기 때문이다. 색은 둘이 같아 보이게 맞춰 뒀다. */
  strip: mc('pearlescent_froglight'),
};

/* ── 치수 (전부 ②에서 읽은 값) ───────────────────────────────── */
/* H 는 **제일 높은 블록 바로 위**에 맞춘다 (지금 꼭대기는 부스 지붕 y=34).
   남겨 두면 `buildGeometry` 가 빈 칸을 그만큼 더 훑고, 카메라도 그만큼 물러난다. */
const W = 100, H = 36, D = 134;

const BASE = 8, FLOOR = 12;        // 판 다섯 겹 (y 8..12) — 그림의 옆면이 딱 이 두께다
const Y = FLOOR + 1;               // 걷는 높이

const HX0 = 0,  HX1 = 74;          // 판 x
const HZ0 = 32, HZ1 = 133;         // 판 z  (= OFF + 0..101, OFF = 32)

/* 다리를 길게 빼면 맵 상자가 커지고, 카메라는 상자 전체를 잡으므로
   (`IsoCamera.tsx`) 판이 화면에서 작아진다. 그래서 **다리를 늘린 만큼
   `cameraPadding` 을 같이 조인다** — 결과적으로 판 크기는 그대로 두고
   다리만 프레임 밖으로 밀어낸다. 그림이 바로 그 구도다.
   맞추는 법: `npm run zone2:compare` 로 한 블록의 픽셀을 그림과 맞춘다. */

const AX0_ = 45, AX1_ = 59;        // 문틀 가로 15칸 (두께 4 → 그림의 19와 맞는다)
/**
 * 문틀의 [z 끝단, x 보정]. z 는 그림의 v 2·13·24·35 — 틈 — 66·77·88·99 에서 왔다.
 * x 보정은 천우태가 패널에서 맞춘 값이다 — **4번만 한 칸 더 들어가 있다.**
 */
const GATES = [[131, 0], [120, 0], [109, 0], [98, -1], [67, 0], [56, 0], [45, 0], [34, 0]];

const BX0_ = 13, BX1_ = 26;        // 부스 x (개체마다 BOOTHS 의 네 번째 값만큼 민다)
/** [z0, z1, 높이, x 밀기] — 탑 둘과 가로형 하나. 네 번째 값은 개체 패널에서 맞춘 자리다. */
const BOOTHS = [[112, 128, 20, 2], [63, 97, 17, 0], [33, 49, 20, 0]];

const CA_X0 = 31, CA_X1 = 45, CA_Z1 = HZ0 - 1;   // 먼 쪽 다리 (z 방향, 맵 끝까지)
const CB_Z0 = 77, CB_Z1 = 90, CB_X0 = HX1 - 3;   // 가까운 쪽 다리 (x 방향, 맵 끝까지)

/* ── 작은 캔버스 ─────────────────────────────────────────────── */
const SIZE = [W, H, D];
const cells = new Int16Array(W * H * D).fill(-1);
const palette = [];
const id = (n) => { const i = palette.indexOf(n); return i >= 0 ? i : palette.push(n) - 1; };
const inb = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D;

/* ── 개체 녹화 ───────────────────────────────────────────────────
   `part()` 안에서 그린 블록은 판(base)에 바로 쓰이지 않고 **따로 모인다.**
   그래야 브라우저에서 개체를 하나씩 옮기거나 지울 수 있다
   (`zone2.html` 의 개체 패널 → `src/zone2/parts.ts` 가 다시 합친다).

   녹화 중에는 `set`·`clear` 가 전부 이 주머니를 본다. 그래서 문틀처럼
   "통으로 쌓고 창을 파내는" 코드도 고치지 않고 그대로 쓸 수 있다. */
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
/**
 * 개체 하나를 녹화한다.
 *
 * `blocked` 는 **양탄자를 깔면 안 되는 바닥 칸**(부스 안처럼 유리로 막힌 자리)을
 * 개체 기준 상대 좌표로 적는 것이다. 개체를 옮기면 이 칸도 같이 따라간다.
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
const box = (x0, y0, z0, x1, y1, z1, n) => {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) set(x, y, z, n);
};
const hollow = (x0, y0, z0, x1, y1, z1) => {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) clear(x, y, z);
};

/** 판 한 장 — 다섯 겹, 윗면만 다른 색 */
const slab = (x0, z0, x1, z1, top) => {
  box(x0, BASE, z0, x1, FLOOR, z1, B.deep);
  box(x0, FLOOR, z0, x1, FLOOR, z1, top);
};

/* ═══ 1. 판 (하늘 섬) ════════════════════════════════════════ */
slab(HX0, HZ0, HX1, HZ1, B.mint);

/* 가장자리를 들쭉날쭉 깎는다 — 그림에 네모 반듯한 변이 하나도 없다 */
for (const [x0, z0, x1, z1] of [
  [0, HZ0, 5, HZ0 + 7], [HX1 - 3, HZ0, HX1, HZ0 + 4], [0, HZ1 - 6, 3, HZ1],
  [HX1 - 6, HZ1 - 2, HX1, HZ1], [HX1 - 1, HZ0 + 22, HX1, HZ0 + 30],
  [0, HZ0 + 44, 2, HZ0 + 52], [HX1 - 2, HZ0 + 62, HX1, HZ0 + 70],
  [28, HZ1 - 1, 36, HZ1], [HX1 - 1, CB_Z0 - 9, HX1, CB_Z0 - 4],
]) hollow(x0, BASE, z0, x1, FLOOR, z1);

/* 밑동 — 판 밑으로 덩어리가 계단처럼 좁아지며 매달린다.
   그림에선 **보이는 쪽 모서리(+x·+z)** 에 몰려 있다. */
const root = (cx, cz, r, depth) => {
  for (let d = 1; d <= depth; d++) {
    const rr = r - ((d / 3) | 0);
    if (rr < 0) break;
    box(cx - rr, BASE - d, cz - rr, cx + rr, BASE - d, cz + rr, B.deep);
  }
};
/* 밑동은 열여섯 덩어리지만 **한 개체로 묶는다.** 패널에 열여섯 줄이 늘어서면
   정작 옮기고 싶은 부스·문틀이 안 보인다. 통째로 껐다 켰다 하는 쪽이 쓸모 있다. */
part('밑동', '하늘 섬 밑동 (16덩이)', () => {
  for (const [x, z, r, d] of [
    [4, HZ1 - 4, 4, 7], [17, HZ1 - 3, 5, 8], [35, HZ1 - 5, 4, 6], [50, HZ1 - 3, 5, 7],
    [62, HZ1 - 6, 3, 5], [HX1 - 6, 112, 4, 7], [HX1 - 5, 96, 3, 5], [HX1 - 7, 78, 5, 8],
    [HX1 - 5, 60, 4, 6], [HX1 - 6, 44, 3, 5], [HX1 - 8, HZ0 + 2, 4, 6],
    [26, 104, 4, 6], [10, 88, 3, 5], [41, 70, 4, 7], [20, 56, 3, 4], [36, HZ0 + 6, 3, 5],
  ]) root(x, z, r, d);
});

/* ═══ 2. 자동심사대 문틀 × 8 ═════════════════════════════════
   주황 몸통 6겹 + 크림 처마 2겹. 구멍은 **z 로 관통**한다.
   양끝을 한 칸씩 계단으로 깎는 게 그림의 성격이라 꼭 넣는다. */
const eGate = (zEnd, withBox, dx) => {
  const AX0 = AX0_ + dx, AX1 = AX1_ + dx;
  const z0 = zEnd - 3, z1 = zEnd;    // 두께 4
  const ZF = z1 + 1;                 // 처마가 한 칸 내미는 자리
  const TOP = Y + 10;                // 높이 11 (주황 10 + 크림 1)
  const WIN0 = Y + 2, WIN1 = Y + 8;  // 창 — 바닥에서 두 칸 띄운다

  box(AX0, Y, z0, AX1, TOP, z1, B.amber);
  /* 구멍은 **바닥까지 뚫린 문이 아니라 창**이다 — 아래에 두 칸짜리 턱이 있다.
     문으로 뚫었더니 주황이 다리 두 개로 쪼개져서, 그림의 "네모 틀"이 아니라
     긴 벤치로 보였다. 창 안으로 저쪽 배경이 비쳐 보이는 것도 그림 그대로다. */
  hollow(AX0 + 2, WIN0, z0, AX0 + 11, WIN1, z1);

  /* 크림은 **한 겹만** 올린다. 두 겹으로 덮었더니 흰 널빤지가 주황 틀을
     통째로 눌러서, 문틀이 아니라 긴 벤치로 보였다. 구멍 위에 주황 상인방이
     두 겹은 남아야 "문"으로 읽힌다. */
  box(AX0, TOP, z0, AX1, TOP, z1, B.cream);
  box(AX0, TOP, ZF, AX1, TOP, ZF, B.cream);             // 내민 처마

  // 양끝 계단 — 오른쪽(+x)이 한 단 더 길다
  hollow(AX0, TOP - 1, z0, AX0, TOP, ZF);
  hollow(AX0 + 1, TOP, z0, AX0 + 1, TOP, ZF);
  hollow(AX1, TOP - 2, z0, AX1, TOP, ZF);
  hollow(AX1 - 1, TOP - 1, z0, AX1 - 1, TOP, ZF);
  hollow(AX1 - 2, TOP, z0, AX1 - 2, TOP, ZF);

  box(AX0 + 11, WIN0, z0 + 1, AX0 + 11, WIN1, z0 + 2, B.teal); // 창 안 틸 날개
  box(AX0 + 2, WIN0, z1, AX0 + 2, WIN0 + 2, z1, B.sign);     // 작은 표시등
  box(AX1, Y, ZF, AX1, WIN1, ZF, B.teal);                    // 앞 틸 기둥
  if (withBox) box(AX0 + 3, TOP + 1, z0 + 1, AX0 + 6, TOP + 1, z0 + 2, B.teal);
};
GATES.forEach(([z, dx], i) => part('심사대', `자동심사대 ${i + 1}`, () => eGate(z, i % 2 === 0, dx)));

/* ═══ 3. 심사 부스 3채 ═══════════════════════════════════════
   민트 몸체 · 한 칸 내민 지붕 두 겹 · 흰 테두리 큰 유리창 ·
   유리를 뚫고 나온 노란 카운터 · 벽에 붙인 빛나는 사인 · 틸 머리 직원. */
BOOTHS.forEach(([z0, z1, hi, dx], i) => part('부스', `심사 부스 ${i + 1}`, () => {
  const TOP = Y + hi;
  const BX0 = BX0_ + dx, BX1 = BX1_ + dx;

  box(BX0, Y, z0, BX1, TOP - 1, z0, B.deep);
  box(BX0, Y, z1, BX1, TOP - 1, z1, B.deep);
  box(BX0, Y, z0, BX0, TOP - 1, z1, B.deep);
  box(BX1, Y, z0, BX1, TOP - 1, z1, B.deep);

  // 카메라를 보는 쪽 면(+z)의 큰 창
  box(BX0 + 2, Y + 2, z1, BX1 - 2, TOP - 4, z1, B.pale);
  box(BX0 + 3, Y + 3, z1, BX1 - 3, TOP - 5, z1, B.glass);

  // 창구 한 칸 = 창 + 사인 + 카운터 + 직원  (가로형 부스는 둘)
  for (let cz = z0 + 2; cz + 11 <= z1; cz += 14) {
    box(BX1, Y + 2, cz, BX1, TOP - 4, cz + 11, B.pale);
    box(BX1, Y + 3, cz + 1, BX1, TOP - 5, cz + 10, B.glass);
    /* 카운터가 나오는 줄은 유리를 걷어낸다. 흰 유리 한 겹(0.4)이 어두운
       부스 안과 겹치면 뿌연 판이 되어, 안의 카운터와 직원이 안 보인다. */
    hollow(BX1, Y + 3, cz + 3, BX1, Y + 4, cz + 8);
    // 벽에 붙인 사인 — 흰 테 + 노란 판, 안에 등 한 칸
    box(BX1 + 1, TOP - 8, cz + 2, BX1 + 1, TOP - 4, cz + 9, B.pale);
    box(BX1 + 1, TOP - 7, cz + 3, BX1 + 1, TOP - 5, cz + 8, B.sign);
    set(BX1 + 1, TOP - 6, cz + 5, B.glow);
    // 유리를 뚫고 나온 노란 카운터
    box(BX1 - 2, Y + 1, cz + 3, BX1 + 2, Y + 3, cz + 8, B.sign);
    set(BX1, Y + 3, cz + 5, B.glow);
    // 직원 — 흰 몸에 틸 머리
    box(BX0 + 3, Y, cz + 5, BX0 + 3, Y + 3, cz + 6, B.pale);
    box(BX0 + 3, Y + 4, cz + 5, BX0 + 3, Y + 4, cz + 6, B.teal);
  }

  // 지붕 두 겹 — 아래가 한 칸 더 넓어 처마가 두 단으로 진다
  box(BX0 - 1, TOP, z0 - 1, BX1 + 1, TOP, z1 + 1, B.roof);
  box(BX0, TOP + 1, z0, BX1, TOP + 1, z1, B.roof);
}, [BX0_ + dx + 1, z0 + 1, BX1_ + dx - 1, z1 - 1]));

/* ═══ 4. 줄 세우는 난간 ══════════════════════════════════════
   흰 기둥 둘이 빛나는 노란 판을 든다. 부스와 문틀 사이에만 둔다. */
const rail = (x, z, len) => {                       // z 로 눕는 난간
  const z1 = z + len;
  box(x, Y, z, x, Y + 7, z, B.pale);
  box(x, Y, z1, x, Y + 7, z1, B.pale);
  box(x, Y + 3, z, x, Y + 8, z1, B.pale);
  box(x, Y + 4, z + 1, x, Y + 7, z1 - 1, B.sign);
  box(x, Y + 5, z + ((len / 2) | 0), x, Y + 6, z + ((len / 2) | 0) + 1, B.glow);
};
/* 난간은 **하나만 남았다.** 처음엔 여덟 개였는데(x 로 눕는 것 셋 포함) 화면이
   답답해져서 천우태가 패널에서 하나씩 지웠다. 심사대 줄 바로 앞의 이 하나만
   남기는 쪽이 "줄 서는 자리"로 읽힌다. */
[[47, 73]].forEach(([x, z], i) =>
  part('난간', `줄 난간 ${i + 1}`, () => rail(x, z, 14)));

/* ═══ 5. 유리 통로 두 줄 — 화면 밖으로 잘린 길 ═══════════════
   불투명한 흰 바닥 + 양 끝 크림 연석 + 먼 쪽 낮은 난간 + 크림 갈비(아치).
   비치는 건 **지붕 한 겹**뿐이다 (위 유리 규칙). */
const TUBE = Y + 9;                 // 갈비·지붕 높이
const PARA = Y + 2;                 // 먼 쪽 난간 꼭대기

/* 다리는 **바닥까지 통째로** 한 개체다. 바닥을 판에 남겨 두면 다리를 옮겼을 때
   길만 공중에 뜨고 바닥은 제자리에 남는다. */
part('통로', '유리 통로 (먼 쪽)', () => {
  slab(CA_X0, 0, CA_X1, CA_Z1, B.pale);
  for (let z = 0; z <= CA_Z1; z++) box(CA_X0, Y, z, CA_X0, PARA, z, B.pale);
  box(CA_X0, TUBE, 0, CA_X1, TUBE, CA_Z1, B.glass);
  box(CA_X0, FLOOR, 0, CA_X0, FLOOR, CA_Z1, B.rib);
  box(CA_X1, FLOOR, 0, CA_X1, FLOOR, CA_Z1, B.rib);
  for (let z = 3; z <= CA_Z1 - 2; z += 16) {
    box(CA_X0, FLOOR, z, CA_X1, FLOOR, z, B.rib);
    box(CA_X0, Y, z, CA_X0, TUBE, z, B.rib);
    box(CA_X0, TUBE, z, CA_X1, TUBE, z, B.rib);
    box(CA_X1, Y, z, CA_X1, TUBE, z, B.rib);
  }
});

part('통로', '유리 통로 (가까운 쪽)', () => {
  slab(CB_X0, CB_Z0, W - 1, CB_Z1, B.pale);
  for (let x = CB_X0; x < W; x++) box(x, Y, CB_Z0, x, PARA, CB_Z0, B.pale);
  box(CB_X0, TUBE, CB_Z0, W - 1, TUBE, CB_Z1, B.glass);
  box(CB_X0, FLOOR, CB_Z0, W - 1, FLOOR, CB_Z0, B.rib);
  box(CB_X0, FLOOR, CB_Z1, W - 1, FLOOR, CB_Z1, B.rib);
  for (let x = CB_X0 + 3; x < W - 2; x += 16) {
    box(x, FLOOR, CB_Z0, x, FLOOR, CB_Z1, B.rib);
    box(x, Y, CB_Z0, x, TUBE, CB_Z0, B.rib);
    box(x, TUBE, CB_Z0, x, TUBE, CB_Z1, B.rib);
    box(x, Y, CB_Z1, x, TUBE, CB_Z1, B.rib);
  }
});

/* ═══ 6. 실내 껍데기 — 벽 넷과 유리 천장 ═══════════════════
   1인칭으로 보면 사방이 까만 허공이라 **공항 안이 아니라 우주에 뜬 섬**으로
   보였다. 그래서 홀을 실제로 둘러막는다.

   ── 벽은 판의 **가장자리를 따라간다**
   판은 변마다 들쭉날쭉 깎여 있다(섹션 1). 네모 반듯한 벽을 두르면 깎아 둔
   자리가 벽 밑의 구멍이 되거나, 메우느라 그 실루엣이 사라진다. 그래서
   "바닥이 있고 옆 네 칸 중 하나가 비었으면 거기가 벽"으로 세운다 —
   깎인 모양을 그대로 따라가고 틈도 안 생긴다.

   통로 두 줄이 들어오는 자리(`OPEN`)만 비운다. 통로 바닥은 개체라서
   `cells` 에 없으니 가장자리로 잡힌다 — 손으로 적어 줘야 한다.

   ── 앞쪽 벽은 **아이소에서 잘린다**
   카메라는 +x·+z 쪽 위에서 내려다본다. 그쪽 벽을 그대로 두면 방 안이 통째로
   가린다. 엔진에 이미 그 장치가 있다(`voxelGeometry` 의 근경 절단) —
   `Stage.cutaway: 3` 이면 **앞벽은 턱 세 칸만 남고** 뒷벽(x·z 작은 쪽)은
   그대로 선다. 1인칭에서는 아무것도 안 자른다.

   ── 천장은 **불투명한 판**이다
   처음엔 유리로 지었다. 불투명하게 덮으면 방향광이 막혀 홀이 깜깜해지는데,
   그림자를 드리우는 건 불투명 메시뿐이라 유리면 빛이 그대로 들어왔기 때문이다.
   그런데 반투명 판이 화면을 꽉 채우니 **1인칭 프레임의 절반**을 먹었다
   (30.6ms → 천장을 걷어내면 16.7ms). 지금은 불투명하게 짓고, 엔진이 천장만
   따로 떼어 **그림자를 안 드리우게** 그린다(`BuiltGeometry.roof`).
   아이소에서는 `Stage.ceiling` 으로 통째로 걷어낸다. */

/* ── 손으로 놓은 블록을 **먼저** 읽는다 ─────────────────────
   `zone2.html` 의 블록 붓으로 놓은 칸들. 패널이 `zone2-edits.json` 에 적어
   두고 여기서 읽어 굽는다. 사람이 옮겨 적지 않는 이유는 간단하다 — 손으로
   놓는 건 백 칸 단위라 옮겨 적을 수가 없다. 자리는 **절대 좌표**라 몇 번
   적용해도 결과가 같다.

   벽보다 먼저 읽는 이유는 아래 `floorAt` 때문이다 — **손으로 깐 바닥도 바닥**
   이라 벽이 거기까지 따라가야 한다. 안 그러면 새로 깐 바닥이 벽 바깥에 남아
   아이가 못 간다 (실제로 그렇게 열네 칸이 끊겼다). */
const readHand = async (file, pick) => {
  try { return pick(JSON.parse(await readFile(file, 'utf8'))) ?? []; }
  catch { return []; }
};
const handBlocks = [];
for (const h of [
  /* ① **기본값으로 구워 둔 것** — `npm run zone2:bake` 가 옮겨 적는다.
        코드로 지은 판·벽과 똑같이 취급한다. */
  ...await readHand('scripts/zone2-blocks.json', (j) => j),
  /* ② 아직 안 구운 편집 — 브라우저에서 방금 놓은 것들 */
  ...await readHand('zone2-edits.json', (j) => j.손블록),
]) {
  const at3 = h.자리;
  if (!Array.isArray(at3) || !inb(...at3)) continue;
  handBlocks.push({ at: at3, block: h.지움 ? null : h.블록 });
}

/**
 * 손으로 **깐** 바닥 — 벽이 여기까지 따라간다.
 *
 * **지운 칸은 안 본다.** 천우태는 바닥을 네 칸 폭으로 파내 유도 동선을 그린다.
 * 그걸 "바닥이 끊겼다"로 읽으면 파낸 고랑마다 22칸짜리 벽이 솟는다 —
 * 한 번 그렇게 해 보니 벽이 8,500칸에서 11,500칸이 됐다.
 * 파는 건 방을 나누는 게 아니라 **바닥에 무늬를 넣는 일**이다.
 */
const handFloor = new Set();
for (const h of handBlocks) {
  if (h.at[1] === FLOOR && h.block !== null) handFloor.add(`${h.at[0]},${h.at[2]}`);
}

const CEIL = H - 1;                 // 천장 (35)
const WTOP = CEIL - 1;              // 벽 꼭대기 (34)
const DOOR = [59, 65];              // 관문으로 나가는 문 (z) — 관문 칸이 60~64
/** 벽을 세우지 않는 자리 [x0, z0, x1, z1] — 통로가 들어온다 */
const OPEN = [
  [CA_X0, HZ0, CA_X1, HZ0 + 1],        // 먼 쪽 통로
  [HX1 - 1, CB_Z0, HX1, CB_Z1],        // 가까운 쪽 통로
];

const floorAt = (x, z) =>
  handFloor.has(`${x},${z}`) ||
  (inb(x, FLOOR, z) && cells[xyzToIndex(x, FLOOR, z, SIZE)] >= 0);
const openAt = (x, z) => OPEN.some(([x0, z0, x1, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);

/** 벽 한 줄의 단면. 창은 세로 기둥으로 일곱 칸마다 끊는다. */
const wallAt = (x, y, z) => {
  if (y <= Y + 1) return B.deep;                         // 13·14  걸레받이 (민트)
  if (y === Y + 2) return B.rib;                         // 15     크림 띠
  if (y <= Y + 4) return B.pale;                         // 16·17  창 아래 벽
  if (y <= Y + 12) return (x + z) % 7 === 0 ? B.pale : B.glass;   // 18~25  창
  if (y === Y + 13) return B.rib;                        // 26     인방
  /* 27  빛 띠 — **일곱 칸 중 셋만** 켠다. 빛나는 블록은 전용 메시에서
     흰색으로 타오르기 때문에(`VoxelGrid` 의 glow), 한 줄로 쭉 이으면
     네온 띠처럼 쨍해서 민트 홀이 통째로 밀린다. 토막 내면 등으로 읽힌다. */
  if (y === Y + 14) return (x + z) % 7 <= 2 ? B.strip : B.pale;
  if (y === Y + 15) return B.rib;                        // 28     띠 아래턱
  if (y < WTOP) return B.pale;                           // 29~33  윗벽
  return B.cream;                                        // 34     코니스
};

/* ── 바깥은 어디인가 ───────────────────────────────────────
   "바닥이 있고 옆이 비었으면 벽"으로만 세우면, 홀 **한가운데를 파낸 구멍**
   둘레에도 벽이 22칸씩 솟는다. 실제로 심사대 1·2 사이를 파냈더니 그 구멍이
   방으로 둘러싸였다 — 구멍은 방의 경계가 아니라 그냥 구멍이다.

   그래서 바닥 없는 칸 중 **맵 가장자리에서 이어지는 것**만 바깥으로 친다.
   안쪽 구멍은 어디서도 이어지지 않으니 벽이 안 선다. */
const outside = new Uint8Array(W * D);
{
  const stack = [];
  const open = (x, z) => {
    if (x < 0 || z < 0 || x >= W || z >= D) return;
    const i = z * W + x;
    if (outside[i] || floorAt(x, z)) return;
    outside[i] = 1;
    stack.push(x, z);
  };
  for (let x = 0; x < W; x++) { open(x, 0); open(x, D - 1); }
  for (let z = 0; z < D; z++) { open(0, z); open(W - 1, z); }
  while (stack.length) {
    const z = stack.pop(), x = stack.pop();
    open(x + 1, z); open(x - 1, z); open(x, z + 1); open(x, z - 1);
  }
}
/** 맵 밖이거나, 바깥과 이어진 빈 칸 */
const isOut = (x, z) =>
  x < 0 || z < 0 || x >= W || z >= D || outside[z * W + x] === 1;

let wall = 0;
for (let x = 0; x <= HX1; x++)
  for (let z = HZ0; z <= HZ1; z++) {
    if (!floorAt(x, z) || openAt(x, z)) continue;
    if (!isOut(x + 1, z) && !isOut(x - 1, z) && !isOut(x, z + 1) && !isOut(x, z - 1)) continue;
    // 관문 쪽은 문으로 뚫는다 — 아이가 걸어 나가는 자리다
    const door = isOut(x - 1, z) && z >= DOOR[0] && z <= DOOR[1];
    for (let y = Y; y <= WTOP; y++) {
      if (door && y <= Y + 8) continue;                  // 13~21  문 구멍
      set(x, y, z, door && y === Y + 9 ? B.cream : wallAt(x, y, z));
      wall++;
    }
  }

let roof = 0;
for (let x = 0; x <= HX1; x++)
  for (let z = HZ0; z <= HZ1; z++) {
    /* 들보 한 줄(크림) · 그 옆에 빛줄 · 나머지는 흰 판.
       천장 밑면은 빛을 못 받아 어두우므로, 열여섯 칸마다 넣는 빛줄이
       조명 기구 노릇을 한다 — 없으면 잿빛 판이 머리 위를 짓누른다. */
    set(x, CEIL, z, x % 8 === 0 ? B.rib : x % 16 === 1 ? B.strip : B.pale);
    roof++;
  }

/* ═══ 7. 합치기 · 걷는 칸 · 마커 ════════════════════════════
   `cells` 는 **판만** 들어 있는 바탕이다. 여기에 개체를 찍어 합친 것이
   게임이 쓰는 맵(`immigration.json`)이고, 바탕과 개체를 따로 담은 것이
   패널이 쓰는 파일(`immigration-parts.json`)이다. */
const composed = Int16Array.from(cells);
const put = (x, y, z, v) => { composed[xyzToIndex(x, y, z, SIZE)] = v; };
const at = (x, y, z) => (inb(x, y, z) ? composed[xyzToIndex(x, y, z, SIZE)] : -1);

for (const q of parts) {
  const buf = rleDecode(q.rle);
  for (let x = 0; x < q.size[0]; x++)
    for (let y = 0; y < q.size[1]; y++)
      for (let z = 0; z < q.size[2]; z++) {
        const v = buf[xyzToIndex(x, y, z, q.size)];
        if (v >= 0) put(q.at[0] + x, q.at[1] + y, q.at[2] + z, v);
      }
}

/* 손 블록을 얹는다 (읽기는 섹션 6 앞에서 끝냈다).
   순서는 **개체 다음, 양탄자 앞** — 브라우저 쪽(`src/zone2/parts.ts`)과 같은
   순서여야 패널에서 본 것과 여정에서 보는 것이 같다. */
for (const h of handBlocks) put(...h.at, h.block === null ? -1 : id(h.block));

const WALK = id(M.walk);
let walk = 0;
for (let x = 0; x < W; x++)
  for (let z = 0; z < D; z++) {
    if (at(x, FLOOR, z) < 0) continue;      // 바닥이 없는 곳
    if (at(x, Y, z) >= 0) continue;         // 벽·가구가 선 곳
    put(x, Y, z, WALK);
    walk++;
  }

/* 부스 안은 유리로 막힌 직원 자리다. 양탄자를 그대로 두면 검사기가
   "갈 수 없는 칸"으로 잡는다 — 실제로 못 가는 게 맞으니 걷어낸다. */
for (const q of parts) {
  if (!q.blocked) continue;
  const [bx0, bz0, bx1, bz1] = q.blocked;
  for (let x = q.at[0] + bx0; x <= q.at[0] + bx1; x++)
    for (let z = q.at[2] + bz0; z <= q.at[2] + bz1; z++)
      if (at(x, Y, z) === WALK) { put(x, Y, z, -1); walk--; }
}

// 아이는 화면 밖에서 이어져 온 유리 통로 위에 선다
const SPAWN = [W - 3, Y, 82];
const GATE_CELLS = [];
for (let z = 60; z <= 64; z++) GATE_CELLS.push([0, Y, z]);
put(...SPAWN, id(M.spawn));
for (const g of GATE_CELLS) put(...g, id(M.gate));

/* ═══ 저장 ═══════════════════════════════════════════════════ */
await mkdir('public/maps', { recursive: true });
await writeFile('public/maps/immigration.json', JSON.stringify({
  source: '(생성기 · 2번 맵 가이드 실측)',
  structure: 'immigration',
  size: SIZE,
  palette,
  rle: rleEncode(Array.from(composed)),
}));

/* 개체 패널용 — 바탕과 개체를 **따로** 담는다. `src/zone2/parts.ts` 가 읽어서
   패널에서 옮긴 만큼 자리를 바꿔 다시 합친다. */

/* 개체 자리의 지문. 패널에서 맞춘 값을 이 파일에 반영하고 나면, 브라우저에
   남아 있던 **그 편집이 또 한 번 더해져 두 배로 밀린다.** 지문이 달라지면
   저장해 둔 편집을 지우게 해서 그 사고를 막는다 (`editStore.ts`). */
const stamp = [
  ...parts.map((q) => `${q.id}@${q.at.join(',')}`),
  /* 손 블록도 **지문에 넣는다.** 지문이 바뀌면 브라우저가 남겨 둔 편집을
     버리는데(`editStore.ts`), 손 블록이 여기 들어 있어야 "구웠으니 이제
     브라우저 쪽은 지워도 된다"가 자동으로 맞아떨어진다. */
  ...handBlocks.map((h) => `${h.at.join(',')}=${h.block ?? '지움'}`),
].join('|')
  .split('').reduce((h, ch) => ((h * 31 + ch.charCodeAt(0)) | 0), 7).toString(36);

await writeFile('public/maps/immigration-parts.json', JSON.stringify({
  source: '(생성기 · 개체 단위)',
  structure: 'immigration',
  stamp,
  size: SIZE,
  palette,
  floorTop: FLOOR,
  walk: M.walk,
  spawn: SPAWN,
  gate: GATE_CELLS,
  base: rleEncode(Array.from(cells)),
  parts,
  handBlocks,
}));

const filled = composed.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0);
console.log(
  `입국 수속  ${W}×${H}×${D}  블록 ${filled.toLocaleString()}  ` +
  `팔레트 ${palette.length}종  걸을 수 있는 칸 ${walk.toLocaleString()}`,
);
console.log(`실내 껍데기  벽 ${wall.toLocaleString()}칸 · 천장 ${roof.toLocaleString()}칸`);
if (handBlocks.length) {
  const 지움 = handBlocks.filter((h) => h.block === null).length;
  console.log(`손으로 놓은 블록 ${handBlocks.length - 지움}칸  지운 칸 ${지움}` +
    `   (zone2-edits.json)`);
}
console.log(`개체 ${parts.length}개  ` +
  [...new Set(parts.map((q) => q.kind))].map((k) =>
    `${k} ${parts.filter((q) => q.kind === k).length}`).join(' · '));
console.log('보기:  localhost:5180/zone2.html   (1번 키로 개체 패널)\n');
