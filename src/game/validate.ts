import { reachableFrom } from '../engine/Pathfinder';
import { isWalkable, type VoxelMap } from '../engine/voxelMap';
import { markerLabelForRole } from './blocks';
import type { Stage } from './types';

/**
 * 물건 자리를 가리킬 때 쓸 이름.
 * 요즘 방식은 색을 안 나누고 '하늘색 양탄자' 를 놓인 순서대로 ①②③④ 로 쓴다.
 * 구버전(금·다이아…)으로 만든 맵도 있어서 둘 다 말이 되게 적는다.
 */
const PROP_BLOCK = markerLabelForRole('prop');
const slotName = (i: number): string => {
  const legacy = markerLabelForRole(`slot${i + 1}` as 'slot1');
  return PROP_BLOCK
    ? `${['①', '②', '③', '④'][i]}번째 ${PROP_BLOCK}`
    : (legacy ?? `${i + 1}번 물건 블록`);
};
const SLOT_BLOCK = [0, 1, 2, 3].map(slotName);

/**
 * 스테이지 + 맵 검사기 (DEV 전용).
 *
 * 마인크래프트로 맵을 만들면 조용히 깨지는 실수가 늘어난다.
 * 특히 **바닥이 한 칸 끊겨 길이 막히는 것**은 눈으로 절대 안 보인다.
 * 그래서 시작 위치에서 실제로 걸어서 닿는지를 BFS로 확인한다.
 */
export function validateStage(stage: Stage, map: VoxelMap): string[] {
  const problems: string[] = [];

  /* ── 1. 필수 마커 ─────────────────────────────────────── */
  const SPAWN_BLOCK = markerLabelForRole('spawn') ?? '시작 마커';
  const GATE_BLOCK = markerLabelForRole('gate') ?? '관문 마커';

  if (!map.spawn) {
    problems.push(`시작 위치가 없습니다. ${SPAWN_BLOCK}를 바닥 위에 1개 놓으세요.`);
  }
  const gateCount = map.gate.reduce((n, v) => n + v, 0);
  if (gateCount === 0) {
    problems.push(`관문이 없습니다. ${GATE_BLOCK}를 바닥 위에 놓으세요.`);
  }

  const walkCount = map.walkY.reduce((n, v) => n + (v >= 0 ? 1 : 0), 0);
  if (walkCount === 0) {
    problems.push(
      '걸을 수 있는 칸이 없습니다. 바닥을 한 겹 깔았는지, 그 위가 뚫려 있는지 확인하세요.',
    );
    return problems; // 여기서부턴 검사할 게 없다
  }

  /* ── 2. 프롭과 마커 짝 맞추기 ─────────────────────────── */
  const missionIds = new Set(stage.missions.map((m) => m.id));
  for (const p of stage.props) {
    if (!map.slots[p.slot - 1]) {
      problems.push(
        `'${p.label}'(${p.id})의 자리가 맵에 없습니다. 마인크래프트에 ${SLOT_BLOCK[p.slot - 1]}을 놓으세요.`,
      );
    }
    if (p.interact && !missionIds.has(p.interact)) {
      problems.push(`'${p.label}'가 없는 미션 '${p.interact}'를 가리킵니다.`);
    }
  }
  const usedSlots = new Set(stage.props.map((p) => p.slot));
  map.slots.forEach((cell, i) => {
    if (cell && !usedSlots.has((i + 1) as 1 | 2 | 3 | 4)) {
      problems.push(`맵에 ${SLOT_BLOCK[i]}이 있는데 쓰는 물건이 없습니다. 스테이지 파일에 추가하세요.`);
    }
  });

  /* ── 3. 연결성 — 눈으로 안 보이는 실패를 잡는 유일한 검사 ── */
  if (map.spawn) {
    if (!isWalkable(map, map.spawn[0], map.spawn[1])) {
      problems.push('시작 위치가 걸을 수 없는 칸입니다.');
    } else {
      const seen = reachableFrom(map, map.spawn);
      const reached = seen.reduce((n, v) => n + v, 0);

      if (reached < walkCount) {
        problems.push(
          `걸을 수 있는 칸 ${walkCount}개 중 ${walkCount - reached}개가 시작 위치에서 끊겨 있습니다. ` +
            '가는 길에 바닥이 끊겼거나 벽으로 막혀 있는지 확인하세요.',
        );
      }

      // 관문까지 갈 수 있나
      let gateReachable = false;
      for (let i = 0; i < map.gate.length; i++) {
        if (map.gate[i] && seen[i]) { gateReachable = true; break; }
      }
      if (gateCount > 0 && !gateReachable) {
        problems.push(
          `관문까지 걸어갈 수 없습니다. ${GATE_BLOCK}까지 바닥이 이어져 있는지 확인하세요.`,
        );
      }

      // 물건마다 옆에 설 자리가 있고, 거기까지 갈 수 있나
      for (const p of stage.props) {
        const at = map.slots[p.slot - 1];
        if (!at) continue;
        let ok = false;
        for (let dz = -1; dz <= 1 && !ok; dz++) {
          for (let dx = -1; dx <= 1 && !ok; dx++) {
            if (dx === 0 && dz === 0) continue;
            const nx = at[0] + dx, nz = at[1] + dz;
            if (isWalkable(map, nx, nz) && seen[nz * map.w + nx]) ok = true;
          }
        }
        if (!ok) {
          problems.push(
            `'${p.label}'에 다가갈 수 없습니다. ${SLOT_BLOCK[p.slot - 1]} 옆에 설 자리가 있는지 확인하세요.`,
          );
        }
      }
    }
  }

  /* ── 4. 미션 의존성 ───────────────────────────────────── */
  for (const m of stage.missions) {
    for (const r of m.requires ?? []) {
      if (!missionIds.has(r)) problems.push(`미션 '${m.id}'가 없는 선행 미션 '${r}'를 요구합니다.`);
    }
  }
  for (const id of stage.gate.opensOn) {
    if (!missionIds.has(id)) problems.push(`gate.opensOn의 '${id}'가 미션 목록에 없습니다.`);
  }
  if (!stage.learningGoal?.trim()) {
    problems.push('learningGoal이 비어 있습니다. 이 구역에서 아이가 배워갈 행동을 한 문장으로 적으세요.');
  }

  return problems;
}
