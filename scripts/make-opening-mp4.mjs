#!/usr/bin/env node
/**
 * 오프닝 모션그래픽 PNG 연속 그림 → **영상 한 편** (`public/opening/start.mp4`).
 *
 *   node scripts/make-opening-mp4.mjs
 *
 * ― 왜 WebP 를 두고 영상으로 갔는가 ―──────────────────────────
 * 움직이는 WebP 는 **브라우저가 CPU 로 한 장씩 푼다.** 맥북은 버텼지만 아이패드는
 * 2000×1422 짜리를 1초에 스무 장씩 풀지 못해서 그림이 뒤처졌다. 영상은 아이패드
 * 안에 **그 일만 하는 칩**이 따로 있어서 거의 공짜로 돈다 (결정 ㊼).
 *
 * 화질은 재 보고 맞췄다 — 네 장을 원본과 대 보니 WebP 와 같거나 조금 낫다:
 *
 *       장      새 영상     옛 WebP
 *       40     47.11 dB    47.27 dB
 *      120     43.68       43.01
 *      200     42.95       41.90
 *      300     49.52       49.58
 *
 * 그러면서 **14MB → 7.7MB** 로 줄었다.
 *
 * ― 색이 어두워지는 함정 ―─────────────────────────────────────
 * 천우태가 뽑은 PNG 에는 색 꼬리표가 없는데, macOS 는 그런 그림을 **Rec.709** 로
 * 친다. 이걸 sRGB 통에 옮겨 담으면 감마가 한 번 바뀌어 **그림 전체가 9단계
 * 어두워진다** (처음에 그렇게 구웠다가 재서 찾았다). 그래서 원본이 들고 있는
 * 색공간을 그대로 쓰고, 영상에도 같은 꼬리표를 박는다.
 *
 * ― 내려받을 게 없다 ―────────────────────────────────────────
 * ffmpeg 를 안 쓴다. 맥에 이미 들어 있는 AVFoundation 으로 굽는다 — 애플이 영상
 * 만들 때 쓰는 바로 그 장치다. `scripts/lib/opening-encode.swift` 가 그 일을 하고,
 * 이 파일은 그걸 컴파일해서 부른다. (Xcode 명령줄 도구만 있으면 된다)
 *
 * 길이나 속도를 바꾸면 **`src/ui/Opening.tsx` 는 안 고쳐도 된다** — 거기서는 이제
 * 시계를 세지 않고 **영상이 끝났다고 말할 때까지** 기다린다. 그게 이번 고침의 핵심이다.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(root, '..', '시작 애니매이션');
const OUT = resolve(root, 'public', 'opening', 'start.mp4');
const SWIFT = resolve(root, 'scripts', 'lib', 'opening-encode.swift');

/** 450장 중 앞 361장만 쓴다 — 뒤쪽은 전부 같은 장이라(끝 ✦ 에서 멈춘 구간)
 *  영상이 끝나면 마지막 장이 그대로 남는다. 18.05초. */
const N = 361;
const W = 2000;
const H = Math.round((W * 1775) / 2497); // 원본 비율 2497:1775 그대로
const FPS = 20;      // 50ms 한 장. 30fps 는 빨랐고 15fps 는 늘어져서 여기로 왔다
const MBPS = 6;      // 재 보니 40Mbps 로 올려도 화질이 그대로다 — 여기가 충분한 자리

if (!existsSync(SRC)) throw new Error(`원본 폴더가 없습니다: ${SRC}`);

const tmp = mkdtempSync(join(tmpdir(), 'orby-enc-'));
try {
  console.log('[1/2] 굽는 도구를 만든다');
  execFileSync('xcrun', ['swiftc', '-O', SWIFT, '-o', join(tmp, 'encode')], { stdio: 'inherit' });

  console.log(`[2/2] ${N}장 → ${W}×${H} · ${FPS}fps · ${MBPS}Mbps`);
  execFileSync(join(tmp, 'encode'), [SRC, String(N), String(W), String(H), String(FPS), String(MBPS), OUT],
    { stdio: 'inherit' });

  const mb = statSync(OUT).size / 1048576;
  console.log(`\n${OUT}  ${mb.toFixed(1)}MB  ${(N / FPS).toFixed(2)}초`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
