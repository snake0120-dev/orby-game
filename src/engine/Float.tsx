import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTune } from '../game/tuneStore';


/**
 * 구조물을 아주 느리게 위아래로 띄운다.
 *
 * 아이소 화면에서 모든 게 완전히 정지해 있으면 사진처럼 굳어 보인다.
 * 관문 큐브에만 걸려 있던 부유 모션을 구조물 전체로 옮긴 것이다.
 *
 * `phase` 로 개체마다 시작 지점을 어긋내는 게 핵심이다. 같은 위상이면 전부
 * 한 덩어리로 오르내려서 움직임이 아니라 카메라 흔들림처럼 보인다.
 */
export function Float({
  phase = 0,
  amp: ampProp,
  speed: speedProp,
  children,
}: {
  phase?: number;
  /** 안 넘기면 전역 값을 쓴다 */
  amp?: number;
  speed?: number;
  children: ReactNode;
}) {
  const g = useRef<THREE.Group>(null);
  const gAmp = useTune((s) => s.floatAmp);
  const gSpeed = useTune((s) => s.floatSpeed);
  const amp = ampProp ?? gAmp;
  const speed = speedProp ?? gSpeed;

  useFrame((s) => {
    if (!g.current) return;
    g.current.position.y = Math.sin(s.clock.elapsedTime * speed + phase) * amp;
  });

  return <group ref={g}>{children}</group>;
}
