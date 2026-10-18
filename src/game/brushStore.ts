import { create } from 'zustand';

/**
 * **블록 붓** — 마우스로 블록을 하나씩 놓고 지운다.
 *
 * 개체 패널(`PartsPanel`)이 "부스를 두 칸 옮기기"라면 이쪽은 그보다 한 단계
 * 아래다 — 마인크래프트에서처럼 **칸 하나**를 놓고 지운다. 생성기 코드를
 * 고치지 않고도 창틀 한 칸, 화분 한 덩이를 직접 얹을 수 있어야 해서 만들었다.
 *
 * 놓은 자리는 **절대 좌표**로 남긴다(`"x,y,z"`). 개체처럼 "몇 칸 밀었다"가
 * 아니라서 두 번 적용돼도 결과가 같다 — 생성기가 구워 넣은 뒤 브라우저에
 * 같은 값이 남아 있어도 사고가 안 난다.
 *
 * 구역마다 저장소 열쇠가 다르다(`attach`). 섞이면 2구역에 3구역 블록이 뜬다.
 */

/** `"x,y,z"` → 놓을 블록 이름. `null` 은 **그 칸을 지운다**는 뜻. */
export type BlockEdits = Record<string, string | null>;

export const blockKey = (x: number, y: number, z: number): string => `${x},${y},${z}`;
export const parseBlockKey = (k: string): [number, number, number] => {
  const [x, y, z] = k.split(',').map(Number);
  return [x, y, z];
};

/** 되돌리기 한 걸음 — 바꾼 칸과 **그 전 값**. `undefined` 는 "손댄 적 없음". */
interface Step { key: string; prev: string | null | undefined }

interface BrushState {
  /** 붓이 켜져 있는가. 켜져 있으면 클릭이 **이동이 아니라 설치**다. */
  on: boolean;
  /** 지금 놓을 블록 */
  block: string;
  /**
   * 누르면 놓을 것인가 지울 것인가.
   *
   * 마우스에서는 오른쪽 단추(또는 Alt)가 반대 손짓이라 이 값이 거의 필요 없다.
   * **아이패드에는 오른쪽 단추가 없다** — 전시 기기에서 직접 손보려면 눌러서
   * 바꿀 수 있어야 한다.
   */
  mode: 'place' | 'erase';
  /** 놓고 지운 칸들 */
  blocks: BlockEdits;
  past: Step[];
  future: Step[];
  /** 저장소 열쇠 앞자리. 안 붙이면 브라우저에 안 남는다. */
  key: string | null;
  /**
   * **지금 끌고 있는 중인가.**
   *
   * 한 칸 놓을 때마다 맵을 통째로 다시 짓는데(50ms 쯤), 끌면 초당 열 칸씩
   * 놓이므로 그동안 화면이 계속 멈칫한다. 끌고 있는 동안에는 미리보기만
   * 띄우고(`BlockBrush` 의 `pending`), **손을 뗄 때 한 번만** 짓는다.
   */
  painting: boolean;
  /**
   * **맵을 다시 지어야 할 때마다 하나씩 오른다.**
   *
   * 구역 페이지가 `blocks` 를 직접 구독하면 블록 한 칸마다 페이지가 통째로
   * 다시 그려진다 — 캔버스 안의 모든 것이 React 를 한 바퀴 돈다는 뜻이고,
   * 끌면서 쌓는 동안 그게 제일 큰 비용이었다. 대신 이 숫자만 보게 하면
   * **한 획에 한 번**만 돈다. 블록 자체는 그때 `getState()` 로 읽는다.
   */
  build: number;

  set: (v: Partial<Pick<BrushState, 'on' | 'block' | 'mode' | 'painting'>>) => void;
  /** 구역 저장소에 붙고 남아 있던 값을 읽어 온다 */
  attach: (storeKey: string) => void;
  /**
   * **파일에서 읽어 온 값으로 통째로 바꾼다** (`zone2-edits.json`).
   *
   * 브라우저 저장소는 창마다 따로라 믿을 수 없다 — 파일이 진짜다.
   * 되돌리기 기록은 접는다. 전에 다른 창에서 놓은 걸 여기서 되돌릴 수는 없다.
   */
  hydrate: (blocks: BlockEdits) => void;
  place: (x: number, y: number, z: number, block?: string) => void;
  /** 손으로 놓은 칸이면 그 설치를 취소하고, 원래 있던 블록이면 **지운다** */
  erase: (x: number, y: number, z: number) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
}

