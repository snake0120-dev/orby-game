/**
 * 3구역 — 공항 터미널  (2구역 유리 통로가 닿는 곳)
 * ═══════════════════════════════════════════════════════════════
 * 가이드: `2,3,4번 맵 가이드/2번 이후 이어지는 부분.png` (2660×1488)
 *
 * ── 축척을 어떻게 정했나 ──────────────────────────────────────
 * 2번 맵 가이드는 한 복셀이 12.5px로 **일정**해서 격자를 되짚을 수 있었다(결정 ⑳).
 * 이 그림은 아니다. 재보니 서로 안 맞는다:
 *
 *   실루엣 톱니 한 칸  약 2px   → 블록이 아니라 그림체다
 *   문 높이 77px       → k ≈ 13
 *   계단 디딤판        → k ≈ 7.6     ← 두 배 차이
 *   바닥 기울기        왼 0.41 / 오른 0.21   (아이소라면 둘 다 0.577)
 *
 * 날개마다 기울기가 다르다 = **원근이 들어간 AI 그림**이다. 베껴 그릴 수 없다.
 *
 * 대신 **딱 하나를 자로 쟀다 — 유리 통로의 폭.**
 *   통로 윗면의 세로 두께 94px ÷ (0.8 × k) , k=7.6  →  15.5칸
 *   2구역 통로 폭 = 15칸 (`CA_X0 31 … CA_X1 45`).  **같다.**
 *
 * → 블록 크기는 2구역과 **1:1**. 통로를 걸어 들어오는 아이가 커지거나
 *   작아지지 않는다. `characterScale` 도 2구역과 같은 1.7.
 *
 * 그런데 그림을 1:1로 다 담으면 가로세로 합이 345칸(= 172×172)이라
 * 맵이 200만 칸을 넘는다. 그래서 **요소 크기는 그대로 두고 빈 바닥만 줄였다.**
 * 그림엔 아무것도 없는 바닥이 아주 넓다 — 거길 접었다.
 * 벽도 그림의 50칸 대신 30칸으로 낮췄다 (그래도 12m다).
 *
 * ── 엔진이 못 박은 것 ─────────────────────────────────────────
 * `voxelMap.ts:59` 의 `walkY` 는 **칸(x,z) 하나당 높이 하나**다. 길찾기도 평면이다.
 * 즉 바닥 위에 바닥을 올릴 수 없다. 그래서 층끼리 평면에서 절대 안 겹치게 짰고,
 * `checkRegions()` 가 매번 검사한다. 겹치면 위층이 통째로 죽는데 화면으론 안 보인다.
 *
 * 보기:  localhost:5180/zone3.html   (1번 키로 개체 패널)
 */
import {
  makeZone, layWalk, checkRegions, countFaces, countLamps, reachFrom, saveZone, mc,
} from './lib/zonekit.mjs';

/* ═══ 팔레트 ═══════════════════════════════════════════════════
   2구역과 **같은 세계**다. 값이 갈리면 다른 공항처럼 보인다 (결정 ⑯). */
const M = { walk: mc('black_carpet'), spawn: mc('lime_carpet'), gate: mc('red_carpet') };
const B = {
  pale:  mc('cyan_concrete_powder'),  // 바닥 윗면 — 옅은 민트
  deep:  mc('cyan_terracotta'),       // 바닥 옆면 · 벽
  cream: mc('smooth_sandstone'),      // 크림 테두리 띠 · 융단
  /* 빛은 **둘로 갈라 둔다.** 엔진은 빛나는 블록을 **종류마다 따로** 모아서
     반경을 따로 줄 수 있다 (결정 ㉛·㊲). 2구역이 띠는 10칸, 바닥 빛길은 7칸으로
     쓰고 있어서, 같은 블록 한 가지로 두면 터미널 벽 띠까지 7칸으로 줄어든다. */
  glow:  mc('pearlescent_froglight'), // 벽 띠 · 판 몰딩 · 가구 — 반경 10칸
  path:  mc('ochre_froglight'),       // 통로 바닥 빛길 — 반경 7칸. 2구역과 **같은 블록**
  white: mc('white_concrete'),        // 유리 통로 바닥
  amber: mc('yellow_terracotta'),     // 간판판 — 그림의 큰 황토색 판
  screen: mc('prismarine'),           // 간판 안에 박힌 민트 화면
  glass: mc('white_stained_glass'),   // 창 — **한 겹만** (GLASS_OPACITY 가 0.4 고정)
  seat:  mc('light_gray_concrete'),   // 공항 의자 — 짙은 회색 (gray_wool 은 새까맣게 나왔다)
  teal:  mc('prismarine_bricks'),     // 또렷한 청록 — 안내·리더기
};

/* ═══ 자리표 ═══════════════════════════════════════════════════
   층은 셋. 윗면 y 와 평면 사각형만 여기 적는다 — 전부 서로 안 겹친다. */
/* `H` 는 **제일 높은 블록 바로 위**에 맞춘다. 남는 높이는 그대로 카메라를
   물러나게 만들어 그림이 작아진다 (2구역도 42→36으로 줄여 14% 아꼈다). */
const W = 104, H = 54, D = 104;

/* 층을 바닥(y 0)에 붙여 둔다. 판이 다섯 겹이라 제일 아래가 L0-4 = 0 이다.
   남는 높이는 그대로 카메라를 물러나게 해서 그림을 작게 만든다. */
const L0 = 4, L1 = 13, L2 = 22;        // 각 층 바닥 윗면
const ATRIUM = 22;                     // 모서리에서 이만큼까지가 아트리움이다

