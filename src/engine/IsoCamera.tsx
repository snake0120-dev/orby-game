import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';

/**
 * 진짜 아이소메트릭: 방위 45°, 고도 35.264°.
 * 그 방향벡터가 정확히 (1,1,1)의 정규화라서 상수로 박아둔다.
 */
const ISO_DIR = new THREE.Vector3(1, 1, 1).normalize();

/** 직교투영이라 거리는 크기에 영향이 없다. 클리핑 여유만 확보하는 값. */
const DISTANCE = 60;

/**
 * 아이소 화면에서 월드 축이 화면으로 눌리는 비율.
 * right = (1,0,-1)/√2, up = (-1,2,-1)/√6 에서 나온 계수다.
 */
const SX = Math.SQRT1_2;            // x, z 가 화면 가로로 기여하는 양
const SY_XZ = 1 / Math.sqrt(6);     // x, z 가 화면 세로로 기여하는 양 (≈0.408)
const SY_Y = 2 / Math.sqrt(6);      // y 가 화면 세로로 기여하는 양 (≈0.816)

const _target = new THREE.Vector3();
const _pos = new THREE.Vector3();

/**
 * 화면 기준 축. 카메라를 "오른쪽으로" 미는 건 월드 x 가 아니라 이 방향이다 —
 * 패널에서 좌우를 누를 때 화면에서 곧장 좌우로 움직여야 손에 붙는다.
 */
const SCREEN_RIGHT = new THREE.Vector3(1, 0, -1).normalize();
const SCREEN_UP = new THREE.Vector3(-1, 2, -1).normalize();

interface Props {
  /** 바라볼 월드 좌표 */
  lookAt: [number, number, number];
  /** 맵의 월드 가로/세로 크기 (X, Z 방향) */
  extent: [number, number];
  /** 맵에서 가장 높은 지점의 월드 높이 */
  maxHeight: number;
  /** 여백 배수. 1이면 화면에 꽉 찬다. */
  padding?: number;
  /** 화면 기준으로 민 거리 (월드 단위). [좌우, 상하] */
  pan?: [number, number];
}

export function IsoCamera({ lookAt, extent, maxHeight, padding = 1.1, pan }: Props) {
  const cam = useRef<THREE.OrthographicCamera>(null);
  const size = useThree((s) => s.size);

  /**
   * 맵이 화면에 꽉 차도록 zoom을 맞춘다.
   * 월드 크기를 그대로 쓰면 안 된다 — 아이소 투영에서 맵은 대각선으로 눕기 때문에
   * 실제 차지하는 화면 크기는 (가로+세로)에 비례한다. 이걸 빼먹으면 맵이 작게 잡힌다.
   */
  useEffect(() => {
    const c = cam.current;
    if (!c) return;
    const [ex, ez] = extent;
    const projW = SX * (ex + ez);
    const projH = SY_XZ * (ex + ez) + SY_Y * maxHeight;
    c.zoom = Math.min(size.width / projW, size.height / projH) / padding;
    c.updateProjectionMatrix();
  }, [size.width, size.height, extent, maxHeight, padding]);

  useFrame((_, dt) => {
    const c = cam.current;
    if (!c) return;
    // 벽 높이의 절반만큼 시선을 올려야 위아래 여백이 균등해진다.
    _target.set(lookAt[0], lookAt[1] + maxHeight / 2, lookAt[2]);
    if (pan) {
      _target.addScaledVector(SCREEN_RIGHT, pan[0]).addScaledVector(SCREEN_UP, pan[1]);
    }
    _pos.copy(ISO_DIR).multiplyScalar(DISTANCE).add(_target);
    // 스테이지 전환 시 카메라가 미끄러지듯 따라가도록 감쇠 보간.
    const k = 1 - Math.exp(-6 * dt);
    c.position.lerp(_pos, k);
    c.lookAt(_target);
  });

  return (
    <OrthographicCamera
      ref={cam}
      makeDefault
      near={-200}
      far={400}
      position={[
        lookAt[0] + ISO_DIR.x * DISTANCE,
        lookAt[1] + ISO_DIR.y * DISTANCE,
        lookAt[2] + ISO_DIR.z * DISTANCE,
      ]}
    />
  );
}
