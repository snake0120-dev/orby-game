/**
 * ORBY 로고타입 — **화면 왼쪽 위.**
 *
 * 가이드(`ui 가이드/Frame 276~279.png`)에서 잰 자리: 왼쪽 2u · 위 2u · 폭 18u.
 * 전시에서 화면에 늘 떠 있는 유일한 브랜드 표시다.
 *
 * ⚠ **지금 들어 있는 `public/ui/logo.png` 는 임시다.** 가이드 그림에서 배경을
 * 색으로 오려낸 것이라 외곽선이 군데군데 얇다. 천우태가 피그마에서 **투명
 * PNG(가로 1200px 쯤) 또는 SVG** 로 내보내 주면 파일만 덮어쓰면 된다 —
 * 이 파일은 안 고쳐도 된다.
 *
 * `image-rendering: pixelated` 인 이유: 픽셀 글자라 보간하면 가장자리가
 * 뭉개져 로고가 흐려 보인다. 아이패드처럼 2배 화면에서 특히 그렇다.
 */
export function Logo() {
  return (
    <img
      src={`${import.meta.env.BASE_URL}ui/logo.png`}
      alt="ORBY"
      style={{
        position: 'absolute',
        left: 'calc(var(--u) * 2 + var(--ui-shift))',
        top: 'calc(var(--u) * 2)',
        width: 'calc(var(--u) * 18)',
        height: 'auto',
        imageRendering: 'pixelated',
        /* 밝은 유리 복도 위에 얹히면 민트가 배경에 묻힌다. 아주 옅은 그림자
           한 겹이면 어디에 얹혀도 글자가 떠 보인다 — 가이드에도 같은 번짐이 있다. */
        filter: 'drop-shadow(0 calc(var(--u) * 0.2) calc(var(--u) * 0.6) #0008)',
      }}
    />
  );
}