//                       x0   z0   x1   z1
const HALL_CHECKIN =   [  0,   0,  22,  60];   // 상층 — 체크인 날개 (화면 왼쪽 아래로)
const HALL_WINDOW  =   [  0,   0,  92,  22];   // 상층 — 창가 날개  (화면 오른쪽 아래로)
const BRIDGE_A     =   [ 32,  38,  54,  53];   // 중간 — 체크인 쪽 다리
const BRIDGE_B     =   [ 56,  32,  72,  42];   // 중간 — 창가 쪽 다리
const ISLE_BOARD   =   [  8,  63,  52,  92];   // 아래 — 전광판 섬 (유리 통로가 여기로 들어온다)
const ISLE_GATE    =   [ 56,  52, 100,  88];   // 아래 — 탑승구 섬

// 계단 — [x0,z0,x1,z1, 축, 위층y, 아래층y]. 축 'x' 면 +x 로, 'z' 면 +z 로 내려간다.
// 디딤판 수 = 두 층의 높이 차. 한 디딤판에 한 칸씩 내려와야 아이가 걷는다.
const STAIRS = [
  ['계단 1', 23, 44, 31, 49, 'x', L2, L1],   // 체크인 홀 → 다리 A
  ['계단 2', 44, 54, 49, 62, 'z', L1, L0],   // 다리 A → 전광판 섬
  ['계단 3', 58, 23, 63, 31, 'z', L2, L1],   // 창가 홀 → 다리 B
  ['계단 4', 60, 43, 65, 51, 'z', L1, L0],   // 다리 B → 탑승구 섬
];

// 유리 통로 — 둘 다 +z 로 뻗어 화면 밖으로 잘린다 (2구역 통로 A·B가 여기로 온다)
// 둘 다 섬과 **같은 높이**다. 2구역에선 통로 B가 판보다 낮았지만 여기선
// 섬 가장자리에 그대로 붙는다 — 한 칸이라도 낮으면 A* 가 못 넘어가(MAX_STEP 2)
// 통로 전체가 "갈 수 없는 칸"이 된다. 그림에서도 둘 다 섬에 붙어 있다.
const TUBE_A = [20, 93, 34, 103, L0];      // 아이가 여기로 들어온다  폭 15
const TUBE_B = [70, 89, 84, 103, L0];      // 탑승구 섬에서 나가는 쪽

/* ═══ 캔버스 ═══════════════════════════════════════════════════ */
const c = makeZone({ W, H, D });
const { set, box, hollow, part } = c;

/* ═══ 판 한 장 — 2단 몰딩이 이 그림의 인상을 거의 다 만든다 ════
      윗면(옅은 민트)
    ─ 크림 테두리 띠            ← 바깥 한 줄
    ─ 민트 벽면
    ─ ▓ 빛나는 띠 ▓             ← 한 칸 들어가서
    ─ 민트 한 단 더
   그림에선 이 빛이 판 **밑면**을 비추는 것처럼 보이는데, 그건 그림의 카메라가
   우리보다 낮아서(24° vs 35°)다. 우리 엔진은 아래 보는 면을 아예 안 만든다(결정 ㉕).
   그래서 **옆면에 낸다** — 한 칸 들여 띠를 박으면 같은 인상이 난다. */
const mask = (rects) => {
  const m = new Uint8Array(W * D);
  for (const [x0, z0, x1, z1] of rects)
    for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++)
      for (let z = Math.max(0, z0); z <= Math.min(D - 1, z1); z++) m[z * W + x] = 1;
  return m;
};
const has = (m, x, z) => x >= 0 && z >= 0 && x < W && z < D && m[z * W + x] === 1;

const plate = (m, top) => {
  const edge = new Uint8Array(W * D);
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    if (!has(m, x, z)) continue;
    box(x, top - 2, z, x, top, B.deep);
    set(x, top, z, B.pale);
    if (!has(m, x + 1, z) || !has(m, x - 1, z) || !has(m, x, z + 1) || !has(m, x, z - 1)) edge[z * W + x] = 1;
  }
  const isEdge = (x, z) => x >= 0 && z >= 0 && x < W && z < D && edge[z * W + x] === 1;
  for (let x = 0; x < W; x++) for (let z = 0; z < D; z++) {
    if (!has(m, x, z)) continue;
    if (isEdge(x, z)) { set(x, top - 1, z, B.cream); continue; }
    if (isEdge(x + 1, z) || isEdge(x - 1, z) || isEdge(x, z + 1) || isEdge(x, z - 1)) {
      set(x, top - 3, z, B.glow);
      set(x, top - 4, z, B.deep);
    }
  }
};

/* ═══ 1. 층 ═══════════════════════════════════════════════════ */
plate(mask([HALL_CHECKIN, HALL_WINDOW]), L2);   // ㄱ자 상층 홀 — 한 덩이로 깐다
plate(mask([BRIDGE_A]), L1);
plate(mask([BRIDGE_B]), L1);
plate(mask([ISLE_BOARD]), L0);
plate(mask([ISLE_GATE]), L0);

/* ═══ 2. 계단 — 한 디딤판에 한 칸씩 (A* 의 MAX_STEP 이 2다) ════ */
for (const [label, x0, z0, x1, z1, axis, hi, lo] of STAIRS) {
  const n = hi - lo;                                   // 디딤판 수
  part('계단', label, () => {
    for (let i = 0; i < n; i++) {
      const y = hi - 1 - i;                            // 위에서 한 칸씩 내려온다
      if (axis === 'x') {
        box(x0 + i, y - 2, z0, x0 + i, y, z1, B.deep);
        box(x0 + i, y, z0, x0 + i, y, z1, B.pale);
        set(x0 + i, y + 1, z0, B.cream);               // 크림 난간
        set(x0 + i, y + 1, z1, B.cream);
      } else {
        box(x0, y - 2, z0 + i, x1, y, z0 + i, B.deep);
        box(x0, y, z0 + i, x1, y, z0 + i, B.pale);
        set(x0, y + 1, z0 + i, B.cream);
        set(x1, y + 1, z0 + i, B.cream);
      }
    }
  });
}

