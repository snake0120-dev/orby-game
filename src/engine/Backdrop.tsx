import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useTune } from '../game/tuneStore';

/**
 * 배경 하늘 — 위아래 그라데이션 + 느리게 일렁이는 결.
 *
 * 단색 검정으로 두면 건물이 허공에 오려붙인 것처럼 보인다. Monument Valley 의
 * 밤 화면이 깊어 보이는 건 배경이 미묘하게 물들고, 그 결이 아주 느리게
 * 움직이기 때문이다.
 *
 * **화면 전체를 덮는 사각형 하나**로 그린다. 정점 셰이더가 투영 행렬을 아예
 * 쓰지 않고 클립 좌표를 직접 찍으므로, 카메라가 어디를 보든 화면에 꽉 찬다.
 * z 를 1(원거리 평면)로 두고 깊이 검사를 끄면 항상 맨 뒤에 깔린다.
 *
 * 캔버스 텍스처를 매 프레임 다시 그리는 방법도 있지만, 일렁임은 2차원 잡음이
 * 필요해서 CPU 로 매번 칠하면 낭비다. 셰이더가 훨씬 싸다.
 */
export function Backdrop() {
  const top = useTune((s) => s.bgTop);
  const mid = useTune((s) => s.bgMid);
  const bottom = useTune((s) => s.bgBottom);
  const shimmer = useTune((s) => s.bgShimmer);
  const speed = useTune((s) => s.bgShimmerSpeed);
  const midStop = useTune((s) => s.bgMidStop);

  const mat = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color(top) },
      uMid: { value: new THREE.Color(mid) },
      uBottom: { value: new THREE.Color(bottom) },
      uMidStop: { value: midStop },
      uShimmer: { value: shimmer },
      uTime: { value: 0 },
    }),
    // 처음 한 번만 만든다. 값 갱신은 아래 useFrame 이 맡는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((_, dt) => {
    const u = mat.current?.uniforms;
    if (!u) return;
    u.uTime.value += dt * speed;
    u.uTop.value.set(top);
    u.uMid.value.set(mid);
    u.uBottom.value.set(bottom);
    u.uMidStop.value = midStop;
    u.uShimmer.value = shimmer;
  });

  return (
    <mesh renderOrder={-1000} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        ref={mat}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
        vertexShader={VERT}
        fragmentShader={FRAG}
      />
    </mesh>
  );
}

/** 투영을 무시하고 클립 공간을 직접 채운다 */
const VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);   // z=1 → 항상 맨 뒤
  }
`;

const FRAG = /* glsl */ `
  precision mediump float;
  varying vec2 vUv;
  uniform vec3 uTop, uMid, uBottom;
  uniform float uMidStop, uShimmer, uTime;

  /* 부드러운 값잡음. 텍스처 없이 결을 만들려는 최소한의 도구다. */
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  void main() {
    /* 일렁임은 **높이를 흔드는** 방식이다. 색을 흔들면 지저분해지는데,
       그라데이션이 갈리는 위치를 흔들면 결이 천천히 흐르는 것처럼 보인다. */
    float w = (noise(vec2(vUv.x * 2.2, uTime * 0.35)) - 0.5)
            + (noise(vec2(vUv.x * 5.5 + 9.0, uTime * 0.6)) - 0.5) * 0.5;
    float y = clamp(vUv.y + w * uShimmer * 0.18, 0.0, 1.0);

    vec3 c = y < uMidStop
      ? mix(uBottom, uMid, y / max(uMidStop, 0.001))
      : mix(uMid, uTop, (y - uMidStop) / max(1.0 - uMidStop, 0.001));

    /* 아주 옅은 알갱이 — 완전히 매끈한 그라데이션은 넓은 화면에서 띠가 진다 */
    c += (hash(vUv * 900.0) - 0.5) * 0.012;

    gl_FragColor = vec4(c, 1.0);
  }
`;
