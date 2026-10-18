#!/usr/bin/env node
/**
 * 패널에서 놓은 **체크포인트 ✦ 를 기본값으로 굳힌다.**   npm run zone2:marks
 *
 * 표식은 `zone2-edits.json` 에 적힌다(패널이 자동 저장한다). 그런데 그 파일은
 * **개발 서버에서만** 읽히므로, 여정 화면(`index.html`)에는 스테이지 파일에
 * 적힌 것만 나온다. 이 스크립트가 그 둘을 맞춘다.
 *
 * 블록과 달리 맵을 다시 구울 필요가 없다 — 표식은 그려 넣는 것이다(결정 ㊳).
 */
import { readFile, writeFile } from 'node:fs/promises';

const EDITS = 'zone2-edits.json';
const STAGE = 'src/game/stages/02-immigration.ts';

const edits = JSON.parse(await readFile(EDITS, 'utf8'));

/* **`표식` 칸이 아예 없으면 손대지 않는다.**
   "없다"와 "하나도 없다"는 다르다 — 패널이 아직 한 번도 안 적은 상태에서
   이 스크립트를 돌리면 스테이지에 적어 둔 기본값이 통째로 지워진다.
   실제로 그렇게 한 번 지웠다. 비우려면 패널에서 전부 지우고 저장하면
   `표식: []` 이 적히고, 그때는 아래가 비운다. */
if (!Array.isArray(edits.표식)) {
  console.log('편집 파일에 표식이 없습니다 — 스테이지 기본값을 그대로 둡니다.');
  process.exit(0);
}
const marks = edits.표식;

const body = marks.length
  ? marks
    .map((m) => `    { id: '${m.id}', at: [${m.자리[0]}, ${m.자리[1]}], `
      + `height: ${m.높이}, scale: ${m.크기} },`)
    .join('\n')
  : null;

const src = await readFile(STAGE, 'utf8');

/* `marks: [` 부터 **짝이 맞는 닫는 괄호**까지를 바꾼다.
   정규식으로 끝을 찾으려다 한 번 틀렸다 — 표식 안의 `at: [59, 126],` 이
   먼저 걸려서 파일이 반 토막 났다. 대괄호를 세는 게 확실하다. */
const head = '  marks: [';
const from = src.indexOf(head);
if (from < 0) {
  console.error(`${STAGE} 에서 marks 를 못 찾았습니다 — 손으로 고쳐야 합니다.`);
  process.exit(1);
}
let depth = 0;
let to = -1;
for (let i = from + head.length - 1; i < src.length; i++) {
  if (src[i] === '[') depth++;
  else if (src[i] === ']') {
    depth--;
    if (depth === 0) { to = i + 1; break; }
  }
}
if (to < 0) {
  console.error(`${STAGE} 의 marks 가 닫히지 않았습니다 — 손으로 고쳐야 합니다.`);
  process.exit(1);
}
const next = src.slice(0, from)
  + (body === null ? '  marks: []' : `  marks: [\n${body}\n  ]`)
  + src.slice(to);

await writeFile(STAGE, next);
console.log(
  `체크포인트 ${marks.length}개를 기본값으로 굳혔습니다 (${STAGE})` +
  (marks.length ? `\n  ${marks.map((m) => `${m.id} (${m.자리.join(', ')})`).join(' · ')}` : ''),
);
