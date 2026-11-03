import { useEffect, useMemo, useRef } from 'react';
import { useGame } from '../game/store';
import { useTune } from '../game/tuneStore';
import { POSE } from '../engine/characterPose';
import { fitRotated, miniMapImage } from '../engine/miniMap';

/**
 * 미니맵 — **화면 오른쪽 아래.**
 *
 * 가이드(`ui 가이드/Frame 276~279.png`)에서 잰 자리: 26u 정사각 ·
 * 오른쪽 4.9u · 아래 4.7u(`--ui-floor` — 말풍선과 **같은 밑줄**).
 *
 * 그림은 `engine/miniMap.ts` 가 맵에서 바로 만든다. 여기서는 **틀에 끼우고
 * 돌리고, 아이를 올린다.**
 *
 * ― 왜 도는가 ―──────────────────────────────────────────────
 * **미니맵의 위쪽 = 화면의 위쪽** 이어야 한다. 그래야 "앞으로"(`c`)를 눌렀을 때
 * 미니맵에서도 위로 간다.
 *
 * **전시에 나가는 2·3구역은 1인칭이다** (`02-immigration.ts` 의 `fpv: true`).
 * 거기서는 고개돌리기(`i`·`g`)로 시선이 계속 바뀌므로 **매 프레임 따라 돈다.**
 * 저장소를 안 거치고 DOM 에 직접 쓴다 — 프레임마다 리액트를 다시 돌릴 일이
 * 아니다 (`characterPose.ts` 와 같은 이유).
 *
 * 아이소로 여는 구역(1구역 따위)에서는 각도가 **상수 45°** 다. 아이소 화면은
 * 비스듬히 누워 있어서 "앞으로"가 맵 좌표로는 대각선 (−1, −1) 이기 때문이다
 * (`walkInput` 의 `ISO`). 거기서는 시선이 안 바뀌니 돌리는 일도 한 번뿐이다.
 */

/** 아이소 화면에서 "화면 위"는 맵의 (−1, −1) 쪽이다 → 45° */
const ISO_SPIN = 45;

export function MiniMap() {
  const map = useGame((s) => s.map);
  const [px, pz] = useGame((s) => s.playerCell);
  const fpv = useTune((s) => s.fpv);
  const canvas = useRef<HTMLCanvasElement>(null);
  const spinner = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);

  /** 구역이 바뀔 때만 다시 그린다 */
  const img = useMemo(() => (map ? miniMapImage(map) : null), [map]);

  const a = map ? map.w / Math.max(map.w, map.d) : 1;
  const b = map ? map.d / Math.max(map.w, map.d) : 1;
  const fit = useMemo(() => fitRotated(a, b, ISO_SPIN), [a, b]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !img) return;
    c.width = img.width;
    c.height = img.height;
    c.getContext('2d')?.putImageData(img, 0, 0);
  }, [img]);

  /* 1인칭일 때만 돈다. 아이소에서는 각도가 상수라 돌 일이 없다 —
     아무도 안 보는 rAF 를 전시 내내 돌리지 않는다. */
  useEffect(() => {
    if (!fpv || !map) return;
    let id = 0;
    const tick = () => {
      /* 아이 모델은 +Z 가 앞이라 앞 벡터가 (sin yaw, cos yaw) 다. 그게 화면
         위(−90°)로 가게 하는 각도를 구한다. */
      const deg = -90 - (Math.atan2(Math.cos(POSE.yaw), Math.sin(POSE.yaw)) * 180) / Math.PI;
      const f = fitRotated(a, b, deg);
      if (spinner.current) spinner.current.style.transform = `rotate(${deg}deg) scale(${f})`;
      if (marker.current) marker.current.style.transform =
        `translate(-50%, -50%) rotate(${-deg}deg) scale(${1 / f})`;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [fpv, map, a, b]);

  if (!map || !img) return null;

  return (
    <div
      style={{
        position: 'absolute',
        right: 'calc(var(--u) * 4.9)',
        bottom: 'var(--ui-floor)',
        width: 'calc(var(--u) * 26)',
        height: 'calc(var(--u) * 26)',
        background: 'var(--ui-map-bg)',
        border: 'var(--ui-line) solid var(--ui-orange)',
        /* 각진 모서리 — 말풍선과 같은 규칙이다 */
        borderRadius: 0,
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
      }}
    >
      <div
        ref={spinner}
        style={{
          position: 'relative',
          width: `${a * 100}%`,
          height: `${b * 100}%`,
          transform: `rotate(${ISO_SPIN}deg) scale(${fit})`,
        }}
      >
        <canvas
          ref={canvas}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            /* 한 칸이 한 픽셀이다. 보간하면 길이 뿌옇게 번져서 어디가 길인지
               안 보인다 — 가이드의 뭉툭한 느낌도 여기서 나온다. */
            imageRendering: 'pixelated',
          }}
        />
        {/* 아이 자리. 0×0 짜리 자리표에 얹어 두고, 표시만 틀 기준으로 되돌린다
            — 지도가 돌아도 아이 표시는 안 기울고 크기도 안 변한다. */}
        <div
          style={{
            position: 'absolute',
            left: `${((px + 0.5) / map.w) * 100}%`,
            top: `${((pz + 0.5) / map.d) * 100}%`,
            width: 0,
            height: 0,
          }}
        >
          <div
            ref={marker}
            style={{
              position: 'absolute',
              width: 'calc(var(--u) * 1.6)',
              height: 'calc(var(--u) * 1.6)',
              borderRadius: '50%',
              background: 'var(--ui-orange)',
              border: 'calc(var(--u) * 0.35) solid #ffffff',
              boxShadow: '0 0 0 calc(var(--u) * 0.2) #00000066',
              transform: `translate(-50%, -50%) rotate(${-ISO_SPIN}deg) scale(${1 / fit})`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
