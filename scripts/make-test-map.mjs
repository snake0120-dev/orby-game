#!/usr/bin/env node
/**
 * 합성 테스트 맵 생성기.  node scripts/make-test-map.mjs
 *
 * 임포터가 뱉는 것과 **완전히 같은 형식**의 JSON을 만든다.
 * 진짜 .mcworld 가 도착하기 전까지 렌더러·길찾기·검사기를 검증하는 용도이고,
 * 실물이 오면 같은 자리에 그대로 갈아끼우면 된다.
 *
 * 마인크래프트에서 지을 때와 동일한 규칙을 따른다:
 *   - 마커(흑요석 등)는 바닥 **위** 칸에 놓는다 = 아이 발이 닿는 높이
 *   - 아이 키 8블록 기준
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { rleEncode } from './lib/mapdata.mjs';
import { xyzToIndex } from './lib/mcstructure.mjs';

const W = 44, H = 16, D = 32;          // x, y, z
const SIZE = [W, H, D];
const cells = new Int16Array(W * H * D).fill(-1);

const palette = [];
const id = (name) => {
  const i = palette.indexOf(name);
  return i >= 0 ? i : (palette.push(name) - 1);
};
const set = (x, y, z, name) => {
  if (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D) return;
  cells[xyzToIndex(x, y, z, SIZE)] = id(name);
};
const box = (x0, y0, z0, x1, y1, z1, name) => {
  for (let x = x0; x <= x1; x++)
    for (let y = y0; y <= y1; y++)
      for (let z = z0; z <= z1; z++) set(x, y, z, name);
};

/* 바닥 (y=0) */
box(0, 0, 0, W - 1, 0, D - 1, 'minecraft:white_concrete');
/* 가운데 카펫 느낌 */
box(12, 0, 10, 31, 0, 21, 'minecraft:light_gray_concrete');

/* 벽 — 사방 12블록 높이. 카메라 앞쪽은 엔진의 근경 절단이 처리한다. */
const WALL = 'minecraft:white_concrete';
box(0, 1, 0, W - 1, 12, 0, WALL);
box(0, 1, D - 1, W - 1, 12, D - 1, WALL);
box(0, 1, 0, 0, 12, D - 1, WALL);
box(W - 1, 1, 0, W - 1, 12, D - 1, WALL);

/* 관문 구멍 — 앞쪽 벽(z 최대)에 6칸 뚫는다 */
for (let x = 19; x <= 24; x++)
  for (let y = 1; y <= 12; y++) cells[xyzToIndex(x, y, D - 1, SIZE)] = -1;

/* 체크인 카운터 두 개 (높이 6 = 아이 가슴께) */
box(6, 1, 5, 15, 6, 7, 'minecraft:light_gray_concrete');
box(28, 1, 5, 37, 6, 7, 'minecraft:light_gray_concrete');

/* 만질 수 있는 물건 = 주황 (색 규칙) */
box(9, 7, 5, 12, 8, 7, 'minecraft:orange_concrete');
/* 길을 알려주는 이정표 = 청록 */
box(21, 1, 16, 22, 14, 17, 'minecraft:cyan_concrete');

/* 소품 몇 개 */
box(34, 1, 24, 37, 4, 27, 'minecraft:brown_concrete');
box(6, 1, 24, 8, 3, 26, 'minecraft:brown_concrete');
/* 표에 없는 블록도 하나 — 경고가 제대로 뜨는지 보려고 */
box(16, 1, 26, 17, 2, 27, 'minecraft:honeycomb_block');

/* ── 마커: 전부 바닥 위 칸(y=1). 화면에는 안 나온다 ────────── */
/* 걸어다닐 수 있는 영역 */
for (let x = 2; x <= W - 3; x++)
  for (let z = 2; z <= D - 3; z++) {
    if (cells[xyzToIndex(x, 1, z, SIZE)] !== -1) continue;  // 이미 뭐가 있으면 건너뛴다
    set(x, 1, z, 'minecraft:obsidian');
  }
/* 관문 앞까지 이어주기 */
for (let x = 19; x <= 24; x++) for (let z = D - 3; z <= D - 2; z++) set(x, 1, z, 'minecraft:obsidian');

/* 시작 위치 */
set(22, 1, 4, 'minecraft:redstone_block');
/* 관문 */
for (let x = 20; x <= 23; x++) set(x, 1, D - 1, 'minecraft:emerald_block');
/* 물건 자리 ①② — 카운터 앞 (아이는 옆 칸에 서서 만진다) */
set(11, 1, 8, 'minecraft:gold_block');
set(32, 1, 8, 'minecraft:diamond_block');

const map = {
  source: '(합성 테스트 맵)',
  structure: 'test-room',
  size: SIZE,
  palette,
  rle: rleEncode(Array.from(cells)),
};

await mkdir('public/maps', { recursive: true });
await writeFile('public/maps/test-room.json', JSON.stringify(map));

const filled = cells.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0);
console.log(`test-room  ${W}×${H}×${D}  블록 ${filled.toLocaleString()}개`);
console.log(`팔레트 ${palette.length}종:`, palette.map((p) => p.replace('minecraft:', '')).join(', '));
console.log(`RLE ${map.rle.length}개 → public/maps/test-room.json`);