/* ═══ 3. 두 벽 ═══════════════════════════════════════════════
   벽은 **얇게, 속은 채워서** 짓는다. `voxelGeometry` 에 "안쪽 빈 공간 지우기"가
   없어서 속을 비우면 안쪽 면까지 진짜 면으로 만들어진다 — 껍데기가 더 무겁다.
   두께 3이면 둘레가 같으니 면 수도 같다. */
const WY0 = L2 + 1, WY1 = L2 + 30;      // 벽 높이 30칸 (약 12m)

/* 벽 꼭대기는 평평하지 않다 — **아트리움 모서리에서 가장 높고 끝으로 갈수록
   계단처럼 내려온다.** 그림의 인상을 만드는 게 거의 이 실루엣이다.
   모서리(x,z 둘 다 0)에서 멀어진 칸 수로 높이를 깎는다. 너무 급하게 깎으면
   벽이 아니라 **계단**으로 보인다 — 9칸에 한 단이 그림과 비슷하다. */
const topAt = (d) => WY1 - Math.floor(d / 9);

/* 기둥 — 베이 사이의 두꺼운 민트 기둥. 세로로 빛나는 띠가 하나씩 붙는다.
   띠는 froglight 다. glowstone 으로 하면 이 띠 하나가 전구를 여덟 개 켠다. */
const pillarZ = (z0, z1) => {              // 체크인 벽 쪽 (x 로 두껍다)
  for (let z = z0; z <= z1; z++) box(0, WY0, z, 3, topAt(z), z, B.deep);
  /* 띠는 **크림 테 안에 흰 심지**다. `glow` 메시는 흰색으로 타오르기 때문에
     맨살로 두면 허공에 뜬 형광등처럼 보인다 — 테를 둘러야 벽에 박힌 게 읽힌다. */
  box(4, WY0 + 2, z0, 4, topAt(z1) - 4, z1, B.cream);
  box(4, WY0 + 3, z0 + 1, 4, topAt(z1) - 5, z1 - 1, B.glow);
};
const pillarX = (x0, x1) => {              // 창가 벽 쪽 (z 로 두껍다)
  for (let x = x0; x <= x1; x++) box(x, WY0, 0, x, topAt(x), 3, B.deep);
  box(x0, WY0 + 2, 4, x1, topAt(x1) - 4, 4, B.cream);
  box(x0 + 1, WY0 + 3, 4, x1 - 1, topAt(x1) - 5, 4, B.glow);
};

/* 체크인 벽 한 칸 — 큰 황토 간판판 + 그 안에 박힌 민트 화면 + 아래 가로 띠 둘 */
const bayCheckin = (z0, z1) => {
  for (let z = z0; z <= z1; z++) box(0, WY0, z, 2, topAt(z), z, B.deep);
  box(3, WY0 + 11, z0 + 1, 3, WY0 + 21, z1 - 1, B.cream);     // 테두리
  box(3, WY0 + 12, z0 + 2, 3, WY0 + 20, z1 - 2, B.amber);     // 간판판
  box(3, WY0 + 15, z0 + 3, 3, WY0 + 19, z1 - 3, B.screen);    // 민트 화면
  box(3, WY0 + 8, z0 + 1, 3, WY0 + 8, z1 - 1, B.cream);       // 아래 가로 띠
  box(3, WY0 + 6, z0 + 1, 3, WY0 + 6, z1 - 1, B.amber);
};

/* 창가 벽 한 칸 — 큰 창, 두꺼운 민트 창틀. 유리는 **한 겹만** (결정 ㉑).
   창틀을 촘촘히 넣으면 창이 아니라 살창이 된다 — 그림은 한 칸에 서넛이다. */
const bayWindow = (x0, x1) => {
  for (let x = x0; x <= x1; x++) box(x, WY0, 0, x, topAt(x), 2, B.deep);
  const y0 = WY0 + 4;
  for (let x = x0 + 1; x <= x1 - 1; x++) {
    const y1 = topAt(x) - 4;
    hollow(x, y0, 0, x, y1, 2);
    box(x, y0, 1, x, y1, 1, B.glass);
  }
  for (let x = x0 + 7; x < x1 - 2; x += 7) box(x, y0, 0, x, topAt(x) - 4, 2, B.deep);  // 세로 창틀
  for (let x = x0 + 1; x <= x1 - 1; x++) {
    const mid = Math.round((y0 + topAt(x) - 4) / 2);
    box(x, mid, 0, x, mid, 2, B.deep);                                                 // 가로 창틀
  }
};

/* 처마 — 꼭대기를 따라 내려오며 들보가 줄줄이 나오고, 그 선을 따라 빛 띠가 흐른다 */
const eaveZ = (z0, z1) => {
  for (let z = z0; z <= z1; z++) {
    const t = topAt(z);
    box(0, t - 2, z, 8, t, z, B.deep);
    if (z % 4 === 0) box(0, t - 3, z, 10, t - 3, z, B.deep);  // 들보
    set(9, t - 2, z, B.glow);
  }
};
const eaveX = (x0, x1) => {
  for (let x = x0; x <= x1; x++) {
    const t = topAt(x);
    box(x, t - 2, 0, x, t, 8, B.deep);
    if (x % 4 === 0) box(x, t - 3, 0, x, t - 3, 10, B.deep);
    set(x, t - 2, 9, B.glow);
  }
};

/* 벽을 기둥·베이로 번갈아 끊는다 — 기둥 4칸, 베이 16칸.
   그림의 간격이 그쯤이고, 끝이 남으면 거기도 기둥으로 막는다. */
