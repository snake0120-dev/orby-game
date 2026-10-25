import { useEffect, useState } from 'react';
import { useGame } from '../game/store';

/**
 * **오프닝 모션그래픽.**
 *
 * 천우태가 만든 450장짜리 PNG 연속 그림(`../시작 애니매이션`)을 움직이는 WebP 한
 * 장으로 구운 것이다 (`public/opening/start.webp` · 1600×1137 · 361장 × 66ms = 23.8초).
 * 뒤쪽 89장은 **전부 같은 장**이라 빼고, 마지막 장을 브라우저가 붙들게 뒀다
 * (`loop=1` 이면 끝나고 멈춘다).
 *
 * 여정의 한 구역이 아니라 **그 위에 덮인 한 장**이다. 덮여 있는 동안 밑에서는
 * 2구역이 조용히 올라오고, 걷히는 순간 바로 걸을 수 있다.
 *
 * **왜 걷어내기만 하면 되는가** — 오프닝 끝 프레임의 배경이 게임 하늘색과 거의
 * 같다 (오프닝 `#2F2A66 → #000600`, 게임 `#27255d → #000300`). 그래서 2구역
 * 이음매처럼 다른 색으로 덮을 필요 없이, **그냥 투명해지면** 이어진 한 장면이 된다.
 */

/**
 * 구운 장 수와 **한 장이 머무는 시간**. `scripts/make-opening-webp.py` 와 **같은 값**
 * 이어야 한다 — 속도는 파일에 구워져 있고, 여기서는 **언제 걷을지**를 셀 뿐이다.
 * 어긋나면 아직 돌고 있는 그림을 걷어내거나, 멈춘 그림을 한참 더 보고 있게 된다.
 */
const FRAMES = 361;
const FRAME_MS = 66;                 // 약 15fps — 처음 33ms(30fps)가 빨라서 두 배로 늘렸다
const PLAY_MS = FRAMES * FRAME_MS;   // 23.8초
/** 마지막 ✦ 를 잠깐 붙든다 — 끝나자마자 걷으면 급하게 읽힌다 */
const HOLD_MS = 900;
/** 걷히는 시간. 덮일 일은 없으니 넉넉하게 */
const FADE_MS = 900;
/** 눌러서 건너뛸 때는 빨리 걷는다 — 기다리는 사람은 이미 마음이 급하다 */
const SKIP_MS = 220;

export function Opening() {
  const endOpening = useGame((s) => s.endOpening);
  const goToStage = useGame((s) => s.goToStage);
  const [fading, setFading] = useState(false);
  /** 눌러서 건너뛰었는가 — 걷는 속도가 달라진다 */
  const [skipped, setSkipped] = useState(false);
  /** 그림이 다 받아졌는가 — 타이머는 **여기서부터** 센다. 안 그러면 받는 데 걸린
      만큼 뒤로 밀려서, 아직 돌고 있는 그림을 걷어내게 된다. */
  const [ready, setReady] = useState(false);

  /* 덮인 동안 2구역을 미리 올려 둔다. 맵을 받고 면을 굽는 동안 한 번 걸리는데,
     12초 안에 한 번이라 눈에 안 띈다. 전시 기기에서 오프닝이 버벅이면 이 줄을
     뒤로 미루면 된다 (끝나기 몇 초 전으로). */
  useEffect(() => { void goToStage(0); }, [goToStage]);

  useEffect(() => {
    if (!ready || skipped) return;
    let out = 0;
    const done = window.setTimeout(() => {
      setFading(true);
      out = window.setTimeout(endOpening, FADE_MS);
    }, PLAY_MS + HOLD_MS);
    return () => { window.clearTimeout(done); window.clearTimeout(out); };
  }, [ready, skipped, endOpening]);

  /* **누르면 바로 건너뛴다** — 화면 아무 데나 누르거나 아무 키나.
     전시에서 아이가 기다리다 톡 치는 것도 같은 손짓이고, 고치면서 새로고침할 때
     열다섯 초를 안 버린다. */
  useEffect(() => {
    if (skipped) return;
    const skip = () => {
      setSkipped(true);
      setFading(true);
      window.setTimeout(endOpening, SKIP_MS);
    };
    window.addEventListener('keydown', skip, { once: true });
    return () => window.removeEventListener('keydown', skip);
  }, [skipped, endOpening]);

  const onTap = () => {
    if (skipped) return;
    setSkipped(true);
    setFading(true);
    window.setTimeout(endOpening, SKIP_MS);
  };

  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label="오프닝 건너뛰기"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        /* 받아지기 전에는 무대 바탕색으로 덮는다 — 게임이 먼저 보이면 안 된다 */
        background: 'var(--orby-paper)',
        opacity: fading ? 0 : 1,
        transition: `opacity ${skipped ? SKIP_MS : FADE_MS}ms ease`,
        /* 클릭을 **여기서 받는다.** 통과시키면 밑에 있는 바닥 판정에 닿아서
           오프닝을 건너뛰려고 누른 손짓이 아이를 걷게 만든다. */
        pointerEvents: 'auto',
        cursor: 'pointer',
      }}
      onPointerDown={onTap}
    >
      <img
        src={`${import.meta.env.BASE_URL}opening/start.webp`}
        alt=""
        onLoad={() => setReady(true)}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    </div>
  );
}
