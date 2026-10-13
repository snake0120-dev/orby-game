import { useLoader, useThree } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * 그림 한 장을 화면에 꽉 채워 세운다 (창틀·날개).
 *
 * 3D 안에 그림을 넣을 때 제일 흔한 사고는 **크기를 손으로 맞추는 것**이다.
 * 창 크기가 바뀌면 그림이 미끄러진다. 여기서는 그 z 깊이에서 카메라가 실제로
 * 보는 크기(`getCurrentViewport`)를 물어보고 그만큼 벌린다 — 창을 어떻게
 * 늘리든 그림은 화면에 정확히 맞는다.
 *
 * 깊이를 안 쓰는(depthWrite=false) 이유: 뒤에 오는 층이 앞 층에 가려지면 안 되고,
 * 어차피 그리는 순서(renderOrder)로 앞뒤가 정해진다.
 */
export function Layer({ url, z, order }: { url: string; z: number; order: number }) {
  const tex = useLoader(THREE.TextureLoader, url);
  const { viewport, camera, gl } = useThree();

  const v = viewport.getCurrentViewport(camera, [0, 0, z]);

  return (
    <mesh position={[0, 0, z]} renderOrder={order}>
      <planeGeometry args={[v.width, v.height]} />
      <meshBasicMaterial
        map={tex}
        /* 그림 파일은 sRGB 다. 안 알려주면 전체가 허옇게 뜬다.
           텍스처를 직접 고치지 않고 재질에 얹어 넘긴다(three 가 알아서 반영한다). */
        map-colorSpace={THREE.SRGBColorSpace}
        map-anisotropy={gl.capabilities.getMaxAnisotropy()}
        transparent
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}
