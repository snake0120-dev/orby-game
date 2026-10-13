import { useMemo } from 'react';
import * as THREE from 'three';
import { buildGeometry } from './voxelGeometry';
import { type VoxelMap } from './voxelMap';
import { makePaint, makeTint, useTune } from '../game/tuneStore';
import { VOXEL } from '../theme';

/**
 * 유리 계열의 불투명도.
 *
 * 0.3 이었는데 벽면이 주황으로 칠해지면서 유리가 거의 안 보이게 됐다 —
 * 0.1 만 올려 **창이 창으로는 읽히되** 안은 계속 들여다보이는 선에서 멈춘다.
 * 더 올리면 통유리 너머 계단과 위층이 흐려진다 (근경 절단을 끈 맵이라 치명적).
 */
const GLASS_OPACITY = 0.4;

/**
 * 마인크래프트 맵 → 면 단위로 추린 메시 셋(불투명 / 유리 / 발광).
 *
 * **복셀을 정육면체로 하나씩 그리지 않는다.** 붙어 있는 블록 사이의 면을 아예
 * 만들지 않아서, 같은 재질이 이어지면 이음매 없이 한 덩어리로 보인다.
 * 유리가 특히 그렇다 — 큐브로 그리면 판유리 한 장이 격자로 갈라져 보이고
 * 반투명이 겹겹이 쌓여 탁해진다.
 *
 * 면을 지우는 규칙은 둘이다:
 *   · 이웃이 **불투명 블록**이면 어차피 가려지니 안 그린다
 *   · 이웃이 **같은 종류**(유리↔유리)면 이음매를 없애려고 안 그린다
 *
 * 남은 면에는 꼭짓점마다 AO 를 구워 넣는다(위 상수 참고).
 */
export function VoxelGrid({ map, cutMin }: { map: VoxelMap; cutMin?: number }) {
  // 개발 패널의 색 설정. 값이 바뀌면 정점 색을 다시 굽는다 (블록 수천 개라 몇 ms).
  const tune = useTune();
  // 밑동을 배경에 녹인다. 메인 구조물에만 건다 — 배경까지 걸면 뭐가 앞인지 안 읽힌다.
  const fade = { top: tune.fadeTop, strength: tune.fadeStrength };
  const faded = fade.strength > 0;
  // 직접 칠하기 (패널의 "칠하기"). 꺼져 있으면 undefined 라 블록 색 그대로다.
  const paint = makePaint(tune.paints.main, (map.h - 1) * VOXEL);
  const painted = paint !== undefined;
  /* **색에 관여하는 값만** 비교한다. `tune` 통째로 걸어 뒀더니 카메라를 밀거나
     1인칭을 켜는 것처럼 색과 무관한 값이 바뀔 때도 정점 색을 다시 구웠다 —
     6만 블록짜리 맵에서는 그때마다 화면이 한 번씩 멈칫한다. */
  /* 1인칭에서는 **아랫면도 만들어야** 한다 (`buildGeometry` 의 `keepDown`).
     보기를 바꾸면 그래서 한 번 다시 굽는다 — 토글할 때 한 번뿐이다. */
  const colorKey = [
    tune.fpv,
    tune.template, tune.mainSaturation, tune.mainBrightness,
    tune.gradLow, tune.gradLowMix, tune.gradHigh, tune.gradHighMix,
    tune.gradFloor, tune.gradSpan,
    JSON.stringify(tune.paints.main ?? null),
  ].join('|');

  const { opaque, glass, glow } = useMemo(
    () => buildGeometry(map, cutMin, makeTint(tune, 'main'), fade, paint, tune.fpv),
    // fade·paint·tint 는 매번 새 객체라 값으로 비교한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, cutMin, colorKey, fade.top, fade.strength],
  );

  return (
    <>
      {opaque && (
        <mesh geometry={opaque} castShadow receiveShadow>
          {/*
            칠했으면 **조명을 안 받는 재질**로 바꾼다. 고른 색이 빛에 물들어
            다르게 나오면 색을 지정하는 의미가 없다. 면마다 색을 따로 넣는 것이
            곧 조명을 손으로 그리는 일이기도 하다. 구운 AO 는 정점 색에 있으니
            구석 그늘은 그대로 남는다.
          */}
          {painted ? (
            <meshBasicMaterial vertexColors transparent={faded} depthWrite />
          ) : (
            <meshStandardMaterial
              vertexColors
              roughness={0.92}
              metalness={0}
              transparent={faded}
              // 깊이는 계속 쓴다. 끄면 반투명한 밑동 너머로 안쪽 벽까지 다 비친다.
              depthWrite
            />
          )}
        </mesh>
      )}
      {glow && (
        <mesh geometry={glow}>
          <meshStandardMaterial
            vertexColors
            emissive="#ffffff"
            emissiveIntensity={0.9}
            roughness={0.5}
            toneMapped={false}
          />
        </mesh>
      )}
      {glass && (
        <mesh geometry={glass} renderOrder={1}>
          <meshStandardMaterial
            vertexColors
            roughness={0.12}
            metalness={0.1}
            transparent
            opacity={GLASS_OPACITY}
            side={THREE.DoubleSide}
            // 유리끼리는 이미 맞닿은 면을 안 만들었다. 깊이까지 쓰면 뒤쪽 유리가
            // 통째로 사라져서 건물 안이 안 보인다.
            depthWrite={false}
          />
        </mesh>
      )}
    </>
  );
}

