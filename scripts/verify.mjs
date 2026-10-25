// ORBY 게임 루프 검증. 실행 중인 dev 서버를 헤드리스 크롬으로 열고
// DEV에서 노출한 zustand 스토어를 직접 두드려 상태머신을 확인한다.
import { spawn } from 'node:child_process';

/* `opening=0` — 오프닝 모션그래픽을 안 띄운다. 띄우면 그게 떠오르면서 부르는
   `goToStage(0)` 이 검사기가 모는 여정 중간에 끼어든다 (`store.ts` 의 SKIP_OPENING). */
const URL_APP = 'http://localhost:5180/?opening=0';
const PORT = 9333;

const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  '--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--window-size=1280,720',
  `--user-data-dir=/tmp/orby-cdp-${Date.now()}`, URL_APP,
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:5180'));
      if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
    } catch { /* 아직 안 떴다 */ }
    await sleep(500);
  }
  throw new Error('CDP 타깃을 못 찾음');
}

const PROBE = `(async () => {
  const out = [];
  const ck = (name, ok, extra) => out.push({ name, ok: !!ok, extra });
  const S = () => window.__orby.getState();
  const tick = () => new Promise(r => setTimeout(r, 0));
  // Character 컴포넌트가 프레임마다 하는 일을 즉시 소진시킨다.
  const drain = async () => { let n = 0; while (S().path.length && n++ < 9999) S().arrive(); await tick(); await tick(); };
  const prop = (id) => S().stage.props.find(p => p.id === id);

  if (!window.__orby) return [{ name: 'store exposed', ok: false }];

  /* ── A. 미션·상호작용 로직 (체크인 스테이지로 검증) ──────────
     체크인은 여정에서 빠지고 확인용(DEV_STAGES)으로 옮겼지만,
     프롭·미션·선행조건 로직을 실제로 태워보는 유일한 스테이지라 여기서 계속 쓴다. */
  const checkin = window.__orbyStages.dev.find(s => s.id === '01-checkin');
  await S().loadStage(checkin);
  ck('체크인 스테이지 진입', S().phase === 'playing' && S().stage.id === '01-checkin', S().phase + ' ' + (S().error || ''));
  if (S().phase !== 'playing') return out;

  const m = S().map;
  ck('맵 로딩', !!m && m.w > 0 && m.d > 0, m && [m.w, m.h, m.d]);
  ck('모르는 블록 보고', Array.isArray(m.unknown), m.unknown);
  ck('시작 위치 마커', !!m.spawn, m.spawn);
  ck('관문 마커', m.gate.some(v => v === 1));
  ck('물건 자리 ①②', !!m.slots[0] && !!m.slots[1], [m.slots[0], m.slots[1]]);
  ck('스폰에서 시작', S().playerCell[0] === m.spawn[0] && S().playerCell[1] === m.spawn[1]);

  // 벽으로는 경로가 생기지 않아야 한다
  S().requestMove([0, 0]);
  ck('벽으로는 이동 불가', S().path.length === 0);

  // 순서가 아직 아닌 미션은 막되, 벌주지 않고 힌트만
  S().requestInteract(prop('agent'));
  ck('잠긴 미션은 완료되지 않음', !S().done.includes('getLanyard'));
  ck('대신 힌트를 준다', typeof S().message === 'string' && S().message.includes('인사하기'), S().message);
  ck('잠긴 미션은 경로도 안 잡음', S().path.length === 0);

  // 1) 부모와 인사
  S().requestInteract(prop('parent'));
  ck('인사 목표로 경로 생성', S().path.length > 0, S().path.length);
  await drain();
  ck('인사하기 완료', S().done.includes('sayBye'), S().done);
  ck('아직 관문은 닫힘', S().phase === 'playing');

  // 2) 카운터에서 목걸이
  S().requestInteract(prop('agent'));
  await drain();
  ck('목걸이 받기 완료', S().done.includes('getLanyard'), S().done);
  ck('관문 개방 안내', (S().message || '').includes('열렸어'), S().message);

  // 3) 관문 통과 — 맵에서 관문 칸을 찾아 그리로 간다
  let gateCell = null;
  for (let z = 0; z < m.d && !gateCell; z++)
    for (let x = 0; x < m.w; x++)
      if (m.gate[z * m.w + x]) { gateCell = [x, z]; break; }
  S().requestMove(gateCell);
  ck('관문까지 경로 생성', S().path.length > 0, gateCell);
  await drain();
  ck('스테이지 클리어', S().phase === 'stageClear', S().phase);

  /* ── B. 여정 네 구역 — 스폰 → 이동 → 관문 ──────────────────
     상호작용이 아직 없으니 확인할 것은 셋뿐이다. 맵이 진짜로 걸어서
     통과 가능한지를 매 구역마다 실제로 걸어서 본다. */
  const journey = window.__orbyStages.journey;
  ck('여정이 두 구역', journey.length === 2, journey.map(s => s.id));

  for (let i = 0; i < journey.length; i++) {
    const id = journey[i].id;
    await S().goToStage(i);
    const mm = S().map;
    if (S().phase !== 'playing' || !mm) { ck(id + ' 로딩', false, S().error); continue; }

    ck(id + ' 로딩', true, [mm.w, mm.h, mm.d]);
    ck(id + ' 모르는 블록 없음', mm.unknown.length === 0, mm.unknown);
    ck(id + ' 검사기 통과', window.__orbyCheck().length === 0, window.__orbyCheck());
    ck(id + ' 스폰에서 시작',
      !!mm.spawn && S().playerCell[0] === mm.spawn[0] && S().playerCell[1] === mm.spawn[1], mm.spawn);

    // 관문 칸 하나를 찾아 실제로 걸어간다
    let g = null;
    for (let z = 0; z < mm.d && !g; z++)
      for (let x = 0; x < mm.w; x++) if (mm.gate[z * mm.w + x]) { g = [x, z]; break; }
    S().requestMove(g);
    ck(id + ' 관문까지 경로', S().path.length > 0, g);
    await drain();
    /* 'seam' 은 **이어진 통로**로 넘어가는 중이라는 뜻이다 (2구역 → 3구역).
       (이 블록은 템플릿 문자열 안이라 **백틱을 쓰면 안 된다** — 문자열이 끊긴다.)
       통과 화면 대신 화면이 한 번 덮였다 걷히는 동안 맵이 갈린다 — 구역이 끝난
       것은 똑같다. 막을 걷는 건 React 쪽 타이머라 여기서는 기다리지 않는다. */
    ck(id + ' 관문 통과', S().phase === 'stageClear' || S().phase === 'seam', S().phase);
  }

  // 마지막 구역 다음은 완주 화면
  await S().nextStage();
  ck('여정 완료 화면', S().phase === 'finished', S().phase);

  return out;
})()`;

const ws = new WebSocket(await target());
await new Promise((r) => (ws.onopen = r));

const result = await new Promise((resolve, reject) => {
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id !== 1) return;
    if (msg.result?.exceptionDetails) reject(new Error(JSON.stringify(msg.result.exceptionDetails)));
    else resolve(msg.result.result.value);
  };
  // 앱이 마운트될 시간을 준 뒤 실행
  setTimeout(() => {
    ws.send(JSON.stringify({
      id: 1, method: 'Runtime.evaluate',
      params: { expression: PROBE, awaitPromise: true, returnByValue: true },
    }));
  }, 3000);
});

let failed = 0;
for (const r of result) {
  if (!r.ok) failed++;
  const extra = r.extra === undefined ? '' : `  ← ${JSON.stringify(r.extra)}`;
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${extra}`);
}
console.log(`\n${result.length - failed}/${result.length} 통과`);

ws.close();
chrome.kill();
process.exit(failed ? 1 : 0);
