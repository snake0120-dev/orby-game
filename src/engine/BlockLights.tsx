import { VOXEL } from '../theme';
import { useTune } from '../game/tuneStore';
import type { VoxelMap } from './voxelMap';

/**
 * 맵 안에 놓인 조명 블록을 **진짜 광원**으로 만든다.
 *
 * 발광 재질은 그 블록만 밝게 칠할 뿐 주변을 비추지 않는다. 등대 램프가 켜져
 * 보이는데 탑 벽면은 어두운 채로 남아서, 불이 붙어 있다는 느낌이 안 났다.
 * 여기서 램프 덩어리마다 점광원을 하나씩 세워 실제로 주변을 물들인다.
 *
 * 광원은 비싼 자원이라 `voxelMap` 이 이미 붙어 있는 램프를 뭉쳐서 넘겨준다.
 * 등대 14칸이 보통 두세 덩어리로 줄어든다.
 */
export function BlockLights({
  map,
  /** 배경 구조물처럼 축소해서 놓은 경우, 도달 거리도 같이 줄이려고 받는다 */
  scale = 1,
  /** 안 넘기면 메인 맵용 전역 값을 쓴다 */
  intensity: intensityProp,
  distance: distanceProp,
  color: colorProp,
}: {
  map: VoxelMap;
  scale?: number;
  intensity?: number;
  distance?: number;
  color?: string;
}) {
  const g = useTune();
  const intensity = intensityProp ?? g.lightIntensity;
  const distance = distanceProp ?? g.lightDistance;
  const color = colorProp ?? g.lightColor;

  if (intensity <= 0 || map.lamps.length === 0) return null;

  return (
    <>
      {map.lamps.map(([x, y, z], i) => (
        <pointLight
          key={i}
          position={[x * VOXEL, y * VOXEL, z * VOXEL]}
          color={color}
          intensity={intensity}
          // 거리는 월드 단위다. 부모 그룹을 줄여도 같이 줄지 않아서 손으로 곱한다.
          distance={distance * VOXEL * scale}
          // 물리 감쇠(2)면 가까이서 타버린다. 1이 복셀 씬에 부드럽게 맞는다.
          decay={1.4}
        />
      ))}
    </>
  );
}
