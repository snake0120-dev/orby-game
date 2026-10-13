#!/usr/bin/env node
/**
 * 3·4구역 맵 생성기.  node scripts/make-stage-maps.mjs
 *
 * **2구역은 여기 없다.** 가이드 그림 축척(한 블록이 이 파일의 절반 크기)으로
 * 따로 짓기 때문에 `scripts/make-zone2.mjs` 로 파일을 갈랐다. 한 파일에 두면
 * 축척이 다른 둘이 서로 흔들린다.
 *
 * 천우태가 마인크래프트로 직접 짓기 전까지 쓸 임시 맵이다.
 * **임포터가 뱉는 것과 완전히 같은 형식**이라, 진짜 맵이 오면 같은 파일명으로
 * 갈아끼우기만 하면 된다. 스테이지 파일은 안 고쳐도 된다.
 *
 * ── 축척 ────────────────────────────────────────────────────
 * 1블록 = 마인크래프트 1블록, 캐릭터 2블록. gate1 실측과 같다.
 * 바닥 y=0 · 걷는 높이 y=1 · 캐릭터 머리 y=3.
 * 카운터/의자 y=1~2 = 가슴·무릎께. 사인 y=4~5 = 올려다보는 높이.
 *
 * ── 세 구역을 어떻게 다르게 만드는가 ────────────────────────
 * 처음 만들었을 때 세 구역이 전부 "45칸 회색 상자"로 똑같아 보였다.
 * 같은 축척을 지키면서 구분되려면 **평면·높이·색** 셋을 다르게 가져가야 한다.
 *
 *   게이트    45×9   긴 관     낮고 복층   흰 콘크리트 + 유리  (천우태가 지음)
 *   입국 수속 34×34  정사각 홀  높은 궁륭   광택 회색 + 노랑·빨강
 *   대기실    40×26  얕고 넓음  천장 없음   따뜻한 나무 + 하늘색
 *
 * ── 마커 (천우태의 양탄자 규칙) ──────────────────────────────
 *   연두 = 시작 · 빨강 = 관문 · 검정 = 걷는 바닥 · 하늘색 = 상호작용
 *
 * ── 카메라 방향 (벽 배치가 여기서 나온다) ────────────────────
 * 아이소 카메라는 (+x, +y, +z) 쪽에서 내려다본다.
 *   **먼 쪽 = x·z 작음** — 벽을 세워도 안 가린다
 *   **가까운 쪽 = x·z 큼** — 불투명 벽을 세우면 방이 통째로 가려진다
 * 그래서 먼 쪽만 콘크리트, 가까운 쪽은 유리. 천장은 덮지 않는다.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { rleEncode } from './lib/mapdata.mjs';
import { xyzToIndex } from './lib/mcstructure.mjs';

const mc = (n) => `minecraft:${n}`;

const M = {
  walk:  mc('black_carpet'),
  spawn: mc('lime_carpet'),
  gate:  mc('red_carpet'),
};

/** 맵 하나를 짓는 작은 캔버스 */
function canvas(W, H, D) {
  const SIZE = [W, H, D];
  const cells = new Int16Array(W * H * D).fill(-1);
  const palette = [];
  const id = (n) => {
    const i = palette.indexOf(n);
    return i >= 0 ? i : palette.push(n) - 1;
  };
  const inb = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < W && y < H && z < D;

  const set = (x, y, z, n) => { if (inb(x, y, z)) cells[xyzToIndex(x, y, z, SIZE)] = id(n); };
  const clear = (x, y, z) => { if (inb(x, y, z)) cells[xyzToIndex(x, y, z, SIZE)] = -1; };
  const get = (x, y, z) => (inb(x, y, z) ? cells[xyzToIndex(x, y, z, SIZE)] : -1);
  const box = (x0, y0, z0, x1, y1, z1, n) => {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) set(x, y, z, n);
  };
  const hollow = (x0, y0, z0, x1, y1, z1) => {
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        for (let z = z0; z <= z1; z++) clear(x, y, z);
  };
  return { W, H, D, SIZE, cells, palette, set, clear, get, box, hollow };
}


/**
 * **복층용** 걷기 양탄자.
 *
 * `layWalkable` 은 바닥 높이가 하나일 때만 쓴다. 테라스·계단이 있는 구역은
 * 칸마다 바닥 높이가 달라서, **기둥을 위에서 훑어 제일 높은 덩어리 바로 위**에
 * 깐다 — 마인크래프트에서 손으로 까는 것과 같은 결과다.
 *
 * `surfaces` 는 **발을 디딜 수 있는 바닥 블록**이다. 이게 없으면 소파·카운터·
 * 난간 위에까지 양탄자가 깔려서 아이가 가구 위를 걸어 다닌다 (검사기도 그걸
 * "갈 수 없는 칸"으로 잡는다 — 실제로 올라갈 방법이 없으니까).
 */
