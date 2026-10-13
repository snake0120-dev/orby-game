import { useEffect, useMemo, useRef } from 'react';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import type * as THREE from 'three';
import { CHARACTER_H, VOXEL } from '../theme';
import { useGame } from '../game/store';
import type { Cell } from './Pathfinder';
import { mapCenter, walkYAt, type VoxelMap } from './voxelMap';
import { VoxelGrid } from './VoxelGrid';
import { IsoCamera } from './IsoCamera';
import { FirstPerson } from './FirstPerson';
import { Character } from './Character';
import { WalkKeys } from './WalkKeys';
import { MoveTarget } from './MoveTarget';
import { Prop } from './Prop';
import { Gate } from './Gate';
import { DevGrid } from './DevGrid';
import { BackdropProp } from './BackdropProp';
import { BlockLights } from './BlockLights';
import { Float } from './Float';
import { useDev } from '../game/devStore';
import {
  DEFAULT_CHARACTER_SCALE, DEFAULT_GRAD, DEFAULT_MAIN, paintFromDef, useTune, type PaintTune,
} from '../game/tuneStore';

/** 아이 발이 닿는 높이 — 클릭 판정 평면을 여기에 둔다 */
function footLevel(map: VoxelMap): number {
  for (let i = 0; i < map.walkY.length; i++) if (map.walkY[i] >= 0) return map.walkY[i];
  return 1;
}

/**
 * 클릭 판정 평면을 맵보다 이만큼(칸) 넓게 잡는다.
 *
 * 높은 자리를 클릭하면 광선이 발 높이 평면과 **맵 바깥에서** 만난다.
 * 평면을 맵 크기에 딱 맞추면 그런 클릭이 아예 안 들어온다.
 */
const PICK_MARGIN = 8;

/**
 * 클릭한 화면 위치 → 걸어갈 칸.
 *
 * 아이소에서는 **화면의 한 점이 여러 칸을 지난다.** 평면 하나에만 광선을 맞추면
 * 계단 위처럼 높은 자리를 눌렀을 때 한두 칸 어긋난 곳으로 걸어간다.
 * 그래서 맵에 실제로 있는 바닥 높이들을 **높은 쪽부터** 훑으면서, 그 높이의
 * 바닥면과 만나는 칸이 정말 그 높이의 보행칸인지 확인한다. 카메라가 위에서
 * 내려다보므로 **먼저 맞는 높은 면이 곧 눈에 보이는 면**이다.
 *
 * 보행칸 y 는 바닥 블록 **위** 칸이라(마커 규칙 ③), 눈에 보이는 바닥면은
 * 그 반 칸 아래인 (y − 0.5) 이다.
 *
 * 걸을 수 있는 바닥을 못 맞히면 null — 벽이나 허공을 눌러도 조용히 아무 일도
 * 일어나지 않는다 (실패 상태 없음이 원칙).
 */
function pickCell(map: VoxelMap, levels: number[], ray: THREE.Ray): Cell | null {
  if (ray.direction.y === 0) return null;
  for (const y of levels) {
    const t = ((y - 0.5) * VOXEL - ray.origin.y) / ray.direction.y;
    if (t < 0) continue;
    const x = Math.round((ray.origin.x + ray.direction.x * t) / VOXEL);
    const z = Math.round((ray.origin.z + ray.direction.z * t) / VOXEL);
    if (walkYAt(map, x, z) === y) return [x, z];
  }
  return null;
}

/**
 * 발 높이 위로 씬이 실제로 차지하는 높이 (복셀).
 *
 * 카메라를 맵 블록 높이에만 맞추면 **블록보다 위에 뜨는 것들이 화면 밖으로 잘린다.**
 * 벽이 낮은 맵일수록 심하다 — 벽 4칸짜리 방에서 아이 머리와 관문 큐브가 통째로 사라진다.
 *   캐릭터 1.0 · 프롭 ✦ 마커 약 1.6 · 관문 큐브 약 2.1 (전부 CHARACTER_H 배수)
 * 그중 제일 높은 관문 큐브에 여유를 얹은 값이다.
 */
const SCENE_HEADROOM = CHARACTER_H * 3;

