import { create } from 'zustand';
import { useTune } from '../game/tuneStore';
import type { Edits, ViewTune } from './parts';

/**
 * 개체 패널이 쥐는 값 — **어떤 개체를 몇 칸 옮겼는지, 무엇을 지웠는지.**
 *
 * 브라우저 저장소에 남긴다. 새로고침해도 옮겨 둔 자리가 유지돼야 한번에
 * 몰아서 맞출 수 있기 때문이다. 마음에 들면 `값 복사` 로 뽑아 생성기
 * (`scripts/make-zone2.mjs`)에 반영하고 `npm run map:zone2` 를 돌린다 —
 * 그래야 여정(1→2→3→4)에서도 같은 자리가 나온다.
 */
const KEY = 'orby.zone2.edits';
const STAMP = 'orby.zone2.stamp';
const VIEW = 'orby.zone2.view';

const read = (): Edits => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Edits;
  } catch {
    return {};
  }
};
const write = (e: Edits) => {
  try { localStorage.setItem(KEY, JSON.stringify(e)); } catch { /* 사생활 보호 창 */ }
};

const readView = (): ViewTune => {
  try { return JSON.parse(localStorage.getItem(VIEW) ?? '{}') as ViewTune; } catch { return {}; }
};
const writeView = (v: ViewTune) => {
  try { localStorage.setItem(VIEW, JSON.stringify(v)); } catch { /* 무시 */ }
};

interface EditState {
  open: boolean;
  /** 마지막으로 파일에 적은 때 — 패널이 "저장됨"을 보여주는 데 쓴다 */
  savedAt: number | null;
  /** 지금 고른 개체 id — 방향키가 이걸 민다 */
  selected: string | null;
  /** 한 번에 미는 칸 수 */
  step: number;
  edits: Edits;
  /** 개체가 아니라 **화면 전체**에 걸리는 값 — 줌·아이 키·그라디언트 */
  view: ViewTune;
  set: (v: Partial<Omit<EditState, 'set' | 'nudge' | 'toggleHidden' | 'resetPart' | 'resetAll' | 'hydrate'>>) => void;
  nudge: (id: string, dx: number, dy: number, dz: number) => void;
  setView: (v: ViewTune) => void;
  resetView: () => void;
  toggleHidden: (id: string) => void;
  /** 파일에서 읽어 온 개체 자리로 통째로 바꾼다 (`zone2-edits.json`) */
  hydrate: (edits: Edits) => void;
  resetPart: (id: string) => void;
  resetAll: () => void;
  /**
   * 생성기 쪽 자리가 바뀌었으면 저장해 둔 편집을 **버린다.**
   *
   * 패널에서 맞춘 값을 `make-zone2.mjs` 에 반영하고 나면 개체는 이미 그 자리에
   * 가 있다. 그런데 브라우저에는 "그만큼 더 밀어라"가 남아 있어서, 그대로 두면
   * 두 배로 밀린다 — 한 번 그렇게 겪어 봤다.
   */
  syncStamp: (stamp: string) => void;
}

export const useEdit = create<EditState>((set) => ({
  open: false,
  savedAt: null,
  selected: null,
  step: 1,
  edits: read(),
  view: readView(),
  set: (v) => set(v),

  /* `useTune` 에 **바로** 꽂는다. 맵을 다시 싣는 건 110ms 뒤라, 그때까지 기다리면
     빠르게 여러 번 누른 값이 전부 같은 옛 값에서 계산돼 한 번만 움직인다. */
  setView: (v) =>
    set((s) => {
      const next = { ...s.view, ...v };
      writeView(next);
      useTune.getState().set(v);
      return { view: next };
    }),

  resetView: () => { writeView({}); return set({ view: {} }); },

  nudge: (id, dx, dy, dz) =>
    set((s) => {
      const d = s.edits[id]?.d ?? [0, 0, 0];
      const next: Edits = {
        ...s.edits,
        [id]: { ...s.edits[id], d: [d[0] + dx, d[1] + dy, d[2] + dz] },
      };
      write(next);
      return { edits: next };
    }),

  toggleHidden: (id) =>
    set((s) => {
      const next: Edits = { ...s.edits, [id]: { ...s.edits[id], hidden: !s.edits[id]?.hidden } };
      write(next);
      return { edits: next };
    }),

  resetPart: (id) =>
    set((s) => {
      const next = { ...s.edits };
      delete next[id];
      write(next);
      return { edits: next };
    }),

  resetAll: () => { write({}); return set({ edits: {} }); },

  hydrate: (edits) => { write(edits); return set({ edits }); },

  syncStamp: (stamp) => {
    let seen: string | null = null;
    try { seen = localStorage.getItem(STAMP); } catch { /* 사생활 보호 창 */ }
    if (seen === stamp) return;
    try { localStorage.setItem(STAMP, stamp); } catch { /* 무시 */ }
    if (seen !== null) write({});
    set(seen === null ? {} : { edits: {}, selected: null });
    /* 붓으로 놓은 블록은 **안 버린다.** 자리가 절대 좌표라 이미 구워졌어도
       한 번 더 얹으면 결과가 같고, 무엇보다 이제 그 값은 브라우저가 아니라
       파일에 있다(`loadEdits`) — 여기서 지우면 파일과 어긋난다. */
    /* 전체 뷰 값은 **지우지 않는다.** 개체 자리와 달리 생성기에 반영해도
       스테이지 파일 쪽이라 지문과 상관이 없고, 지우면 맞춰 둔 톤이 날아간다. */
  },
}));