const read = (key: string): BlockEdits => {
  try { return JSON.parse(localStorage.getItem(`${key}.blocks`) ?? '{}') as BlockEdits; }
  catch { return {}; }
};
/**
 * 브라우저 저장소에 적는다 — **손이 멈추고 나서.**
 *
 * 블록이 천 칸쯤 쌓이면 한 번 적을 때마다 그 전부를 글자로 바꾼다(60KB).
 * 칸마다 그러면 끄는 동안 초당 열 번씩 60KB 를 쓰는 셈이라 그대로 멈칫거림이
 * 된다. 진짜 보관은 파일 쪽이니(`zone2-edits.json`) 여기는 늦어도 된다.
 */
let pending: ReturnType<typeof setTimeout> | null = null;
const write = (key: string | null, b: BlockEdits) => {
  if (!key) return;
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    try { localStorage.setItem(`${key}.blocks`, JSON.stringify(b)); }
    catch { /* 사생활 보호 창 */ }
  }, 400);
};

/** 되돌리기 기록 상한. 한 칸이 한 걸음이라 넉넉히 둔다. */
const HISTORY = 500;

/** 한 칸을 바꾸고 되돌리기 기록을 남긴다 */
const change = (s: BrushState, key: string, val: string | null | undefined) => {
  const prev = Object.hasOwn(s.blocks, key) ? s.blocks[key] : undefined;
  if (prev === val) return {};
  const blocks = { ...s.blocks };
  if (val === undefined) delete blocks[key];
  else blocks[key] = val;
  write(s.key, blocks);
  return {
    blocks,
    past: [...s.past, { key, prev }].slice(-HISTORY),
    future: [],   // 새로 놓으면 다시하기 줄은 끊긴다 (어느 편집기나 그렇다)
  };
};

export const useBrush = create<BrushState>((set) => ({
  on: false,
  block: 'minecraft:cyan_terracotta',
  mode: 'place',
  painting: false,
  build: 0,
  blocks: {},
  past: [],
  future: [],
  key: null,

  /* `painting: false` 로 바뀌는 순간이 곧 "이제 다시 지어라" 다 */
  set: (v) =>
    set((s) => (v.painting === false && s.painting ? { ...v, build: s.build + 1 } : v)),

  attach: (storeKey) => set({ key: storeKey, blocks: read(storeKey), past: [], future: [] }),

  hydrate: (blocks) =>
    set((s) => { write(s.key, blocks); return { blocks, past: [], future: [], build: s.build + 1 }; }),

  place: (x, y, z, block) =>
    set((s) => change(s, blockKey(x, y, z), block ?? s.block)),

  erase: (x, y, z) =>
    set((s) => {
      const key = blockKey(x, y, z);
      /* 손으로 놓은 걸 지우는 건 **설치 취소**다 — `null`(구워진 블록을 파내라)을
         남기면 나중에 생성기가 엉뚱한 칸을 파낸다. */
      const mine = s.blocks[key];
      return change(s, key, mine ? undefined : null);
    }),

  undo: () =>
    set((s) => {
      const step = s.past[s.past.length - 1];
      if (!step) return {};
      const now = Object.hasOwn(s.blocks, step.key) ? s.blocks[step.key] : undefined;
      const blocks = { ...s.blocks };
      if (step.prev === undefined) delete blocks[step.key];
      else blocks[step.key] = step.prev;
      write(s.key, blocks);
      return {
        blocks,
        past: s.past.slice(0, -1),
        future: [...s.future, { key: step.key, prev: now }],
        build: s.build + 1,
      };
    }),

  redo: () =>
    set((s) => {
      const step = s.future[s.future.length - 1];
      if (!step) return {};
      const now = Object.hasOwn(s.blocks, step.key) ? s.blocks[step.key] : undefined;
      const blocks = { ...s.blocks };
      if (step.prev === undefined) delete blocks[step.key];
      else blocks[step.key] = step.prev;
      write(s.key, blocks);
      return {
        blocks,
        past: [...s.past, { key: step.key, prev: now }],
        future: s.future.slice(0, -1),
        build: s.build + 1,
      };
    }),

  reset: () =>
    set((s) => { write(s.key, {}); return { blocks: {}, past: [], future: [], build: s.build + 1 }; }),
}));