const bands = (end) => {
  const out = [];
  for (let a = 0; a <= end; a += 20) {
    out.push(['기둥', a, Math.min(a + 3, end)]);
    if (a + 4 <= end) out.push(['베이', a + 4, Math.min(a + 19, end)]);
  }
  return out;
};

let nCheckin = 0;
for (const [what, a, b] of bands(HALL_CHECKIN[3])) {
  if (b <= ATRIUM) continue;             // 모서리 쪽 첫 칸들은 아트리움이 가져간다
  if (what === '기둥') { part('체크인 벽', `체크인 기둥 ${++nCheckin}`, () => pillarZ(a, b)); continue; }
  part('체크인 벽', `체크인 벽 ${nCheckin}`, () => bayCheckin(a, b));
}
part('처마', '체크인 처마', () => eaveZ(ATRIUM + 1, HALL_CHECKIN[3]));

let nWindow = 0;
for (const [what, a, b] of bands(HALL_WINDOW[2])) {
  if (b <= ATRIUM) continue;
  if (what === '기둥') { part('창가 벽', `창가 기둥 ${++nWindow}`, () => pillarX(a, b)); continue; }
  part('창가 벽', `창가 벽 ${nWindow}`, () => bayWindow(a, b));
}
part('처마', '창가 처마', () => eaveX(ATRIUM + 1, HALL_WINDOW[2]));


/* ═══ 4. 아트리움 모서리 ══════════════════════════════════════
   두 벽이 만나는 자리는 막혀 있지 않다. 벽이 뚫려 구름이 보이고, 가느다란 살이
   길게 내려오고, 천장에는 얇은 살이 촘촘히 매달려 있다 — 그림의 한가운데다. */
/* 벽 대신 **큰 개구부 + 가느다란 살.** 유리는 한 겹만 (결정 ㉑). */
const atriumZ = (z0, z1) => {            // 체크인 쪽
  for (let z = z0; z <= z1; z++) {
    const t = topAt(z);
    box(0, WY0, z, 2, t, z, B.deep);
    hollow(0, WY0 + 2, z, 2, t, z);                             // 꼭대기까지 뚫는다
    set(1, WY0 + 2, z, B.glass);
    if (z % 3 === 0) box(1, WY0 + 2, z, 1, t, z, B.deep);       // 가느다란 살
  }
};
const atriumX = (x0, x1) => {            // 창가 쪽
  for (let x = x0; x <= x1; x++) {
    const t = topAt(x);
    box(x, WY0, 0, x, t, 2, B.deep);
    hollow(x, WY0 + 2, 0, x, t, 2);
    set(x, WY0 + 2, 1, B.glass);
    if (x % 3 === 0) box(x, WY0 + 2, 0, x, t, 2, B.deep);
  }
};

part('아트리움', '아트리움 벽 (체크인 쪽)', () => atriumZ(4, ATRIUM));
part('아트리움', '아트리움 벽 (창가 쪽)', () => atriumX(4, ATRIUM));

/* 리브 천장 — 얇은 살이 촘촘히 매달려 있다. 이 그림에서 제일 비싼 무늬라
   간격 3, 두께 1, 다섯 단으로 묶어 둔다 (면 수를 보며 늘리고 줄인다). */
part('아트리움', '리브 천장', () => {
  for (let x = 3; x <= ATRIUM; x += 3)
    for (let z = 3; z <= ATRIUM; z++) {
      const t = topAt(Math.max(x, z));
      box(x, t - 7, z, x, t - 3, z, B.deep);
    }
});

/* 홀로 서 있는 민트 문틀 — 기둥 둘에 인방 하나 */
part('아트리움', '서 있는 문틀', () => {
  const y = L2 + 1;
  box(9, y, 9, 10, y + 7, 10, B.deep);
  box(16, y, 9, 17, y + 7, 10, B.deep);
  box(9, y + 7, 9, 17, y + 8, 10, B.deep);
  box(9, y + 9, 9, 17, y + 9, 10, B.cream);
});

/* ═══ 4.5. 껍데기 — 층마다 자기 벽과 지붕 ═════════════════════
   2구역은 홀이 한 층이라 맵 전체를 **한 상자**로 둘러막았다 (결정 ㉟). 3구역은
   층이 셋이라 그게 안 된다 — 한 상자로 묶으면 아래 섬이 상자 속에 갇혀 위에서
   안 보인다. 그래서 **바닥판마다 껍데기를 하나씩** 세운다. 바닥 모양 그대로,
   그 층 높이에서. 높이는 손으로 안 적고 그 판의 윗면(L0/L1/L2)에서 쌓는다.

   카메라는 (+x, +y, +z) 에서 내려다본다 (결정 ⑧):

     먼 쪽  (x·z 작은 쪽)  진짜 벽. 카메라 반대편이라 아무것도 안 가린다.
     가까운 쪽(x·z 큰 쪽)  홀은 진짜 벽을 세우고 **엔진이 턱만 남기고 자른다**
                          (`Stage.cutaway`). 섬·다리는 허리 높이 난간만 둔다 —
                          자르는 높이가 윗층 기준이라 아래 섬엔 안 닿기 때문이다.

   ── 문은 손으로 안 적는다 ───────────────────────────────────
   벽이 계단 입구를 막으면 **그 층 전체가 못 가는 땅**이 되는데 화면으론 멀쩡하다.
   그래서 `STAIRS` 와 `TUBE_A/B` 표에서 자리를 뽑아 한 칸씩 넓혀 문으로 비운다.
   계단을 옮기면 문도 따라 옮겨간다. 그래도 막히면 `reachFrom` 이 몇 칸인지 찍는다. */

