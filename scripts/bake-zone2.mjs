#!/usr/bin/env node
/**
 * 손으로 놓은 블록을 **생성기의 기본값으로 굽는다.**   node scripts/bake-zone2.mjs
 *
 * `zone2.html` 의 블록 붓으로 놓은 칸은 `zone2-edits.json` 에 "편집"으로 쌓인다.
 * 쌓일수록 한 칸 놓을 때마다 그 전부를 다시 글자로 바꿔 저장소와 파일에 적게
 * 되고(천 칸이면 60KB·108KB), 패널의 "놓은 블록 N칸"도 영원히 안 줄어든다.
 *
 * 마음에 드는 자리가 나왔으면 여기서 **기본값으로 옮긴다** —
 * `scripts/zone2-blocks.json` 이 그 자리다. 생성기가 매번 읽어서, 코드로 지은
 * 판·벽과 똑같이 취급한다. 편집 층은 비워져서 다시 0칸에서 시작한다.
 *
 * 자리는 절대 좌표라 몇 번 적용해도 결과가 같다. 그래서 굽기 전과 후의
 * **맵 파일이 글자 하나까지 같아야** 한다 — 아래에서 그걸 확인하고 알려준다.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';

const BASE = 'scripts/zone2-blocks.json';
const EDITS = 'zone2-edits.json';
const MAP = 'public/maps/immigration.json';

const read = async (file, fallback) => {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
};
const hash = async () =>
  createHash('sha1').update(await readFile(MAP)).digest('hex').slice(0, 12);

const before = await hash();
const base = await read(BASE, []);
const edits = await read(EDITS, {});
const hand = edits.손블록 ?? [];

if (!hand.length) {
  console.log('편집 층이 이미 비어 있습니다 — 구울 게 없습니다.');
  process.exit(0);
}

/* 같은 칸이면 **나중 것이 이긴다.** 편집 층이 기본값보다 나중이다. */
const key = (b) => b.자리.join(',');
const merged = new Map(base.map((b) => [key(b), b]));
for (const h of hand) merged.set(key(h), h);
const baked = [...merged.values()];

await writeFile(BASE, JSON.stringify(baked, null, 1));
edits.손블록 = [];
await writeFile(EDITS, JSON.stringify(edits, null, 2));

execFileSync('node', ['scripts/make-zone2.mjs'], { stdio: 'inherit' });

/* 새 지문을 편집 파일에 적는다. 브라우저는 지문이 같으면 "파일이 진짜"로 보고
   저장소에 남아 있던 옛 블록을 버린다 (`parts.ts` 의 `loadEdits`). */
const parts = JSON.parse(await readFile('public/maps/immigration-parts.json', 'utf8'));
edits.지문 = parts.stamp;
await writeFile(EDITS, JSON.stringify(edits, null, 2));

const after = await hash();
console.log(
  `\n기본값으로 구운 블록 ${baked.length.toLocaleString()}칸  ` +
  `(이번에 ${hand.length.toLocaleString()}칸 옮김)  → ${BASE}`,
);
console.log(
  before === after
    ? `맵은 그대로입니다 (지문 ${after}) — 보이는 것은 하나도 안 바뀌었습니다.`
    : `⚠ 맵이 바뀌었습니다: ${before} → ${after}  (개체와 겹친 칸이 있는지 보세요)`,
);
