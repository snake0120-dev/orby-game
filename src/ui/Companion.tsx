import { useEffect } from 'react';
import { useGame } from '../game/store';
import { OrbyStar } from './OrbyStar';

/** 말풍선이 떠 있는 시간 */
const DWELL_MS = 4200;

/**
 * ORBY 동반자의 말풍선 — **화면 왼쪽 아래.**
 *
 * 이 게임에 실패 메시지는 없다. 틀린 순서로 조작해도 여기서 부드럽게 다시 안내할 뿐이다.
 * 에스코트 직원은 바뀌어도 이 목소리는 여정 내내 바뀌지 않는다 — 정서적 불변성.
 *
 * 대사는 스토어가 단일 출처다. 여기서 로컬 state로 복제하지 않고,
 * 시간이 지나면 스토어를 비우는 타이머만 건다. (나중에 보이스오버를 붙일 때도 같은 자리다.)
 *
 * ― 모양은 `ui 가이드/Frame 276~279.png` 에서 잰 값이다 ―────────
 *   · 상자   67u × 14u, 왼쪽 6.8u · 아래 4.7u(`--ui-floor`)
 *   · 테두리 1.2u(`--ui-line`) 짜리 주황 한 겹, **모서리는 각진다**
 *   · 바탕   #d9d9d9, 글자 검정
 *   · 별 ✦  상자의 **왼쪽 위 모서리**에 중심을 두고 화면 밖으로 잘려 나간다
 *
 * 아래 4.7u 는 미니맵과 **같은 밑줄**이다. 가이드에서 둘의 아랫변이 정확히
 * 한 줄에 놓여 있어서 한 값(`--ui-floor`)으로 묶어 뒀다 — 한쪽만 옮기면 어긋난다.
 */
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
        left: 'calc(var(--u) * 6.8 + var(--ui-shift))',
        bottom: 'var(--ui-floor)',
        width: 'calc(var(--u) * 67)',
        /* 말풍선이 없을 때도 **자리는 그대로 둔다** — 투명도만 바꾼다.
           붙였다 떼면 별까지 같이 사라졌다 나타나서 왼쪽 아래가 한 번 번쩍인다. */
        opacity: message ? 1 : 0,
        transform: message ? 'translateY(0)' : 'translateY(calc(var(--u) * 0.8))',
        transition: 'opacity 280ms ease, transform 280ms ease',
      }}
    >
      <div
        style={{
          minHeight: 'calc(var(--u) * 14)',
          display: 'grid',
          placeItems: 'center',
          padding: 'calc(var(--u) * 1.6) calc(var(--u) * 3.2)',
          background: 'var(--ui-bubble)',
          border: 'var(--ui-line) solid var(--ui-orange)',
          /* 각진 모서리가 이 UI 의 성격이다. 둥글리면 지금까지의 알약 모양으로
             돌아간다 — 로고타입이 픽셀 글자라 모서리가 각져야 한 벌로 읽힌다. */
          borderRadius: 0,
          /* 가이드 글씨는 Pretendard 보다 훨씬 좁다. 그 글씨체가 들어오면 이
             숫자를 4.3u 로 올린다 (가이드에서 잰 값). 지금은 Pretendard 폭으로
             한 줄에 들어가는 크기다. */
          fontSize: 'calc(var(--u) * 2.6)',
          fontWeight: 800,
          lineHeight: 1.3,
          textAlign: 'center',
          color: 'var(--ui-bubble-ink)',
          wordBreak: 'keep-all',
        }}
      >
        {message ?? ''}
      </div>
      <OrbyStar />
    </div>
  );
}
