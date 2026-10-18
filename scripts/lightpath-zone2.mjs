#!/usr/bin/env node
/**
 * 파놓은 바닥에 **빛길을 깐다.**   node scripts/lightpath-zone2.mjs
 *
 * 천우태가 2구역 바닥을 네 칸 폭으로 파내 유도 동선을 그렸다. 단면은 이렇다:
 *
 *     y13  검은 양탄자    ← 걷는 칸 (생성기가 자동으로 깐다)
 *     y12  흰 반투명 유리  ← 지면
 *     y11  ochre froglight ← 유리 밑에서 올라오는 빛
 *
 * 하는 일 둘:
 *   ① **파놓기만 한 지면**(`지움`)을 유리로 메운다. 빈 칸을 전부 메우지 않고
 *      '손으로 지운 칸'만 보는 이유는, 판에 원래 깎아 둔 자리(섹션 1의 들쭉날쭉한
 *      변)까지 메우면 그 실루엣이 사라지기 때문이다.
 *   ② **지면 유리 밑을 전부 같은 빛으로 맞춘다.**
 *
 * ## ②를 '구워진 맵'에서 찾는 이유
 *
 * 전에는 손블록 목록만 훑었다. 그러니 **코드와 개체가 깐 유리를 못 봤다** —
 * 지면 유리는 손으로 깐 것만이 아니고, 손으로 깐 자리도 개체가 나중에 덮으면
 * 결과가 달라진다. 실제로 그 바람에 유리 밑 스물여덜 칸이 글로스톤으로 남아
 * 빛길에서 빠져 있었다(늘 켜진 채였다).
 *
 * 그래서 이제 **맵을 한 번 굽고, 구워진 결과를 읽어서** 지면 유리를 찾는다.
 * 맵은 코드·개체·손블록을 다 합친 최종 그림이라 빠지는 칸이 없다. 거기서 고칠
 * 자리가 나오면 손블록으로 적고 한 번 더 굽는다.
 *
 * 한 번 돌리면 그 칸들이 '지움'에서 '유리'로 바뀌므로, 또 돌려도 아무 일도
 * 안 일어난다. 새로 파낸 뒤에 다시 돌리면 그 자리에만 깔린다.
 */
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

/** `make-zone2.mjs` 의 FLOOR — 판 맨 윗단(지면) */
const FLOOR = 12;
const GLASS = 'minecraft:white_stained_glass';
/**
 * 빛길에 쓰는 발광 블록 — **froglight** 다. 글로스톤이 아닌 이유 둘:
 *
 * ① 글로스톤은 **전구**라(`isLamp`), 900칸을 깔면 광원이 수십 개 켜진다.
 *    froglight 는 밝게 보이기만 하고 전구를 안 켠다 (결정 ㉛).
 * ② 엔진이 **빛 종류마다 메시를 나눈다.** 길만 아이 둘레에서 켜지게 하려면
 *    (`Stage.pathGlow`) 부스 사인에 박힌 글로스톤과 종류가 달라야 한다.
 */
const GLOW = 'minecraft:ochre_froglight';

const BASE = 'scripts/zone2-blocks.json';
const EDITS = 'zone2-edits.json';
const MAP = 'public/maps/immigration.json';

const read = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
};

const key = (x, y, z) => `${x},${y},${z}`;
const blocks = await read(BASE, []);
const edits = await read(EDITS, {});
const byKey = new Map(blocks.map((b) => [key(...b.자리), b]));

/* **브라우저에서 방금 놓은 것부터 거둬들인다.**
   이걸 안 하고 아래에서 편집 층을 비우면 그 작업이 통째로 날아간다 —
   먼 통로에 새로 판 95칸을 그렇게 한 번 잃을 뻔했다. 굽는 것과 같은 규칙이다:
   같은 칸이면 **나중 것(편집)이 이긴다.** */
let taken = 0;
for (const h of edits.손블록 ?? []) { byKey.set(key(...h.자리), h); taken++; }

