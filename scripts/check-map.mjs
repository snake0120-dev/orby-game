// 임포트한 맵이 게임에서 제대로 인식되는지 확인하고 스크린샷을 남긴다.
//
//   npm run dev                         (다른 터미널에서 5180 포트로 띄워둘 것)
//   npm run map:check orbytest01.json
//
// 헤드리스 크롬을 CDP로 물려서 DEV에 열어둔 스토어를 직접 읽는다.
// 추가 의존성 없이 Node 내장 WebSocket만 쓴다 (scripts/verify.mjs 와 같은 방식).
import { spawn } from 'node:child_process';
import { writeFile } from 'node:fs/promises';

const MAP = process.argv[2] ?? 'orbytesttlqkf.json';
/** 스테이지 id. 주면 그 스테이지로 띄운다 (`01-gate`). */
const STAGE = process.argv[4] ?? '';
/** 그 밖에 붙일 URL 파라미터 */
const EXTRA = process.argv[5] ?? '';
const APP = `http://localhost:5180/?map=${MAP}${STAGE ? `&stage=${STAGE}` : ''}${EXTRA}`;
const PORT = 9334;
const SHOT = process.argv[3] ?? `/tmp/orby-${MAP.replace(/\.json$/, '')}.png`;

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--window-size=1280,720',
  `--user-data-dir=/tmp/orby-chk-${Date.now()}`, APP,
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:5180'));
      if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(500);
  }
  throw new Error('CDP 타깃을 못 찾음');
}

const ws = new WebSocket(await target());
await new Promise((r) => (ws.onopen = r));
let id = 0; const waiting = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (waiting.has(m.id)) waiting.get(m.id)(m); };
const send = (method, params) => new Promise((res) => { const i = ++id; waiting.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Runtime.enable');
await sleep(3500);

const PROBE = `(async () => {
  const S = () => window.__orby.getState();
  // 스테이지를 URL 로 지정했으면 App 이 이미 띄웠다. 아니면 1구역으로.
  if (S().phase === 'title') await S().goToStage(0);
  await new Promise(r => setTimeout(r, 900));
  const m = S().map;
  if (!m) return { error: S().error, phase: S().phase };
  const walk = [...m.walkY].filter(v => v >= 0).length;
  const gate = [...m.gate].filter(v => v === 1).length;
  return {
    phase: S().phase,
    size: [m.w, m.h, m.d],
    walk, gate,
    spawn: m.spawn,
    slots: m.slots,
    playerCell: S().playerCell,
    unknown: m.unknown,
    problems: window.__orbyCheck(),
  };
})()`;

const r = await send('Runtime.evaluate', { expression: PROBE, awaitPromise: true, returnByValue: true });
const v = r.result?.result?.value;
if (!v || v.error) {
  console.error('✗ 맵을 못 띄웠습니다:', v?.error ?? JSON.stringify(r.result));
  chrome.kill(); process.exit(1);
}
console.log(`\n맵 ${v.size.join(' × ')}`);
console.log(`  걸을 수 있는 칸  ${v.walk}`);
console.log(`  시작 자리        ${v.spawn ? `[${v.spawn}]` : '없음'}`);
console.log(`  관문             ${v.gate}칸`);
v.slots.forEach((c, i) => {
  if (c) console.log(`  물건 ${'①②③④'[i]}          [${c}]`);
});
if (v.unknown.length) console.log(`  ⚠ 표에 없는 블록: ${v.unknown.join(', ')}`);
console.log(v.problems.length ? '\n고칠 것:' : '\n✓ 검사기가 찾은 문제 없음');
v.problems.forEach((p) => console.log(`  ✗ ${p}`));

await send('Runtime.evaluate', { expression: `window.__orby.getState().say(null)` });
await sleep(600);
const shot = await send('Page.captureScreenshot', { format: 'png' });
if (shot.result?.data) { await writeFile(SHOT, Buffer.from(shot.result.data, 'base64')); console.log('\n스크린샷:', SHOT); }
chrome.kill(); process.exit(0);
