import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { VOXLoader, buildMesh } from 'three/examples/jsm/loaders/VOXLoader.js';
import { VOXEL } from '../theme';

const cache = new Map<string, Promise<THREE.BufferGeometry | null>>();

/**
 * MagicaVoxel `.vox`를 그대로 읽어 지오메트리로 만든다.
 *
 * 계획서의 교체 규약을 여기서 강제한다:
 *   - MagicaVoxel은 Z-up이라 X축 -90° 회전으로 Y-up으로 돌린다 (Prop에서 처리)
 *   - 원점은 바운딩박스 **바닥면 중앙**으로 옮긴다
 *   - 1복셀 = VOXEL(0.1) 월드 유닛으로 스케일 (Prop에서 처리)
 *
 * 파일이 없으면 null을 반환한다 — 호출부가 그레이박스로 폴백하므로
 * 에셋을 하나씩 순차 교체할 수 있다.
 */
function load(url: string): Promise<THREE.BufferGeometry | null> {
  const hit = cache.get(url);
  if (hit) return hit;

  const p = new Promise<THREE.BufferGeometry | null>((resolve) => {
    new VOXLoader().load(
      url,
      (result) => {
        const chunk = result.chunks?.[0];
        if (!chunk) return resolve(null);
        const mesh = buildMesh(chunk);
        const geo = mesh.geometry;
        // 바닥면 중앙을 원점으로. (vox 공간에서 x,y가 수평, z가 위)
        geo.translate(-chunk.size.x / 2, -chunk.size.y / 2, 0);
        resolve(geo);
      },
      undefined,
      () => resolve(null),
    );
  });

  cache.set(url, p);
  return p;
}

export function useVox(file?: string) {
  const [loaded, setLoaded] = useState<{
    file?: string;
    geo: THREE.BufferGeometry | null;
  }>({ geo: null });

  useEffect(() => {
    if (!file) return;
    let alive = true;
    load(`${import.meta.env.BASE_URL}vox/${file}`).then((geo) => {
      if (alive) setLoaded({ file, geo });
    });
    return () => { alive = false; };
  }, [file]);

  // 파일이 바뀌면 새로 로드되기 전까지 null — 이전 모델이 잠깐 남지 않는다.
  return loaded.file === file ? loaded.geo : null;
}

/** vox 지오메트리를 월드에 앉히는 변환 — Z-up → Y-up + 복셀 스케일 */
export const VOX_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];
export const VOX_SCALE = VOXEL;