/** 계단·통로가 지나가는 자리 — 여기엔 벽을 안 세운다 */
const DOOR = new Uint8Array(W * D);
const markDoor = (x0, z0, x1, z1) => {
  for (let x = Math.max(0, x0 - 1); x <= Math.min(W - 1, x1 + 1); x++)
    for (let z = Math.max(0, z0 - 1); z <= Math.min(D - 1, z1 + 1); z++) DOOR[z * W + x] = 1;
};
for (const [, x0, z0, x1, z1] of STAIRS) markDoor(x0, z0, x1, z1);
for (const [x0, z0, x1, z1] of [TUBE_A, TUBE_B]) markDoor(x0, z0, x1, z1);

/** 바닥판 가장자리 칸 — `plate()` 의 가장자리 판정(섹션 1)과 같은 규칙이다.
    바닥판이 네모라서 2구역처럼 번져 나가는 검사는 필요 없다.
    모서리는 두 쪽 다인데, 그럴 땐 **가까운 쪽**으로 친다 (잘려야 하니까). */
const edgesOf = (m) => {
  const out = [];
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) {
      if (!has(m, x, z) || DOOR[z * W + x]) continue;
      const near = !has(m, x + 1, z) || !has(m, x, z + 1);
      const far = !has(m, x - 1, z) || !has(m, x, z - 1);
      if (near || far) out.push([x, z, near]);
    }
  return out;
};

/** 벽 한 줄의 단면 — 2구역 `wallAt`(`make-zone2.mjs:419`) 을 3구역 높이로 옮겼다.
    `y0` 는 바닥 위 첫 칸, `top` 은 꼭대기.

    **턱(y0 … y0+2)에 공을 들인다.** 가까운 쪽 벽은 기본 화면에서 거기까지만 남고
    위는 잘려 나간다 — 1인칭에서만 보이는 부분에 창을 크게 준다. */
const wallAt = (x, y, z, y0, top) => {
  if (y <= y0 + 1) return B.deep;                                // 걸레받이 — 민트 둘
  /* 창턱은 바닥에서 **두 칸**이다. 아이 눈이 바닥 위 3칸(약 1.2m)이라 2구역처럼
     네 칸을 올리면 눈높이가 막힌 벽에 걸려 창밖이 안 보인다 — 1인칭으로 서 보고 고쳤다.
     잘리는 선도 마침 여기라, 아이소에는 이 **세 칸 턱**까지만 남는다. */
  if (y === y0 + 2) return B.cream;                              // 크림 창턱 ← 잘린 꼭대기
  if (y === top) return B.cream;                                 // 코니스
  if (y === top - 1) return B.pale;                              // 윗벽
  if (y === top - 2) return B.cream;                             // 띠 아래턱
  if (y === top - 3) return (x + z) % 7 <= 2 ? B.glow : B.pale;   // 빛 띠 — 일곱 중 셋
  if (y === top - 4) return B.cream;                             // 인방
  return (x + z) % 7 === 0 ? B.deep : B.glass;                   // 창 — 일곱 칸마다 창틀
};

/* ── 윗층 홀의 앞벽 ─────────────────────────────────────────
   먼 쪽 두 면(x=0 · z=0)은 섹션 3 의 체크인 벽·창가 벽이 이미 서 있다. 여기서는
   **가까운 쪽만** 세운다 — ㄱ자의 두 팔 끝막음(z=60 · x=92)도 가까운 쪽이다.
   꼭대기는 기존 두 벽과 **같은 `topAt`** 을 쓴다. 갈리면 앞벽과 뒷벽의 키가 안
   맞아 방이 비뚤어 보인다. 체크인 팔은 z 로, 창가 팔은 x 로 깎인다. */
const HALL = mask([HALL_CHECKIN, HALL_WINDOW]);
const hallNear = (arm) => {
  for (const [x, z, isNear] of edgesOf(HALL)) {
    if (!isNear) continue;
    const mine = z > ATRIUM ? '체크인' : '창가';
    if (mine !== arm) continue;
    const top = topAt(mine === '체크인' ? z : x);
    for (let y = WY0; y <= top; y++) set(x, y, z, wallAt(x, y, z, WY0, top));
  }
};
part('껍데기', '홀 앞벽 (체크인 쪽)', () => hallNear('체크인'));
part('껍데기', '홀 앞벽 (창가 쪽)', () => hallNear('창가'));

/* ── 윗층 홀의 지붕 ─────────────────────────────────────────
   **평평한 한 겹**이어야 한다. "이 높이부터 안 그린다"는 스위치가 엔진에 딱 하나라
   (`Stage.ceiling`), 계단처럼 내려오는 지붕을 얹으면 그 높이 전부를 걷어내야 해서
   벽 꼭대기의 계단식 실루엣이 같이 사라진다. 그래서 **제일 위 한 켜에만** 깐다.
   아래 섬에 지붕을 못 얹는 것도 같은 이유다 — 걷어낼 방법이 없어서 속이 안 보인다.

   아트리움 모서리 위는 **구멍으로 남긴다** (결정 ㉙). 1인칭으로 올려다보면 구름이
   보이고, 방향광이 그리로 떨어져 아트리움 바닥이 밝아진다.

   벽 꼭대기(42~52)와 지붕(53) 사이에 빈 띠가 남는데 **메우지 않는다 — 고측창이다.**
   메우면 그 블록이 아이소에도 그대로 보여서 실루엣이 뭉개진다. */
