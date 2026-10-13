import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Backdrop } from '../engine/Backdrop';
import { Scene } from '../engine/Scene';
import { ErrorScreen, Loading } from '../ui/Screens';
import { TunePanel } from '../ui/TunePanel';
import { useGame } from '../game/store';
import { useTune } from '../game/tuneStore';
import type { Stage } from '../game/types';
import { compose, loadParts, type PartsFile } from './parts';
import { createEditStore } from './editStore';
import { PartsPanel } from './PartsPanel';
import type { ZoneSpec } from './spec';

/**
 * **한 구역만 보는 전용 입구.**
 *
 * 여정용 화면(타이틀·구역 통과·HUD·길잡이 말풍선)은 **일부러 안 붙인다.**
 * 이 페이지는 가이드 그림과 나란히 놓고 구도를 맞추는 용도라, 맵 위에
 * 아무것도 없어야 한다.
 *
 * 맵은 파일에서 통째로 읽지 않고 **개체 단위로 읽어 여기서 합친다**(`parts.ts`).
 * 그래야 패널에서 개체 하나를 집어 두 칸 옮기는 게 가능하다.
 *
 *   1 / 2  개체 패널 열기 / 닫기
 *   3 / 4  화면 톤 패널 열기 / 닫기
 */
export function ZonePage({ spec, stage }: { spec: ZoneSpec; stage: Stage }) {
  const useEdit = useMemo(() => createEditStore(spec), [spec]);
  const phase = useGame((s) => s.phase);
  const [file, setFile] = useState<PartsFile | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const edits = useEdit((s) => s.edits);

  useEffect(() => {
    loadParts(spec).then((f) => {
      // 생성기에 값이 반영됐으면 브라우저에 남은 편집을 버린다 (두 번 밀리는 사고 방지)
      useEdit.getState().syncStamp(f.stamp);
      setFile(f);
    }, (err: unknown) => setFailed(err instanceof Error ? err.message : String(err)));
  }, [spec, useEdit]);

  /* 개체를 옮길 때마다 다시 합쳐서 통째로 갈아끼운다.
     방향키를 **누르고 있으면** 초당 몇 번씩 다시 합치게 되는데, 65만 칸짜리
     맵이라 그대로 두면 키가 밀린다. 잠깐 멈출 때까지 기다렸다 한 번만 짓는다. */
  useEffect(() => {
    if (!file) return;
    const t = setTimeout(() => {
      void useGame.getState().loadStage(stage, compose(spec, file, edits));
      /* `loadStage` 가 `useTune` 을 스테이지 기본값으로 되돌린다. 패널에서
         맞춘 전체 뷰 값은 그 뒤에 다시 꽂아야 안 날아간다. */
      const v = useEdit.getState().view;
      if (Object.keys(v).length) useTune.getState().set(v);
    }, 160);
    return () => clearTimeout(t);
  /* `view` 는 **일부러 뺐다.** 1인칭을 켜거나 카메라를 미는 건 맵과 상관없는
     일인데, 여기 걸어 두면 그때마다 맵을 다시 합치고 `phase: 'loading'` 을
     거친다 — 그 한 호흡 동안 개체가 날아다니는 것처럼 보였다. */
  }, [file, edits, spec, stage, useEdit]);

  /* ── 두 조립이 어긋나지 않는지 스스로 본다 (개발 중에만) ───────
     양탄자 까는 규칙이 생성기(`zonekit.mjs`)와 여기(`parts.ts`) 양쪽에 있다.
     값은 맵 파일에서 같이 읽으니 어긋날 수 없지만 **코드는 두 벌**이다.
     그래서 구워진 맵을 받아 칸마다 맞춰 보고, 다르면 바로 콘솔에 찍는다. */
  const checked = useRef(false);
  useEffect(() => {
    if (!import.meta.env.DEV || !file || checked.current) return;
    /* **한 번만 돈다.** 맵을 통째로 한 벌 더 조립하는 일이라, StrictMode 가
       효과를 두 번 돌리는 개발 모드에서 그대로 두면 65만 칸을 두 번 짓는다. */
    checked.current = true;
    let off = false;
    void (async () => {
      const res = await fetch(`${import.meta.env.BASE_URL}maps/${spec.map}.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok || off) return;
      const baked = await res.json() as { rle: number[] };
      const mine = compose(spec, file, {}).cells;
      let n = 0, p = 0;
      const bad: string[] = [];
      const [W, H, D] = file.size;
      for (let i = 0; i < baked.rle.length; i += 2) {
        for (let k = 0; k < baked.rle[i + 1]; k++, p++) {
          if (mine[p] === baked.rle[i]) continue;
          if (++n <= 10) bad.push(`(${Math.floor(p / (H * D))}, ${Math.floor(p / D) % H}, ${p % D})`);
        }
      }
      if (n) {
        console.error(
          `[${spec.map}] 생성기와 패널의 조립이 다릅니다 — ${n.toLocaleString()}칸.\n` +
          `  처음 몇 자리: ${bad.join(' ')}\n` +
          `  양탄자 규칙이 zonekit.mjs 와 zoneedit/parts.ts 에서 갈라졌습니다.`,
        );
      } else {
        console.info(`[${spec.map}] 생성기와 패널의 조립이 같습니다 (${(W * H * D).toLocaleString()}칸).`);
      }
    })();
    return () => { off = true; };
  }, [file, spec]);

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const el = ev.target as HTMLInputElement | null;
      const typing =
        el?.tagName === 'TEXTAREA' ||
        (el?.tagName === 'INPUT' &&
          ['text', 'number', 'search', 'email', 'password', 'url'].includes(el.type));
      if (typing) return;

      if (ev.key === '1') { useEdit.getState().set({ open: true }); return; }
      if (ev.key === '2') { useEdit.getState().set({ open: false }); return; }
      if (ev.key === '3') { useTune.getState().set({ open: true }); return; }
      if (ev.key === '4') { useTune.getState().set({ open: false }); return; }

      /* 고른 개체를 방향키로 민다. 버튼을 누르는 것보다 이쪽이 훨씬 빨라서,
         한 칸씩 보며 맞추는 작업이 실제로 손에 붙는다. */
      const { selected, step, nudge } = useEdit.getState();
      if (!selected) return;
      const big = ev.shiftKey;
      const moves: Record<string, [number, number, number]> = {
        ArrowLeft: [-step, 0, 0],
        ArrowRight: [step, 0, 0],
        ArrowUp: big ? [0, step, 0] : [0, 0, -step],
        ArrowDown: big ? [0, -step, 0] : [0, 0, step],
      };
      const m = moves[ev.key];
      if (!m) return;
      ev.preventDefault();
      nudge(selected, m[0], m[1], m[2]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [useEdit]);

  return (
    <div className="stage">
      {/* 레티나에서 dpr 2 는 픽셀이 네 배다. 1.5 로 묶으면 칠하는 양이 절반 가까이
          줄고, 복셀 덩어리라 눈으로는 거의 티가 안 난다. */}
      <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true }} style={{ position: 'absolute', inset: 0 }}>
        <Backdrop />
        <Scene />
      </Canvas>
      <div className="fade-bottom" />
      {failed && <ErrorScreen />}
      {!failed && phase === 'loading' && <Loading />}
      {!failed && phase === 'error' && <ErrorScreen />}
      {file && <PartsPanel file={file} useEdit={useEdit} spec={spec} />}
      {import.meta.env.DEV && <TunePanel />}
    </div>
  );
}
