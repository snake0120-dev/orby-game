import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { CHARACTER_H, VOXEL } from '../theme';
import { POSE } from './characterPose';

/** 눈은 머리 꼭대기보다 조금 아래다 */
const EYE = 0.86;
/** 발밑 바닥이 잘려 보이지 않게 눈을 조금 앞으로 뺀다 */
const FORWARD = 0.3;

const _want = new THREE.Vector3();

/**
 * **아이의 1인칭 눈.**
 *
 * 아이소 화면은 공항 전체를 한눈에 보여주지만, 실제로 혼자 비행기를 타는 아이가
 * 보는 건 자기 눈높이의 풍경이다. 미리 걸어 보는 게 이 게임의 목적이라
 * "내가 거기 서면 뭐가 보이나"를 확인할 수 있어야 한다.
 *
 * 자리와 방향은 `POSE` 에서 읽는다 — `Character` 가 프레임마다 적어 둔 값이다.
 * 거기에 바로 붙이면 걸음마다 덜컹거려서, 감쇠 보간으로 따라붙는다.
 */
export function FirstPerson() {
  const cam = useRef<THREE.PerspectiveCamera>(null);
  const ready = useRef(false);
  const size = useThree((s) => s.size);

  useFrame((_, dt) => {
    const c = cam.current;
    if (!c) return;

    const eye = VOXEL * CHARACTER_H * POSE.scale * EYE;
    _want.set(0, 0, FORWARD * VOXEL * CHARACTER_H * POSE.scale)
      .applyAxisAngle(UP, POSE.yaw)
      .add(POSE.at);
    _want.y = POSE.at.y + eye;

    /* 카메라는 자기 **−Z** 를 본다. 아이 모델은 +Z 가 앞이라(`Character`)
       반 바퀴를 더해야 같은 쪽을 본다 — 안 그러면 아이 뒤통수 쪽 허공만 비친다. */
    const look = POSE.yaw + Math.PI;
    /* **첫 프레임은 보간하지 않는다.** 카메라는 원점에서 시작하므로, 그냥
       따라붙게 두면 맵을 가로질러 날아오면서 개체가 휙휙 지나간다. */
    const k = ready.current ? 1 - Math.exp(-10 * dt) : 1;
    ready.current = true;
    c.position.lerp(_want, k);
    c.rotation.y += Math.atan2(
      Math.sin(look - c.rotation.y),
      Math.cos(look - c.rotation.y),
    ) * k;

    /* 1인칭이 까맣게 나올 때 **어디를 보고 있는지** 알 수 있어야 한다.
       화면만 봐서는 카메라가 바닥 밑인지, 반대쪽을 보는지, 아예 안 움직인
       건지 구별이 안 된다. 개발 중에만 적어 둔다. */
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__fpv = {
        눈: c.position.toArray().map((v) => +(v / VOXEL).toFixed(1)),
        발: POSE.at.toArray().map((v) => +(v / VOXEL).toFixed(1)),
        아이방향: +((POSE.yaw * 180) / Math.PI).toFixed(0),
        카메라방향: +((c.rotation.y * 180) / Math.PI).toFixed(0),
        키배수: POSE.scale,
      };
    }
  });

  return (
    <PerspectiveCamera
      ref={cam}
      makeDefault
      fov={68}
      near={VOXEL * 0.3}
      far={400}
      aspect={size.width / size.height}
      rotation={[0, 0, 0]}
    />
  );
}

const UP = new THREE.Vector3(0, 1, 0);