function layWalkableTop(c, x0, z0, x1, z1, surfaces) {
  const ok = new Set(surfaces);
  let n = 0;
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++) {
      let top = -1;
      for (let y = c.H - 2; y >= 0; y--) if (c.get(x, y, z) >= 0) { top = y; break; }
      if (top < 0) continue;
      if (!ok.has(c.palette[c.get(x, top, z)])) continue;
      c.set(x, top + 1, z, M.walk);
      n++;
    }
  return n;
}

async function save(c, name, label) {
  const map = {
    source: '(생성기 · 진짜 맵이 오면 교체)',
    structure: name,
    size: c.SIZE,
    palette: c.palette,
    rle: rleEncode(Array.from(c.cells)),
  };
  await mkdir('public/maps', { recursive: true });
  await writeFile(`public/maps/${name}.json`, JSON.stringify(map));
  const filled = c.cells.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0);
  console.log(
    `${label.padEnd(11)} ${String(c.W).padStart(2)}×${c.H}×${String(c.D).padStart(2)}  ` +
    `블록 ${String(filled.toLocaleString()).padStart(6)}  팔레트 ${c.palette.length}종`,
  );
}

/* ══════════════════════════════════════════════════════════════
   3구역 · 환승 통로       미리보기: `2,3,4번 맵 가이드/3번 맵.png`

   앞의 두 구역이 **한 층짜리 판**이었으니 여기는 **복층**으로 간다.
   그림에서 읽은 것:

     · 위층 테라스와 아래층이 **계단**으로 이어진다.
     · 테라스 가장자리에 나무 난간, 그 아래 띠처럼 흐르는 호박색 불빛.
     · 위층에 모니터가 놓인 긴 안내 카운터.
     · 상점 쇼윈도 — 민트 상자에 유리 앞면, 안에 호박색 물건.
     · 바닥에서 천장까지 꿰뚫는 큰 기둥.
     · 아래층에 작은 유리 키오스크.

   계단은 **한 칸씩 쌓은 블록**이다. 길찾기가 두 칸까지 오르내리므로(MAX_STEP)
   따로 손댈 게 없고, 복셀 화면에서는 계단 블록보다 이쪽이 더 또렷하다.
   ══════════════════════════════════════════════════════════════ */
