import { create } from 'zustand';
import { findPath, type Cell } from '../engine/Pathfinder';
import { isGateCell, isWalkable, loadVoxelMap, type VoxelMap } from '../engine/voxelMap';
import { DEV_STAGES, STAGES } from './stages';
import { validateStage } from './validate';
import type { MissionDef, PropDef, Stage } from './types';

export type Phase = 'title' | 'loading' | 'playing' | 'stageClear' | 'finished' | 'error';

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
  nextStage: () => Promise<void>;
  /** 클릭한 칸까지 길찾기로 걸어간다. 길이 없으면 아무 일도 안 일어난다. */
  requestMove: (target: Cell) => void;
  requestInteract: (prop: PropDef) => void;
  /** Character가 한 칸 도착할 때마다 호출 */
  arrive: () => void;
  complete: (missionId: string) => void;
  say: (text: string | null) => void;
  reset: () => void;
  /** 프롭이 놓인 칸 (마인크래프트의 마커 위치) */
  propCell: (prop: PropDef) => Cell | null;
}

/** 선행 미션이 전부 끝났는지 */
export const isUnlocked = (m: MissionDef, done: string[]): boolean =>
  (m.requires ?? []).every((r) => done.includes(r));

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

export const useGame = create<GameState>((set, get) => ({
  phase: 'title',
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

    if (import.meta.env.DEV) {
      if (map.unknown.length) {
        console.warn(
          `[ORBY] blocks.ts 표에 없는 블록 ${map.unknown.length}종 — 화면에 안 그려집니다:\n` +
            map.unknown.map((b) => `  · ${b}`).join('\n'),
        );
      }
      const problems = validateStage(stage, map);
      if (problems.length) {
        console.group(`[ORBY] ${stage.id} 맵 문제 ${problems.length}건`);
        problems.forEach((p) => console.warn(p));
        console.groupEnd();
      }
    }

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
        patch.phase = 'stageClear';
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

  reset: () =>
    set({ phase: 'title', map: null, done: [], path: [], moved: false, message: null }),
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
