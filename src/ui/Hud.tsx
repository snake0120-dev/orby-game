import { isUnlocked, useGame } from '../game/store';

/**
 * HUD. 아이 대상이라 문장보다 **지금 할 일 하나**가 크게 보여야 한다.
 * 아직 잠긴 미션은 흐리게만 두고 이유를 설명하지 않는다 — 정보의 선택적 노출.
 */
export function Hud() {
  const stage = useGame((s) => s.stage);
  const done = useGame((s) => s.done);

  const current = stage.missions.find((m) => !done.includes(m.id) && isUnlocked(m, done));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--u) * 1.2)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'calc(var(--u) * 1.4)' }}>
        <span
          style={{
            fontSize: 'calc(var(--u) * 1.5)',
            fontWeight: 700,
            letterSpacing: '0.02em',
            color: 'var(--orby-teal)',
          }}
        >
          {stage.index}구역
        </span>
        <span
          style={{
            fontSize: 'calc(var(--u) * 2.3)',
            fontWeight: 800,
            color: 'var(--orby-ink)',
          }}
        >
          {stage.title}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'calc(var(--u) * 0.5)' }}>
        {stage.missions.map((m) => {
          const isDone = done.includes(m.id);
          const isCurrent = m.id === current?.id;
          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'calc(var(--u) * 0.9)',
                fontSize: `calc(var(--u) * ${isCurrent ? 1.7 : 1.35})`,
                fontWeight: isCurrent ? 800 : 600,
                color: isDone
                  ? 'var(--orby-teal)'
                  : isCurrent
                    ? 'var(--orby-ink)'
                    : '#2b272455',
                transition: 'all 260ms ease',
              }}
            >
              <span
                style={{
                  width: 'calc(var(--u) * 1.6)',
                  height: 'calc(var(--u) * 1.6)',
                  borderRadius: '50%',
                  flex: '0 0 auto',
                  display: 'grid',
                  placeItems: 'center',
                  background: isDone
                    ? 'var(--orby-teal)'
                    : isCurrent
                      ? 'var(--orby-primary)'
                      : '#2b272418',
                  color: '#fff',
                  fontSize: 'calc(var(--u) * 1)',
                }}
              >
                {isDone ? '✓' : ''}
              </span>
              {m.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