async function concourse() {
  const W = 34, H = 20, D = 34;
  const c = canvas(W, H, D);

  const FLOOR = 1;          // 아래층 바닥 맨 윗단
  const Y = FLOOR + 1;      // 아래층 걷는 높이
  const DECK = FLOOR + 5;   // 위층 바닥 맨 윗단
  const UY = DECK + 1;      // 위층 걷는 높이

  const B = {
    mint:  mc('cyan_concrete_powder'),
    deep:  mc('cyan_terracotta'),
    pale:  mc('white_concrete'),
    wood:  mc('birch_planks'),          // 난간·카운터
    top:   mc('smooth_sandstone'),      // 카운터 상판
    sign:  mc('yellow_terracotta'),     // 호박색 띠
    glow:  mc('glowstone'),
    glass: mc('white_stained_glass'),
    dark:  mc('gray_concrete'),         // 모니터
  };

  // 아래층 판
  c.box(0, 0, 0, W - 1, FLOOR, D - 1, B.deep);
  c.box(0, FLOOR, 0, W - 1, FLOOR, D - 1, B.mint);

  /* 위층 테라스 — ㄱ자로 앉힌다. 네모로 덮으면 아래층이 통째로 사라져서
     복층인 게 안 읽힌다. 아래층이 보이는 구멍이 있어야 층이 두 개로 보인다. */
  const deckBox = (x0, z0, x1, z1) => {
    c.box(x0, 0, z0, x1, DECK, z1, B.deep);
    c.box(x0, DECK, z0, x1, DECK, z1, B.mint);
  };
  deckBox(0, 0, 19, 13);
  deckBox(0, 14, 8, 25);

  /* 계단 — 아래층에서 테라스까지 한 칸씩 오른다.
     **테라스 가장자리(x=19)에 맞붙여야** 올라간 자리가 바로 위층이다.
     처음엔 반대로 쌓아서 허공에 탑 하나만 서 있었다. */
  const STAIR_Z0 = 9, STAIR_Z1 = 11;
  for (let k = 0; k <= DECK - FLOOR; k++) {
    const x = 25 - k;                                      // 25(아래) → 20(위층 높이)
    c.box(x, 0, STAIR_Z0, x, FLOOR + k, STAIR_Z1, B.deep);
    c.box(x, FLOOR + k, STAIR_Z0, x, FLOOR + k, STAIR_Z1, B.mint);
  }

  /* 테라스에서 뻗어나가 아래층 위를 건너는 **구름다리**.
     그림에서 공간이 깊어 보이는 건 통로가 공중에서 교차하기 때문이다 —
     한 층짜리 판에서는 절대 안 나오는 깊이다. */
  /* 다리는 맵 끝(z=0)에 붙인다. 한 줄 띄우면 그 뒤 아래층 한 줄이
     난간에 가로막혀 아무 데서도 못 가는 띠가 된다. */
  c.box(20, DECK - 1, 0, W - 1, DECK, 4, B.deep);         // 다리 두께 두 단
  c.box(20, DECK, 0, W - 1, DECK, 4, B.mint);

  /* 테라스·다리 **가장자리**를 따라 호박색 띠와 나무 난간.
     띠는 옆면(DECK-1), 난간은 위(UY)다. 계단 입구만 비운다. */
  const edge = (x0, z0, x1, z1) => {
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const atStair = x === 19 && z >= STAIR_Z0 && z <= STAIR_Z1;
        c.set(x, DECK - 1, z, (x + z) % 4 === 0 ? B.glow : B.sign);
        if (atStair) continue;
        c.set(x, UY + 1, z, B.wood);                       // 가로대
        if ((x + z) % 3 === 0) c.set(x, UY, z, B.wood);    // 기둥
      }
  };
  edge(19, 5, 19, 13);        // 테라스 동쪽 (다리 아래쪽)
  edge(9, 13, 19, 13);        // 테라스 남쪽
  edge(8, 14, 8, 25);         // 아래 날개 동쪽
  edge(0, 25, 8, 25);         // 아래 날개 남쪽
  /* 다리 난간은 **다리 위**에 올려야 한다. 다리 바깥(z=0·6)에 세웠더니
     허공에 난간만 떠서, 그 아래 아래층 한 줄이 통째로 못 걷는 칸이 됐다. */
  edge(20, 0, W - 1, 0);      // 구름다리 양옆 (다리 폭 안쪽)
  edge(20, 4, W - 1, 4);

  /* 상점 쇼윈도 — 민트 상자에 유리 앞면, 안에 호박색 진열대.
     테라스 **안쪽 벽**을 따라 줄지어 서야 상가로 읽힌다. */
  const shop = (z0) => {
    c.box(0, UY, z0, 3, UY + 5, z0 + 3, B.deep);
    c.hollow(1, UY, z0 + 1, 3, UY + 4, z0 + 2);
    c.box(3, UY + 1, z0 + 1, 3, UY + 3, z0 + 2, B.glass);  // 통로 쪽 유리
    c.box(1, UY, z0 + 1, 2, UY, z0 + 2, B.sign);           // 진열대
    c.set(2, UY + 1, z0 + 1, B.glow);
    c.box(0, UY + 4, z0, 3, UY + 4, z0 + 3, B.sign);       // 간판 띠
    c.set(1, UY + 4, z0 + 1, B.glow);
  };
  shop(0); shop(5); shop(9);
  // 아래 날개 쪽 가게 둘 (축이 돌아간다)
  for (const z0 of [16, 21]) {
    c.box(0, UY, z0, 3, UY + 5, z0 + 3, B.deep);
    c.hollow(1, UY, z0 + 1, 3, UY + 4, z0 + 2);
    c.box(3, UY + 1, z0 + 1, 3, UY + 3, z0 + 2, B.glass);
    c.box(1, UY, z0 + 1, 2, UY, z0 + 2, B.sign);
    c.set(2, UY + 1, z0 + 1, B.glow);
  }

  /* 안내 카운터 — 나무 몸체 + 밝은 상판 + 모니터. 위층의 중심이다. */
  c.box(8, UY, 3, 16, UY + 1, 4, B.wood);
  c.box(8, UY + 1, 3, 16, UY + 1, 4, B.top);
  for (let x = 9; x <= 15; x += 3) c.box(x, UY + 2, 4, x, UY + 3, 4, B.dark);

  /* 바닥에서 위로 꿰뚫는 큰 기둥 — 복층의 높이를 한눈에 보여주는 장치 */
  c.box(23, 0, 18, 26, H - 2, 21, B.deep);

  /* 아래층 유리 키오스크 — 밑동만 호박색으로 빛난다 */
  const kiosk = (x, z) => {
    c.box(x, Y, z, x + 3, Y + 3, z + 3, B.deep);
    c.hollow(x + 1, Y, z + 1, x + 2, Y + 2, z + 2);
    c.box(x, Y, z, x + 3, Y, z + 3, B.sign);
    c.set(x + 1, Y, z + 1, B.glow);
    c.box(x, Y + 1, z + 1, x, Y + 2, z + 2, B.glass);
    c.box(x + 1, Y + 1, z + 3, x + 2, Y + 2, z + 3, B.glass);
  };
  kiosk(12, 18); kiosk(12, 26); kiosk(28, 26);

  /* 아래층 벤치 — 넓은 바닥이 허전해서 앉는 자리를 몇 줄 둔다 */
  for (const [bx, bz] of [[20, 14], [20, 23], [28, 14]]) {
    c.box(bx, Y, bz, bx + 3, Y, bz, B.wood);
    c.box(bx, Y, bz + 1, bx + 3, Y + 1, bz + 1, B.wood);
  }

  const walk = layWalkableTop(c, 0, 0, W - 1, D - 1, [B.mint, B.pale]);

  // 아이는 아래층 끝에서 들어와, 계단을 올라, 위층 관문으로 나간다
  c.set(W - 2, Y, D - 3, M.spawn);
  for (let z = 6; z <= 8; z++) c.set(4, UY, z, M.gate);

  await save(c, 'concourse', '환승 통로');
  return walk;
}

