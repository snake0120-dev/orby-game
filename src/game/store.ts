import { create } from 'zustand';
import { findPath, type Cell } from '../engine/Pathfinder';
import {
  isGateCell, isWalkable, loadVoxelMap, prefetchVoxelMap, type VoxelMap,
} from '../engine/voxelMap';
import { DEV_STAGES, STAGES } from './stages';
import { useTune } from './tuneStore';
import { validateStage } from './validate';
import type { MissionDef, PropDef, Stage } from './types';

/**
 * `seam` 은 **이어진 통로로 넘어가는 중**이다 (`GateDef.seam`). 통과 화면도 로딩도
 * 없고, 화면이 한 번 밝게 덮였다 걷히는 동안 맵만 조용히 갈린다.
 */
export type Phase =
  | 'title' | 'loading' | 'playing' | 'stageClear' | 'seam' | 'finished' | 'error';

interface GameState {
  phase: Phase;
  stageIndex: number;
  stage: Stage;
  /** 맵 로딩이 끝나기 전에는 null */
  map: VoxelMap | null;
  error: string | null;

  playerCell: Cell;
  /** 남은 경로. 앞에서부터 소비된다. */
  path: Cell[];
  /** 도착하면 완료할 미션. 프롭을 클릭하면 걸어간 뒤 자동 처리된다. */
  pending: string | null;
  /**
   * 이 구역에서 아이가 **한 번이라도 걸으려 했는지.**
   *
   * 머리 위 말풍선("어디로 가야할까?")을 걷어내는 신호다. 걷기 시작하면
   * 질문은 이미 답을 얻은 것이라 계속 떠 있으면 잔소리가 된다.
   * `path` 로 대신할 수 없다 — 도착하는 순간 비어서 말풍선이 되살아난다.
   */
  moved: boolean;

  done: string[];
  /** 동반자 말풍선. null이면 숨김. */
  message: string | null;

  goToStage: (index: number) => Promise<void>;
  /** 여정에 없는 스테이지를 직접 띄운다 (맵 확인용) */
  /** 두 번째 인자를 주면 파일 대신 그 맵을 쓴다 (2구역 개체 패널이 합친 맵) */
  loadStage: (stage: Stage, prebuilt?: VoxelMap) => Promise<void>;
  /**
   * **맵만** 갈아끼운다 — 스테이지·진행·아이 자리는 그대로 둔다.
   *
   * 구역 편집기가 쓴다. 블록 한 칸을 놓을 때마다 `loadStage` 를 부르면
   * `phase: 'loading'` 을 거치면서 화면이 한 번 비고(씬이 통째로 다시 올라간다)
   * 아이가 시작 자리로 되돌아간다 — 블록 백 칸을 놓는 동안 백 번 그럴 수는 없다.
   */
  replaceMap: (map: VoxelMap) => void;
  nextStage: () => Promise<void>;
  /**
   * **화면을 안 비우고** 다음 구역으로 넘어간다 — 이어진 통로 전용.
   *
   * `loadStage` 는 맨 먼저 `map: null` 을 넣어서 3D 씬이 통째로 내려갔다 올라온다
   * (그래서 검은 화면이 보인다). 여기서는 맵을 **먼저 받아 두고 한 번에** 갈아끼운다.
   */
  crossSeam: () => Promise<void>;
  /** 클릭한 칸까지 길찾기로 걸어간다. 길이 없으면 아무 일도 안 일어난다. */
  requestMove: (target: Cell) => void;
  requestInteract: (prop: PropDef) => void;
  /** Character가 한 칸 도착할 때마다 호출 */
  arrive: () => void;
  complete: (missionId: string) => void;
  say: (text: string | null) => void;
  reset: () => void;
  /**
   * 오프닝 모션그래픽이 아직 화면을 덮고 있는가 (`Opening`).
   *
   * 여정의 일부가 아니라 **그 위에 덮인 한 장**이다. 덮여 있는 동안 밑에서는
   * 2구역이 조용히 올라와서, 걷히는 순간 바로 걸을 수 있다.
   */
  opening: boolean;
  /**
   * 되돌릴 때마다 하나씩 오르는 번호.
   *
   * `App` 이 오프닝 덮개의 `key` 로 쓴다. 인트로가 **이미 떠 있는데** 또 되돌리면
   * `opening` 은 계속 true 라 덮개가 안 갈리고, 그러면 밑에서 구역을 다시 올리는
   * 일(`goToStage`)도 안 일어나서 걷어냈을 때 빈 화면이 남는다.
   */
  openingRun: number;
  endOpening: () => void;
  /**
   * **3D 무대를 쉬게 둔다** — 오프닝이 덮고 있는 동안만.
   *
   * 덮개는 불투명한데 그 밑에서 `Canvas` 는 그림자까지 켠 채 계속 그리고 있었다.
   * 맥북은 티가 안 났지만 아이패드에서는 **아무도 안 보는 그림을 그리느라**
   * 오프닝 영상이 버벅였다. 덮여 있는 동안에는 그리지 않는다 (결정 ㊼).
   *
   * 구역을 올리는 일(맵 받기·면 굽기)은 그대로 돈다 — 그건 그리는 일이 아니다.
   */
  sceneIdle: boolean;
  /** 덮개가 걷히기 **직전에** 무대를 깨운다 — 걷히는 순간 첫 장을 그리면 한 번 걸린다 */
  wakeScene: () => void;
  /** 프롭이 놓인 칸 (마인크래프트의 마커 위치) */
  propCell: (prop: PropDef) => Cell | null;
}

