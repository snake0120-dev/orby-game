import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { VOXEL } from '../theme';
import { useTune } from '../game/tuneStore';
import { nearGlowDist, nearGlowLit, nearGlowParams } from './nearGlow';
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
  proximity = false,
}: {
  map: VoxelMap;
  scale?: number;
  intensity?: number;
  distance?: number;
  color?: string;
  /**
   * **아이 가까이에서만 켠다** (`Stage.glowNear`).
   *
   * 빛나는 블록을 거리로 끄는 구역에서는 전구도 같이 꺼져야 한다. 블록은
   * 꺼졌는데 그 자리 전구만 켜져 있으면 바닥에 빛 웅덩이만 남아서, 꺼진 게
   * 아니라 고장 난 것처럼 보인다. 식은 `nearGlow.ts` 한 군데를 같이 쓴다.
   */
  proximity?: boolean;
}) {
  const g = useTune();
  const intensity = intensityProp ?? g.lightIntensity;
  const distance = distanceProp ?? g.lightDistance;
  const color = colorProp ?? g.lightColor;
  const lamps = useRef<(THREE.PointLight | null)[]>([]);

  /* **광원을 떼었다 붙이지 않고 세기만 0 으로 내린다.**
     개수가 바뀌면 three 가 셰이더를 다시 엮어서 걸을 때마다 한 번씩 멈칫한다.
     열몇 개짜리 거리 계산은 프레임당 1μs 도 안 든다. */
  useFrame(() => {
    if (!proximity) return;
    // 전구는 사인·난간에 박힌 글로스톤이다 — 바닥 길이 아니라 방 조명이다
    const p = nearGlowParams('other');
    for (let i = 0; i < map.lamps.length; i++) {
      const l = lamps.current[i];
      if (!l) continue;
      const [x, , z] = map.lamps[i];
      l.intensity = intensity * nearGlowLit(nearGlowDist(x, z, p), p.far);
    }
  });

  if (intensity <= 0 || map.lamps.length === 0) return null;

  return (
    <>
      {map.lamps.map(([x, y, z], i) => (
        <pointLight
          key={i}
          ref={(el) => { lamps.current[i] = el; }}
          position={[x * VOXEL, y * VOXEL, z * VOXEL]}
          color={color}
          // 가까이에서만 켜는 구역은 꺼진 채로 시작한다 (위 `useFrame` 이 올린다)
          intensity={proximity ? 0 : intensity}
          // 거리는 월드 단위다. 부모 그룹을 줄여도 같이 줄지 않아서 손으로 곱한다.
          distance={distance * VOXEL * scale}
          // 물리 감쇠(2)면 가까이서 타버린다. 1이 복셀 씬에 부드럽게 맞는다.
          decay={1.4}
        />
      ))}
    </>
  );
}
