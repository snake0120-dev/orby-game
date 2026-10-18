import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHARACTER_H, PALETTE, VOXEL } from '../theme';
import { lookupBlock } from '../game/blocks';
import { useGame } from '../game/store';
import { useMarks, type Mark } from '../game/markStore';
import { orbySymbolGeometry } from './orbySymbol';
import { walkYAt } from './voxelMap';

/**
 * **둥둥 떠 있는 ORBY 별 표식** (`Stage.marks` · `markStore`).
 *
 * 맵의 한 칸 위에 심볼 하나를 띄워 "여기"를 가리킨다. 2구역에서는 천우태가
 * 쌓아 둔 체크포인트 아치 한가운데에 뜬다.
 *
 * 관문 사인·동반자와 **같은 마크**다 (`orbySymbolGeometry`). 브랜드 은유가
 * "아이의 궤도를 도는 위성"이라, 길을 알려주는 표시가 전부 같은 모양이어야
 * 아이가 하나로 읽는다.
 *
 * ## 색은 **발광 블록에서 가져온다**
 *
 * 처음에는 ORBY 주황(`PALETTE.primary`)이었는데, 체크포인트가 글로스톤 아치
 * 한가운데 떠 있으니 **혼자만 다른 색**이라 따로 놀았다. 같은 빛의 일부로
 * 읽혀야 "저기가 다음 지점"이 된다. 색은 `blocks.ts` 표에서 읽어 오므로
 * 블록 색을 고치면 표식도 따라간다.
 *
 * 구역의 빛이 아이 가까이에서만 켜져도(`Stage.glowNear`) **표식은 늘 켜져
 * 있다.** 멀리서 보고 찾아가라고 띄운 것이라 꺼지면 쓸모가 없다.
 *
 * ## 셋을 띄워도 안 무겁게
 *
 * · **지오메트리와 재질을 한 벌만 만든다.** 표식마다 만들면 표식 수만큼
 *   셰이더 프로그램이 늘고, 패널에서 크기를 만질 때마다 `ExtrudeGeometry`
 *   (곡선 20분할 × 네 모서리)를 다시 깎게 된다. 반지름 1짜리를 한 번 깎아
 *   놓고 **메시를 축척**하면 크기를 끌어도 새로 깎는 게 없다.
 * · **전구는 안 단다**(㊱). 빛나는 판 하나를 띄우자고 진짜 광원을 달면
 *   셰이더의 광원 루프가 한 바퀴 늘어난다. `toneMapped={false}` 라 어두운
 *   홀에서도 충분히 또렷하다.
 * · 움직임은 `useFrame` 안에서 **ref 로만** 만진다. state 를 건드리면 표식
 *   하나가 매 프레임 React 를 한 바퀴 돌린다.
 */

/** 반지름 1 블록짜리 한 벌. 크기는 메시 축척으로 낸다. */
const STAR = orbySymbolGeometry(VOXEL);

/** 빛나는 블록과 같은 색 — 표를 고치면 표식도 따라간다 */
const GLOW_COLOR = lookupBlock('minecraft:glowstone')?.color ?? PALETTE.primary;

const STAR_MAT = new THREE.MeshStandardMaterial({
  color: GLOW_COLOR,
  emissive: GLOW_COLOR,
  /* 빛나는 블록(`VoxelGrid`)과 같은 0.9 로는 **블록보다 흐려 보인다** —
     블록은 면이 셋이라 서로를 비추는데 이건 얇은 판 하나라서다. 조금 올린다. */
  emissiveIntensity: 1.15,
  roughness: 0.35,
  toneMapped: false,
});

/** 패널에서 고른 표식에 걸리는 테두리 — 어느 걸 미는지 보이게 */
const PICK_MAT = new THREE.MeshBasicMaterial({
  color: PALETTE.primary,   // 고른 표식의 테두리는 **일부러 주황** — 빛과 구분돼야 한다
  wireframe: true,
  transparent: true,
  opacity: 0.5,
  toneMapped: false,
});

function MarkMesh({ def, picked }: { def: Mark; picked: boolean }) {
  const g = useRef<THREE.Group>(null);
  const map = useGame((s) => s.map);

  useFrame((s) => {
    if (!g.current) return;
    const t = s.clock.elapsedTime;
    /* 돌리고 띄운다 — 둘 다 걸어야 "떠 있다"로 읽힌다. 돌기만 하면 벽에 붙은
       사인처럼 보이고, 뜨기만 하면 납작한 판이 오르내리는 걸로 보인다. */
    g.current.rotation.y = t * 1.1;
    g.current.position.y = Math.sin(t * 1.9) * VOXEL * CHARACTER_H * 0.18;
  });

  if (!map) return null;
  const [x, z] = def.at;
  /* 바닥 높이는 맵에서 읽는다 — 자리마다 적어 두면 바닥을 한 칸 깎을 때마다
     표식이 땅에 묻히거나 떠오른다. */
  const foot = Math.max(walkYAt(map, x, z), 0);
  const y = foot + def.height;
  // 반지름 1 블록짜리를 관문 사인 크기(CHARACTER_H × 0.55)에 맞춰 키운다
  const r = CHARACTER_H * 0.55 * def.scale;

  return (
    <group position={[x * VOXEL, y * VOXEL, z * VOXEL]}>
      <group ref={g}>
        <mesh geometry={STAR} material={STAR_MAT} scale={r} />
        {picked && <mesh geometry={STAR} material={PICK_MAT} scale={r * 1.35} />}
      </group>
    </group>
  );
}

export function FloatMarks() {
  const marks = useMarks((s) => s.marks);
  const selected = useMarks((s) => s.selected);
  if (!marks.length) return null;
  return (
    <>
      {marks.map((m) => <MarkMesh key={m.id} def={m} picked={m.id === selected} />)}
    </>
  );
}
