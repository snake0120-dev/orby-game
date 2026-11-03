/**
 * ORBY ✦ — **화면 UI 용 별.**
 *
 * 3D 쪽 마크(`engine/orbySymbol.ts`)와 **같은 모양**인데 그리는 법이 다르다.
 * 저쪽은 모서리를 2차 곡선으로 부드럽게 잇고, 이쪽은 **계단으로 끊는다** —
 * `ui 가이드/Frame 276.png` 의 별이 그렇게 생겼다. 로고타입이 픽셀 글자라
 * 화면 UI 는 한 벌로 픽셀 쪽에 맞춘다.
 *
 * ― 가이드에서 잰 값 ―────────────────────────────────────────
 * 2497×1775 그림에서:
 *   · 중심        (94, 1462) = **말풍선의 왼쪽 위 모서리**
 *   · 팔 두께     32px  → 2 칸
 *   · 팔 길이(반) 220px → 14 칸
 *   · 중심 덩어리 64px  → 4 칸 (팔이 중심에서만 두 배로 부푼다)
 *   · 흰 테두리 한 겹 + 바깥 번짐
 *
 * 왼쪽 팔은 **화면 밖으로 잘려 나간다** — 중심이 말풍선 왼쪽 모서리에 있고
 * 말풍선이 화면 왼쪽에서 6.8u 밖에 안 떨어져 있어서, 13u 짜리 팔이 화면을
 * 넘어간다. 가이드도 잘려 있다. 자르지 않으려고 별을 옮기면 안 된다.
 */

/** 28칸 짜리 모눈. 중심은 (14, 14). */
const D =
  'M13 0 L15 0 L15 11.5 L16.5 11.5 L16.5 13 L28 13 L28 15 L16.5 15 L16.5 16.5 L15 16.5 ' +
  'L15 28 L13 28 L13 16.5 L11.5 16.5 L11.5 15 L0 15 L0 13 L11.5 13 L11.5 11.5 L13 11.5 Z';

export function OrbyStar({ dim = false }: { dim?: boolean }) {
  return (
    <svg
      viewBox="0 0 28 28"
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        /* 중심이 말풍선 모서리에 **정확히** 얹혀야 한다 — 별이 말풍선 테두리를
           물고 있는 게 이 그림의 핵심이다. */
        transform: 'translate(-50%, -50%)',
        width: 'calc(var(--u) * 26)',
        height: 'calc(var(--u) * 26)',
        overflow: 'visible',
        /* 바깥 번짐. 두 겹을 겹쳐야 가이드처럼 **가까이는 또렷하고 멀리는
           부드럽게** 퍼진다 — 한 겹이면 테두리가 흐려지기만 한다. */
        filter: `drop-shadow(0 0 calc(var(--u) * 0.5) #ffffffcc)
                 drop-shadow(0 0 calc(var(--u) * 1.6) #ffffff66)`,
        opacity: dim ? 0 : 1,
        transition: 'opacity 280ms ease',
      }}
    >
      <defs>
        {/* 팔은 가운데가 진하고 끝으로 갈수록 옅다 — 가이드의 그라데이션 */}
        <radialGradient id="orby-star-fill" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ee9b2e" />
          <stop offset="38%" stopColor="#f3ab52" />
          <stop offset="100%" stopColor="#fbddbc" />
        </radialGradient>
      </defs>
      {/* `paint-order: stroke` 라 흰 선이 칠 **뒤**로 가서 바깥쪽에만 남는다.
          안 그러면 선이 안쪽을 절반 먹어 팔이 가늘어진다. */}
      <path
        d={D}
        fill="url(#orby-star-fill)"
        stroke="#ffffff"
        strokeWidth={1.2}
        strokeLinejoin="miter"
        paintOrder="stroke"
      />
    </svg>
  );
}
