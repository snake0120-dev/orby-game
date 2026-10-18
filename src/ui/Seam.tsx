import { useEffect, useRef, useState } from 'react';
import { useGame } from '../game/store';

/**
 * **이어진 통로의 이음매.**
 *
 * 2구역의 먼 쪽 유리 통로는 3구역의 유리 통로 A 로 그대로 이어진다 — 같은 건물의
 * 한 복도다. 거기서 "통과!" 전체화면이 뜨고 검은 로딩을 거치면 한 건물이 두 동강
 * 난다. 그래서 그 관문만 `gate.seam` 으로 표시해 두고(`types.ts`), 여기서 화면을
 * 한 번 **밝게 덮었다 걷으면서** 그 사이에 맵을 갈아끼운다 (`store.crossSeam`).
 *
 * **왜 덮어야 하나** — 두 맵은 크기가 달라서(100×36×134 vs 104×54×104) 카메라가
 * 다른 자리에 선다. 아무것도 안 덮고 바꾸면 그림이 한 번 튄다.
 *
 * **막은 늘 떠 있고 투명도만 바뀐다.** `phase` 에 따라 붙였다 뗐다 하면 맵이 갈리는
 * 순간 막이 통째로 사라져서 오히려 한 번 번쩍인다.
 */

/** 덮이는 시간 */
const IN_MS = 350;
/** 덮인 채로 맵을 갈아끼우고 카메라가 자리를 잡는 틈 */
const HOLD_MS = 140;
/** 걷히는 시간 — 덮일 때보다 느긋해야 "도착했다"로 읽힌다 */
const OUT_MS = 480;

/* 게임 바탕이 거의 검정(`--orby-paper` #000300)이라 **순백은 번쩍인다.**
   통로 자체의 빛 색인 민트로 덮으면 "복도 끝의 밝은 데로 걸어 들어간다"가 된다.
   어둡게 지나가는 쪽이 나으면 이 한 줄을 `--orby-paper` 로 바꾸면 된다. */
const VEIL = 'var(--orby-mint)';

export function Seam() {
  const phase = useGame((s) => s.phase);
  const crossSeam = useGame((s) => s.crossSeam);
  const [covered, setCovered] = useState(false);
  /** 한 번 시작한 이음매를 두 번 타지 않게 */
  const busy = useRef(false);

  useEffect(() => {
    if (phase !== 'seam' || busy.current) return;
    busy.current = true;
    setCovered(true);
    const t = window.setTimeout(() => {
      /* 넘어가다 멈추든(`crossSeam` 이 스스로 접든) 실패하든 **막은 반드시 걷는다.**
         안 그러면 화면이 민트색으로 덮인 채 굳는다. */
      void crossSeam().finally(() => {
        window.setTimeout(() => {
          setCovered(false);
          busy.current = false;
        }, HOLD_MS);
      });
    }, IN_MS);
    return () => window.clearTimeout(t);
  }, [phase, crossSeam]);

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 30,
        background: VEIL,
        opacity: covered ? 1 : 0,
        transition: `opacity ${covered ? IN_MS : OUT_MS}ms ease`,
        pointerEvents: 'none',
      }}
    />
  );
}
