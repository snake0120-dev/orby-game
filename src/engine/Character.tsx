import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CHARACTER_H, PALETTE, VOXEL } from '../theme';
import { POSE } from './characterPose';
import { INPUT } from './walkInput';
import { useGame } from '../game/store';
import { useTune } from '../game/tuneStore';
import { COMPANION_RATIO, orbySymbolGeometry } from './orbySymbol';
import { SpeechBubble } from './SpeechBubble';
import { mapCenter, walkYAt } from './voxelMap';

/**
 * 블록/초. 원래는 마인크래프트의 걷는 속도(4.3블록/초)에 맞춰 두었다.
 *
 * 2구역이 100×134 로 넓어지면서 한쪽 끝에서 반대쪽까지 가는 데 너무 오래
 * 걸렸다 — 맵을 보려고 걷는 사람 입장에서는 기다리는 시간이다. 두 배로 올린다.
 * (1구역은 45칸짜리라 원래 속도로도 충분했다.)
 */
const SPEED = 8.6;

/* ── 캐릭터 치수 (블록) — 전부 CHARACTER_H 에서 비례로 나온다 ──
 * 마인크래프트 사람 비율: 몸 3분의 2, 머리 3분의 1.
 */
const BODY_H = CHARACTER_H * 0.66;
const BODY_W = CHARACTER_H * 0.28;
const BODY_D = CHARACTER_H * 0.17;
const HEAD = CHARACTER_H * 0.31;

/**
 * 동반자 심볼 — 관문 사인과 **같은 마크**를 70% 크기로.
 *
 * 브랜드 은유가 "아이의 궤도를 도는 위성"이라, 길을 알려주는 사인과 아이 곁의
 * 동반자가 같은 모양이어야 아이가 둘을 하나로 읽는다. 관문 사인의 반지름
 * (Gate.tsx 의 STAR_R)과 같은 기준에서 비율만 줄인다.
 */
const COMPANION = orbySymbolGeometry(CHARACTER_H * 0.55 * COMPANION_RATIO * VOXEL);
/** 이 거리 안에 들면 한 칸 도착으로 친다 (월드 유닛) */
const ARRIVE_EPS = VOXEL * 0.15;

const _target = new THREE.Vector3();
const _dir = new THREE.Vector3();

