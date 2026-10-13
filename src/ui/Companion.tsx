import { useEffect } from 'react';
import { useGame } from '../game/store';

/** 말풍선이 떠 있는 시간 */
const DWELL_MS = 4200;

/**
 * ORBY 동반자의 말풍선.
 *
 * 이 게임에 실패 메시지는 없다. 틀린 순서로 조작해도 여기서 부드럽게 다시 안내할 뿐이다.
 * 에스코트 직원은 바뀌어도 이 목소리는 여정 내내 바뀌지 않는다 — 정서적 불변성.
 *
 * 대사는 스토어가 단일 출처다. 여기서 로컬 state로 복제하지 않고,
 * 시간이 지나면 스토어를 비우는 타이머만 건다. (나중에 보이스오버를 붙일 때도 같은 자리다.)
 */
export function Companion() {
  const message = useGame((s) => s.message);
  const say = useGame((s) => s.say);

  useEffect(() => {
    if (!message) return;
    // 읽을 시간을 준 뒤 조용히 사라진다. 닫기 버튼을 누르게 하지 않는다.
    const t = setTimeout(() => say(null), DWELL_MS);
    return () => clearTimeout(t);
  }, [message, say]);

  return (
    <div
      style={{
        alignSelf: 'center',
        display: 'flex',
        alignItems: 'center',
        gap: 'calc(var(--u) * 1.2)',
        maxWidth: 'calc(var(--u) * 46)',
        padding: 'calc(var(--u) * 1.2) calc(var(--u) * 1.9)',
        borderRadius: 'calc(var(--u) * 1.6)',
        background: '#ffffffee',
        boxShadow: '0 calc(var(--u) * 0.6) calc(var(--u) * 2) #2b272418',
        fontSize: 'calc(var(--u) * 1.65)',
        fontWeight: 600,
        lineHeight: 1.45,
        color: 'var(--orby-ink)',
        opacity: message ? 1 : 0,
        transform: message ? 'translateY(0)' : 'translateY(calc(var(--u) * 0.8))',
        transition: 'opacity 280ms ease, transform 280ms ease',
      }}
    >
      <span
        style={{
          flex: '0 0 auto',
          fontSize: 'calc(var(--u) * 2.2)',
          color: 'var(--orby-teal)',
          lineHeight: 1,
        }}
      >
        ✦
      </span>
      <span>{message ?? ''}</span>
    </div>
  );
}
