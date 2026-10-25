#!/usr/bin/env python3
"""
오프닝 모션그래픽 PNG 연속 그림 → **움직이는 WebP 한 장**.

  python3 scripts/make-opening-webp.py

천우태가 뽑아 둔 `../시작 애니매이션/anime000.png … anime449.png` (2497×1775 · 253MB)
를 `public/opening/start.webp` 로 굽는다. `src/ui/Opening.tsx` 가 그걸 띄운다.

― 왜 이 값들인가 ―────────────────────────────────────────────
* **450장 중 361장만 쓴다.** 뒤쪽 89장은 해시로 재 보니 **전부 같은 장**이다
  (끝 ✦ 에서 멈춘 구간). `loop=1` 이면 브라우저가 마지막 장을 그대로 붙들어서
  정지 구간을 파일에 넣을 이유가 없다 — 그것만으로 20% 가 빠진다.
* **1600 폭.** 원본 비율 2497:1775 = 1.4068 로 무대 비율과 같아서 그대로 줄인다.
  재 보니 1200폭 5.7MB · 1600폭 8.1MB(q60) 였고, q72 로 구워 6.3MB 가 나왔다.
  더 또렷하게 하려면 폭만 올리면 된다 (2000폭이면 10MB 쯤).
* **알파를 버린다.** 450장 전부 불투명이라(확인함) RGB 로 구우면 그만큼 싸진다.
* 장 수나 속도를 바꾸면 `Opening.tsx` 의 `FRAMES`·`FRAME_MS` 도 **같이** 고칠 것.
"""
from PIL import Image
from pathlib import Path
import time

HERE = Path(__file__).resolve().parent
SRC = HERE.parent.parent / '시작 애니매이션'
OUT = HERE.parent / 'public' / 'opening' / 'start.webp'
W, N, Q = 1600, 361, 72
# 한 장이 화면에 머무는 시간(ms). **속도는 파일에 구워진다** — 다 굽고 나서
# CSS 나 JS 로는 못 바꾼다. 처음엔 33ms(30fps)로 구웠는데 천우태가 보기에
# 너무 빨라서 **두 배로 늘렸다**. 여기를 고치면 `src/ui/Opening.tsx` 의
# `FRAME_MS` 도 **같이** 고쳐야 한다 — 거기서 언제 걷을지를 센다.
FRAME_MS = 66
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
               duration=FRAME_MS, loop=1, quality=Q, method=4)
    mb = OUT.stat().st_size / 1048576
    print(f'{OUT}  {mb:.1f}MB  {W}x{H}  {N}장 × {FRAME_MS}ms = {N * FRAME_MS / 1000:.1f}s'
          f'  ({1000 / FRAME_MS:.1f}fps, {time.time() - t0:.0f}s 걸림)')


if __name__ == '__main__':
    main()
