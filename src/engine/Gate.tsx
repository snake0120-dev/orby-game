import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHARACTER_H, PALETTE, VOXEL } from '../theme';
import { isGateOpen, useGame } from '../game/store';
import { useTune } from '../game/tuneStore';
import { orbySymbolGeometry } from './orbySymbol';

/* 사인 치수 — 캐릭터 키에 비례시킨다.
 * 고정값으로 두면 캐릭터 축척이 바뀔 때 사인만 거인이 된다. */
const STAR_R = CHARACTER_H * 0.55;      // 심볼 반지름
const HANG = CHARACTER_H * 1.75;        // 발 높이에서 매달린 높이

const STAR = orbySymbolGeometry(STAR_R * VOXEL);

export function Gate() {
  const stage = useGame((s) => s.stage);
  const map = useGame((s) => s.map);
  const done = useGame((s) => s.done);
  const open = isGateOpen(stage, done);

  const signScale = useTune((s) => s.gateScale);
  const symbolLight = useTune((s) => s.symbolLight);
  const cube = useRef<THREE.Group>(null);
  const glow = useRef<THREE.MeshStandardMaterial>(null);
  const lamp = useRef<THREE.PointLight>(null);
  const lit = useRef(0);

  // 관문 칸들과 그 중심
  const { cells, center, y } = useMemo(() => {
    const cs: [number, number][] = [];
    if (!map) return { cells: cs, center: [0, 0] as [number, number], y: 0 };
    let sy = 0;
    for (let z = 0; z < map.d; z++)
      for (let x = 0; x < map.w; x++)
        if (map.gate[z * map.w + x]) { cs.push([x, z]); sy = map.walkY[z * map.w + x]; }
    const cx = cs.reduce((n, c) => n + c[0], 0) / (cs.length || 1);
    const cz = cs.reduce((n, c) => n + c[1], 0) / (cs.length || 1);
    return { cells: cs, center: [cx, cz] as [number, number], y: sy };
  }, [map]);

  useFrame((s, dt) => {
    // 갑자기 켜지지 않고 서서히 밝아진다.
    lit.current += ((open ? 1 : 0) - lit.current) * Math.min(1, 3.5 * dt);
    const t = s.clock.elapsedTime;
    if (cube.current) {
      cube.current.position.y = (y + HANG) * VOXEL + Math.sin(t * 1.6) * VOXEL * CHARACTER_H * 0.08;
      cube.current.rotation.y = Math.sin(t * 0.5) * 0.12;
    }
    if (glow.current) {
      glow.current.emissiveIntensity = lit.current * (0.75 + Math.sin(t * 2.4) * 0.12);
    }
    // 빛도 서서히 켜진다. 렌더 중에 ref 를 읽으면 안 되니 여기서 직접 물린다.
    if (lamp.current) {
      lamp.current.intensity = symbolLight * (0.35 + lit.current * 0.65);
    }
  });

  if (!map || cells.length === 0) return null;

  return (
    <>
      {/* 바닥 문턱 */}
      {cells.map(([x, z]) => (
        <mesh
          key={`${x},${z}`}
          position={[x * VOXEL, (y - 0.49) * VOXEL, z * VOXEL]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[VOXEL, VOXEL]} />
          <meshStandardMaterial
            color={open ? PALETTE.primary : '#4a4640'}
            emissive={PALETTE.primary}
            emissiveIntensity={open ? 0.35 : 0}
            roughness={0.6}
          />
        </mesh>
      ))}

      {/* ORBY 심볼 — 매달린 사인 */}
      <group ref={cube} position={[center[0] * VOXEL, (y + HANG) * VOXEL, center[1] * VOXEL]}>
        {/* 심볼 자체가 빛난다 — 어두운 배경에서 이정표가 눈에 먼저 들어와야 한다 */}
        <pointLight
          ref={lamp}
          color={PALETTE.primary}
          distance={CHARACTER_H * 6 * VOXEL}
          decay={1.4}
        />
        <mesh castShadow geometry={STAR} scale={signScale}>
          <meshStandardMaterial
            ref={glow}
            color={PALETTE.primary}
            emissive={PALETTE.primary}
            roughness={0.35}
          />
        </mesh>
      </group>
    </>
  );
}