/** 선행 미션이 전부 끝났는지 */
export const isUnlocked = (m: MissionDef, done: string[]): boolean =>
  (m.requires ?? []).every((r) => done.includes(r));

/**
 * 구역이 열릴 때의 **보기 방식**을 건다 (지금은 1인칭인가 아닌가).
 *
 * **여정에서만** 부른다 — 구역 편집기(`zone2.html`·`zone3.html`)도 같은 `loadStage`
 * 를 거치는데, 거기서까지 걸면 천우태가 패널에 저장해 둔 값을 덮어쓴다.
 */
function applyStageView(stage: Stage) {
  useTune.getState().set({ fpv: stage.fpv ?? false });
}

/** 다음 구역이 **이어진 통로**로 붙어 있으면 그 맵을 미리 받아 둔다 */
function prefetchNext(index: number) {
  const next = STAGES[index + 1];
  if (next && STAGES[index]?.gate.seam) prefetchVoxelMap(next.map);
}

/** 개발 중에만 — 모르는 블록과 맵 문제를 콘솔에 찍는다 */
function devCheck(stage: Stage, map: VoxelMap) {
  if (!import.meta.env.DEV) return;
  if (map.unknown.length) {
    console.warn(
      `[ORBY] blocks.ts 표에 없는 블록 ${map.unknown.length}종 — 화면에 안 그려집니다:\n` +
        map.unknown.map((b) => `  · ${b}`).join('\n'),
    );
  }
  const problems = validateStage(stage, map);
  if (problems.length) {
    console.group(`[ORBY] ${stage.id} 맵 문제 ${problems.length}건`);
    problems.forEach((q) => console.warn(q));
    console.groupEnd();
  }
}

/** 관문이 열렸는지 — gate.opensOn이 전부 완료됐을 때 */
export const isGateOpen = (stage: Stage, done: string[]): boolean =>
  stage.gate.opensOn.every((id) => done.includes(id));

/** 프롭 옆에서 설 수 있는 칸들을, 플레이어에게 가까운 순으로 */
function approachCells(map: VoxelMap, at: Cell, from: Cell): Cell[] {
  const [px, pz] = at;
  const out: Cell[] = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      if (isWalkable(map, px + dx, pz + dz)) out.push([px + dx, pz + dz]);
    }
  }
  return out.sort(
    (a, b) =>
      (a[0] - from[0]) ** 2 + (a[1] - from[1]) ** 2 -
      ((b[0] - from[0]) ** 2 + (b[1] - from[1]) ** 2),
  );
}

/**
 * 오프닝을 **건너뛸 자리**인가.
 *
 * 세 가지다.
 *
 * ① `?stage=…` 로 특정 구역을 열 때. 오프닝은 떠오르자마자 `goToStage(0)` 을 부르는데,
 *    그 부름이 **중간에 끼어들어** 구역을 되돌린다 (검사기에서 2구역 관문 통과가 한 번
 *    깨졌다). ② `?opening=0` — 검사기가 이걸로 연다.
 *
 * ③ **개발 중에는 기본으로 건너뛴다.** 재 보니 맵은 새로고침 뒤 0.5초면 준비되는데
 *    오프닝 때문에 **15.4초**를 기다린다. 하나 고칠 때마다 비행기를 끝까지 봐야 한다.
 *    오프닝째로 보려면 `?opening=1`. **빌드한 전시용에서는 늘 재생된다.**
 */
const PARAMS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : null;
const SKIP_OPENING = !!PARAMS && (
  PARAMS.has('stage') ||
  PARAMS.get('opening') === '0' ||
  (import.meta.env.DEV && PARAMS.get('opening') !== '1')
);
/** `?opening=0` — 검사기처럼 **오프닝이 아예 뜨면 안 되는** 자리. 되돌려도 안 뜬다. */
const NEVER_OPENING = PARAMS?.get('opening') === '0';

