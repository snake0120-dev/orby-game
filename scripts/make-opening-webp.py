#!/usr/bin/env python3
"""
오프닝 모션그래픽 PNG 연속 그림 → **움직이는 WebP 한 장**.

⚠ **이제 쓰지 않는다 — `npm run opening:mp4` 로 갈아탔다 (결정 ㊼).**
   움직이는 WebP 는 브라우저가 CPU 로 한 장씩 풀어서 **아이패드가 못 따라갔다.**
   영상은 전용 칩이 풀고, 끝났다고 자기가 알려준다. 이 파일은 그때 쓰던 WebP 를
   다시 구워야 할 때(영상을 못 읽는 기기용 예비 그림)만 쓴다.

  python3 scripts/make-opening-webp.py

천우태가 뽑아 둔 `../시작 애니매이션/anime000.png … anime449.png` (2497×1775 · 253MB)
를 `public/opening/start.webp` 로 굽는다. `src/ui/Opening.tsx` 가 그걸 띄운다.

― 왜 이 값들인가 ―────────────────────────────────────────────
* **450장 중 361장만 쓴다.** 뒤쪽 89장은 해시로 재 보니 **전부 같은 장**이다
  (끝 ✦ 에서 멈춘 구간). `loop=1` 이면 브라우저가 마지막 장을 그대로 붙들어서
  정지 구간을 파일에 넣을 이유가 없다 — 그것만으로 20% 가 빠진다.
* **2000 폭 · q90 · method 6.** 원본 비율 2497:1775 = 1.4068 로 무대 비율과 같아서
  그대로 줄인다. 처음엔 1600폭 q72(6.3MB)로 구웠는데 **부드러운 음영에 띠가 지고
  곡선이 계단처럼 끊겼다** — 원본과 나란히 놓고 보면 바로 보인다. 재 본 값:

      1600px q72 m4   7.9MB   PSNR 44.6dB   ← 처음
      1600px q88 m6  12.1MB        47.3
      2000px q90 m6  17.4MB        48.1     ← 지금
      2497px q86 m6  19.3MB        47.3     ← 원본 크기 그대로

  화면에 보이는 크기가 아이패드 2388px · 레티나 모니터 3038px 라서 **폭도 같이**
  올려야 한다. 더 또렷하게 하려면 `W = 2497`(원본 그대로)로 올리면 되는데, 장당
  픽셀이 1.6배라 아이패드에서 넘기는 비용도 그만큼 는다 — 거기서 재 보고 정할 것.
* **알파를 버린다.** 450장 전부 불투명이라(확인함) RGB 로 구우면 그만큼 싸진다.
* 장 수나 속도를 바꾸면 `Opening.tsx` 의 `FRAMES`·`FRAME_MS` 도 **같이** 고칠 것.
"""
from PIL import Image
from pathlib import Path
import time

HERE = Path(__file__).resolve().parent
SRC = HERE.parent.parent / '시작 애니매이션'
OUT = HERE.parent / 'public' / 'opening' / 'start.webp'
W, N, Q, METHOD = 2000, 361, 90, 6
# 한 장이 화면에 머무는 시간(ms). **속도는 파일에 구워진다** — 다 굽고 나서
# CSS 나 JS 로는 못 바꾼다. 처음엔 33ms(30fps)로 구웠는데 천우태가 보기에
# 너무 빨라서 **두 배로 늘렸다**. 여기를 고치면 `src/ui/Opening.tsx` 의
# `FRAME_MS` 도 **같이** 고쳐야 한다 — 거기서 언제 걷을지를 센다.
FRAME_MS = 50
H = round(W * 1775 / 2497)


def frames():
    for i in range(N):
        yield Image.open(SRC / f'anime{i:03d}.png').convert('RGB').resize((W, H), Image.LANCZOS)


def main() -> None:
    if not SRC.is_dir():
        raise SystemExit(f'원본 폴더가 없습니다: {SRC}')
    OUT.parent.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    it = frames()
    first = next(it)
    first.save(OUT, 'WEBP', save_all=True, append_images=list(it),
               duration=FRAME_MS, loop=1, quality=Q, method=METHOD)
    mb = OUT.stat().st_size / 1048576
    print(f'{OUT}  {mb:.1f}MB  {W}x{H}  {N}장 × {FRAME_MS}ms = {N * FRAME_MS / 1000:.1f}s'
          f'  ({1000 / FRAME_MS:.1f}fps, {time.time() - t0:.0f}s 걸림)')


if __name__ == '__main__':
    main()