export function Character() {
  // 개발 패널에서 키를 실시간으로 바꿔볼 수 있게. 기본은 1 (= CHARACTER_H 그대로).
  const scale = useTune((s) => s.characterScale);
  /* 1인칭일 때는 **안 그린다.** 눈이 아이 안에 있어서 동반자 ✦ 가 화면을
     통째로 가린다. 다만 자리·방향은 계속 계산해야 하니 `useFrame` 은 살려 두고
     보이기만 끈다 — 컴포넌트를 떼면 `POSE` 가 멈춰 카메라가 얼어붙는다. */
  const fpv = useTune((s) => s.fpv);
  const symbolLight = useTune((s) => s.symbolLight);
  // 머리 위 말풍선. 스테이지가 대사를 안 주면 아예 안 그린다.
  const bubble = useGame((s) => s.stage.bubble);
  const group = useRef<THREE.Group>(null);
  const companion = useRef<THREE.Group>(null);
  const spawnedFor = useRef<string | null>(null);

  useFrame((state, dtRaw) => {
    const g = group.current;
    if (!g) return;

    /* **한 프레임이 길어도 순간이동하지 않게 묶는다.**
       맵을 다시 굽거나 탭을 바꿨다 돌아오면 `dt` 가 1~2초로 들어온다. 그러면
       `min(1, 12*dt)` 가 1 이 돼서 보간이 아니라 **텔레포트**가 된다. 1/30 초로
       묶으면 멈칫한 만큼 느리게 따라붙을 뿐 자리는 안 튄다. */
    const dt = Math.min(dtRaw, 1 / 30);

    const { playerCell, path, arrive, map, stage } = useGame.getState();
    if (!map) return;

    const [cx, cz] = playerCell;
    const cy = Math.max(walkYAt(map, cx, cz), 0);

    // 스테이지가 바뀌면 보간 없이 시작 위치로 순간이동
    if (spawnedFor.current !== stage.id) {
      g.position.set(cx * VOXEL, cy * VOXEL, cz * VOXEL);
      /* 처음에는 **맵 한가운데를 보고 선다.** 방향이 0 이면 아이가 맵 바깥
         허공을 보고 서 있는데, 1인칭으로 바꾸면 까만 화면만 나온다.
         한가운데가 안 맞는 구역은 `Stage.facing` 으로 볼 칸을 적어 준다. */
      const look = stage.facing
        ? [stage.facing[0] * VOXEL, 0, stage.facing[1] * VOXEL]
        : mapCenter(map);
      g.rotation.y = Math.atan2(look[0] - g.position.x, look[2] - g.position.z);
      spawnedFor.current = stage.id;
    }

    const next = path[0] ?? playerCell;
    const ny = Math.max(walkYAt(map, next[0], next[1]), 0);
    _target.set(next[0] * VOXEL, ny * VOXEL, next[1] * VOXEL);

    _dir.copy(_target).sub(g.position);
    const flatDist = Math.hypot(_dir.x, _dir.z);

    // 높이는 항상 부드럽게 따라간다 (계단·단차)
    g.position.y += (_target.y - g.position.y) * Math.min(1, 12 * dt);

    if (flatDist > ARRIVE_EPS) {
      const stepLen = Math.min(SPEED * VOXEL * dt, flatDist);
      g.position.x += (_dir.x / flatDist) * stepLen;
      g.position.z += (_dir.z / flatDist) * stepLen;

      /* 진행 방향을 바라본다. **1인칭일 때는 안 돌린다** — 거기서는 Q·E 로
         정한 시선이 곧 카메라라, 옆걸음(A·D)에 몸이 돌면 화면이 홱 돌아간다. */
      if (!fpv) {
        const want = Math.atan2(_dir.x, _dir.z);
        g.rotation.y +=
          Math.atan2(Math.sin(want - g.rotation.y), Math.cos(want - g.rotation.y)) *
          Math.min(1, 12 * dt);
      }
      // 걸을 때만 살짝 통통 튄다
      g.position.y += Math.abs(Math.sin(state.clock.elapsedTime * 11)) * VOXEL * CHARACTER_H * 0.05;
    } else if (path.length > 0) {
      arrive();
    }

    // 1인칭에서는 Q·E 로 정한 시선을 따라간다
    if (fpv) {
      /* **시선 이어받기를 여기서 한다.** 예전엔 `WalkKeys` 가 했는데, r3f 는
         useFrame 을 **붙은 순서대로** 돌린다 — `Character` 가 `WalkKeys` 보다
         먼저다. 그래서 1인칭을 켠 첫 프레임에 아이가 **아직 안 이어받은 옛
         시선(0)** 쪽으로 먼저 돌아 버렸다. 맵이 클수록 그 한 프레임이 길어서
         (1인칭을 켜면 아래 면까지 다시 굽느라 멈칫한다) 아예 0 으로 **홱**
         돌아갔고, 그 0 을 `WalkKeys` 가 이어받아 못 돌아왔다.
         → 3구역에서 1인칭을 켜면 맵 밖 허공만 보였다. */
      if (!INPUT.synced) { INPUT.heading = g.rotation.y; INPUT.synced = true; }
      g.rotation.y +=
        Math.atan2(
          Math.sin(INPUT.heading - g.rotation.y),
          Math.cos(INPUT.heading - g.rotation.y),
        ) * Math.min(1, 16 * dt);
    }

    /* 1인칭 카메라가 읽을 자리·방향. 저장소를 거치지 않는다 — 프레임마다
       바뀌는 값이라 저장소에 넣으면 그때마다 리액트가 다시 그린다. */
    POSE.at.copy(g.position);
    POSE.yaw = g.rotation.y;
    POSE.scale = scale;

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__pose = {
        칸: [Math.round(g.position.x / VOXEL), Math.round(g.position.z / VOXEL)],
        아이방향: +((g.rotation.y * 180) / Math.PI).toFixed(0),
        시선: +((INPUT.heading * 180) / Math.PI).toFixed(0),
        이어받음: INPUT.synced,
        자리잡은스테이지: spawnedFor.current,
      };
    }

    // 동반자 ✦ 는 아이 주위를 도는 위성이다 — 브랜드 은유 그대로
    if (companion.current) {
      const t = state.clock.elapsedTime;
      companion.current.position.set(
        Math.cos(t * 1.4) * VOXEL * CHARACTER_H * 0.6,
        VOXEL * CHARACTER_H * 1.3 + Math.sin(t * 2.2) * VOXEL * CHARACTER_H * 0.1,
        Math.sin(t * 1.4) * VOXEL * CHARACTER_H * 0.6,
      );
      companion.current.rotation.y = t * 1.2;
    }
  });

  return (
    <group ref={group} visible={!fpv}>
      {/* 몸·머리·목걸이·동반자를 한 덩어리로 키운다. 발 높이는 그대로 유지된다. */}
      <group scale={scale}>
      {/* 아이 — 키 2블록(CHARACTER_H). 맵이 마인크래프트 실제 축척이라 사람도 그 크기다. */}
      <mesh position={[0, VOXEL * BODY_H * 0.5, 0]} castShadow>
        <boxGeometry args={[VOXEL * BODY_W, VOXEL * BODY_H, VOXEL * BODY_D]} />
        <meshStandardMaterial color="#F0E6D8" roughness={0.9} />
      </mesh>
      <mesh position={[0, VOXEL * (BODY_H + HEAD * 0.5), 0]} castShadow>
        <boxGeometry args={[VOXEL * HEAD, VOXEL * HEAD, VOXEL * HEAD]} />
        <meshStandardMaterial color="#E4C9A8" roughness={0.9} />
      </mesh>
      {/* UM 목걸이 — 아이를 식별하는 오렌지 액센트 */}
      <mesh position={[0, VOXEL * BODY_H * 0.72, VOXEL * BODY_D * 0.55]}>
        <boxGeometry args={[VOXEL * BODY_W * 0.5, VOXEL * BODY_H * 0.2, VOXEL * 0.06]} />
        <meshStandardMaterial color={PALETTE.primary} roughness={0.6} />
      </mesh>

      {bubble && <SpeechBubble text={bubble} />}

      {/* 동반자 — 관문 사인과 같은 ORBY 심볼. 아이 주위를 도는 위성이다. */}
      <group ref={companion}>
        <mesh geometry={COMPANION}>
          <meshStandardMaterial
            color={PALETTE.primary}
            emissive={PALETTE.primary}
            emissiveIntensity={0.9}
            roughness={0.35}
            toneMapped={false}
          />
        </mesh>
        {/* 심볼이 실제로 아이 주변을 밝힌다 — 궤도를 도는 빛이라 그림자도 함께 돈다 */}
        <pointLight
          color={PALETTE.primary}
          intensity={symbolLight}
          distance={CHARACTER_H * 5 * VOXEL}
          decay={1.4}
        />
      </group>
      </group>
    </group>
  );
}