if (import.meta.env.DEV && SKIP_OPENING && PARAMS && !PARAMS.has('stage')) {
  console.info('[ORBY] 오프닝을 건너뛰었습니다 — 같이 보려면 주소에 ?opening=1');
}

export const useGame = create<GameState>((set, get) => ({
  phase: 'title',
  opening: !SKIP_OPENING,
  openingRun: 0,
  sceneIdle: !SKIP_OPENING,
  stageIndex: 0,
  stage: STAGES[0],
  map: null,
  error: null,
  playerCell: [0, 0],
  path: [],
  moved: false,
  pending: null,
  done: [],
  message: null,

  goToStage: async (index) => {
    if (index < 0 || index >= STAGES.length) {
      set({ phase: 'finished' });
      return;
    }
    await get().loadStage(STAGES[index]);
    set({ stageIndex: index });
    applyStageView(STAGES[index]);
    prefetchNext(index);
  },

  crossSeam: async () => {
    /* 아직 이음매를 건너는 중인가. 막이 덮이는 사이에 다른 데서 구역을 갈아치웠으면
       (검사기가 `goToStage` 를 부르는 경우) 여기서 멈춘다 — 안 그러면 방금 띄운
       구역 위로 한 구역 더 넘어가 버린다. */
    if (get().phase !== 'seam') return;
    const index = get().stageIndex + 1;
    if (index < 0 || index >= STAGES.length) {
      set({ phase: 'finished' });
      return;
    }
    const stage = STAGES[index];
    let map: VoxelMap;
    try {
      map = await loadVoxelMap(stage.map);
    } catch (e) {
      set({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
      return;
    }
    devCheck(stage, map);
    /* `loadStage` 와 **같은 것들을 지우되**, `map: null` 을 거치지 않는다 —
       씬이 안 내려가므로 화면이 안 빈다. `stageIndex` 도 같은 묶음에 넣어서
       중간에 "이전 구역"으로 읽히는 틈이 없게 한다. */
    set({
      phase: 'playing',
      stage,
      map,
      stageIndex: index,
      playerCell: map.spawn ?? [0, 0],
      path: [],
      pending: null,
      moved: false,
      done: [],
      message: stage.intro ?? null,
    });
    applyStageView(stage);
    prefetchNext(index);
  },

  loadStage: async (stage, prebuilt) => {
    set({ phase: 'loading', stage, map: null, error: null });

    // `?map=파일.json` 으로 스테이지 파일을 고치지 않고 아무 맵이나 띄워볼 수 있다.
    // 마인크래프트에서 갓 임포트한 맵을 확인할 때 쓴다. 전시 빌드엔 없다.
    const override = import.meta.env.DEV
      ? new URLSearchParams(location.search).get('map')
      : null;

    let map: VoxelMap;
    try {
      map = prebuilt ?? (await loadVoxelMap(override ?? stage.map));
    } catch (e) {
      set({ phase: 'error', error: e instanceof Error ? e.message : String(e) });
      return;
    }

    devCheck(stage, map);

    set({
      phase: 'playing',
      map,
      playerCell: map.spawn ?? [0, 0],
      path: [],
      pending: null,
      moved: false,
      done: [],
      message: stage.intro ?? null,
    });
  },

  replaceMap: (map) =>
    set((s) => {
      /* 아이가 서 있던 칸이 **없어졌을 수도** 있다 (그 칸을 지웠거나 위에
         블록을 놓았거나). 그대로 두면 아이가 바닥 아래로 내려가 보이므로
         시작 자리로 돌린다. */
      const [x, z] = s.playerCell;
      const here = isWalkable(map, x, z) ? s.playerCell : map.spawn ?? s.playerCell;
      return { phase: 'playing', map, playerCell: here, path: [] };
    }),

  nextStage: () => get().goToStage(get().stageIndex + 1),

  propCell: (prop) => get().map?.slots[prop.slot - 1] ?? null,

  /**
   * 클릭한 칸으로 이동.
   *
   * 걷는 중에 다시 클릭하면 **지금 서 있는 칸에서 새로 길을 잡는다** — 멈췄다가
   * 다시 출발하지 않고 그대로 방향을 튼다.
   */
  requestMove: (target) => {
    const { map, playerCell } = get();
    if (!map) return;
    const path = findPath(map, playerCell, target);
    // 경로가 없으면 아무 일도 안 일어난다. 실패 연출도 감점도 없는 게 원칙이다.
    // (길이 없는 자리를 눌렀을 때는 `moved` 도 그대로 둔다 — 아직 안 걸었으니까.)
    if (path.length > 0) set({ path, pending: null, moved: true });
  },

  requestInteract: (prop) => {
    if (!prop.interact) return;
    const { map, playerCell, done, stage } = get();
    if (!map) return;

    const mission = stage.missions.find((m) => m.id === prop.interact);
    const at = get().propCell(prop);
    if (!mission || !at) return;

    // 아직 순서가 아니면 막지 않고 힌트만 준다. 아이를 벌주지 않는다.
    if (!isUnlocked(mission, done)) {
      const blocker = stage.missions.find((m) => (mission.requires ?? []).includes(m.id));
      set({ message: blocker ? `먼저 ${blocker.label} 부터 하자.` : null });
      return;
    }
    if (done.includes(mission.id)) return;

    // 이미 옆에 서 있으면 바로 처리한다.
    if (Math.abs(playerCell[0] - at[0]) <= 1 && Math.abs(playerCell[1] - at[1]) <= 1) {
      get().complete(mission.id);
      return;
    }

    for (const cell of approachCells(map, at, playerCell)) {
      const path = findPath(map, playerCell, cell);
      if (path.length > 0) {
        set({ path, pending: mission.id, message: prop.hint ?? null });
        return;
      }
    }
  },

  arrive: () =>
    set((s) => {
      if (s.path.length === 0 || !s.map) return s;
      const [next, ...rest] = s.path;
      const patch: Partial<GameState> = { playerCell: next, path: rest };

      if (rest.length === 0 && s.pending) {
        // 목적지 도착 — 걸어가서 하기로 했던 일을 처리한다.
        const id = s.pending;
        queueMicrotask(() => get().complete(id));
        patch.pending = null;
      }

      if (isGateCell(s.map, next[0], next[1]) && isGateOpen(s.stage, s.done)) {
        /* 이어진 통로면 통과 화면을 건너뛴다 — 같은 건물의 복도를 계속 걷는 중이다. */
        patch.phase = s.stage.gate.seam ? 'seam' : 'stageClear';
        patch.path = [];
      }
      return patch as GameState;
    }),

  complete: (missionId) =>
    set((s) => {
      if (s.done.includes(missionId)) return s;
      const m = s.stage.missions.find((x) => x.id === missionId);
      if (!m || !isUnlocked(m, s.done)) return s;
      const done = [...s.done, missionId];
      const opened = !isGateOpen(s.stage, s.done) && isGateOpen(s.stage, done);
      return {
        done,
        message: opened ? '길이 열렸어. 다음 곳으로 가자!' : (m.say ?? null),
      };
    }),

  say: (text) => set({ message: text }),

  /* 대사는 **걷히는 순간**에 띄운다. 2구역을 오프닝 뒤에서 미리 올려 두기 때문에,
     그때 들어온 `intro` 는 아이가 화면을 보기도 전에 이미 사라져 있다. */
  endOpening: () =>
    set((s) => ({ opening: false, sceneIdle: false, message: s.stage.intro ?? null })),

  wakeScene: () => set({ sceneIdle: false }),

  /**
   * **처음(인트로)으로 되돌린다** — `h` 키와 완주 화면의 "처음으로".
   *
   * 전시에서는 한 아이가 끝내면 다음 아이가 온다. 작업 중에는 오프닝을 건너뛰지만
   * (`SKIP_OPENING`) **되돌릴 때는 일부러 되돌리는 것이라 오프닝부터 다시 돈다.**
   * 검사기(`?opening=0`)에서만 안 뜬다.
   */
  reset: () =>
    set((s) => ({
      phase: 'title', opening: !NEVER_OPENING, sceneIdle: !NEVER_OPENING,
      openingRun: s.openingRun + 1,
      map: null, done: [], path: [], moved: false, message: null,
    })),
}));

if (import.meta.env.DEV) {
  const g = globalThis as unknown as {
    __orby?: typeof useGame;
    __orbyCheck?: (s?: Stage, m?: VoxelMap) => string[];
    __orbyStages?: { journey: Stage[]; dev: Stage[] };
  };
  g.__orby = useGame;
  // 검증 스크립트가 여정 밖 스테이지도 띄울 수 있게 목록을 열어둔다.
  g.__orbyStages = { journey: STAGES, dev: DEV_STAGES };
  // 콘솔에서 현재(또는 임의의) 스테이지를 바로 검사할 수 있게 열어둔다.
  g.__orbyCheck = (stage, map) => {
    const st = stage ?? useGame.getState().stage;
    const mp = map ?? useGame.getState().map;
    return mp ? validateStage(st, mp) : ['맵이 아직 로딩되지 않았습니다.'];
  };
}
