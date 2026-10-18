import { useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Scene } from './engine/Scene';
import { Backdrop } from './engine/Backdrop';
import { Hud } from './ui/Hud';
import { Companion } from './ui/Companion';
import { ErrorScreen, Finished, Loading, StageClear, Title } from './ui/Screens';
import { Seam } from './ui/Seam';
import { useGame } from './game/store';
import { useDev } from './game/devStore';
import { DevReadout } from './ui/DevReadout';
import { TunePanel } from './ui/TunePanel';
import { useTune } from './game/tuneStore';
import { DEV_STAGES, STAGES } from './game/stages';

/**
 * 개발용 단축키 + `?stage=N` 진입 파라미터.
 * 전시 빌드(production)에서는 붙지 않는다.
 */
function useDevKeys() {
  useEffect(() => {
    if (!import.meta.env.DEV) return;

    // 특정 구역부터 바로 열기 — 맵을 고칠 때 매번 처음부터 걷지 않아도 된다.
    // 숫자면 여정 순서, 이름이면 스테이지 id (`?stage=01-gate`, `?stage=01-checkin`).
    const q = new URLSearchParams(location.search).get('stage') ?? '';
    const byId = [...STAGES, ...DEV_STAGES].find((s) => s.id === q);
    if (byId) useGame.getState().loadStage(byId);
    else {
      const n = Number(q);
      if (n >= 1 && n <= STAGES.length) useGame.getState().goToStage(n - 1);
    }

    const onKey = (e: KeyboardEvent) => {
      /* 글자를 입력하는 칸에서만 단축키를 비켜준다.
         슬라이더·컬러피커까지 막으면 패널을 한 번 만진 뒤로 단축키가 통째로
         죽는다 — 포커스가 거기 남아 있기 때문이다. */
      const el = e.target as HTMLInputElement | null;
      const typing =
        el?.tagName === 'TEXTAREA' ||
        (el?.tagName === 'INPUT' &&
          ['text', 'number', 'search', 'email', 'password', 'url'].includes(el.type));
      if (typing) return;

      const { goToStage, complete, stage } = useGame.getState();

      // 1 / 2 는 화면 맞추기 패널. 제일 자주 여닫는 것이라 맨 앞 키를 준다.
      if (e.key === '1') { useTune.getState().set({ open: true }); return; }
      if (e.key === '2') { useTune.getState().set({ open: false }); return; }

      // 구역 이동은 Shift+숫자 로 물러났다 (1·2 를 패널에 내주면서).
      const n = Number(e.key);
      if (e.shiftKey && n >= 1 && n <= STAGES.length) goToStage(n - 1);
      /* 글자 단축키는 **자판 위치(`code`)로 읽는다.** `key` 로 읽으면 한글
         입력기가 켜져 있을 때 c 가 `ㅊ`, g 가 `ㅎ` 으로 들어와 안 먹는다.
         숫자 키는 입력기와 무관해서 위처럼 `key` 로 둬도 된다. */
      // c: 현재 스테이지 미션 일괄 완료 (관문 개방 확인용)
      if (e.code === 'KeyC') stage.missions.forEach((m) => complete(m.id));
      // g: 맵 좌표 그리드 — 프롭 자리를 찍을 때 쓴다
      if (e.code === 'KeyG') useDev.getState().toggleGrid();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export default function App() {
  const phase = useGame((s) => s.phase);
  /* 가로 무대는 창을 거의 다 쓴다 — 여백이 좁아 패널이 무대 왼쪽을 덮는다.
     그동안 HUD 를 오른쪽으로 밀어 가려지지 않게 한다. */
  const panelOpen = useTune((s) => s.open);
  useDevKeys();

  return (
    <>
      {/*
        전시 화면비(아이패드 프로 11인치 세로)로 고정된 무대. 크기는 index.css 의
        --stage-ratio 가 쥔다. 창을 어떻게 띄우든 여기 안쪽만 게임이고,
        바깥은 회색 여백이다.
      */}
      <div className="stage">
        <Canvas
          shadows
          /* 레티나에서 dpr 2 는 칠할 픽셀이 네 배다. 아이패드 프로 11인치면
             4.0메가픽셀 → 1.5 로 묶어 2.2메가픽셀. 칠하는 양이 **44% 줄고**
             복셀 덩어리라 눈으로는 거의 티가 안 난다 — 2구역 전용 화면이
             진작부터 1.5 로 돌고 있었고 거기서 문제가 없었다. */
          dpr={[1, 1.5]}
          gl={{ antialias: true }}
          style={{ position: 'absolute', inset: 0 }}
        >
          {/* 단색 대신 그라데이션 하늘. index.css 의 --orby-paper 와 아래쪽 색을 맞춰둔다. */}
          <Backdrop />
          <Scene />
        </Canvas>

        {/* 맵이 화면 밑변에 잘리는 경계를 지운다. HUD 보다 아래 층. */}
        <div className="fade-bottom" />

        <div
          className="overlay"
          style={panelOpen ? { paddingLeft: 'calc(var(--u) * 27.5)' } : undefined}
        >
          {/* 이음매(`seam`)에서도 HUD 를 그대로 둔다 — 빠졌다 들어오면 막 가장자리에서 깜빡인다 */}
          {phase === 'playing' || phase === 'seam' ? <Hud /> : <div />}
          {/* 말풍선은 항상 화면 아래쪽. 씬 한가운데를 가리면 안 된다. */}
          <Companion />
        </div>

        {phase === 'title' && <Title />}
        {phase === 'loading' && <Loading />}
        {phase === 'error' && <ErrorScreen />}
        {phase === 'stageClear' && <StageClear />}
        {/* 이어진 통로의 이음매 — 늘 떠 있고 투명도만 바뀐다 */}
        <Seam />
        {phase === 'finished' && <Finished />}
      </div>

      {/* 개발 도구는 무대 밖(여백 위)에 둔다 — 화면을 가리면 구도를 못 본다 */}
      {import.meta.env.DEV && <DevReadout />}
      {import.meta.env.DEV && <TunePanel />}
    </>
  );
}
