import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildGeometry } from '../engine/voxelGeometry';
import { loadVoxelMap } from '../engine/voxelMap';
import { CLOUD } from './palette';

/**
 * 창밖으로 흘러가는 복셀 구름.
 *
 * 그림으로 박아두지 않고 3D 로 띄우는 이유는 하나다 — **대기화면은 멈춰 있으면
 * 고장 난 화면처럼 보인다.** 전시장에서 아이가 다가오기 전까지 계속 떠 있을
 * 화면이라, 아주 느리게라도 흘러가야 "켜져 있다"고 읽힌다.
 *
 * 구름 모양은 게임에서 쓰는 것과 **같은 마인크래프트 구조**(`cloud1·cloud2`)를
 * 그대로 쓴다. 대기화면과 게임이 다른 손에서 나온 것처럼 보이면 안 된다.
 *
 * 비행기는 오른쪽(기수)으로 날고 있으니 구름은 **왼쪽으로** 흐른다.
 * 가까운 구름일수록 빠르다 — 이 속도 차이가 없으면 배경 그림 한 장이 미끄러지는
 * 것처럼 보이고 깊이가 죽는다.
 */
const FILES = ['cloud1.json', 'cloud2.json'];
const COUNT = 24;

/** 씨앗을 고정한 난수. 새로고침할 때마다 구름 배치가 달라지면 눈으로 맞출 수가 없다. */
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Puff {
  geo: number;
  x: number;
  y: number;
  z: number;
  scale: number;
  speed: number;
  /** 이 깊이에서 화면 밖으로 완전히 나가는 x. 여기까지 가면 반대편에서 다시 들어온다. */
  limit: number;
}

export function Clouds() {
  const [geos, setGeos] = useState<THREE.BufferGeometry[] | null>(null);
  const groups = useRef<(THREE.Group | null)[]>([]);
  const { camera, size } = useThree();

  useEffect(() => {
    let alive = true;
    Promise.all(FILES.map((f) => loadVoxelMap(f)))
      .then((maps) => {
        if (!alive) return;
        setGeos(
          maps.map((m) => {
            // 색은 원본 그림의 구름 흰색으로 덮어쓴다. 면마다 구워둔 그늘(AO)은 남아서
            // 덩어리가 납작해지지 않는다.
            const g = buildGeometry(m, 999, (c) => c.set(CLOUD)).opaque!;
            g.center();   // 모서리가 아니라 한가운데를 기준점으로
            return g;
          }),
        );
      })
      .catch(() => setGeos(null));
    return () => { alive = false; };
  }, []);

  const puffs = useMemo<Puff[]>(() => {
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 38;
    const aspect = size.width / Math.max(size.height, 1);
    const halfH = (dist: number) => Math.tan((fov * Math.PI) / 360) * dist;
    const rnd = seeded(20260910);
    const out: Puff[] = [];
    for (let i = 0; i < COUNT; i++) {
      const z = -13 - rnd() * 34;                       // 깊이
      const dist = camera.position.z - z;
      const hh = halfH(dist);
      const hw = hh * aspect;
      /* 원본 그림처럼 **두 층**으로 나눈다 — 아래는 두꺼운 구름 바다,
         위는 얇게 지나가는 층. 고르게 흩으면 눈이 어디를 봐야 할지 모르고,
         무엇보다 비행 고도가 안 읽힌다. 셋 중 하나만 위로 올린다. */
      const high = i % 3 === 0;
      out.push({
        geo: i % FILES.length,
        // 처음부터 화면 가득 흩어 놓는다 — 켜자마자 구름이 채워져 있어야 한다
        x: (rnd() * 2 - 1) * hw * 1.3,
        y: high
          ? hh * (0.32 + rnd() * 0.58)
          : hh * (-0.95 + rnd() * 0.75),
        z,
        // 아래쪽 구름 바다가 더 크고 두껍다
        scale: high ? 2.5 + rnd() * 3 : 5 + rnd() * 7,
        // 가까울수록 빠르게 (시차). 26 은 눈으로 맞춘 값.
        speed: 26 / dist,
        limit: hw * 1.45,
      });
    }
    return out;
  }, [camera, size.width, size.height]);

  useFrame((_, dt) => {
    for (let i = 0; i < puffs.length; i++) {
      const g = groups.current[i];
      if (!g) continue;
      g.position.x -= puffs[i].speed * dt;
      // 왼쪽으로 다 빠져나가면 오른쪽에서 다시 들어온다
      if (g.position.x < -puffs[i].limit) g.position.x = puffs[i].limit;
    }
  });

  if (!geos) return null;

  return (
    <>
      {puffs.map((p, i) => (
        <group
          key={i}
          ref={(el) => { groups.current[i] = el; }}
          position={[p.x, p.y, p.z]}
          // 구름 구조가 z 축으로 길다. 눕혀야 화면 가로로 흐른다.
          rotation={[0, -Math.PI / 2, 0]}
          scale={p.scale}
        >
          <mesh geometry={geos[p.geo]}>
            <meshStandardMaterial vertexColors roughness={1} metalness={0} flatShading />
          </mesh>
        </group>
      ))}
    </>
  );
}
