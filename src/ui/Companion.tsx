import { useEffect } from 'react';
import { useGame } from '../game/store';

/**
 * 말풍선이 떠 있는 시간.
 *
 * 4200 으로 뒀다가 **1.3배 늘렸다** — 아이가 다 읽기 전에 사라졌다. 이제
 * 화면에 안내가 이것 하나뿐이라(결정 ㊾) 놓치면 볼 데가 없다.
 */
const DWELL_MS = 5460;

/**
 * ORBY 동반자의 말풍선 — **화면 왼쪽 아래.**
 *
 * 이 게임에 실패 메시지는 없다. 틀린 순서로 조작해도 여기서 부드럽게 다시 안내할 뿐이다.
 * 에스코트 직원은 바뀌어도 이 목소리는 여정 내내 바뀌지 않는다 — 정서적 불변성.
 *
 * 대사는 스토어가 단일 출처다. 여기서 로컬 state로 복제하지 않고,
 * 시간이 지나면 스토어를 비우는 타이머만 건다. (나중에 보이스오버를 붙일 때도 같은 자리다.)
 *
 * ― 틀 모양은 **보통 테두리가 아니다** ―─────────────────────
 * `ui 가이드/배경 없음 ui.png` 를 픽셀로 떠 보니 이렇게 생겼다:
 *
 * ```
 *        x111                      x1228 x1248
 *  y1456  ┌──────── 위 띠 ─────────┐          ← 주황 20px
 *  y1476  ├───────────────────────┼─────┐
 *         │   몸통 #d9d9d9         │ 오른 │    ← 오른 띠는 **몸통 높이만큼만**
 *  y1676  ├───────────────────────┼─────┘
 *  y1696  └──────── 아래 띠 ───────┘
 * ```
 *
 * **왼쪽 테두리가 없다. 오른쪽 위·아래 모서리도 비어 있다.** 네 변을 두른
 * 보통 테두리(`border`)로는 안 나온다 — 모서리가 채워져 버린다. 그래서 위·아래
 * 띠는 몸통에 붙이고, 오른쪽 띠만 따로 띄워 몸통 높이에 맞춘다.
 *
 * ― 가이드에서 잰 값 ―────────────────────────────────────────
 *   바깥 67.5u × 14.2u · 몸통 66.3u × 11.9u · 띠 1.19u(`--ui-line`)
 *   왼쪽 6.58u · 아래 4.69u(`--ui-floor` — 미니맵과 **같은 밑줄**)
 *   글씨 Mona 2.61u (가이드 44px) · 검정 · 가운데
 *
 * ✦ 별은 `public/ui/star.png` 다 — 가이드에서 그대로 오려낸 그림이라 모양이
 * 똑같다. SVG 로 다시 그렸더니 팔 두께(세로 1u · 가로 2u)와 끝으로 갈수록
 * 옅어지는 그라데이션이 안 맞았다. **위 띠 기준으로 붙인다** — 가로팔이 그 띠를
 * 가로지르는 게 이 그림의 핵심이라, 글이 길어져 상자가 커져도 그 자리는 지켜야 한다.
 */

/** 오려낸 별 그림의 크기(332×496px)와 말풍선 왼쪽 위 모서리 기준 자리 */
const STAR = { w: 19.69, h: 29.42, left: -6.58, top: -14.23 };

export function Companion() {
  const message = useGame((s) => s.message);
  const say = useGame((s) => s.say);
  const opening = useGame((s) => s.opening);

  useEffect(() => {
    if (!message) return;
    /* **오프닝이 덮고 있는 동안은 안 센다.** 2구역은 덮개가 걷히기 15초쯤
       전에 미리 올라오는데(`Opening` 의 backstop), 그때 구역 첫 인사가
       말풍선에 담긴다. 그대로 두면 4.2초 뒤에 조용히 사라져서 **아이는 첫
       안내를 한 번도 못 본다.** 화면에 나온 뒤부터 센다. */
    if (opening) return;
    // 읽을 시간을 준 뒤 조용히 사라진다. 닫기 버튼을 누르게 하지 않는다.
    const t = setTimeout(() => say(null), DWELL_MS);
    return () => clearTimeout(t);
  }, [message, opening, say]);

  return (
    <div
      style={{
        position: 'absolute',
        left: 'calc(var(--ui-u) * 6.58 + var(--ui-shift))',
        bottom: 'var(--ui-floor)',
        width: 'calc(var(--ui-u) * 67.49)',
        /* 말풍선이 없을 때도 **자리는 그대로 둔다** — 투명도만 바꾼다.
           붙였다 떼면 별까지 같이 사라졌다 나타나서 왼쪽 아래가 한 번 번쩍인다. */
        opacity: message ? 1 : 0,
        transform: message ? 'translateY(0)' : 'translateY(calc(var(--ui-u) * 0.8))',
        transition: 'opacity 280ms ease, transform 280ms ease',
      }}
    >
      {/* 위 띠 — 오른쪽 띠 자리를 비워 둔다 (모서리가 비어 있어야 한다) */}
      <div
        style={{
          height: 'var(--ui-line)',
          marginRight: 'var(--ui-line)',
          background: 'var(--ui-orange)',
        }}
      />
      <div
        style={{
          /* **키를 고정한다.** 글이 길어 두 줄이 되면 상자가 커지고, 그러면
             별이 위로 밀려 가로팔이 위 띠를 못 가로지른다 — 가이드 그림이
             깨진다. 두 줄(7.1u)은 이 키(11.9u) 안에 넉넉히 들어간다. */
          height: 'calc(var(--ui-u) * 11.86)',
          marginRight: 'var(--ui-line)',
          display: 'grid',
          placeItems: 'center',
          padding: '0 calc(var(--ui-u) * 2)',
          background: 'var(--ui-bubble)',
          /* 가이드 글씨 그대로. 다른 UI(시작 화면·통과 화면)는 Pretendard 를
             쓴다 — 가이드가 말풍선만 이 글씨체로 그려져 있다. */
          fontFamily: "'Mona', 'Pretendard', sans-serif",
          fontSize: 'calc(var(--ui-u) * 2.61)',
          lineHeight: 1.35,
          textAlign: 'center',
          color: 'var(--ui-bubble-ink)',
          wordBreak: 'keep-all',
        }}
      >
        {message ?? ''}
      </div>
      {/* 아래 띠 */}
      <div
        style={{
          height: 'var(--ui-line)',
          marginRight: 'var(--ui-line)',
          background: 'var(--ui-orange)',
        }}
      />
      {/* 오른쪽 띠 — 위·아래 띠 사이, 몸통 높이만큼만 */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 'var(--ui-line)',
          bottom: 'var(--ui-line)',
          width: 'var(--ui-line)',
          background: 'var(--ui-orange)',
        }}
      />
      <img
        src={`${import.meta.env.BASE_URL}ui/star.png`}
        alt=""
        aria-hidden
        style={{
          position: 'absolute',
          left: `calc(var(--ui-u) * ${STAR.left})`,
          top: `calc(var(--ui-u) * ${STAR.top})`,
          width: `calc(var(--ui-u) * ${STAR.w})`,
          height: `calc(var(--ui-u) * ${STAR.h})`,
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
