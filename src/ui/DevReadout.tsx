import { useDev } from '../game/devStore';
import { useGame } from '../game/store';
import { stripNamespace } from '../game/blocks';
import { walkYAt } from '../engine/voxelMap';

/**
 * 클릭한 칸의 좌표와 그 자리 블록을 읽어주는 개발용 표시기.
 * 마인크래프트에서 지은 것과 게임 좌표를 맞춰볼 때 쓴다.
 */
export function DevReadout() {
  const show = useDev((s) => s.showGrid);
  const pick = useDev((s) => s.pick);
  const map = useGame((s) => s.map);

  if (!show || !map) return null;

  const walkCount = map.walkY.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0);

  let detail = '바닥을 클릭하면 좌표가 나옵니다';
  if (pick) {
    const [x, z] = pick;
    const y = walkYAt(map, x, z);
    if (y >= 0) {
      // 발 높이 바로 아래 = 아이가 밟고 선 블록
      const below = map.cells[x * map.h * map.d + (y - 1) * map.d + z];
      const name = below >= 0 ? stripNamespace(map.palette[below]) : '없음';
      detail = `[${x}, ${z}]  발높이 y=${y}  밟는 블록: ${name}`;
    } else {
      detail = `[${x}, ${z}]  걸을 수 없음 (흑요석 없음)`;
    }
  }

  return (
    <div
      style={{
        position: 'absolute',
        right: 'calc(var(--u) * 2.4)',
        bottom: 'calc(var(--u) * 2.4)',
        pointerEvents: 'auto',
        padding: 'calc(var(--u) * 1.1) calc(var(--u) * 1.5)',
        borderRadius: 'calc(var(--u) * 1)',
        background: '#2b2724ee',
        color: '#fff',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 'calc(var(--u) * 1.2)',
        lineHeight: 1.7,
      }}
    >
      <div style={{ opacity: 0.55 }}>
        맵 {map.w} × {map.h} × {map.d} · 보행 {walkCount}칸 · G키로 끄기
      </div>
      <div style={{ color: '#E6B877' }}>{detail}</div>
      <div style={{ marginTop: 'calc(var(--u) * 0.6)', opacity: 0.5, fontSize: '0.85em' }}>
        <span style={{ color: '#C9E4E2' }}>■</span> 보행 ·{' '}
        <span style={{ color: '#61B7AF' }}>■</span> 관문 ·{' '}
        <span style={{ color: '#E39F44' }}>■</span> 물건 ·{' '}
        <span style={{ color: '#fff' }}>■</span> 시작
      </div>
    </div>
  );
}
