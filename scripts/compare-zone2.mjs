#!/usr/bin/env node
/**
 * 2구역 렌더를 **미리보기 그림과 나란히·겹쳐서** 한 장으로 뽑는다.
 *
 *   npm run dev                       (5180 포트로 띄워둘 것)
 *   node scripts/compare-zone2.mjs [출력경로]
 *
 * 왜 있는가 — "띄워보고 눈대중으로 고치기"를 반복하다 그림에서 세 번 멀어졌다.
 * 요소를 하나 얹을 때마다 이걸 돌려서 **옆에 놓고** 본다.
 *
 * 추가 의존성 없이 Node 내장 WebSocket 으로 헤드리스 크롬을 물린다
 * (`scripts/verify.mjs` 와 같은 방식).
 */
import { spawn } from 'node:child_process';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const OUT = process.argv[2] ?? 'public/compare-zone2.png';
const GUIDE = '../2,3,4번 맵 가이드/2번 맵.png';
const APP = 'http://localhost:5180/zone2.html';
const PORT = 9336;
const W = 1400, H = 995;            // 가이드와 같은 가로세로비 (2497×1775)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', `--window-size=${W},${H}`,
  `--user-data-dir=${join(tmpdir(), `orby-cmp-${Date.now()}`)}`, APP,
], { stdio: 'ignore' });

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.url.includes('zone2'));
      if (page) return page;
    } catch { /* 아직 안 떴다 */ }
    await sleep(500);
  }
  throw new Error('헤드리스 크롬이 안 떴다');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const pend = new Map();
await new Promise((r) => ws.addEventListener('open', r));
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method, params = {}) =>
  new Promise((res) => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });

await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.enable');
await send('Page.navigate', { url: APP });
/* 6만 블록짜리 맵이라 로딩이 길다. 짧게 잡았더니 **빈 화면**이 찍혀서
   두 번 헛돌았다 — 캔버스에 뭔가 그려질 때까지 기다린 뒤 조금 더 둔다. */
for (let i = 0; i < 40; i++) {
  await sleep(3000);
  const r = await send('Runtime.evaluate', {
    expression: 'document.querySelector("canvas") ? 1 : 0', returnByValue: true,
  });
  if (r?.result?.result?.value === 1 && i >= 6) break;
}
await sleep(12000);

let shot = null;
for (let t = 1; t <= 6 && !shot; t++) {
  const r = await Promise.race([
    send('Page.captureScreenshot', { format: 'png' }),
    sleep(30000).then(() => null),
  ]);
  shot = r?.result?.data ?? null;
  if (!shot) console.log(`캡처 지연, 재시도 ${t}`);
}
ws.close(); chrome.kill();
if (!shot) { console.error('캡처 실패'); process.exit(1); }

await mkdir('public', { recursive: true });
const mine = join(tmpdir(), `orby-zone2-${Date.now()}.png`);
await writeFile(mine, Buffer.from(shot, 'base64'));

/* 합성은 파이썬(Pillow)에 맡긴다 — Node 쪽에 이미지 라이브러리를 들이지 않는다 */
const py = `
from PIL import Image
g = Image.open(${JSON.stringify(GUIDE)}).convert("RGB").resize((${W}, ${H}))
m = Image.open(${JSON.stringify(mine)}).convert("RGB").resize((${W}, ${H}))
out = Image.new("RGB", (${W}, ${H} * 2 + 12), (16, 16, 22))
out.paste(g, (0, 0)); out.paste(m, (0, ${H} + 12))
out.save(${JSON.stringify(OUT)})
Image.blend(g, m, 0.5).save(${JSON.stringify(OUT.replace(/\.png$/, '-overlay.png'))})
print("위=가이드 / 아래=지금 렌더")
`;
const p = spawn('python3', ['-c', py], { stdio: 'inherit' });
await new Promise((r) => p.on('close', r));
console.log(`${OUT}\n${OUT.replace(/\.png$/, '-overlay.png')}  (반반 겹친 것)`);
await readFile(OUT);
