#!/usr/bin/env node
/**
 * 마인크래프트 Bedrock 월드 → 게임 맵(JSON).
 *
 *   node scripts/import-mcworld.mjs "테스트 맵"                  # 월드 폴더 (압축 안 푼 것)
 *   node scripts/import-mcworld.mjs "테스트 맵/db"               # db 폴더만 있어도 된다
 *   node scripts/import-mcworld.mjs maps/01-checkin.mcworld      # 내보낸 파일
 *   node scripts/import-mcworld.mjs "테스트 맵" --name orbytest01
 *
 * 왜 월드 통째인가: 구조 블록의 "내보내기"는 iOS에서 막혀 있다. 하지만 "저장"은
 * 월드의 LevelDB 안에 `structuretemplate_<이름>` 키로 들어가므로, 월드를 빼면 그 안에 있다.
 *
 * 이 스크립트는 **색도 보행 영역도 모른다.** 블록 이름만 뽑아서 넘기고,
 * 색 매핑과 보행 영역 계산은 게임이 런타임에 한다 (src/game/blocks.ts, src/engine/voxelMap.ts).
 * 덕분에 색이나 규칙을 고칠 때 재임포트가 필요 없다.
 */
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import {
  extractStructureFilesFromMcworld,
  extractStructureFilesFromLevelDbKeys,
  readLevelDb,
} from 'mcbe-leveldb-reader';
import { readMcStructure } from './lib/mcstructure.mjs';
import { crop, rleEncode } from './lib/mapdata.mjs';
import { MARKERS, ROLE_LABEL, EMPTY_BLOCKS, stripNamespace } from './lib/markers.mjs';

const OUT_DIR = 'public/maps';

const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--'));
const wantName = args.includes('--name') ? args[args.indexOf('--name') + 1] : null;

if (!target) {
  console.error('사용법: node scripts/import-mcworld.mjs <월드 폴더 | .mcworld> [--name 구조이름]');
  process.exit(1);
}

/* ── 1. 구조 파일 꺼내기 ─────────────────────────────────── */

/** 폴더 안의 LevelDB 파일들을 File[] 로 읽는다. `db` 폴더거나 그 부모여도 된다. */
async function levelDbFiles(dir) {
  const entries = await readdir(dir);
  const root = entries.includes('db') ? join(dir, 'db') : dir;
  const out = [];
  for (const name of await readdir(root)) {
    const path = join(root, name);
    if (!(await stat(path)).isFile()) continue;
    out.push(new File([await readFile(path)], name));
  }
  if (out.length === 0) throw new Error(`${root} 안에 LevelDB 파일이 없습니다.`);
  return out;
}

let structures;
const isDir = (await stat(target)).isDirectory();

