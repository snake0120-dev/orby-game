#!/usr/bin/env node
/**
 * 오프닝 모션그래픽 PNG 연속 그림 → **영상 두 편**.
 *
 *   npm run opening:mp4
 *
 *   public/opening/start-loop.mp4    15~74번   ·  60장 ·  3.00초   ← 끝없이 돈다
 *   public/opening/start-rest.mp4    75~279번  · 205장 · 10.25초   ← 누르면 재생
 *
 * ― 왜 두 토막인가 (결정 ㊽) ―────────────────────────────────
 * 전시장에서 아이가 오기 전까지는 **창문이 닫힌 채 그림자가 흔들리는 부분만**
 * 끝없이 돌아야 한다. 아무도 없는데 혼자 재생되고 혼자 게임에 들어가 있으면 안 된다.
 *
 * 파일을 가르면 브라우저의 `loop` 속성이 루프를 돌려 준다 — **자바스크립트가 한 줄도
 * 안 돈다.** 한 파일에서 3초마다 되감게 하면 키오스크가 몇 시간 도는 동안 되감기를
 * 수천 번 하게 된다. 덤으로 처음 뜨는 것도 빨라진다 (8MB 가 아니라 1.3MB 만 받으면 된다).
 *
 * ― 편집점은 짐작이 아니라 **잰 값**이다 ―─────────────────────
 * 이 애니메이션은 **45번 장을 거울로 삼은 좌우 대칭**이다 — `f(45-k) = f(45+k)` 가
 * k=30 까지, 즉 **15번~75번에서 성립하고 76번에서 깨진다**(거기서 셰이드가 올라간다).
 *
 *       15 ↔ 75    1.82        ← 쓰는 자리
 *       24 ↔ 66    0.32
 *       14 ↔ 76   16.32        ← 깨지는 자리
 *       12 ↔ 78   44.74
 *
 * 그래서 15~74번을 돌리면 **그 자체로 "나갔다 돌아오는" 완전한 한 바퀴**가 된다.
 * 돌아가는 이음매(74→15)의 평균차가 **2.53** 인데, 바로 옆 장끼리의 차이가 **3.03** 이다
 * — 이음매가 보통 장면 한 장 넘어가는 것보다도 작아서 눈에 띌 수가 없다.
 *
 * **0~14번은 버린다.** 페이드인이 아니라(밝기가 처음부터 162로 일정하다) 흔들림의
 * 다른 위상일 뿐이라, 15번부터 시작해도 보는 사람은 차이를 모른다.
 *
 * ― 끝은 **움직임이 멎는 자리**에서 끊는다 ―─────────────────────
 * 원본은 360번까지 가는데, **274번에서 움직임이 완전히 멎는다.** 그 뒤 86장은
 * 글자 하나 안 바뀌는 같은 그림이다 — 그대로 쓰면 **마지막 컷이 4.30초간 얼어붙어
 * 있다.** 거기에 `Opening.tsx` 가 붙드는 0.9초와 걷히는 0.9초가 더 붙으니
 * 끝에서 **6초를 가만히 보고** 있어야 했다.
 *
 *       273 → 274   0.852   ← 마지막 움직임
 *       274 → 275   0.011   ← 여기서부터 멎는다 (0.011 은 잡티다)
 *
 * 그래서 **279번에서 끊는다** — 멎고 나서 다섯 장(0.25초)만 숨을 고르고, 나머지는
 * 붙듦·걷힘이 받는다. 끝의 멈춤을 더 줄이거나 늘리려면 아래 `count` 한 숫자만 만진다
 * (한 장 = 0.05초).
 *
 * ― 색이 어두워지는 함정 (㊼) ―───────────────────────────────
 * 천우태가 뽑은 PNG 에는 색 꼬리표가 없는데, macOS 는 그런 그림을 **Rec.709** 로
 * 친다. 이걸 sRGB 통에 옮겨 담으면 감마가 한 번 바뀌어 **그림 전체가 9단계
 * 어두워진다.** 그래서 원본이 들고 있는 색공간을 그대로 쓴다.
 *
 * ― 내려받을 게 없다 ―────────────────────────────────────────
 * ffmpeg 를 안 쓴다. 맥에 이미 들어 있는 AVFoundation 으로 굽는다.
 * `scripts/lib/opening-encode.swift` 가 그 일을 하고, 이 파일은 그걸 컴파일해서 부른다.
 *
 * 토막 경계를 바꾸면 **`src/ui/Opening.tsx` 는 안 고쳐도 된다** — 거기서는 시계를
 * 세지 않고 영상이 끝났다고 말할 때까지 기다린다 (㊼).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, '..', '시작 애니매이션');
const SWIFT = resolve(root, 'scripts', 'lib', 'opening-encode.swift');
const OUT = resolve(root, 'public', 'opening');

const W = 2000;
const H = Math.round((W * 1775) / 2497); // 원본 비율 2497:1775 그대로
const FPS = 20;      // 50ms 한 장. 30fps 는 빨랐고 15fps 는 늘어져서 여기로 왔다
const MBPS = 6;      // 재 보니 40Mbps 로 올려도 화질이 그대로다 — 여기가 충분한 자리

/**
 * 토막 둘. `first` 부터 `count` 장.
 *
 * **루프는 74번까지다 (75번을 안 넣는다).** 75번은 15번과 같은 그림이라, 넣으면
 * 돌아가는 자리에서 같은 장이 두 번 보인다. 그 한 장이 뒷부분의 첫 장이 된다 —
 * 그래서 루프 끝(74번) 다음에 뒷부분 첫 장(75번)이 **그냥 이어진다.**
 */
const PARTS = [
  { name: 'start-loop.mp4', first: 15, count: 60, 뭐: '끝없이 도는 앞부분' },
  { name: 'start-rest.mp4', first: 75, count: 205, 뭐: '누르면 재생되는 뒷부분' },
];

if (!existsSync(SRC)) throw new Error(`원본 폴더가 없습니다: ${SRC}`);

const tmp = mkdtempSync(join(tmpdir(), 'orby-enc-'));
try {
  console.log('[1/3] 굽는 도구를 만든다');
  const bin = join(tmp, 'encode');
  execFileSync('xcrun', ['swiftc', '-O', SWIFT, '-o', bin], { stdio: 'inherit' });

  PARTS.forEach((p, i) => {
    const last = p.first + p.count - 1;
    console.log(`\n[${i + 2}/3] ${p.name} — ${p.뭐}`);
    console.log(`      ${p.first}~${last}번 · ${p.count}장 · ${(p.count / FPS).toFixed(2)}초`);
    execFileSync(bin, [SRC, String(p.first), String(p.count),
      String(W), String(H), String(FPS), String(MBPS), resolve(OUT, p.name)],
      { stdio: 'inherit' });
  });

  console.log('');
  for (const p of PARTS) {
    const mb = statSync(resolve(OUT, p.name)).size / 1048576;
    console.log(`  ${p.name.padEnd(16)} ${mb.toFixed(1)}MB  ${(p.count / FPS).toFixed(2)}초`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