/* ── ① 파놓기만 한 지면을 유리로 ───────────────────────── */
let glass = 0;
for (const b of [...byKey.values()]) {
  if (!b.지움 || b.자리[1] !== FLOOR) continue;
  const [x, , z] = b.자리;
  byKey.set(key(x, FLOOR, z), { 자리: [x, FLOOR, z], 블록: GLASS });
  glass++;
}

const save = () => writeFile(BASE, JSON.stringify([...byKey.values()], null, 1));
const bake = () => execFileSync('node', ['scripts/make-zone2.mjs'], { stdio: 'inherit' });
const saveEdits = () => writeFile(EDITS, JSON.stringify(edits, null, 2));

await save();
/* **거둬들인 편집은 바로 비운다.** 굽기는 기본값 위에 편집을 얹으므로,
   비우지 않으면 아래 ②에서 고친 칸을 편집이 다시 덮어쓴다 — 실제로 여섯 칸이
   그렇게 글로스톤으로 되돌아갔다. 내용은 이미 기본값에 들어갔으니 안 잃는다.
   (지문은 맨 끝에 새 걸로 맞춘다 — 지금 맞춰도 아래에서 한 번 더 구우면 바뀐다.) */
edits.손블록 = [];
await saveEdits();
bake();

/* ── ② 구워진 맵에서 지면 유리를 찾아 밑을 맞춘다 ──────── */

/** 맵 JSON → 칸을 바로 물어볼 수 있는 꼴 */
const openMap = async () => {
  const m = await read(MAP, null);
  const [w, h, d] = m.size;
  let n = 0;
  for (let i = 1; i < m.rle.length; i += 2) n += m.rle[i];
  const cells = new Int16Array(n);
  let o = 0;
  for (let i = 0; i < m.rle.length; i += 2) {
    cells.fill(m.rle[i], o, o + m.rle[i + 1]);
    o += m.rle[i + 1];
  }
  return {
    w, h, d,
    /** 블록 이름, 빈 칸이면 null */
    at: (x, y, z) => {
      if (x < 0 || y < 0 || z < 0 || x >= w || y >= h || z >= d) return null;
      const v = cells[x * h * d + y * d + z];
      return v < 0 ? null : m.palette[v];
    },
  };
};

const map = await openMap();
/** 유리 밑에서 바꾼 블록을 종류별로 센다 — 뭐가 잘못 박혀 있었는지 보고용 */
const was = {};
let path = 0;
for (let x = 0; x < map.w; x++) {
  for (let z = 0; z < map.d; z++) {
    if (map.at(x, FLOOR, z) !== GLASS) continue;
    path++;
    const under = map.at(x, FLOOR - 1, z);
    if (under === GLOW) continue;
    was[under ?? '빈 칸'] = (was[under ?? '빈 칸'] || 0) + 1;
    byKey.set(key(x, FLOOR - 1, z), { 자리: [x, FLOOR - 1, z], 블록: GLOW });
  }
}
const fixed = Object.values(was).reduce((a, b) => a + b, 0);

console.log(
  (taken ? `브라우저에서 거둔 편집 ${taken}칸\n` : '') +
  `빛길 — 지면 유리 ${path}칸 · 새로 깐 유리 ${glass}칸 · 밑을 빛으로 고친 칸 ${fixed}` +
  (fixed ? `\n  고친 내역 ${JSON.stringify(was)}` : ''),
);

if (fixed) { await save(); bake(); }

/* 새 지문을 편집 파일에 적는다.
   **이게 없으면 방금 깐 유리가 다시 지워진다** — 브라우저에는 "이 칸을 지워라"가
   아직 남아 있고, 편집은 기본값보다 나중에 얹히기 때문이다. 지문이 맞으면
   브라우저가 "파일이 진짜"로 보고 저장소에 남은 옛 편집을 버린다
   (`src/zone2/parts.ts` 의 `loadEdits`). */
const parts = JSON.parse(await readFile('public/maps/immigration-parts.json', 'utf8'));
edits.지문 = parts.stamp;
await saveEdits();
console.log('편집 층을 비우고 지문을 맞췄습니다 — 창을 새로고침하면 그대로 보입니다.');