/* ══════════════════════════════════════════════════════════════
   4구역 · 대기실          미리보기: `2,3,4번 맵 가이드/4번 맵.png`

   여정에서 **처음으로 쉬어가는 곳**이다. 앞 세 구역이 전부 "지나가는 길"
   이었으니 여기는 앉는 가구로 채운다. 그림에서 읽은 것:

     · 민트 판을 **네 갈래 흰 통로**가 가로지른다 (십자로 뻗어 화면 밖으로).
     · 왼쪽 위 사무 구역 — 나무 책상 + 모니터 + 민트 의자.
     · 호박색으로 빛나는 **파티션**이 지그재그로 서서 구역을 나눈다.
     · 오른쪽·아래 라운지 — 민트 소파, 나무 안락의자, 탁자, 스탠드, 화분.
   ══════════════════════════════════════════════════════════════ */
async function lounge() {
  const W = 38, H = 12, D = 38;
  const c = canvas(W, H, D);

  const FLOOR = 1;
  const Y = FLOOR + 1;

  const B = {
    mint:  mc('cyan_concrete_powder'),
    deep:  mc('cyan_terracotta'),
    sofa:  mc('prismarine'),            // 민트 소파
    pale:  mc('white_concrete'),        // 통로
    wood:  mc('birch_planks'),
    top:   mc('smooth_sandstone'),      // 탁자 상판
    sign:  mc('yellow_terracotta'),     // 파티션 패널·조명 갓
    glow:  mc('glowstone'),
    dark:  mc('gray_concrete'),         // 모니터
    plant: mc('moss_block'),
    part:  mc('light_gray_stained_glass'),   // 사무 구역 뒤 반투명 칸막이
    glass: mc('white_stained_glass'),
  };

  // 민트 판
  c.box(0, 0, 0, W - 1, FLOOR, D - 1, B.deep);
  c.box(0, FLOOR, 0, W - 1, FLOOR, D - 1, B.mint);

  /* 네 갈래 흰 통로. 판을 가로지르며 화면 밖으로 빠져나간다 —
     이 방이 여정의 한 토막일 뿐이라는 걸 통로가 말해준다. */
  c.box(0, FLOOR, 16, W - 1, FLOOR, 21, B.pale);
  c.box(16, FLOOR, 0, 21, FLOOR, D - 1, B.pale);
  // 통로 가장자리에 한 줄 — 바닥과 통로가 같은 밝기로 뭉개지지 않게
  for (const z of [16, 21]) c.box(0, FLOOR, z, W - 1, FLOOR, z, B.deep);
  for (const x of [16, 21]) c.box(x, FLOOR, 0, x, FLOOR, D - 1, B.deep);

  /* 호박색 파티션 — 나무 틀에 빛나는 판. 지그재그로 세워 구역을 나눈다. */
  const panel = (x, z, along) => {
    const [dx, dz] = along === 'x' ? [1, 0] : [0, 1];
    for (let k = 0; k < 3; k++) {
      const px = x + dx * k, pz = z + dz * k;
      c.box(px, Y, pz, px, Y + 3, pz, B.sign);
      c.set(px, Y + 1, pz, B.glow);
    }
    c.set(x - dx, Y, z - dz, B.wood);
    c.box(x + dx * 3, Y, z + dz * 3, x + dx * 3, Y + 3, z + dz * 3, B.wood);
  };
  panel(13, 11, 'x'); panel(13, 14, 'x');
  panel(12, 15, 'z'); panel(12, 18, 'z');
  panel(22, 2, 'z'); panel(22, 5, 'z');
  panel(22, 22, 'x'); panel(22, 25, 'x');
  panel(4, 22, 'x'); panel(8, 22, 'x');

  /* 라운지 가구.
     소파는 **앉는 면 + 등받이 + 팔걸이**가 다 있어야 소파로 읽힌다. 앉는 면만
     깔면 그냥 민트색 띠다. 탁자는 상판을 한 단 밝게 해서 나무와 가른다. */
  const sofa = (x, z, along, back) => {
    const [dx, dz] = along === 'x' ? [1, 0] : [0, 1];
    const [bx, bz] = along === 'x' ? [0, back] : [back, 0];
    for (let k = 0; k < 4; k++) {
      const sx = x + dx * k, sz = z + dz * k;
      c.set(sx, Y, sz, B.sofa);                                  // 앉는 면
      c.box(sx + bx, Y, sz + bz, sx + bx, Y + 1, sz + bz, B.sofa); // 등받이
    }
    for (const k of [-1, 4]) {                                   // 양끝 팔걸이
      const sx = x + dx * k, sz = z + dz * k;
      c.box(sx, Y, sz, sx, Y + 1, sz, B.sofa);
    }
  };
  const chair = (x, z) => {                                      // 1인 안락의자
    c.box(x, Y, z, x + 1, Y, z + 1, B.wood);
    c.box(x, Y + 1, z, x + 1, Y + 1, z, B.wood);
  };
  const table = (x, z, w = 3, d = 2) => {
    c.box(x, Y, z, x + w - 1, Y, z + d - 1, B.top);
  };
  const lamp = (x, z) => {
    c.set(x, Y, z, B.wood);
    c.set(x, Y + 1, z, B.glow);
    c.set(x, Y + 2, z, B.sign);
  };
  const pot = (x, z) => { c.set(x, Y, z, B.wood); c.box(x, Y + 1, z, x, Y + 2, z, B.plant); };

  /* 응접 세트 한 벌 — 마주보는 소파 둘 + 안락의자 + 탁자 + 스탠드 + 화분.
     한 벌로 묶어 두 군데에 놓는다. 가구가 흩어져 있으면 "앉는 자리"로 안 읽힌다. */
  const seating = (ox, oz) => {
    sofa(ox + 1, oz, 'x', -1);
    sofa(ox + 1, oz + 5, 'x', 1);
    table(ox + 1, oz + 2, 4, 2);
    chair(ox + 6, oz + 2);
    lamp(ox, oz - 1);
    lamp(ox + 6, oz + 6);
    pot(ox - 1, oz + 3);
    pot(ox + 7, oz);
  };
  seating(24, 6);
  seating(24, 25);
  seating(5, 25);

  /* 사무 구역 — 책상 두 개가 등을 맞대고, 뒤에 회색 칸막이가 선다. */
  const desk = (x, z) => {
    c.box(x, Y, z, x + 3, Y, z + 1, B.wood);
    c.box(x, Y, z, x + 3, Y, z, B.top);                          // 상판 앞단
    c.box(x + 1, Y + 1, z, x + 2, Y + 2, z, B.dark);             // 모니터
    c.box(x + 1, Y, z + 2, x + 1, Y + 1, z + 2, B.sofa);         // 의자
  };
  const office = (ox, oz) => {
    desk(ox, oz); desk(ox + 5, oz);
    desk(ox, oz + 5); desk(ox + 5, oz + 5);
    c.box(ox - 1, Y, oz - 1, ox + 8, Y + 3, oz - 1, B.part);     // 뒤 칸막이
  };
  office(3, 4);

  const walk = layWalkableTop(c, 0, 0, W - 1, D - 1, [B.mint, B.pale, B.deep]);

  c.set(W - 2, Y, 18, M.spawn);
  for (let z = 17; z <= 20; z++) c.set(0, Y, z, M.gate);

  await save(c, 'lounge', '대기실');
  return walk;
}

const b = await concourse();
const d = await lounge();
console.log(`\n걸을 수 있는 칸: 환승 통로 ${b} · 대기실 ${d}`);
console.log('보기:  ?stage=03-concourse · ?stage=04-lounge');
console.log('2구역은 축척이 달라 생성기가 따로다 →  npm run map:zone2\n');
