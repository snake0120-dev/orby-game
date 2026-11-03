/**
 * ORBY 로고타입 — **화면 왼쪽 위.**
 *
 * 가이드(`ui 가이드/Frame 276~279.png`)에서 잰 자리: 왼쪽 2u · 위 2u · 폭 18u.
 * 전시에서 화면에 늘 떠 있는 유일한 브랜드 표시다.
 *
 * `public/ui/logo.png` 는 천우태가 준 `ui 가이드/로고타입 1.png` 를 투명 여백만
 * 잘라낸 것이다 (608×265). 로고를 새로 그리면 **그 파일만 덮어쓰면 된다** —
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
        left: 'calc(var(--ui-u) * 2 + var(--ui-shift))',
        top: 'calc(var(--ui-u) * 2)',
        width: 'calc(var(--ui-u) * 18)',
        height: 'auto',
        imageRendering: 'pixelated',
      }}
    />
  );
}
