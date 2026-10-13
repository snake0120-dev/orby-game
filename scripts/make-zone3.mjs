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
  glow:  mc('ochre_froglight'),       // 빛나는 띠 — 밝게 보이되 **전구는 아니다**
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
const W = 104, H = 58, D = 104;

const L0 = 8, L1 = 17, L2 = 26;        // 각 층 바닥 윗면
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

/* ═══ 5. 유리 통로 둘 — 2구역 것이 이어져 온다 ════════════════ */
for (const [i, [x0, z0, x1, z1, top]] of [TUBE_A, TUBE_B].entries()) {
  part('통로', `유리 통로 ${i + 1}`, () => {
    box(x0, top - 2, z0, x1, top, z1, B.deep);
    box(x0, top, z0, x1, top, z1, B.white);            // 흰 바닥
    for (let z = z0; z <= z1; z++) {
      set(x0, top + 1, z, B.cream);                    // 양쪽 크림 연석
      set(x1, top + 1, z, B.cream);
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

await saveZone(c, {
  name: 'airport', structure: 'airport',
  source: '(생성기 · 2번 이후 이어지는 부분 가이드)',
  composed, walkSpec: WALK_SPEC, spawn: SPAWN, gate: [],
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
