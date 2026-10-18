import { create } from 'zustand';
import type { MarkDef } from './types';

/**
 * **떠 있는 ORBY 별 표식** — 패널에서 놓고 옮긴다.
 *
 * 체크포인트는 블록이 아니라 **그려 넣는 것**이다(결정 ㊳). 그래서 블록 붓
 * (`brushStore`)과 달리 맵을 다시 구울 일이 없다 — 자리를 바꾸면 그 프레임에
 * 바로 옮겨진다. 패널에서 방향키를 눌러도 멈칫하지 않는 이유다.
 *
 * 스테이지 파일(`Stage.marks`)이 **기본값**이고, 여기 값이 그 위에 얹힌다.
 * 스테이지가 바뀌면 `seed` 가 다시 깐다 — 2구역 체크포인트가 3구역에 따라가면
 * 안 된다.
 */

/** 패널에서 쓰는 표식 — 스테이지 파일과 달리 값이 전부 채워져 있다 */
export interface Mark {
  id: string;
  at: [number, number];
  height: number;
  scale: number;
}

/** 스테이지가 안 적어둔 값의 기본 */
export const MARK_DEFAULT = { height: 4, scale: 1.4 };

export const toMark = (d: MarkDef): Mark => ({
  id: d.id,
  at: [d.at[0], d.at[1]],
  height: d.height ?? MARK_DEFAULT.height,
  scale: d.scale ?? MARK_DEFAULT.scale,
});

interface MarkState {
  marks: Mark[];
  /**
   * **바뀔 때마다 하나씩 오른다.**
   *
   * 구역 페이지가 자동 저장을 걸 때 쓴다 — `marks` 배열을 직접 구독하면
   * 표식을 한 칸 밀 때마다 페이지가 통째로 다시 그려진다 (`brushStore.build`
   * 와 같은 이유).
   */
  rev: number;
  /** 패널에서 고른 표식. 방향키가 이걸 민다. */
  selected: string | null;
  /**
   * **파일에서 꽂은 값을 쓰고 있는가.**
   *
   * 구역 편집기는 `zone2-edits.json` 을 읽어 `hydrate` 로 꽂는다. 그런데
   * 스테이지를 싣는 건 그 다음이라, `Scene` 의 `seed` 가 뒤늦게 돌면서
   * **방금 꽂은 값을 스테이지 기본값으로 덮어썼다** — 새로고침 한 번에
   * 천우태가 놓은 표식이 사라지고, 자동 저장이 그 빈 값을 파일에 다시 적었다.
   * 파일이 진짜다(㉜). 한 번 꽂히면 기본값은 더 이상 안 깐다.
   */
  owned: boolean;
  /** 스테이지 기본값으로 깐다 (스테이지가 바뀔 때) */
  seed: (defs: MarkDef[] | undefined) => void;
  /** 스테이지 기본값으로 **되돌린다** — 패널의 되돌리기. `seed` 와 달리 덮는다. */
  restore: (defs: MarkDef[] | undefined) => void;
  /** 저장해 둔 값으로 덮어쓴다 (`zone2-edits.json`) — 이 뒤로 `seed` 는 안 먹는다 */
  hydrate: (marks: Mark[]) => void;
  add: (at: [number, number]) => void;
  remove: (id: string) => void;
  set: (id: string, patch: Partial<Omit<Mark, 'id'>>) => void;
  /** 고른 표식을 민다 (칸) */
  nudge: (id: string, dx: number, dz: number, dh: number) => void;
  select: (id: string | null) => void;
}

/** `체크포인트 1` · `체크포인트 2` … — 비어 있는 제일 작은 번호를 쓴다 */
const nextId = (marks: Mark[]): string => {
  for (let n = 1; ; n++) {
    const id = `체크포인트 ${n}`;
    if (!marks.some((m) => m.id === id)) return id;
  }
};

export const useMarks = create<MarkState>((set) => ({
  marks: [],
  rev: 0,
  selected: null,
  owned: false,

  /* 스테이지 기본값을 깔 때는 `rev` 를 안 올린다 — 올리면 페이지가 연 직후
     "바뀌었다"고 보고 파일에 한 번 적는다. */
  seed: (defs) =>
    set((s) => (s.owned ? {} : { marks: (defs ?? []).map(toMark), selected: null })),
  hydrate: (marks) => set({ marks, selected: null, owned: true }),

  restore: (defs) =>
    set((s) => ({
      marks: (defs ?? []).map(toMark),
      selected: null,
      owned: true,
      rev: s.rev + 1,          // 되돌린 것도 파일에 적어야 한다
    })),

  add: (at) =>
    set((s) => {
      const id = nextId(s.marks);
      return {
        marks: [...s.marks, { id, at, ...MARK_DEFAULT }],
        selected: id,
        rev: s.rev + 1,
      };
    }),

  remove: (id) =>
    set((s) => ({
      marks: s.marks.filter((m) => m.id !== id),
      selected: s.selected === id ? null : s.selected,
      rev: s.rev + 1,
    })),

  set: (id, patch) =>
    set((s) => ({
      marks: s.marks.map((m) => (m.id === id ? { ...m, ...patch } : m)),
      rev: s.rev + 1,
    })),

  nudge: (id, dx, dz, dh) =>
    set((s) => ({
      marks: s.marks.map((m) =>
        m.id === id
          ? {
            ...m,
            at: [m.at[0] + dx, m.at[1] + dz],
            // 바닥 밑으로는 안 내려간다 — 내려가면 판에 묻혀 안 보인다
            height: Math.max(0, m.height + dh),
          }
          : m,
      ),
      rev: s.rev + 1,
    })),

  select: (id) => set({ selected: id }),
}));
