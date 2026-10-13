import { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHARACTER_H, PALETTE, VOXEL } from '../theme';
import type { PropDef } from '../game/types';
import { isUnlocked, useGame } from '../game/store';
import { walkYAt } from './voxelMap';

/** 지금 아이가 만질 수 있는 것 위에 떠 있는 ORBY 심볼 */
function Marker() {
  const g = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (!g.current) return;
    const t = s.clock.elapsedTime;
    g.current.rotation.y = t * 1.6;
    g.current.position.y = Math.sin(t * 2.6) * VOXEL * CHARACTER_H * 0.1;
  });
  return (
    <group ref={g}>
      {[[0.14, 0.58], [0.58, 0.14]].map(([w, h], i) => (
        <mesh key={i}>
          <boxGeometry args={[VOXEL * CHARACTER_H * w, VOXEL * CHARACTER_H * h, VOXEL * 0.12]} />
          <meshStandardMaterial
            color={PALETTE.primary}
            emissive={PALETTE.primary}
            emissiveIntensity={0.8}
            roughness={0.4}
          />
        </mesh>
      ))}
    </group>
  );
}

/**
 * 상호작용 지점.
 *
 * 물건 자체는 **이미 마인크래프트에 지어져 있으므로 아무것도 그리지 않는다.**
 * 여기서 하는 일은 두 가지뿐이다:
 *   - 클릭을 받는 투명한 판정 영역
 *   - 지금 만질 수 있을 때 떠오르는 ✦ 표시
 */
export function Prop({ def }: { def: PropDef }) {
  const [hover, setHover] = useState(false);

  const map = useGame((s) => s.map);
  const done = useGame((s) => s.done);
  const missions = useGame((s) => s.stage.missions);
  const requestInteract = useGame((s) => s.requestInteract);

  const at = map?.slots[def.slot - 1];
  if (!map || !at) return null;

  const mission = def.interact ? missions.find((m) => m.id === def.interact) : undefined;
  // "지금 할 수 있는 일"만 ✦로 표시한다 — 기획의 정보의 선택적 노출.
  const actionable = !!mission && isUnlocked(mission, done) && !done.includes(mission.id);

  const [x, z] = at;
  const y = Math.max(walkYAt(map, x, z), 0);
  // 판정 영역은 아이 키만큼 세운다. 마인크래프트에 지어진 물건을 덮는 크기.
  const hitH = VOXEL * CHARACTER_H;

  return (
    <group position={[x * VOXEL, y * VOXEL, z * VOXEL]}>
      <mesh
        position={[0, hitH / 2, 0]}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); }}
        onPointerOut={() => setHover(false)}
        onClick={(e) => { e.stopPropagation(); requestInteract(def); }}
      >
        <boxGeometry args={[VOXEL * CHARACTER_H * 0.7, hitH, VOXEL * CHARACTER_H * 0.7]} />
        <meshBasicMaterial
          transparent
          opacity={hover && actionable ? 0.12 : 0}
          color={PALETTE.primary}
          depthWrite={false}
        />
      </mesh>

      {actionable && (
        <group position={[0, hitH + VOXEL * CHARACTER_H * 0.4, 0]}>
          <Marker />
        </group>
      )}
    </group>
  );
}
