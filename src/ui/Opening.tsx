import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { RESTART_KEY } from '../engine/walkInput';

/**
 * **오프닝 모션그래픽.**
 *
 * 천우태가 만든 450장짜리 PNG 연속 그림(`../시작 애니매이션`)을 **영상 한 편**으로
 * 구운 것이다 (`public/opening/start.mp4` · 2000×1422 · 20fps · 18.05초 · 7.7MB).
 * 굽는 법은 `scripts/make-opening-mp4.mjs` 에 있다.
 *
 * 여정의 한 구역이 아니라 **그 위에 덮인 한 장**이다. 덮여 있는 동안 밑에서는
 * 2구역이 조용히 올라오고, 걷히는 순간 바로 걸을 수 있다.
 *
 * **왜 걷어내기만 하면 되는가** — 오프닝 끝 장의 배경이 게임 하늘색과 거의
 * 같다 (오프닝 `#2F2A66 → #000600`, 게임 `#27255d → #000300`). 그래서 2구역
 * 이음매처럼 다른 색으로 덮을 필요 없이, **그냥 투명해지면** 이어진 한 장면이 된다.
 *
 * ― 아이패드에서 버벅이던 것을 고친 자리 (결정 ㊼) ―─────────────
 * 예전에는 움직이는 WebP 한 장(14MB)을 띄우고 **시계를 세서** 18.95초에 걷었다.
 * 맥북에서는 맞아떨어졌지만 아이패드에서는 셋이 한꺼번에 어긋났다:
 *
 *  ① WebP 는 브라우저가 **CPU 로** 한 장씩 푼다. 아이패드는 2000×1422 를 1초에
 *     스무 장씩 못 풀어서 그림이 시계보다 뒤처졌다 → 아직 재생 중인데 걷혔다.
 *  ② 그 와중에 덮개 **밑에서 3D 무대가 그림자까지 켠 채 계속 그려지고** 있었다.
 *  ③ WebP 는 **다 받아야 첫 장이 뜬다.** 14MB 를 12초 안에 못 받으면 포기하고
 *     그냥 넘어가게 해 뒀었다.
 *
 * 셋 다 영상으로 바꾸면서 풀린다 — 아이패드에는 영상만 푸는 칩이 따로 있고,
 * 영상은 **받으면서 바로 틀고**, 무엇보다 **언제 끝났는지 자기가 알려준다.**
 * 그래서 여기서는 이제 **시계를 세지 않는다.** 길이를 바꿔도 이 파일은 안 고친다.
 */

/** 마지막 ✦ 를 잠깐 붙든다 — 끝나자마자 걷으면 급하게 읽힌다 */
const HOLD_MS = 900;
/** 걷히는 시간. 덮일 일은 없으니 넉넉하게 */
const FADE_MS = 900;
/** 눌러서 건너뛸 때는 빨리 걷는다 — 기다리는 사람은 이미 마음이 급하다 */
const SKIP_MS = 220;
/** 걷히기 **얼마 전에** 3D 무대를 깨울지. 첫 장을 그리는 값이 덮개 밑에서 치러진다 */
const WAKE_BEFORE_MS = 700;
/** 아예 안 틀리면 포기하고 넘어간다 (전시장에서 멈춰 있으면 아무도 못 되살린다) */
const NEVER_STARTED_MS = 20000;
/** 틀다가 멎은 채 이만큼 지나면 포기한다 */
const STALLED_MS = 8000;
/** 영상을 못 읽었을 때 쓰는 옛 WebP 한 장. 길이는 파일에 구워져 있다 */
const WEBP_MS = 18050 + HOLD_MS;

/** 주소에 `?diag=1` 을 붙이면 **화면 위에** 상태를 띄운다 — 아이패드에는 개발자
 *  도구가 없어서, 거기서 무슨 일이 벌어지는지 볼 방법이 이것뿐이다. */
const DIAG = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('diag') === '1';

