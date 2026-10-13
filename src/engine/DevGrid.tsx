import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PALETTE, VOXEL } from '../theme';
import { useDev } from '../game/devStore';
import { useGame } from '../game/store';

const _m = new THREE.Matrix4();
const _c = new THREE.Color();
const FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const ONE = new THREE.Vector3(1, 1, 1);

/**
 * 개발용 보행영역 오버레이 (G 키).
 *
 * 마인크래프트에서 흑요석을 어디에 깔았는지가 **화면에서는 안 보인다.**
 * 이걸 켜야 길이 끊긴 곳이 눈에 들어온다.
 *   민트 = 걸을 수 있는 칸 / 틸 = 관문 / 주황 = 물건 자리 / 흰 = 시작 위치
 */
export function DevGrid() {
  const show = useDev((s) => s.showGrid);
  const pick = useDev((s) => s.pick);
  const map = useGame((s) => s.map);
  const ref = useRef<THREE.InstancedMesh>(null);

  const cells = useMemo(() => {
    if (!map) return [];
    const out: { x: number; y: number; z: number; color: string }[] = [];
    for (let z = 0; z < map.d; z++) {
      for (let x = 0; x < map.w; x++) {
        const i = z * map.w + x;
        const y = map.walkY[i];
        if (y < 0) continue;
        out.push({
          x, y, z,
          color: map.gate[i] ? PALETTE.teal : PALETTE.mintPale,
        });
      }
    }
    for (const s of map.slots) {
      if (s) out.push({ x: s[0], y: Math.max(map.walkY[s[1] * map.w + s[0]], 1), z: s[1], color: PALETTE.primary });
    }
    if (map.spawn) {
      const [sx, sz] = map.spawn;
      out.push({ x: sx, y: map.walkY[sz * map.w + sx], z: sz, color: '#ffffff' });
    }
    return out;
  }, [map]);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    cells.forEach((c, i) => {
      _m.compose(
        new THREE.Vector3(c.x * VOXEL, c.y * VOXEL + VOXEL * 0.02, c.z * VOXEL),
        FLAT,
        ONE,
      );
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, _c.set(c.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [cells, show]);

  if (!show || !map || cells.length === 0) return null;

  return (
    <>
      <instancedMesh key={cells.length} ref={ref} args={[undefined, undefined, cells.length]}>
        <planeGeometry args={[VOXEL * 0.9, VOXEL * 0.9]} />
        <meshBasicMaterial transparent opacity={0.55} depthWrite={false} />
      </instancedMesh>

      {pick && (
        <mesh
          position={[pick[0] * VOXEL, VOXEL * 1.06, pick[1] * VOXEL]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[VOXEL, VOXEL]} />
          <meshBasicMaterial color={PALETTE.primary} transparent opacity={0.85} depthWrite={false} />
        </mesh>
      )}
    </>
  );
}
