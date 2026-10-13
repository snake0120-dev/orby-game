import { create } from 'zustand';
import type { Cell } from '../engine/Pathfinder';

/**
 * 맵을 손으로 고칠 때 쓰는 개발용 상태. 전시 빌드에는 영향이 없다.
 * (엔진/게임 로직은 이걸 읽지 않는다 — 순수하게 작업용 표시기다.)
 */
interface DevState {
  /** 그리드 좌표 오버레이 표시 여부 (G 키) */
  showGrid: boolean;
  /** 마지막으로 클릭한 칸 */
  pick: Cell | null;
  toggleGrid: () => void;
  setPick: (c: Cell) => void;
}

export const useDev = create<DevState>((set) => ({
  showGrid: false,
  pick: null,
  toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
  setPick: (pick) => set({ pick }),
}));