try {
  if (isDir) {
    console.log(`\n${basename(target)} 폴더에서 월드 데이터 읽는 중…`);
    const keys = await readLevelDb(await levelDbFiles(target), { log: () => {}, error: () => {} });
    structures = extractStructureFilesFromLevelDbKeys(keys, true);
  } else {
    const buf = await readFile(target);
    console.log(`\n${basename(target)} 읽는 중… (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
    structures = await extractStructureFilesFromMcworld(new Blob([buf]), true);
  }
} catch (e) {
  console.error('\n✗ 월드를 열지 못했습니다:', e.message);
  console.error('  폴더라면 안에 db 폴더가 있어야 하고, 파일이라면 월드 내보내기가 끝난 것이어야 합니다.');
  process.exit(1);
}

const names = [...structures.keys()];
if (names.length === 0) {
  console.error('\n✗ 이 월드에 저장된 구조가 없습니다.');
  console.error('  구조 블록을 "저장(Save)" 모드로 두고 저장 버튼을 눌렀는지 확인하세요.');
  process.exit(1);
}

console.log(`구조 ${names.length}개 발견: ${names.join(', ')}`);
const picked = wantName ?? names[names.length - 1]; // 이름을 안 주면 마지막에 저장한 것
if (!structures.has(picked)) {
  console.error(`\n✗ '${picked}' 라는 구조가 없습니다. 위 목록 중에서 --name 으로 골라주세요.`);
  process.exit(1);
}
if (!wantName && names.length > 1) {
  console.log(`  → '${picked}' 를 씁니다. 다른 걸 쓰려면 --name 으로 골라주세요.`);
}

const st = readMcStructure(new Uint8Array(await structures.get(picked).arrayBuffer()));
console.log(
  `\n'${picked}' 원본 크기: ${st.size.join(' × ')} (${(st.size[0] * st.size[1] * st.size[2]).toLocaleString()}칸)`,
);

/* ── 2. 공기를 빈칸으로 바꾸고 잘라내기 ──────────────────── */

// 구조 블록은 공기도 팔레트에 넣어 저장한다. 그대로 두면 crop 이 아무것도 못 자르고
// RLE 도 안 접힌다. 빈칸(-1)으로 바꿔야 실제 지은 범위만 남는다.
const isEmpty = st.palette.map((p) => EMPTY_BLOCKS.has(stripNamespace(p.name)));
const solidified = Int16Array.from(st.indices, (v) => (v >= 0 && isEmpty[v] ? -1 : v));

const cropped = crop(solidified, st.size);
const [w, h, d] = cropped.size;
console.log(`빈 공간 잘라낸 크기: ${w} × ${h} × ${d}`);

/* ── 3. 블록 개수 ────────────────────────────────────────── */

const counts = new Map();
for (const v of cropped.indices) {
  if (v < 0) continue;
  const n = stripNamespace(st.palette[v]?.name ?? `<팔레트 밖 ${v}>`);
  counts.set(n, (counts.get(n) ?? 0) + 1);
}

console.log('\n사용된 블록:');
for (const [name, n] of [...counts].sort((a, b) => b[1] - a[1])) {
  if (MARKERS[name]) continue; // 마커는 아래에서 따로 보여준다
  console.log(`  ${String(n).padStart(7)}  ${name}`);
}

/* ── 4. 마커 확인 — 이 출력이 "제대로 옮겨졌나"의 답이다 ──── */

console.log('\n마커 확인:');
const found = new Map(); // role → 개수
for (const [name, n] of counts) {
  const m = MARKERS[name];
  if (m) found.set(m.role, (found.get(m.role) ?? 0) + n);
}

const problems = [];
const line = (ok, what, detail) =>
  console.log(`  ${ok ? '✓' : '·'} ${what.padEnd(14, ' ')} ${detail}`);

for (const [name, m] of Object.entries(MARKERS)) {
  const n = counts.get(name) ?? 0;
  if (n > 0) line(true, ROLE_LABEL[m.role] ?? m.role, `${m.ko}  ${n}칸`);
}

const spawn = found.get('spawn') ?? 0;
const gate = found.get('gate') ?? 0;
const props = found.get('prop') ?? 0;
const slots = ['slot1', 'slot2', 'slot3', 'slot4'].filter((r) => found.get(r)).length;

if (spawn === 0) problems.push(`시작 자리가 없습니다. ${MARKERS_BY_ROLE('spawn')}를 1개 놓으세요.`);
if (spawn > 1) problems.push(`시작 자리가 ${spawn}개입니다. ${MARKERS_BY_ROLE('spawn')}를 하나만 남기세요.`);
if (gate === 0) problems.push(`관문이 없습니다. ${MARKERS_BY_ROLE('gate')}를 놓으세요.`);
// 상호작용 지점이 없는 맵도 정상이다 — 지형만 먼저 확인하는 단계가 있다.
if (props + slots > 4) problems.push(`상호작용 지점이 ${props + slots}개입니다. 한 구역에 4개까지만 됩니다.`);

function MARKERS_BY_ROLE(role) {
  const hit = Object.values(MARKERS).find((m) => m.role === role);
  return hit ? hit.ko : role;
}

if (props > 0) {
  console.log(`\n  상호작용 지점 ${props}개는 맵을 내려다본 순서(위→아래, 왼→오른쪽)대로`);
  console.log('  ①②③④ 가 됩니다. 게임에서 ✦ 표시로 확인하세요.');
}

if (problems.length) {
  console.log('\n고칠 것:');
  problems.forEach((p) => console.log(`  ✗ ${p}`));
}

/* ── 5. 저장 ─────────────────────────────────────────────── */

const map = {
  source: basename(target),
  structure: picked,
  size: [w, h, d],
  palette: st.palette.map((p) => p.name),
  /**
   * 팔레트별 블록 상태값. 계단의 방향(weirdo_direction)·뒤집힘(upside_down_bit)이
   * 여기 들어 있다. 이걸 버리면 ㄴ자 계단이 통짜 큐브로 나온다.
   */
  states: st.palette.map((p) => p.states ?? {}),
  /** [값, 반복횟수] 쌍. 값 -1 은 빈칸. 순서는 ZYX (i = d*h*x + d*y + z) */
  rle: rleEncode(Array.from(cropped.indices)),
};

await mkdir(OUT_DIR, { recursive: true });
const outPath = join(OUT_DIR, `${picked}.json`);
await writeFile(outPath, JSON.stringify(map));

const raw = w * h * d * 2;
const size = (await readFile(outPath)).length;
console.log(
  `\n✓ ${outPath} (${(size / 1024).toFixed(0)}KB, 압축 안 했으면 ${(raw / 1024).toFixed(0)}KB)`,
);
console.log(`\n게임에서 보기:  npm run dev  →  localhost:5173/?map=${picked}.json`);
console.log('  G 키를 누르면 걸을 수 있는 곳이 색으로 보입니다.\n');
