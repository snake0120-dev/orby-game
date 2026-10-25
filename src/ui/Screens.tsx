import { useGame } from '../game/store';
import { STAGES } from '../game/stages';

const center: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  /* 무대(.stage)와 같은 어둠. 밝은 크림색이던 시절의 잔재였는데, 글자색만
     밝은 쪽으로 옮겨가 있어서 제목이 바탕에 묻혀 있었다. */
  background: 'rgba(var(--orby-paper-rgb), 0.95)',
  pointerEvents: 'auto',
};

const button: React.CSSProperties = {
  marginTop: 'calc(var(--u) * 2.4)',
  // 키오스크 최소 터치 타깃 64px 이상
  minWidth: 'calc(var(--u) * 18)',
  minHeight: 'calc(var(--u) * 5)',
  padding: 'calc(var(--u) * 1.2) calc(var(--u) * 3)',
  border: 'none',
  borderRadius: 999,
  background: 'var(--orby-primary)',
  color: 'var(--orby-white)',
  fontSize: 'calc(var(--u) * 1.9)',
  fontWeight: 800,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

export function Loading() {
  return (
    <div style={center}>
      <div style={{ textAlign: 'center', color: '#efefefaa' }}>
        <div style={{ fontSize: 'calc(var(--u) * 4)', color: 'var(--orby-teal)' }}>✦</div>
        <p style={{ fontSize: 'calc(var(--u) * 1.8)', fontWeight: 600 }}>맵을 불러오는 중…</p>
      </div>
    </div>
  );
}

/** 맵 파일이 없거나 깨졌을 때. 전시 빌드에서는 나올 일이 없어야 한다. */
export function ErrorScreen() {
  const error = useGame((s) => s.error);
  const reset = useGame((s) => s.reset);
  return (
    <div style={center}>
      <div style={{ textAlign: 'center', maxWidth: 'calc(var(--u) * 56)' }}>
        <h2 style={{ fontSize: 'calc(var(--u) * 2.4)', color: 'var(--orby-ink)' }}>
          맵을 불러오지 못했습니다
        </h2>
        <pre
          style={{
            textAlign: 'left',
            whiteSpace: 'pre-wrap',
            fontSize: 'calc(var(--u) * 1.25)',
            lineHeight: 1.6,
            background: '#efefef14',
            padding: 'calc(var(--u) * 1.4)',
            borderRadius: 'calc(var(--u) * 0.8)',
            color: '#efefefcc',
          }}
        >
          {error}
        </pre>
        <button style={button} onClick={reset}>처음으로</button>
      </div>
    </div>
  );
}

export function Title() {
  const goToStage = useGame((s) => s.goToStage);
  return (
    <div style={center}>
      <div style={{ textAlign: 'center' }}>
        <div
          style={{
            fontSize: 'calc(var(--u) * 6)',
            color: 'var(--orby-teal)',
            lineHeight: 1,
          }}
        >
          ✦
        </div>
        <h1
          style={{
            margin: 'calc(var(--u) * 1.6) 0 calc(var(--u) * 0.6)',
            fontSize: 'calc(var(--u) * 5)',
            letterSpacing: '0.16em',
            color: 'var(--orby-ink)',
          }}
        >
          ORBY
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 'calc(var(--u) * 1.9)',
            fontWeight: 600,
            color: '#efefefaa',
          }}
        >
          혼자 타는 비행기, 미리 한 번 가보자
        </p>
        <button style={button} onClick={() => goToStage(0)}>
          시작하기
        </button>
      </div>
    </div>
  );
}

export function StageClear() {
  const stage = useGame((s) => s.stage);
  const nextStage = useGame((s) => s.nextStage);
  const stageIndex = useGame((s) => s.stageIndex);
  /* 마지막 구역인지는 **배열에서 몇 번째인가**로 본다. 손으로 적은 `stage.index`
     (HUD 에 보이는 "2구역")와 여정 길이를 견주면, 구역을 빼거나 끼울 때마다 어긋난다. */
  const last = stageIndex >= STAGES.length - 1;

  return (
    <div style={center}>
      <div style={{ textAlign: 'center', maxWidth: 'calc(var(--u) * 48)' }}>
        <div
          style={{
            fontSize: 'calc(var(--u) * 5)',
            color: 'var(--orby-teal)',
            lineHeight: 1,
          }}
        >
          ✦
        </div>
        <h2
          style={{
            margin: 'calc(var(--u) * 1.2) 0 calc(var(--u) * 0.8)',
            fontSize: 'calc(var(--u) * 3.2)',
            color: 'var(--orby-ink)',
          }}
        >
          {stage.title} 통과!
        </h2>
        {/* learningGoal을 여기서 되짚어준다 — 이게 예습 게임인 이유다. */}
        <p
          style={{
            margin: 0,
            fontSize: 'calc(var(--u) * 1.7)',
            fontWeight: 600,
            lineHeight: 1.5,
            color: '#efefefaa',
          }}
        >
          {stage.learningGoal}
        </p>
        <button style={button} onClick={nextStage}>
          {last ? '여정 마치기' : '다음 구역으로'}
        </button>
      </div>
    </div>
  );
}

export function Finished() {
  const reset = useGame((s) => s.reset);
  return (
    <div style={center}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 'calc(var(--u) * 6)', color: 'var(--orby-teal)' }}>✦</div>
        <h2
          style={{
            margin: 'calc(var(--u) * 1.4) 0 calc(var(--u) * 0.6)',
            fontSize: 'calc(var(--u) * 3.4)',
            color: 'var(--orby-ink)',
          }}
        >
          도착했어!
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: 'calc(var(--u) * 1.8)',
            fontWeight: 600,
            color: '#efefefaa',
          }}
        >
          이제 진짜 여행에서도 무슨 일이 생길지 알고 있어.
        </p>
        <button style={button} onClick={reset}>
          다시 하기
        </button>
      </div>
    </div>
  );
}