const ROOF = H - 1;                                   // 53 — 제일 위 한 켜
/* ── 아래 섬 둘과 다리 둘 ───────────────────────────────────
   섬은 **지붕을 못 얹는다.** 걷어내는 스위치가 하나뿐이라 윗층 지붕에 이미 썼고,
   섬을 덮으면 위에서 전광판·아치·좌석이 통째로 안 보인다. 그래서 **들보만** 건다 —
   1인칭에선 덮인 건물 속 같고, 위에서는 들보 사이로 다 보인다.

   가까운 쪽도 같은 이유로 **허리 높이 유리 난간**만 둔다. 자르는 선이 윗층 기준
   y 26 이라 섬에는 안 닿아서, 여기에 진짜 벽을 세우면 안 걷히고 섬을 가린다. */

/** 허리 높이 난간 — 민트 한 단 · 유리 한 겹 · 크림 손잡이 */
const rail = (x, y0, z) => {
  set(x, y0, z, B.deep);
  set(x, y0 + 1, z, B.glass);
  set(x, y0 + 2, z, B.cream);
};

/** 섬 하나의 껍데기. `높이` 는 먼 쪽 벽, `들보` 는 그 위를 건너지르는 높이다. */
const isleShell = (rect, y0, { 높이, 들보 }) => {
  const m = mask([rect]);
  for (const [x, z, isNear] of edgesOf(m)) {
    if (isNear) { rail(x, y0, z); continue; }
    const top = y0 + 높이 - 1;
    for (let y = y0; y <= top; y++) set(x, y, z, wallAt(x, y, z, y0, top));
  }
  /* 들보는 **제일 높은 가구보다 위**로 건너지른다 — 전광판이 바닥에서 열네 칸이라
     낮게 걸면 들보가 전광판을 뚫고 지나간다.

     **간격은 열 칸이다.** 네 칸으로 해봤더니 섬이 통째로 가렸다 — 들보가 바닥보다
     열여섯 칸 위라, 35° 로 내려다보면 들보 하나가 제 그림자까지 두 칸을 먹는다.
     빛줄도 뺐다. 들보마다 빛을 넣으면 섬이 네온 격자가 된다. */
  const [x0, z0, x1, z1] = rect;
  for (let x = x0; x <= x1; x++)
    if (x % 10 === 0) box(x, 들보, z0, x, 들보, z1, B.cream);
};

part('껍데기', '전광판 섬 껍데기', () => isleShell(ISLE_BOARD, L0 + 1, { 높이: 16, 들보: 21 }));
part('껍데기', '탑승구 섬 껍데기', () => isleShell(ISLE_GATE, L0 + 1, { 높이: 16, 들보: 21 }));

/* 다리는 바깥 통로다 — 벽도 지붕도 없이 난간만 두른다 (그림도 그렇다) */
part('껍데기', '다리 난간', () => {
  for (const rect of [BRIDGE_A, BRIDGE_B])
    for (const [x, z] of edgesOf(mask([rect]))) rail(x, L1 + 1, z);
});

part('껍데기', '홀 지붕', () => {
  for (let x = 0; x < W; x++)
    for (let z = 0; z < D; z++) {
      if (!has(HALL, x, z)) continue;
      if (x <= ATRIUM && z <= ATRIUM) continue;       // 아트리움 — 뚫어 둔다
      /* 들보 한 줄(크림) · 그 옆에 빛줄 · 나머지는 흰 판 — 2구역 천장과 같은 무늬
         (`make-zone2.mjs:477`). 천장 밑면은 빛을 못 받아서 띠가 조명 구실을 한다. */
      set(x, ROOF, z, x % 8 === 0 ? B.cream : x % 16 === 1 ? B.glow : B.pale);
    }
});


/* ═══ 5. 유리 통로 둘 — 2구역 것이 **그대로 이어져 온다** ══════
   원본은 `make-zone2.mjs:311-323` 의 먼 쪽 통로다. 아이는 그 통로를 걸어 나와서
   이 통로로 걸어 들어온다 — **같은 물건이라 단면이 한 칸도 달라선 안 된다.**
   2구역은 바닥이 y 12, 여기는 y 4 라 **바닥 기준 상대 높이**로 옮긴다.

     바닥  −1   빛길 (왼쪽에서 5~8칸째)      ochre_froglight
     바닥   0   흰 바닥 · 양 끝 크림 연석 · 빛길 위 유리
     바닥 +1~3  난간 — **먼 쪽 한 줄만** (가까운 쪽은 열어 둬야 속이 보인다)
     바닥 +10   유리 지붕 — **한 겹만** (결정 ㉑)
     갈비 16칸마다 — 바닥 가로선 · 양쪽 기둥 · 윗 보

   갈비는 **이음매 쪽 끝에서 3칸째부터** 센다. 2구역도 끝에서 3칸째라, 그래야
   건너가는 순간 갈비 간격이 끊기지 않는다. */
for (const [i, [x0, z0, x1, z1, top]] of [TUBE_A, TUBE_B].entries()) {
  const ROOF_Y = top + 10, PARA_Y = top + 3;
  part('통로', `유리 통로 ${i + 1}`, () => {
    /* 밑동은 **다섯 겹**이다 — 2구역 통로와 같아야 테두리 두께가 안 달라진다
       (`make-zone2.mjs` 의 `slab()`). 섬 바닥판도 같은 다섯 겹이다. */
    box(x0, top - 4, z0, x1, top, z1, B.deep);
    box(x0, top, z0, x1, top, z1, B.white);                      // 흰 바닥
    box(x0, top, z0, x0, top, z1, B.cream);                      // 양 끝 크림 연석
    box(x1, top, z0, x1, top, z1, B.cream);
    box(x0, top + 1, z0, x0, PARA_Y, z1, B.white);               // 먼 쪽 난간
    box(x0, ROOF_Y, z0, x1, ROOF_Y, z1, B.glass);                // 유리 지붕
    /* 바닥 빛길 — 유리 한 겹 밑에 빛 블록. 2구역이 통로 시작에서 5~8칸째라 그대로. */
    box(x0 + 5, top - 1, z0, x0 + 8, top - 1, z1, B.path);
    box(x0 + 5, top, z0, x0 + 8, top, z1, B.glass);
    for (let z = z1 - 3; z >= z0 + 2; z -= 16) {                 // 갈비
      box(x0, top, z, x1, top, z, B.cream);
      box(x0, top + 1, z, x0, ROOF_Y, z, B.cream);
      box(x1, top + 1, z, x1, ROOF_Y, z, B.cream);
      box(x0, ROOF_Y, z, x1, ROOF_Y, z, B.cream);
    }
  });
}


