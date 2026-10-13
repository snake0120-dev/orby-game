import { useMemo } from 'react';
import * as THREE from 'three';
import { SKY_BOTTOM, SKY_MID, SKY_TOP } from './palette';

/**
 * 창밖 하늘.
 *
 * 화면 전체를 덮는 사각형 하나로 그린다. 정점 셰이더가 투영을 아예 쓰지 않고
 * 클립 좌표를 직접 찍으므로 카메라와 무관하게 항상 화면에 꽉 차고, 깊이 검사를
 * 끄면 언제나 제일 뒤에 깔린다 (게임의 `Backdrop` 과 같은 방식).
 *
 * 위가 진하고 아래로 갈수록 옅어진다 — 대기가 두꺼워지는 쪽이 흐려지는 것이라,
 * 이게 뒤집히면 하늘이 아니라 벽처럼 보인다. 색은 천우태의 `완전체.png` 에서
 * 그대로 뽑았다.
 */
export function Sky() {
  const uniforms = useMemo(
    () => ({
      uTop: { value: new THREE.Color(SKY_TOP) },
      uMid: { value: new THREE.Color(SKY_MID) },
      uBottom: { value: new THREE.Color(SKY_BOTTOM) },
    }),
    [],
  );

  return (
    <mesh renderOrder={-1000} frustumCulled={false}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
        fog={false}
        vertexShader={VERT}
        fragmentShader={FRAG}
      />
    </mesh>
  );
}

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

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    float y = vUv.y;
    vec3 c = y < 0.55
      ? mix(uBottom, uMid, y / 0.55)
      : mix(uMid, uTop, (y - 0.55) / 0.45);
    /* 아주 옅은 알갱이 — 매끈한 그라데이션은 넓은 화면에서 띠가 진다 */
    c += (hash(vUv * 900.0) - 0.5) * 0.012;
    gl_FragColor = vec4(c, 1.0);

    /* three 는 색을 선형 공간에서 다루다가 화면에 낼 때 되돌린다. 직접 쓴
       셰이더는 그 되돌리는 과정을 안 거치므로, 여기서 직접 불러줘야 한다.
       빼먹으면 하늘이 원본보다 훨씬 진하고 퍼렇게 나온다. */
    #include <colorspace_fragment>
  }
`;
