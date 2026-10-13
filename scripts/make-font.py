#!/usr/bin/env python3
"""
Pretendard → 게임에 같이 넣을 웹폰트.

왜 필요한가:
  전시는 **오프라인**이다. CSS 에 'Pretendard' 라고 적어두면 천우태 맥에서는
  설치돼 있어서 잘 나오지만, 전시용 아이패드에는 없어서 다른 고딕으로 떨어진다.
  글자가 보이긴 해도 자폭과 굵기가 달라 맞춰둔 레이아웃이 어긋난다.

무엇을 하는가:
  ~/Library/Fonts/PretendardVariable.ttf (가변 폰트 한 장에 100~900 굵기가 다 있다)
  에서 **쓰는 글자만 남기고** woff2 로 줄여 public/fonts/ 에 넣는다.
  원본 6.8MB → 아래 범위로 자르면 1/5 수준.

다시 돌려야 할 때:
  한글 범위를 넓히거나 Pretendard 를 새로 받았을 때. 평소에는 건드릴 일 없다.
  글자가 빠져도 화면이 깨지지는 않는다 — 그 글자만 시스템 고딕으로 떨어진다.

  python3 scripts/make-font.py

라이선스: Pretendard 는 SIL OFL 1.1 이라 같이 배포해도 된다.
"""
import pathlib
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

SRC = pathlib.Path.home() / 'Library/Fonts/PretendardVariable.ttf'
OUT = pathlib.Path(__file__).resolve().parent.parent / 'public/fonts/pretendard.woff2'

# 남길 글자 ─────────────────────────────────────────────────
#   한글 음절 전체(11172자) 를 통째로 남긴다. "자주 쓰는 2350자" 로 줄이면
#   더 작아지지만, 나중에 대사 한 줄 쓸 때 빠진 글자가 나오면 그 글자만
#   다른 폰트로 튀어서 문장이 얼룩덜룩해진다. 몇백 KB 아끼자고 낼 위험이 아니다.
RANGES = [
    (0x0020, 0x007E),   # 기본 라틴 (영문·숫자·문장부호)
    (0x00A0, 0x00FF),   # 라틴-1 보충 (·, ×, ° 등)
    (0x1100, 0x11FF),   # 한글 자모
    (0x2000, 0x206F),   # 일반 문장부호 (…, 따옴표, 줄표)
    (0x20A0, 0x20BF),   # 통화 기호 (₩)
    (0x2190, 0x21FF),   # 화살표 (↓ — 말풍선 패널에서 쓴다)
    (0x2460, 0x24FF),   # 원문자 ①②③④ — 마커 번호 표기
    (0x2500, 0x257F),   # 괘선 (개발 도구 출력)
    (0x25A0, 0x25FF),   # 도형 ■ ▲
    (0x2600, 0x26FF),   # 기타 기호 ✦
    (0x2700, 0x27BF),   # 장식 기호
    (0x3000, 0x303F),   # CJK 문장부호
    (0xAC00, 0xD7A3),   # 한글 음절 전체
    (0xFF01, 0xFF5E),   # 전각 영문·부호
]


def main() -> int:
    if not SRC.exists():
        print(f'폰트를 못 찾았다: {SRC}\n'
              'Pretendard 를 설치했는지 확인할 것 (github.com/orioncactus/pretendard).',
              file=sys.stderr)
        return 1

    chars = {c for lo, hi in RANGES for c in range(lo, hi + 1)}
    font = TTFont(SRC)
    before = SRC.stat().st_size

    options = subset.Options()
    options.flavor = 'woff2'
    # 가변 축(wght)을 살려둔다 — 한 파일로 100~900 을 다 쓴다
    options.retain_gids = False
    options.layout_features = ['kern', 'liga', 'calt', 'ccmp', 'locl']
    options.drop_tables += ['DSIG']
    options.name_IDs = ['*']
    options.notdef_outline = True

    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=chars)
    subsetter.subset(font)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = 'woff2'
    font.save(OUT)

    after = OUT.stat().st_size
    axes = [(a.axisTag, a.minValue, a.maxValue) for a in font['fvar'].axes] if 'fvar' in font else []
    print(f'{SRC.name}  {before/1e6:.1f}MB  →  {OUT.name}  {after/1e3:.0f}KB')
    print(f'가변 축: {axes}')
    print(f'글자 수: {len(chars)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
