import { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Backdrop } from '../engine/Backdrop';
import { Scene } from '../engine/Scene';
import { ErrorScreen, Loading } from '../ui/Screens';
import { TunePanel } from '../ui/TunePanel';
import { useGame } from '../game/store';
import { useTune } from '../game/tuneStore';
import { immigration } from '../game/stages/02-immigration';
import { compose, loadEdits, loadParts, saveToFile, type PartsFile } from './parts';
import { useEdit } from './editStore';
import { useBrush } from '../game/brushStore';
import { useMarks, type Mark } from '../game/markStore';
import { PartsPanel } from './PartsPanel';

/**
 * **2구역만 보는 전용 입구** (`zone2.html`).
 *
 * 대기화면(`opening.html`)과 같은 이유로 입구를 갈랐다 — 여정 쪽을 손봐도
 * 이쪽이 안 흔들리고, 반대도 마찬가지다.
 *
 * 여정용 화면(타이틀·구역 통과·HUD·길잡이 말풍선)은 **일부러 안 붙인다.**
 * 이 페이지는 미리보기 그림과 나란히 놓고 구도를 맞추는 용도라, 맵 위에
 * 아무것도 없어야 한다.
 *
 * 맵은 파일에서 통째로 읽지 않고 **개체 단위로 읽어 여기서 합친다**
 * (`parts.ts`). 그래야 패널에서 부스 하나를 집어 두 칸 옮기는 게 가능하다.
 *
 *   1 / 2  개체 패널 열기 / 닫기
 *   3 / 4  화면 톤 패널 열기 / 닫기
 *   B      블록 붓 켜기 / 끄기 (마우스로 블록을 하나씩 놓는다)
 *   Ctrl+Z 되돌리기 · Ctrl+Shift+Z 다시
 */