/* ═══ 6. 가구 ═════════════════════════════════════════════════
   여기부터는 **잘라낼 수 있는 부분**이다. 앞의 것들만으로도 걸을 수 있고
   검사도 통과한다. 개체는 하나씩 쪼개지 않고 **종류별로 묶는다** — 2구역이
   밑동 16덩이를 하나로 묶은 것과 같다. 서른 줄짜리 목록은 못 쓴다. */

/** 갈색 융단 띠 — 바닥에 깔린 길잡이 선. 밟을 수 있는 바닥이라 양탄자가 깔린다. */
const runner = (x0, z0, x1, z1, top) => box(x0, top, z0, x1, top, z1, B.cream);

/** 공항 의자 한 줄 — 등받이·앉는 자리·크림 다리. n 개가 이어 붙는다. */
const seatRow = (x, z, n, along) => {
  const y = L0 + 1;
  for (let i = 0; i < n; i++) {
    const [sx, sz] = along === 'x' ? [x + i * 3, z] : [x, z + i * 3];
    box(sx, y, sz, sx + 1, y, sz + 1, B.seat);          // 앉는 자리
    if (along === 'x') box(sx, y + 1, sz, sx + 1, y + 2, sz, B.seat);
    else box(sx, y + 1, sz, sx, y + 2, sz + 1, B.seat);
    set(sx, y - 0, sz, B.seat);
  }
  if (along === 'x') box(x, L0, z, x + n * 3 - 2, L0, z + 1, B.cream);
  else box(x, L0, z, x + 1, L0, z + n * 3 - 2, B.cream);
};

/** 체크인 데스크 한 짝 — 황토 카운터 + 크림 모니터 */
const desk = (x, z) => {
  const y = L2 + 1;
  box(x, y, z, x + 3, y + 1, z + 1, B.amber);
  box(x + 1, y + 2, z, x + 2, y + 2, z, B.cream);
};

/** 계단식 아치 — 탑승구 문. 테두리가 빛난다. */
const arch = (x, z, w, h, lit) => {
  const y = L0 + 1;
  const skin = lit ? B.amber : B.deep;      // 몸통
  const core = lit ? B.glow : B.teal;       // 안쪽에 흐르는 빛 선
  box(x, y, z, x + 1, y + h, z + 1, skin);                 // 왼 기둥
  box(x + w - 1, y, z, x + w, y + h, z + 1, skin);         // 오른 기둥
  box(x + 2, y + h - 1, z, x + w - 2, y + h, z + 1, skin); // 인방
  box(x + 1, y + h + 1, z, x + w - 1, y + h + 1, z + 1, B.cream);
  // 문 안쪽 테두리만 빛난다 — 통째로 빛내면 흰 덩어리가 된다
  box(x + 1, y + 1, z, x + 1, y + h - 1, z, core);
  box(x + w - 1, y + 1, z, x + w - 1, y + h - 1, z, core);
  box(x + 2, y + h - 1, z, x + w - 2, y + h - 1, z, core);
};

part('가구', '체크인 데스크', () => {
  for (let z = 8; z <= 54; z += 8) { desk(8, z); desk(14, z + 2); }
});

part('가구', '좌석', () => {
  seatRow(62, 60, 5, 'z'); seatRow(72, 58, 5, 'z');       // 탑승구 섬
  seatRow(80, 70, 6, 'x'); seatRow(20, 70, 5, 'x');       // 전광판 섬
  seatRow(30, 80, 6, 'x');
});

part('가구', '융단', () => {
  runner(4, 10, 20, 12, L2);                              // 체크인 홀
  runner(26, 4, 88, 6, L2);                               // 창가 홀
  runner(12, 74, 48, 76, L0);                             // 전광판 섬
  runner(60, 66, 96, 68, L0);                             // 탑승구 섬
  runner(34, 40, 52, 42, L1);                             // 다리 A
});

part('가구', '탑승구', () => {
  arch(62, 72, 8, 9, true);                               // 빛나는 주황 아치
  arch(76, 78, 8, 9, true);
  arch(88, 58, 8, 9, false);                              // 청록 아치
  // 게이트 카운터 — 크림 데스크 + 청록 리더기 기둥 + 머리 위 사인판
  const y = L0 + 1;
  box(64, y, 56, 72, y + 1, 57, B.cream);
  for (let x = 65; x <= 71; x += 3) box(x, y + 2, 56, x, y + 3, 56, B.teal);
  box(63, y + 6, 56, 73, y + 8, 56, B.deep);
  box(64, y + 7, 55, 72, y + 7, 55, B.glow);
});

part('가구', '전광판과 상점', () => {
  const y = L0 + 1;
  // 큰 출발 안내 전광판 — 기둥 둘 위에
  box(14, y, 66, 15, y + 9, 67, B.deep);
  box(28, y, 66, 29, y + 9, 67, B.deep);
  box(14, y + 9, 66, 29, y + 14, 66, B.deep);
  for (let x = 16; x <= 27; x += 2) box(x, y + 11, 65, x, y + 12, 65, B.cream);
  // 작은 상점 카운터
  box(34, y, 84, 42, y + 1, 85, B.cream);
  box(34, y + 2, 85, 42, y + 5, 85, B.deep);
  box(35, y + 3, 84, 41, y + 3, 84, B.glow);
});

