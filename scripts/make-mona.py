#!/usr/bin/env python3
"""
Mona10 → 게임에 같이 넣을 웹폰트.

**말풍선 글씨체다.** 천우태가 `ui 가이드/배경 없음 ui.png` 에 쓴 글씨가 이것이고,
재 보니 **Mona10 Regular 44px** 였다 (가이드 글자 폭 862px·높이 40px, 이 폰트
44px 가 860px·40px). Bold 나 Mona10x12 는 획 굵기·자폭이 안 맞는다.

왜 파일로 넣는가:
  전시는 **오프라인**이다. 이름만 적어두면 천우태 맥에서는 나오지만 전시용
  아이패드에는 없어서 다른 고딕으로 떨어진다. 이 폰트는 픽셀 글씨라 다른
  고딕으로 떨어지면 **한눈에 티가 난다** (Pretendard 때보다 심하다).

  python3 scripts/make-mona.py

원본은 `../폰트/Mona10.ttf` 다 (천우태가 받아 둔 것).

한글 음절 전체(11172자)를 남긴다. "자주 쓰는 2350자" 로 줄이면 더 작아지지만,
나중에 대사 한 줄 쓸 때 빠진 글자가 나오면 그 글자만 다른 폰트로 튄다.
몇백 KB 아끼자고 낼 위험이 아니다 (`make-font.py` 와 같은 판단).
"""
import pathlib
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT.parent / '폰트' / 'Mona10.ttf'
OUT = ROOT / 'public/fonts/mona.woff2'

RANGES = [
    (0x0020, 0x007E),   # 기본 라틴 (영문·숫자·문장부호)
    (0x00A0, 0x00FF),   # 라틴-1 보충
    (0x1100, 0x11FF),   # 한글 자모
    (0x2000, 0x206F),   # 일반 문장부호 (…, 따옴표, 줄표)
    (0x2460, 0x24FF),   # 원문자 ①②③④
    (0x2600, 0x26FF),   # 기타 기호 ✦
    (0x3000, 0x303F),   # CJK 문장부호
    (0xAC00, 0xD7A3),   # 한글 음절 전체
    (0xFF01, 0xFF5E),   # 전각 영문·부호
]


def main() -> int:
    if not SRC.exists():
        print(f'폰트를 못 찾았다: {SRC}', file=sys.stderr)
        return 1

    chars = {c for lo, hi in RANGES for c in range(lo, hi + 1)}
    font = TTFont(SRC)
    before = SRC.stat().st_size

    options = subset.Options()
    options.flavor = 'woff2'
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

    print(f'{SRC.name}  {before/1e6:.1f}MB  →  {OUT.name}  {OUT.stat().st_size/1e3:.0f}KB')
    print(f'글자 수: {len(chars)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