export default function Zone2() {
  const phase = useGame((s) => s.phase);
  const [file, setFile] = useState<PartsFile | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const edits = useEdit((s) => s.edits);
  const view = useEdit((s) => s.view);
  /* 붓으로 놓은 블록은 **구독하지 않는다.** 구독하면 블록 한 칸마다 이 페이지가
     통째로 다시 그려진다(캔버스 안까지). 다시 지어야 할 때만 오르는 숫자를
     보고, 블록 자체는 그때 `getState()` 로 읽는다. */
  const build = useBrush((s) => s.build);
  /* 표식이 바뀌면 자동 저장이 돌아야 한다. 배열을 직접 구독하면 한 칸 밀
     때마다 페이지가 통째로 다시 그려진다 (`markStore.rev`). */
  const markRev = useMarks((s) => s.rev);

  // 브라우저에 남겨 둔 블록을 읽어 온다. 구역마다 열쇠가 따로다.
  useEffect(() => { useBrush.getState().attach('orby.zone2'); }, []);

  /* **표식을 먼저 깔아 둔다.** 자동 저장은 파일을 읽자마자 돌 수 있는데,
     그때 표식 store 가 비어 있으면 `표식: []` 을 파일에 적어 **천우태가 놓은
     표식을 지운다.** 실제로 그렇게 한 번 날렸다. 스테이지 기본값을 먼저
     깔아 두면 최악이라도 기본값이 적힌다. 파일 값은 조금 뒤 `hydrate` 가
     덮는다 (`markStore.owned`). */
  useEffect(() => { useMarks.getState().seed(immigration.marks); }, []);

  /* 파일에서 읽어 오기 전에는 **저장하지 않는다.** 안 그러면 빈 상태가
     먼저 파일을 덮어써서, 다른 창에서 놓아 둔 블록이 통째로 날아간다. */
  const ready = useRef(false);
  /* 파일에서 읽은 표식. **`loadStage` 뒤에** 꽂아야 한다 — 스테이지를 실으면
     `Scene` 이 스테이지 기본값으로 다시 깔기 때문이다 (전체 뷰 값과 같은 사정). */
  const savedMarks = useRef<Mark[] | null>(null);

  useEffect(() => {
    loadParts().then(async (f) => {
      // 생성기에 값이 반영됐으면 브라우저에 남은 편집을 버린다 (두 번 밀리는 사고 방지)
      useEdit.getState().syncStamp(f.stamp);
      /* **파일이 진짜다.** 브라우저 저장소는 창마다 따로라, 천우태가 보는
         크롬에서 놓은 블록이 미리보기 창에는 없었다. 파일을 읽어 덮어쓴다. */
      const saved = await loadEdits(f.stamp);
      if (saved) {
        /* 파일이 **지금 맵과 같은 세대**면(지문이 같으면) 그게 진짜다 —
           비어 있어도 그대로 따른다. `npm run zone2:bake` 로 블록을 생성기
           기본값으로 옮기고 나면 편집 층이 비는데, 그때 브라우저에 남아 있던
           천 칸이 되살아나면 영영 안 줄어든다.

           지문이 다른데 파일이 비어 있으면 **이 브라우저 것을 지킨다** —
           파일로 옮기기 전에 놓아 둔 블록이 새로고침 한 번에 날아가면 안 된다. */
        const mine = useBrush.getState().blocks;
        const fromFile = saved.blocks;
        const sameGen = saved.stamp === f.stamp;
        useBrush.getState().hydrate(sameGen || Object.keys(fromFile).length ? fromFile : mine);
        if (Object.keys(saved.parts).length) useEdit.getState().hydrate(saved.parts);
        savedMarks.current = saved.marks;
        if (Object.keys(saved.view).length) useEdit.getState().setView(saved.view);
      }
      ready.current = true;
      setFile(f);
    }, (err: unknown) => setFailed(err instanceof Error ? err.message : String(err)));
  }, []);

  /**
   * **바꾸는 즉시 파일에 적는다** (개발 서버에서만).
   *
   * 전에는 `파일로 저장` 을 눌러야 넘어갔다. 누르는 걸 잊으면 그 창에만 남고,
   * 다른 창에서 열면 아무것도 없다 — 실제로 그렇게 겪었다.
   * 손이 멈출 때까지 기다렸다 한 번만 적는다(블록을 끌어 놓으면 초당 몇 번씩
   * 바뀐다).
   */
  useEffect(() => {
    if (!file || !ready.current || !import.meta.env.DEV) return;
    const t = setTimeout(() => {
      saveToFile(file, edits, view, useBrush.getState().blocks, useMarks.getState().marks).then(
        () => useEdit.getState().set({ savedAt: Date.now() }),
        () => useEdit.getState().set({ savedAt: null }),
      );
    }, 700);
    return () => clearTimeout(t);
  }, [file, edits, view, build, markRev]);

  /* 개체를 옮길 때마다 다시 합쳐서 통째로 갈아끼운다.
     방향키를 **누르고 있으면** 초당 몇 번씩 다시 합치게 되는데, 56만 칸짜리
     맵이라 그대로 두면 키가 밀린다. 잠깐 멈출 때까지 기다렸다 한 번만 짓는다. */
  const started = useRef(false);
  useEffect(() => {
    if (!file) return;
    const t = setTimeout(() => {
      const t0 = performance.now();
      const map = compose(file, edits, useBrush.getState().blocks);
      /* 블록을 하나 놓을 때마다 맵을 통째로 다시 짓는다. 얼마나 걸리는지
         콘솔에서 바로 볼 수 있어야 **느려졌을 때 어디가 느린지** 안다.
         면 굽는 시간은 `VoxelGrid` 가 같은 자리에 적는다. */
      if (import.meta.env.DEV) {
        const w = window as unknown as Record<string, unknown>;
        w.__ms = {
          ...(w.__ms as object),
          합치기: +(performance.now() - t0).toFixed(1),
          전구: map.lamps.length,
        };
      }
      /* 처음 한 번만 스테이지를 싣는다. 그 뒤로는 **맵만 갈아끼운다** —
         블록 한 칸 놓을 때마다 화면이 비고 아이가 시작 자리로 돌아가면
         하나씩 놓아 가며 맞추는 일이 불가능하다. */
      if (started.current) { useGame.getState().replaceMap(map); return; }
      started.current = true;
      void useGame.getState().loadStage(immigration, map);
      /* `loadStage` 가 `useTune` 을 스테이지 기본값으로 되돌린다. 패널에서
         맞춘 전체 뷰 값은 그 뒤에 다시 꽂아야 안 날아간다. */
      const v = useEdit.getState().view;
      if (Object.keys(v).length) useTune.getState().set(v);
      // 표식도 같은 이유로 여기서 다시 꽂는다 (위 `savedMarks`)
      if (savedMarks.current) useMarks.getState().hydrate(savedMarks.current);
    }, 110);
    return () => clearTimeout(t);
  /* `view` 는 **일부러 뺐다.** 1인칭을 켜거나 카메라를 미는 건 맵과 상관없는
     일인데, 여기 걸어 두면 그때마다 56만 칸을 다시 합치고 `phase: 'loading'`
     을 거친다 — 그 한 호흡 동안 개체가 날아다니는 것처럼 보였다.
     전체 뷰 값은 `setView` 가 `useTune` 에 바로 꽂는다. */
  }, [file, edits, build]);

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

      /* 글자 키는 `code` 로 본다 — 한글 자판에서는 `key` 가 'ㅠ' 로 온다
         (HANDOFF 결정 ⑰). */
      if (ev.code === 'KeyB' && !ev.metaKey && !ev.ctrlKey) {
        const b = useBrush.getState();
        b.set({ on: !b.on });
        return;
      }
      if (ev.code === 'KeyZ' && (ev.metaKey || ev.ctrlKey)) {
        ev.preventDefault();
        if (ev.shiftKey) useBrush.getState().redo();
        else useBrush.getState().undo();
        return;
      }

      const { step } = useEdit.getState();
      /* **표식을 골랐으면 표식이 먼저다.** 둘 다 방향키를 쓰므로, 고른 쪽이
         움직여야 손이 헷갈리지 않는다. Shift 는 양쪽 다 '높이'다. */
      const pickedMark = useMarks.getState().selected;
      if (pickedMark) {
        const big = ev.shiftKey;
        const mv: Record<string, [number, number, number]> = {
          ArrowLeft: [-step, 0, 0],
          ArrowRight: [step, 0, 0],
          ArrowUp: big ? [0, 0, step] : [0, -step, 0],
          ArrowDown: big ? [0, 0, -step] : [0, step, 0],
        };
        const d = mv[ev.key];
        if (!d) return;
        ev.preventDefault();
        useMarks.getState().nudge(pickedMark, d[0], d[1], d[2]);
        return;
      }

      /* 고른 개체를 방향키로 민다. 버튼을 누르는 것보다 이쪽이 훨씬 빨라서,
         한 칸씩 보며 맞추는 작업이 실제로 손에 붙는다. */
      const { selected, nudge } = useEdit.getState();
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
  }, []);

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
      {file && <PartsPanel file={file} />}
      {import.meta.env.DEV && <TunePanel />}
    </div>
  );
}