part('가구', '기둥과 안내판', () => {
  for (let x = 30; x <= 86; x += 14) box(x, L2 + 1, 14, x + 1, L2 + 7, 15, B.deep);
  for (const [x, z, y] of [[56, 70, L0 + 1], [24, 68, L0 + 1], [84, 64, L0 + 1]]) {
    box(x, y, z, x, y + 5, z, B.deep);
    box(x - 1, y + 4, z, x + 1, y + 7, z, B.cream);
  }
});

/* ═══ 7. 걷는 칸 ═══════════════════════════════════════════════ */
const stairRegion = ([, x0, z0, x1, z1, , hi, lo]) => [x0, z0, x1, z1, lo - 1, hi];
const REGIONS = [
  [...HALL_CHECKIN, L2, L2], [...HALL_WINDOW, L2, L2],
  [...BRIDGE_A, L1, L1], [...BRIDGE_B, L1, L1],
  [...ISLE_BOARD, L0, L0], [...ISLE_GATE, L0, L0],
  ...STAIRS.map(stairRegion),
  [TUBE_A[0], TUBE_A[1], TUBE_A[2], TUBE_A[3], TUBE_A[4], TUBE_A[4]],
  [TUBE_B[0], TUBE_B[1], TUBE_B[2], TUBE_B[3], TUBE_B[4], TUBE_B[4]],
];

/* 상층 홀은 사각형 둘이 겹치는 ㄱ자라 겹침 검사에서 빼고 따로 본다 */
const overlaps = checkRegions(REGIONS.slice(1), { W, D });
if (overlaps.length) {
  console.error('\n층이 평면에서 겹친다 — 겹치면 위층이 통째로 죽는다:');
  for (const o of overlaps) console.error(`  구역 ${o.a} 와 ${o.b} 가 (${o.x}, ${o.z}) 에서`);
  process.exit(1);
}

const WALK_SPEC = {
  block: M.walk,
  surfaces: [B.pale, B.white, B.cream],
  regions: REGIONS,
};

const composed = c.compose();
c.id(M.walk); c.id(M.spawn); c.id(M.gate);
const walk = layWalk(composed, { SIZE: c.SIZE, palette: c.palette, ...WALK_SPEC, walkName: M.walk });

/* 아이는 화면 밖에서 이어져 온 유리 통로 위에 선다 (좌하단 입구) */
const SPAWN = [27, TUBE_A[4] + 1, 101];
composed[SPAWN[0] * H * D + SPAWN[1] * D + SPAWN[2]] = c.palette.indexOf(M.spawn);

/* 관문은 **빛나는 탑승구 아치 아래**다 (`arch(62, 72, 8, 9, true)` 의 문간).
   이 구역에서 아이가 배우는 게 "안내를 보고 탑승구를 찾아간다"라서, 끝나는 자리가
   탑승구여야 말이 된다.

   처음엔 통로 B 의 끝에 뒀다가 옮겼다 — **화면 아래로 잘려서 안 보인다.**
   맵 상자는 네모인데 지은 건 ㄱ자라 `cameraPadding` 을 0.78 로 당겨 놨고(스테이지
   파일), 그 바깥은 화면에 안 들어온다. 아이가 못 가는 관문은 관문이 아니다.

   여정에 들어가려면 관문이 **반드시** 있어야 한다. 없으면 "시작 → 관문까지 길이
   있는가" 검사가 깨진다 (`validate.ts`). 그래서 여태 여정 밖에 뒀던 것이다. */
const GATE_CELLS = [];
for (let x = 64; x <= 68; x++) GATE_CELLS.push([x, L0 + 1, 73]);
for (const [gx, gy, gz] of GATE_CELLS)
  composed[gx * H * D + gy * D + gz] = c.palette.indexOf(M.gate);

await saveZone(c, {
  name: 'airport', structure: 'airport',
  source: '(생성기 · 2번 이후 이어지는 부분 가이드)',
  composed, walkSpec: WALK_SPEC, spawn: SPAWN, gate: GATE_CELLS,
});

/* ═══ 숫자 — 브라우저를 열기 전에 비용을 본다 ══════════════════ */
const filled = composed.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0);
const faces = countFaces(composed, c);
const { cells: lit, lamps } = countLamps(composed, c);
const cap = (v, max, unit) => `${v.toLocaleString()}${unit} ${v <= max ? '✓' : `✗ (상한 ${max.toLocaleString()})`}`;
console.log(`\n공항 터미널  ${W}×${H}×${D}`);
console.log(`  맵 칸        ${cap(W * H * D, 700000, '')}`);
console.log(`  채워진 블록   ${cap(filled, 110000, '')}`);
console.log(`  드러난 면     ${cap(faces, 60000, '')}`);
console.log(`  전구         ${cap(lamps, 24, '')}   (빛나는 칸 ${lit.toLocaleString()})`);
const reach = reachFrom(composed, { SIZE: c.SIZE, palette: c.palette, walkName: M.walk, spawn: SPAWN });
console.log(`  걸을 수 있는 칸 ${walk.toLocaleString()}` +
  (reach.missed
    ? `   ✗ 시작 자리에서 못 닿는 칸 ${reach.missed.toLocaleString()}개 — ${(reach.where ?? []).join(' ')}`
    : '   ✓ 전부 시작 자리에서 닿는다'));
console.log(`  개체 ${c.parts.length}개  ` +
  [...new Set(c.parts.map((q) => q.kind))].map((k) =>
    `${k} ${c.parts.filter((q) => q.kind === k).length}`).join(' · '));
console.log('  보기: localhost:5180/zone3.html\n');
