#!/usr/bin/env python3
"""
오프닝(대기화면) 원본 그림 → 웹용 파츠.

    python3 scripts/make-opening-parts.py            # ../오프닝 을 읽는다
    python3 scripts/make-opening-parts.py "다른 폴더" --width 2560

원본은 10405 × 7397 짜리 20MB PNG 다. 그대로 쓰면 텍스처 한 장이 300MB 를
차지해서 아이패드에서 뜨지도 않는다. 전시 화면이 2388 픽셀 폭이라 그보다
조금 넉넉한 크기로 줄여서 쓴다.

**창문 파츠는 투명한 그림이 아니다.** 창구멍이 검게(12,12,12) 채워진 불투명
그림이라, 그 검은 자리를 투명으로 바꿔야 뒤의 하늘이 비친다. 그 일을 여기서
한 번 해두고, 화면에서는 그냥 겹치기만 한다.

파이썬과 Pillow 가 필요하다 (맥에 이미 깔려 있다). 원본 그림을 다시 뽑았을
때만 돌리면 된다 — 결과는 public/opening/ 에 들어간다.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'opening'

# 창구멍을 채운 검정. 이 색을 배경으로 깔고 그린 그림이라 되돌릴 때도 이 값을 쓴다.
HOLE_RGB = np.array([12.0, 12.0, 12.0])
# 이 밝기 아래는 창구멍(투명), 위는 창틀(불투명). 사이는 부드럽게 잇는다.
HOLE_MAX, FRAME_MIN = 25.0, 60.0

SOURCES = {
    '비행기 창문 파츠.png': 'wall.png',   # 객실 벽 + 창틀 (창구멍을 투명으로)
    '날개 파츠.png': 'wing.png',          # 날개 (이미 투명 배경)
}


def resized(im: Image.Image, width: int) -> Image.Image:
    h = round(im.height * width / im.width)
    return im.resize((width, h), Image.LANCZOS)


def key_out_hole(im: Image.Image, width: int) -> Image.Image:
    """검게 채운 창구멍을 투명으로 바꾼다."""
    rgb = np.asarray(resized(im.convert('RGB'), width)).astype(np.float64)
    lum = rgb.mean(axis=2)

    # 경계 한 줄이 딱 끊기지 않게 밝기로 부드럽게 잇는다
    a = np.clip((lum - HOLE_MAX) / (FRAME_MIN - HOLE_MAX), 0.0, 1.0)
    a = a * a * (3 - 2 * a)                       # smoothstep

    # 경계 픽셀은 창틀색과 검정이 섞인 값이다. 검정을 걷어내지 않으면
    # 하늘 위에 얹었을 때 테두리가 거뭇하게 남는다.
    safe = np.maximum(a, 1e-3)[..., None]
    clean = np.clip((rgb - HOLE_RGB * (1 - safe)) / safe, 0, 255)

    out = np.dstack([clean, a * 255]).astype(np.uint8)
    return Image.fromarray(out)


def shrink_with_alpha(im: Image.Image, width: int) -> Image.Image:
    """투명한 그림을 줄인다. 미리 곱해두지 않으면 가장자리에 흰 테가 생긴다."""
    src = np.asarray(im.convert('RGBA')).astype(np.float64)
    a = src[..., 3:4] / 255.0
    pre = Image.fromarray(np.dstack([src[..., :3] * a, src[..., 3]]).astype(np.uint8))
    small = np.asarray(resized(pre, width)).astype(np.float64)
    sa = np.maximum(small[..., 3:4] / 255.0, 1e-3)
    rgb = np.clip(small[..., :3] / sa, 0, 255)
    return Image.fromarray(np.dstack([rgb, small[..., 3]]).astype(np.uint8))


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    width = 2560
    if '--width' in sys.argv:
        width = int(sys.argv[sys.argv.index('--width') + 1])

    src = Path(args[0]) if args else ROOT.parent / '오프닝'
    if not src.is_dir():
        print(f'그림 폴더를 못 찾았습니다: {src}')
        return 1

    OUT.mkdir(parents=True, exist_ok=True)
    print(f'{src} 에서 읽는 중… (가로 {width} 로 줄임)\n')

    for name, out_name in SOURCES.items():
        path = src / name
        if not path.exists():
            print(f'  ✗ {name} 이(가) 없습니다')
            return 1
        im = Image.open(path)
        made = key_out_hole(im, width) if out_name == 'wall.png' else shrink_with_alpha(im, width)
        made.save(OUT / out_name, optimize=True)
        kb = (OUT / out_name).stat().st_size / 1024
        print(f'  ✓ {name}  {im.width}×{im.height}'
              f'  →  public/opening/{out_name}  {made.width}×{made.height}  {kb:,.0f}KB')

    # 창구멍이 화면 어디에 뚫려 있는지 (하늘·구름을 앉힐 때 참고용)
    wall = np.asarray(Image.open(OUT / 'wall.png'))[..., 3]
    ys, xs = np.where(wall < 40)
    h, w = wall.shape
    print(f'\n창구멍 자리 (화면 대비)  가로 {xs.min()/w:.3f}~{xs.max()/w:.3f}'
          f'  세로 {ys.min()/h:.3f}~{ys.max()/h:.3f}')
    print(f'화면 비율 {w/h:.5f} — 무대 비율(1.40676)과 맞아야 그림이 안 늘어난다.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
