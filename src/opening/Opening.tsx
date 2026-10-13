import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { OpeningScene } from './OpeningScene';

/**
 * 대기화면 — 비행기 창밖.
 *
 * 게임과 같은 무대(`.stage`, 아이패드 프로 11인치 가로)를 쓴다. 전시에서
 * 대기화면과 게임이 같은 틀 안에서 이어져야 하니 여기서도 같은 상자에 담는다.
 */
export function Opening() {
  return (
    <div className="stage">
      <Canvas
        dpr={[1, 2]}
        /* 톤매핑을 끈다 — 창틀·날개는 천우태가 색까지 정해서 뽑은 그림이라,
           렌더러가 다시 손대면 원본과 다른 색이 된다. */
        gl={{ antialias: true, toneMapping: THREE.NoToneMapping }}
        camera={{ fov: 38, position: [0, 0, 6], near: 0.1, far: 400 }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Suspense fallback={null}>
          <OpeningScene />
        </Suspense>
      </Canvas>
    </div>
  );
}
