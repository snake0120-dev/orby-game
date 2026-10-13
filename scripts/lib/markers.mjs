/**
 * `src/game/markers.json` 을 Node 쪽에서 읽는다.
 *
 * 게임(blocks.ts)과 임포터가 **같은 파일**을 보게 하려고 이렇게 둘렀다.
 * 표를 두 군데 적어두면 언젠가 반드시 어긋나고, 그때 생기는 버그는
 * "마인크래프트에서는 놓았는데 게임에 안 나온다" 라서 원인을 찾기 어렵다.
 */
import { readFile } from 'node:fs/promises';

const json = JSON.parse(
  await readFile(new URL('../../src/game/markers.json', import.meta.url), 'utf8'),
);

/** `minecraft:red_carpet` → `red_carpet` */
export const stripNamespace = (name) =>
  name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;

/**
 * 방식별로 묶여 있는 표를 한 장으로 편다.
 * `_` 로 시작하는 키는 사람이 읽을 주석이라 건너뛴다.
 */
export const MARKERS = Object.fromEntries(
  Object.entries(json)
    .filter(([k, v]) => !k.startsWith('_') && v && typeof v === 'object' && !Array.isArray(v))
    .flatMap(([, group]) => Object.entries(group)),
);

/** role → 사람이 읽을 이름 */
export const ROLE_LABEL = {
  walk: '걷는 바닥',
  spawn: '시작 자리',
  gate: '관문',
  prop: '상호작용',
  slot1: '물건 ①',
  slot2: '물건 ②',
  slot3: '물건 ③',
  slot4: '물건 ④',
};

/**
 * 그리지도 않고 마커도 아닌 것 — 빈칸으로 친다.
 * `src/game/blocks.ts` 의 EMPTY 와 같아야 한다.
 */
export const EMPTY_BLOCKS = new Set([
  'air', 'structure_void', 'cave_air', 'void_air', 'bedrock', 'structure_block',
]);
