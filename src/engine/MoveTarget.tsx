import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { PALETTE, VOXEL } from '../theme';
import { useGame } from '../game/store';
import { walkYAt } from './voxelMap';

/**
 * 걸어가는 중인 목적지 표시.
 *
 * 클릭으로 움직이면 **누른 순간과 아이가 도착하는 순간 사이가 길다.**
 * 표시가 없으면 눌린 건지 안 눌린 건지 알 수 없어 아이가 같은 자리를
 * 계속 두드린다. 도착하면 경로가 비면서 저절로 사라진다.
 *
 * 색은 동반자·관문 사인과 같은 오렌지다. "ORBY 가 알려주는 자리"로 읽혀야 한다.
 */
export function MoveTarget() {
  const map = useGame((s) => s.map);
  const path = useGame((s) => s.path);
  const ring = useRef<THREE.Mesh>(null);

  useFrame((s) => {
    if (!ring.current) return;
    // 느리게 벌렁이는 고리 하나. 깜빡이면(on/off) 시선이 자꾸 끌려간다.
    const pulse = 1 + Math.sin(s.clock.elapsedTime * 4.2) * 0.12;
    ring.current.scale.set(pulse, pulse, 1);
  });

  if (!map || path.length === 0) return null;

  const [x, z] = path[path.length - 1];
  const y = walkYAt(map, x, z);
  if (y < 0) return null;

  return (
    <mesh
      ref={ring}
      // 보행칸은 바닥 블록 **위** 칸이라, 눈에 보이는 바닥면은 반 칸 아래다.
      position={[x * VOXEL, (y - 0.5) * VOXEL + VOXEL * 0.03, z * VOXEL]}
      rotation={[-Math.PI / 2, 0, 0]}
    >
      <ringGeometry args={[VOXEL * 0.3, VOXEL * 0.42, 24]} />
      <meshBasicMaterial
        color={PALETTE.primary}
        transparent
        opacity={0.75}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