export function Opening() {
  const endOpening = useGame((s) => s.endOpening);
  const wakeScene = useGame((s) => s.wakeScene);
  const goToStage = useGame((s) => s.goToStage);

  const video = useRef<HTMLVideoElement>(null);
  const [fading, setFading] = useState(false);
  /** 눌러서 건너뛰었는가 — 걷는 속도가 달라진다 */
  const [skipped, setSkipped] = useState(false);
  /** 영상을 못 읽었다 — 옛 WebP 로 돌아간다 */
  const [fallback, setFallback] = useState(false);
  /** 아이패드가 **저전력 모드**면 소리를 껐어도 저절로 안 튼다. 그때만 뜨는 안내 */
  const [blocked, setBlocked] = useState(false);
  const [diag, setDiag] = useState('');

  /** 끝내는 길은 여럿(다 봄·건너뜀·포기)인데 **한 번만** 끝나야 한다 */
  const closing = useRef(false);
  /** 2구역을 올리기 시작했는가 — 두 번 부르지 않는다 */
  const kicked = useRef(false);

  /** 덮개를 걷는다. `fast` 면 눌러서 건너뛴 것이라 빨리 걷는다. */
  const close = useCallback((fast: boolean) => {
    if (closing.current) return;
    closing.current = true;
    if (fast) setSkipped(true);
    wakeScene();
    setFading(true);
    window.setTimeout(endOpening, fast ? SKIP_MS : FADE_MS);
  }, [endOpening, wakeScene]);

  /** 밑에서 2구역을 올린다. 영상이 **실제로 돌기 시작한 뒤**에 부른다 —
   *  맵을 받고 면을 굽는 일이 영상이 뜨는 순간과 겹치면 거기서 한 번 걸린다. */
  const kick = useCallback(() => {
    if (kicked.current) return;
    kicked.current = true;
    void goToStage(0);
  }, [goToStage]);

  /* 영상이 끝내 안 돌더라도 **2구역은 올려 둬야 한다.** 안 그러면 걷었을 때 빈 화면이다. */
  useEffect(() => {
    const t = window.setTimeout(kick, 4000);
    return () => window.clearTimeout(t);
  }, [kick]);

  /* **저절로 틀기.** iOS 는 소리를 끈 영상만 저절로 틀어 주는데, 저전력 모드에서는
     그것마저 막는다. 막히면 안내를 띄우고, 화면을 한 번 누르면 거기서 시작한다. */
  useEffect(() => {
    if (fallback) return;
    const v = video.current;
    if (!v) return;
    v.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  }, [fallback]);

  /* **멈춰 선 채로 끝나지 않게 지킨다.** 못 받았든 못 틀었든 멎었든, 전시장에서
     덮개가 안 걷히면 아무도 못 되살린다. 단 **잘 돌고 있으면 절대 안 건드린다** —
     예전에 시계로 걷다가 아직 재생 중인 그림을 잘라 먹었다. */
  useEffect(() => {
    if (fallback || skipped) return;
    const born = performance.now();
    let lastTime = -1;
    let lastMove = performance.now();

    const tick = window.setInterval(() => {
      const v = video.current;
      if (!v || closing.current) return;
      const now = performance.now();
      const t = v.currentTime;

      if (t !== lastTime) { lastTime = t; lastMove = now; }

      if (DIAG) {
        const got = v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0;
        setDiag(
          `${t.toFixed(1)} / ${(v.duration || 0).toFixed(1)}초 · 받은 데까지 ${got.toFixed(1)}초`
          + ` · ${v.paused ? '멈춤' : '재생'} · 멎은 지 ${((now - lastMove) / 1000).toFixed(1)}초`,
        );
      }

      if (t === 0 && now - born > NEVER_STARTED_MS) {
        console.warn('[ORBY] 오프닝 영상이 끝내 안 돌았습니다 — 그냥 넘어갑니다');
        close(false);
      } else if (t > 0 && now - lastMove > STALLED_MS) {
        console.warn('[ORBY] 오프닝 영상이 멎었습니다 — 그냥 넘어갑니다');
        close(false);
      }
    }, 500);
    return () => window.clearInterval(tick);
  }, [fallback, skipped, close]);

  /* **영상이 다 돌았을 때.** 시계가 아니라 영상이 알려준다 — 느린 기기에서도
     잘리지 않는 이유가 여기다. 마지막 장을 잠깐 붙들었다 걷는다. */
  const onEnded = useCallback(() => {
    window.setTimeout(() => close(false), HOLD_MS);
  }, [close]);

  /* 걷히기 직전에 3D 무대를 깨운다 — 첫 장을 그리는 값을 덮개 밑에서 치른다 */
  useEffect(() => {
    const v = video.current;
    if (!v || fallback) return;
    const plan = () => {
      const left = (v.duration - v.currentTime) * 1000 + HOLD_MS - WAKE_BEFORE_MS;
      if (Number.isFinite(left)) window.setTimeout(wakeScene, Math.max(0, left));
    };
    v.addEventListener('playing', plan, { once: true });
    return () => v.removeEventListener('playing', plan);
  }, [fallback, wakeScene]);

  /* 영상을 못 읽으면 **옛 WebP 한 장**으로 돌아간다. 전시장 아이패드는 오프라인이라
     파일이 깨지는 일만 아니면 여기까지 올 일이 없지만, 오면 덮개가 안 걷힌다. */
  const onError = useCallback(() => {
    console.warn('[ORBY] 오프닝 영상을 못 읽었습니다 — 옛 그림으로 돌아갑니다');
    setFallback(true);
  }, []);

  /* WebP 로 돌아갔을 때만 쓰는 시계. 여기서는 끝을 알 길이 없어서 어쩔 수 없다. */
  useEffect(() => {
    if (!fallback || skipped) return;
    const t = window.setTimeout(() => close(false), WEBP_MS);
    return () => window.clearTimeout(t);
  }, [fallback, skipped, close]);

  /* **누르면 바로 건너뛴다** — 화면 아무 데나 누르거나 아무 키나.
     전시에서 아이가 기다리다 톡 치는 것도 같은 손짓이고, 고치면서 새로고침할 때
     열여덟 초를 안 버린다. */
  useEffect(() => {
    if (skipped) return;
    /* `h` 만 뺀다 — 그건 **처음으로 되돌리는 키**다 (`App` 의 `useRestartKey`).
       여기서 같이 받으면 되돌리려고 누른 손짓이 "건너뛰기"로 먹혀서 인트로가
       0.2초 만에 걷힌다. */
    const skip = (e: KeyboardEvent) => {
      if (e.code === `Key${RESTART_KEY.toUpperCase()}`) return;
      window.removeEventListener('keydown', skip);
      close(true);
    };
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, [skipped, close]);

  const onTap = () => {
    /* 저전력 모드라 안 틀린 것이면, 이 손짓은 **건너뛰기가 아니라 시작하기**다 */
    if (blocked) {
      setBlocked(false);
      void video.current?.play().catch(() => setBlocked(true));
      return;
    }
    close(true);
  };

  const fill = { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } as const;

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
      {fallback ? (
        <img src={`${import.meta.env.BASE_URL}opening/start.webp`} alt="" style={fill} />
      ) : (
        <video
          ref={video}
          src={`${import.meta.env.BASE_URL}opening/start.mp4`}
          /* 이 넷이 iOS 에서 **저절로 틀리게 하는 조건**이다. `playsInline` 이
             빠지면 아이패드가 영상을 전체화면으로 띄워 버린다. */
          muted
          autoPlay
          playsInline
          preload="auto"
          onPlaying={kick}
          onEnded={onEnded}
          onError={onError}
          style={fill}
        />
      )}

      {blocked && (
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
          color: 'var(--orby-ink)', font: '500 calc(var(--u) * 2.2) / 1.4 Pretendard, sans-serif',
        }}>
          화면을 한 번 눌러 주세요
        </div>
      )}

      {DIAG && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0.6em 0.8em',
          background: 'rgba(0,0,0,.6)', color: '#fff', font: '400 14px/1.4 monospace',
        }}>
          {diag || '영상을 받는 중…'}
        </div>
      )}
    </div>
  );
}
