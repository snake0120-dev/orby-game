import { useCallback, useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';
import { RESTART_KEY, WALK_KEYS } from '../engine/walkInput';

/**
 * **오프닝 모션그래픽.**
 *
 * 천우태가 만든 450장짜리 PNG 연속 그림(`../시작 애니매이션`)을 **영상 두 편**으로
 * 구운 것이다. 굽는 법은 `scripts/make-opening-mp4.mjs` 에 있다.
 *
 *   `start-loop.mp4`   15~74번  ·  3.00초   ← 창문 닫힌 채 그림자가 흔들린다. **끝없이 돈다**
 *   `start-rest.mp4`   75~360번 · 14.30초   ← 창문이 열리고 ✦ 가 나온다. **누르면 재생**
 *
 * 여정의 한 구역이 아니라 **그 위에 덮인 한 장**이다. 덮여 있는 동안 밑에서는
 * 2구역이 조용히 올라오고, 걷히는 순간 바로 걸을 수 있다.
 *
 * ― 왜 앞부분이 끝없이 도는가 (결정 ㊽) ―─────────────────────
 * 전시장에서 **아이가 오기 전까지 기다리는 상태**가 있어야 한다. 예전에는 틀면
 * 18초를 혼자 다 돌고 혼자 게임에 들어가 앉아 있었다. 지금은 아이가 버튼을 눌러야
 * 이야기가 시작된다 — **아이가 시작시킨 것**이 된다.
 *
 * 창문 셰이드에 **↑ 화살표**가 그려져 있다. 그게 "눌러서 올려라"는 안내라,
 * 글자를 따로 띄우지 않는다.
 *
 * ― 넘어가는 장치는 `loop` 를 끄는 것이 전부다 ―───────────────
 * 누르면 바로 바꾸지 않는다 — **이번 흔들림 한 바퀴를 마치고** 넘어간다
 * (천우태 결정). 누른 순간이 한 바퀴 중 어디냐에 따라 그림자 자리가 달라서,
 * 그냥 이으면 한 번 톡 튀기 때문이다.
 *
 *   누르기 전 │ 루프영상.loop = true   → 브라우저가 알아서 영원히 돈다
 *   눌렀을 때 │ 루프영상.loop = false  → 이번 바퀴만 마치고 `ended` 가 온다
 *   `ended`   │ 뒷부분 영상을 튼다     → 74번 다음에 75번. **그냥 이어진다**
 *
 * 재 보니 루프 끝 → 뒷부분 첫 장의 차이가 **3.06** 인데, 원본에서 74→75번으로
 * 넘어가는 차이가 **3.07** 이다 — 바꿔치는 자리가 보통 장면 한 장 넘어가는 것과
 * 똑같다는 뜻이다. 돌아가는 이음매(74→15)는 **2.56** 으로 그보다도 작다.
 *
 * ― 자바스크립트가 루프를 돌리지 않는다 ―────────────────────
 * 파일을 가른 덕에 `loop` 속성이 루프를 돌린다. 키오스크가 이 화면에서 몇 시간
 * 머물러도 **자바스크립트가 한 줄도 안 돈다.** 한 파일에서 3초마다 되감게 했으면
 * 되감기를 수천 번 했을 것이다.
 *
 * ― 아이패드에서 버벅이던 것을 고친 자리 (결정 ㊼) ―─────────────
 * 예전에는 움직이는 WebP 한 장(14MB)을 띄우고 **시계를 세서** 걷었다. WebP 는
 * 브라우저가 CPU 로 한 장씩 푸는데 아이패드가 못 따라가서, 아직 재생 중인 그림이
 * 잘려 나갔다. 영상은 아이패드 안의 전용 칩이 풀고 **끝났다고 자기가 알려준다** —
 * 그래서 여기서는 **시계를 세지 않는다.** 토막 경계를 바꿔도 이 파일은 안 고친다.
 */

/** 마지막 ✦ 를 잠깐 붙든다 — 끝나자마자 걷으면 급하게 읽힌다 */
const HOLD_MS = 900;
/** 걷히는 시간. 덮일 일은 없으니 넉넉하게 */
const FADE_MS = 900;
/** 걷히기 **얼마 전에** 3D 무대를 깨울지. 첫 장을 그리는 값이 덮개 밑에서 치러진다 */
const WAKE_BEFORE_MS = 700;
/** 기다리는 중에 영상이 멎으면 이만큼 뒤에 **되살려 본다** (넘어가지는 않는다) */
const REVIVE_MS = 4000;
/** 뒷부분이 멎은 채 이만큼 지나면 포기하고 넘어간다 — 사람이 보고 있다 */
const STALLED_MS = 8000;
/** 기다리는 중에 이만큼이 되도록 한 장도 못 돌면 정지 그림으로 바꾼다 */
const NEVER_STARTED_MS = 20000;
/** 2구역이 아직 안 올라왔으면 **이만큼까지 기다렸다** 걷는다 — 준비 전에 걷으면
 *  "시작하기" 버튼이 뜨고, 아이가 그걸 또 눌러야 한다 (천우태가 잡은 것) */
const READY_WAIT_MS = 5000;
/** 예비 그림(WebP)의 길이 + 마지막 붙듦. 거기선 끝을 알 길이 없어 시계를 쓴다 */
const WEBP_MS = 18050 + HOLD_MS;
/** 예비 그림조차 안 올라오면 이만큼 뒤에 넘어간다 */
const WEBP_GIVEUP_MS = 30000;

/** 주소에 `?diag=1` 을 붙이면 **화면 위에** 상태를 띄운다 — 아이패드에는 개발자
 *  도구가 없어서, 거기서 무슨 일이 벌어지는지 볼 방법이 이것뿐이다. */
const DIAG = typeof location !== 'undefined'
  && new URLSearchParams(location.search).get('diag') === '1';

/** **눌렀다고 치는 키.** 걷기·고개돌리기 키 여섯(`c d e f i g`)만 받는다 —
 *  전시 컨트롤러가 그 글자를 보내기 때문이다 (`walkInput.ts` 의 `KEY`).
 *  `h`(처음으로)는 `WALK_KEYS` 에 애초에 없다. */
const START_CODES = new Set(WALK_KEYS.map((k) => `Key${k.toUpperCase()}`));

export function Opening() {
  const endOpening = useGame((s) => s.endOpening);
  const wakeScene = useGame((s) => s.wakeScene);
  const goToStage = useGame((s) => s.goToStage);

  const loopV = useRef<HTMLVideoElement>(null);
  const restV = useRef<HTMLVideoElement>(null);

  /** 눌렀다 — 이번 바퀴를 마치면 뒷부분으로 넘어간다 */
  const [armed, setArmed] = useState(false);
  /** 뒷부분이 재생 중이다. 여기서부터는 **누름을 안 받는다** (끝까지 보여준다) */
  const [rest, setRest] = useState(false);
  const [fading, setFading] = useState(false);
  /** 영상을 못 읽었다 — 옛 WebP 한 장으로 돌아가고, 눌러야 넘어간다 */
  const [fallback, setFallback] = useState(false);
  /** 아이패드가 **저전력 모드**면 소리를 껐어도 저절로 안 튼다. 그때만 뜨는 안내 */
  const [blocked, setBlocked] = useState(false);
  /** 예비 그림이 올라왔는가 — 거기서부터 시계를 센다 */
  const [webpReady, setWebpReady] = useState(false);
  const [diag, setDiag] = useState('');

  /** 끝내는 길은 여럿인데 **한 번만** 끝나야 한다 */
  const closing = useRef(false);
  /** 2구역을 올리기 시작했는가 — 두 번 부르지 않는다 */
  const kicked = useRef(false);
  /** 뒷부분 첫 장을 미리 풀어 뒀는가 */
  const primed = useRef(false);
  /** 지킴이가 이벤트 핸들러 바깥에서 봐야 하는 값들 */
  const state = useRef({ armed: false, rest: false, laps: 0, stut: 0, revived: 0 });

  /** 밑에서 2구역을 올린다. 루프가 **실제로 돌기 시작한 뒤**에 부른다 —
   *  맵을 받고 면을 굽는 일이 영상이 뜨는 순간과 겹치면 거기서 한 번 걸린다. */
  const kick = useCallback(() => {
    if (kicked.current) return;
    kicked.current = true;
    void goToStage(0);
  }, [goToStage]);

  /**
   * 덮개를 걷는다.
   *
   * **2구역이 준비된 뒤에 걷는다.** 준비 전에 걷으면 `phase` 가 아직 `title` 이라
   * `App` 이 **"시작하기" 버튼이 있는 시작 화면**을 띄운다 — 아이가 스플래시를 다
   * 보고도 버튼을 한 번 더 눌러야 한다. 전시에서 그러면 안 된다.
   * 그동안은 **마지막 장을 그대로 붙들고** 있는다 (빈 하늘을 보여주지 않는다).
   */
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    kick();                       // 아직 안 시켰으면 지금이라도
    const since = performance.now();
    const begin = () => {
      const ready = !!useGame.getState().map;
      if (!ready && performance.now() - since < READY_WAIT_MS) {
        window.setTimeout(begin, 100);
        return;
      }
      wakeScene();
      setFading(true);
      window.setTimeout(endOpening, FADE_MS);
    };
    begin();
  }, [endOpening, wakeScene, kick]);

  /* 기다리는 동안 **뒷부분을 받아 두고 첫 장까지 풀어 둔다.** iOS 는 `play()` 를
     한 번도 안 부른 영상의 첫 장을 안 풀어 두는 일이 있는데, 그러면 바꿔치는
     순간 한 번 깜빡인다. 루프가 저절로 틀린 뒤라 여기서도 틀 수 있다. */
  const prime = useCallback(() => {
    if (primed.current) return;
    const v = restV.current;
    if (!v) return;
    primed.current = true;
    v.play().then(() => { v.pause(); v.currentTime = 0; }).catch(() => { /* 못 해도 그만이다 */ });
  }, []);

  /* **영상이 끝내 안 돌아도 2구역은 올려 둬야 한다.** 올리는 일을 `playing` 에만
     매달아 두면, 영상을 못 읽었을 때(예비 그림으로 넘어갔을 때) 한 번도 안 불린다.
     그러면 스플래시를 다 보고 걷히는 순간 **"시작하기" 버튼**이 뜬다 — 전시용
     빌드에는 이걸 대신 불러 주는 개발용 코드도 없다. */
  useEffect(() => {
    const t = window.setTimeout(kick, 4000);
    return () => window.clearTimeout(t);
  }, [kick]);

  /** 루프가 돌기 시작했다 */
  const onLoopPlaying = useCallback(() => {
    setBlocked(false);
    kick();
    prime();
  }, [kick, prime]);

  /* **저절로 틀기.** iOS 는 소리를 끈 영상만 저절로 틀어 주는데, 저전력 모드에서는
     그것마저 막는다. 막히면 안내를 띄우고, 화면을 한 번 누르면 거기서 시작한다. */
  useEffect(() => {
    if (fallback) return;
    loopV.current?.play().then(() => setBlocked(false)).catch(() => setBlocked(true));
  }, [fallback]);

  /** **누름** — 걷기 키 여섯이나 화면 터치. 이번 바퀴를 마치고 넘어가게 **건다**. */
  const press = useCallback(() => {
    /* 영상을 못 읽어 정지 그림을 띄운 상태면, 누름은 그냥 넘어가라는 뜻이다 */
    if (fallback) { close(); return; }
    /* 저전력 모드라 안 틀린 것이면, 이 손짓은 **넘어가기가 아니라 시작하기**다 */
    if (blocked) {
      setBlocked(false);
      void loopV.current?.play().catch(() => setBlocked(true));
      return;
    }
    /* 뒷부분은 **끝까지 보여준다** — 연타해도 안 건너뛴다 (천우태 결정) */
    if (state.current.rest || state.current.armed) return;
    state.current.armed = true;
    setArmed(true);
    /* 지금 바로 바꾸지 않는다. `loop` 를 끄면 이번 바퀴를 마치고 `ended` 가 온다 —
       그동안 흔들림은 자연스럽게 계속 돈다. */
    const v = loopV.current;
    if (v) v.loop = false;
  }, [fallback, blocked, close]);

  /* 키보드. **자판 위치(`code`)로 읽는다** — 한글 입력기가 켜져 있으면
     `c` 가 `ㅊ` 으로 들어와서 `key` 로는 안 먹는다 (`App.tsx` 와 같은 규칙).
     거들쇠가 눌린 건 안 받는다 — `Shift+C` 같은 개발용 단축키와 겹친다. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.code === `Key${RESTART_KEY.toUpperCase()}`) return;   // 처음으로 되돌리는 키
      if (!START_CODES.has(e.code)) return;
      press();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  /** 루프가 이번 바퀴를 마쳤다 (`loop` 를 껐을 때만 온다) → 뒷부분으로 바꾼다 */
  const onLoopEnded = useCallback(() => {
    state.current.rest = true;
    setRest(true);
    void restV.current?.play().catch(() => { /* 지킴이가 받는다 */ });
  }, []);

  /** 뒷부분이 다 돌았다. 시계가 아니라 영상이 알려준다 */
  const onRestEnded = useCallback(() => {
    window.setTimeout(close, HOLD_MS);
  }, [close]);

  /* 걷히기 직전에 3D 무대를 깨운다 — 첫 장을 그리는 값을 덮개 밑에서 치른다.
     **미리 풀어 두느라 튼 것과 구별해야 한다.** `prime()` 이 첫 장을 풀려고
     `play()` 를 한 번 부르는데, 그것도 `playing` 으로 들어온다. 거기서 깨우면
     아무도 안 눌렀는데 14초 뒤에 무대가 깨어나서 **기다리는 내내 2구역을 그린다**
     (실제로 그랬다 — 그 탓에 루프가 멎었다). */
  const onRestPlaying = useCallback(() => {
    if (!state.current.rest) return;
    const v = restV.current;
    if (!v) return;
    const left = (v.duration - v.currentTime) * 1000 + HOLD_MS - WAKE_BEFORE_MS;
    if (Number.isFinite(left)) window.setTimeout(wakeScene, Math.max(0, left));
  }, [wakeScene]);

  /* 영상을 못 읽으면 **옛 WebP 한 장**으로 돌아간다. 거기서는 끝을 알 길이 없어서
     혼자 넘어가지 않고 **누를 때까지 기다린다.** */
  const onError = useCallback(() => {
    console.warn('[ORBY] 오프닝 영상을 못 읽었습니다 — 옛 그림으로 돌아갑니다');
    setFallback(true);
  }, []);

  /* **예비 그림도 혼자 넘어간다.** 영상을 못 읽어 옛 WebP 로 돌아갔을 때,
     거기에는 **기다리는 상태가 없다** — WebP 는 창문 열리는 데까지 통째로 한 번
     돌고 멈춘다. 그래서 ㊽ 의 "안 눌렀으면 안 넘어간다" 규칙이 여기엔 안 맞는다.
     스플래시를 다 보여 준 뒤엔 **혼자 2구역으로 간다** (천우태가 잡은 것).
     끝을 알 길이 없어서 여기서만 시계를 쓴다. */
  useEffect(() => {
    if (!fallback) return;
    const t = window.setTimeout(close, webpReady ? WEBP_MS : WEBP_GIVEUP_MS);
    return () => window.clearTimeout(t);
  }, [fallback, webpReady, close]);

  /* **멈춰 선 채로 끝나지 않게 지킨다.**
     기다리는 중과 뒷부분 재생 중의 처리가 **다르다** — 아무도 안 눌렀는데 혼자
     게임을 시작하는 건 어떤 경우에도 틀렸다 (전시장에 사람이 없을 수 있다). */
  useEffect(() => {
    if (fallback) return;
    const born = performance.now();
    let lastT = -1;
    let lastMove = performance.now();
    /** **한 번이라도 돌았는가.** `currentTime === 0` 으로 판단하면 안 된다 —
        루프는 **한 바퀴마다 0으로 돌아온다.** 그걸 "아직 시작도 못 했다"로 읽어서
        20초 뒤 마침 0인 순간에 재면 멀쩡한 루프를 정지 그림으로 바꿔버린다
        (실제로 그랬다 · 16바퀴째에서 죽었다). */
    let everPlayed = false;

    const tick = window.setInterval(() => {
      const s = state.current;
      const v = s.rest ? restV.current : loopV.current;
      if (!v || closing.current) return;
      const now = performance.now();
      const t = v.currentTime;

      /* 되감겼다 = 한 바퀴 돌았다 */
      if (!s.rest && t < lastT - 0.5) s.laps++;
      if (t > 0) everPlayed = true;
      if (t !== lastT) { lastT = t; lastMove = now; }
      const still = now - lastMove;

      if (DIAG) {
        const got = v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0;
        const where = s.rest ? '뒷부분' : s.armed ? '이번 바퀴 마치는 중' : '기다리는 중';
        setDiag(
          `${where} · ${s.laps}바퀴 · ${t.toFixed(1)}/${(v.duration || 0).toFixed(1)}초`
          + ` · 받은 데까지 ${got.toFixed(1)}초 · ${v.paused ? '멈춤' : '재생'}`
          + ` · 끊김 ${s.stut} · 되살림 ${s.revived}`,
        );
      }

      if (s.rest) {
        /* 뒷부분: 사람이 보고 있다. 멎어 있으면 걷고 넘어간다 */
        if (still > STALLED_MS) {
          console.warn('[ORBY] 뒷부분이 멎었습니다 — 그냥 넘어갑니다');
          close();
        }
        return;
      }

      /* 기다리는 중: **절대 게임으로 넘어가지 않는다.** 되살려 본다. */
      if (!everPlayed && now - born > NEVER_STARTED_MS) {
        console.warn('[ORBY] 오프닝 영상이 끝내 안 돌았습니다 — 그림으로 기다립니다');
        setFallback(true);
        return;
      }
      if (still > REVIVE_MS) {
        s.revived++;
        lastMove = now;
        void v.play().catch(() => setBlocked(true));
      }
    }, 500);
    return () => window.clearInterval(tick);
  }, [fallback, close]);

  const fill = {
    position: 'absolute', inset: 0,
    width: '100%', height: '100%', objectFit: 'cover', display: 'block',
  } as const;

  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label="오프닝 시작"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 50,
        /* 받아지기 전에는 무대 바탕색으로 덮는다 — 게임이 먼저 보이면 안 된다 */
        background: 'var(--orby-paper)',
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        /* 클릭을 **여기서 받는다.** 통과시키면 밑에 있는 바닥 판정에 닿아서
           오프닝에서 누른 손짓이 아이를 걷게 만든다. */
        pointerEvents: 'auto',
        cursor: 'pointer',
      }}
      onPointerDown={press}
    >
      {fallback ? (
        <img
          src={`${import.meta.env.BASE_URL}opening/start.webp`}
          alt=""
          onLoad={() => setWebpReady(true)}
          style={fill}
        />
      ) : (
        <>
          {/*
            **둘을 포개 둔다.** 뒷부분이 밑, 루프가 위다. 바꿀 때 위를 투명하게만
            하면 되니까 붙였다 뗐다 할 필요가 없다 — `display` 로 여닫으면 그 순간
            한 번 번쩍인다 (`Seam.tsx` 에서 겪은 것과 같은 함정이다).
          */}
          <video
            ref={restV}
            src={`${import.meta.env.BASE_URL}opening/start-rest.mp4`}
            muted
            playsInline
            preload="auto"
            onPlaying={onRestPlaying}
            onEnded={onRestEnded}
            onError={onError}
            style={fill}
          />
          <video
            ref={loopV}
            src={`${import.meta.env.BASE_URL}opening/start-loop.mp4`}
            /* 이 넷이 iOS 에서 **저절로 틀리게 하는 조건**이다. `playsInline` 이
               빠지면 아이패드가 영상을 전체화면으로 띄워 버린다. */
            muted
            autoPlay
            playsInline
            loop
            preload="auto"
            onPlaying={onLoopPlaying}
            /* **바퀴가 넘어가는 자리는 안 센다.** 브라우저가 루프를 돌 때
               되감으면서 `waiting` 을 한 번 흘리는데, 그걸 끊김으로 세면 전시장에서
               `?diag=1` 에 "끊김 200" 이 찍혀서 멀쩡한데 고장난 줄 알게 된다. */
            onWaiting={(e) => {
              const v = e.currentTarget;
              if (v.currentTime > 0.2 && v.currentTime < v.duration - 0.2) state.current.stut++;
            }}
            onEnded={onLoopEnded}
            onError={onError}
            style={{ ...fill, opacity: rest ? 0 : 1 }}
          />
        </>
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
          background: 'rgba(0,0,0,.6)', color: '#fff', font: '400 13px/1.4 monospace',
        }}>
          {diag || '영상을 받는 중…'}{armed && !rest ? '  ← 눌렸다' : ''}
        </div>
      )}
    </div>
  );
}