/**
 * 그림자 지도를 **세 프레임에 한 번만** 다시 그린다.
 *
 * 그림자 한 장을 만들려면 맵 전체를 한 번 더 그려야 한다 — 2구역은 면이 3만
 * 개라 이게 매 프레임의 가장 큰 덩어리다. 움직이는 건 걸어가는 아이 하나뿐이고
 * 걸음이 느려서, 세 프레임에 한 번이면 눈으로는 구분이 안 간다.
 */
function ThrottledShadows() {
  const n = useRef(0);
  /* `gl` 은 프레임 인자로 받는다. 훅이 돌려준 걸 밖에서 고치면 린트가 잡고,
     실제로도 렌더 밖에서 건드리는 셈이라 순서가 헷갈린다. */
  useFrame(({ gl }) => {
    const i = n.current++;
    if (i === 0) gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = i % 3 === 0;
  });
  return null;
}

export function Scene() {
  const stage = useGame((s) => s.stage);
  const map = useGame((s) => s.map);
  const padding = useTune((s) => s.cameraPadding);
  const panX = useTune((s) => s.panX);
  const panY = useTune((s) => s.panY);
  const fpv = useTune((s) => s.fpv);

  /**
   * 스테이지가 바뀌면 패널 값을 그 스테이지의 실제 값으로 맞춘다.
   *
   * 안 그러면 패널 기본값이 모든 스테이지를 덮어써서, 1구역용으로 잡아둔
   * 값이 2·3구역에도 그대로 걸린다. 패널은 **지금 화면에 적용된 값**을
   * 보여줘야 슬라이더를 믿고 움직일 수 있다.
   */
  useEffect(() => {
    const objects = Object.fromEntries(
      (stage.backdrops ?? []).map((b) => [
        b.id,
        {
          x: b.at[0], y: b.at[1], z: b.at[2],
          rotation: b.rotation ?? 0,
          scale: b.scale ?? 1,
          saturation: b.saturation ?? 0.5,
          brightness: b.brightness ?? 1,
          haze: b.haze ?? 0.5,
          opacity: b.opacity ?? 1,
          lightIntensity: b.lightIntensity ?? 1.83,
          lightDistance: b.lightDistance ?? 26,
          lightColor: b.lightColor ?? '#FFD9A0',
          floatAmp: b.floatAmp,
          floatSpeed: b.floatSpeed,
        },
      ]),
    );
    /* 칠하기도 같이 되돌린다. 스테이지마다 색이 다른데 패널 값이 남아 있으면
       2구역에 1구역 색이 그대로 걸린다. 스테이지가 안 적어둔 개체는 '원본'. */
    const paints: Record<string, PaintTune> = {};
    if (stage.paint) paints.main = paintFromDef(stage.paint);
    for (const b of stage.backdrops ?? []) {
      if (b.paint) paints[b.id] = paintFromDef(b.paint);
    }

    useTune.getState().set({
      cameraPadding: stage.cameraPadding ?? 1.1,
      mainSaturation: stage.mainSaturation ?? DEFAULT_MAIN.saturation,
      mainBrightness: stage.mainBrightness ?? DEFAULT_MAIN.brightness,
      fadeTop: stage.fadeTop ?? DEFAULT_MAIN.fadeTop,
      fadeStrength: stage.fadeStrength ?? DEFAULT_MAIN.fadeStrength,
      lightIntensity: stage.lightIntensity ?? DEFAULT_MAIN.lightIntensity,
      characterScale: stage.characterScale ?? DEFAULT_CHARACTER_SCALE,
      gradLow: stage.gradient?.low ?? DEFAULT_GRAD.low,
      gradLowMix: stage.gradient?.lowMix ?? DEFAULT_GRAD.lowMix,
      gradHigh: stage.gradient?.high ?? DEFAULT_GRAD.high,
      gradHighMix: stage.gradient?.highMix ?? DEFAULT_GRAD.highMix,
      gradFloor: stage.gradient?.floor ?? DEFAULT_GRAD.floor,
      gradSpan: stage.gradient?.span ?? DEFAULT_GRAD.span,
      objects,
      paints,
      selected: 'main',
    });
  }, [
    stage.id, stage.cameraPadding, stage.backdrops, stage.paint,
    stage.mainSaturation, stage.mainBrightness, stage.fadeTop, stage.fadeStrength,
    stage.lightIntensity, stage.characterScale, stage.gradient,
  ]);

  const geom = useMemo(() => {
    if (!map) return null;
    const foot = footLevel(map);
    return {
      center: mapCenter(map),
      extent: [(map.w - 1) * VOXEL, (map.d - 1) * VOXEL] as [number, number],
      maxHeight: Math.max(map.h, foot + SCENE_HEADROOM) * VOXEL,
      foot,
      span: Math.max(map.w, map.d) * VOXEL,
    };
  }, [map]);

  /** 맵에 실제로 존재하는 바닥 높이들, 높은 쪽부터. 클릭 판정이 이 순서로 훑는다. */
  const levels = useMemo(() => {
    if (!map) return [];
    const set = new Set<number>();
    for (const y of map.walkY) if (y >= 0) set.add(y);
    return [...set].sort((a, b) => b - a);
  }, [map]);

  if (!map || !geom) return null;
  const { center, extent, maxHeight, foot, span } = geom;

  /**
   * 바닥 클릭 = 이동. 누른 칸까지 길찾기로 걸어간다.
   *
   * 아이가 배워야 할 조작이 **하나**여야 한다. 키오스크에는 키보드가 없고,
   * 물건도 클릭해서 만지므로 이동도 같은 손짓이라야 앞뒤가 맞는다.
   * 길이 없으면 `requestMove` 가 조용히 넘긴다 — 실패 연출은 없다.
   */
  const onGround = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const cell = pickCell(map, levels, e.ray);
    if (!cell) return;
    // 맵을 고칠 때 "이 칸이 몇 번인지" 보여주는 개발용 표시기(G 키)
    if (import.meta.env.DEV) useDev.getState().setPick(cell);
    useGame.getState().requestMove(cell);
  };

  return (
    <>
      {fpv ? (
        <FirstPerson />
      ) : (
        <IsoCamera
          lookAt={center}
          extent={extent}
          maxHeight={maxHeight}
          padding={padding ?? stage.cameraPadding}
          pan={[panX * VOXEL, panY * VOXEL]}
        />
      )}

      {/*
        전시장 오프라인 구동이 전제라 HDRI 환경맵은 쓰지 않는다.

        Monument Valley 처럼 **면마다 값이 또렷하게 갈리는** 게 목표다.
        앰비언트를 높이면 전부 같은 밝기로 떠서 형태가 안 읽힌다.
        낮은 앰비언트 + 한쪽에서 오는 강한 직사광 + 반대쪽 차가운 반사광.
      */}
      <ThrottledShadows />

      <ambientLight intensity={0.34} />
      <hemisphereLight args={['#dbe7ef', '#20242c', 0.5]} />
      <directionalLight
        position={[center[0] + span * 0.6, span * 1.1, center[2] + span * 0.35]}
        intensity={1.5}
        castShadow
        /* 그림자 지도 크기는 **맵 크기에 맞춘다.** 2구역처럼 넓은 맵에서
           2048 을 그대로 쓰면 한 텍셀이 덮는 면적이 커져 이득도 없으면서
           메모리와 샘플링만 비싸진다. */
        shadow-mapSize={span > 6 ? [1024, 1024] : [2048, 2048]}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={0.1}
        shadow-camera-far={span * 4}
        shadow-bias={-0.0008}
        shadow-normalBias={0.01}
      />

      {(stage.backdrops ?? []).map((b) => (
        <BackdropProp key={b.id} id={b.id} file={b.map} />
      ))}

      <Float phase={0}>
        <VoxelGrid map={map} cutMin={stage.cutaway} />
        <BlockLights map={map} />
      </Float>
      {stage.props.map((p) => (
        <Prop key={p.id} def={p} />
      ))}
      <Gate />
      <Character />
      <WalkKeys />
      <MoveTarget />
      {import.meta.env.DEV && <DevGrid />}

      {/* 클릭을 받는 투명한 판정 평면. 복셀 메시에는 클릭 처리가 없으므로
          가까운 쪽 유리벽 너머로도 그대로 통과해서 여기까지 들어온다. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[center[0], foot * VOXEL, center[2]]}
        onClick={onGround}
      >
        <planeGeometry
          args={[(map.w + PICK_MARGIN * 2) * VOXEL, (map.d + PICK_MARGIN * 2) * VOXEL]}
        />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  );
}
