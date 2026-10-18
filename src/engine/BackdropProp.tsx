import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { buildGeometry } from './voxelGeometry';
import { loadVoxelMap, type VoxelMap } from './voxelMap';
import { VOXEL } from '../theme';
import { DEFAULT_OBJ, makePaint, makeTint, useTune } from '../game/tuneStore';
import { BlockLights } from './BlockLights';
import { Float } from './Float';
import { phaseOf } from './phase';

/**
 * 배경에 세우는 장식 구조물 (등대 등).
 *
 * 게임판이 아니다 — 걷지도, 부딪히지도, 검사받지도 않는다. 오직 뒤에 서서
 * 공간이 어디까지 이어지는지를 보여준다.
 *
 * ── 공기 원근법 ────────────────────────────────────────────
 * 멀리 있는 것은 대기를 통과해 오면서 **채도가 빠지고 배경색에 물든다.**
 * 직교 투영이라 거리가 멀어져도 저절로 작아지지 않으니, 축소까지 손으로 건다.
 * 이 셋(채도↓ · 배경색 혼합 · 축소)이 같이 걸려야 "멀리 있다"로 읽힌다.
 */
export function BackdropProp({
  id,
  file,
  sky = '#141a27',
}: {
  /** 스테이지 `backdrops[].id`. 패널의 값이 이 키로 붙는다. */
  id: string;
  file: string;
  sky?: string;
}) {
  const tune = useTune();
  const o = tune.objects[id] ?? DEFAULT_OBJ;
  const [map, setMap] = useState<VoxelMap | null>(null);

  useEffect(() => {
    let alive = true;
    // 맵이 아직 없어도 게임은 돌아가야 한다 (구름처럼 나중에 들어올 파일).
    // 실패하면 조용히 안 그린다.
    loadVoxelMap(file)
      .then((m) => { if (alive) setMap(m); })
      .catch(() => { if (alive) setMap(null); });
    return () => { alive = false; };
  }, [file]);

  const built = useMemo(() => {
    if (!map) return null;
    const skyColor = new THREE.Color(sky);
    // 개체별 채도·명도가 여기서 걸린다. 메인과 값이 갈려야 거리가 생긴다.
    const tint = makeTint(tune, id);
    const adjust = (c: THREE.Color, y: number) => {
      tint?.(c, y);
      c.lerp(skyColor, o.haze);   // 마지막으로 하늘색에 잠긴다
    };
    /* 직접 칠하기 (패널의 "칠하기").
       고른 색에는 위 보정(채도·명도·흐림)을 걸지 않는다 — 넣은 색이 그대로
       나와야 한다. 대신 멀리 보이게 하려면 흐린 색을 직접 고른다. */
    const paint = makePaint(tune.paints[id], (map.h - 1) * VOXEL);
    // 1인칭에서는 구름·등대의 밑면도 올려다보게 된다 (`keepDown`)
    return { geo: buildGeometry(map, 999, adjust, undefined, paint, tune.fpv), painted: !!paint };
  }, [map, id, o.haze, sky, tune]);

  if (!built || !map) return null;
  const { geo, painted } = built;

  // 위치·크기는 패널이 쥔다. 스테이지 값은 Scene 이 패널 초기값으로 넣어준다.
  const pos: [number, number, number] = [o.x, o.y, o.z];
  const sc = o.scale;

  /**
   * 회전축을 **개체 한가운데**로 옮긴다.
   *
   * 지오메트리는 (0,0,0) 모서리에서 시작하므로, 그냥 돌리면 개체가 축을 중심으로
   * 멀리 휙 날아간다 — 각도를 만질 때마다 위치를 다시 잡아야 한다는 뜻이다.
   * 한가운데로 옮겨 놓으면 제자리에서 돈다. 각도 0 이면 아무것도 달라지지 않아서
   * 이미 맞춰둔 등대·구름 값은 그대로다.
   */
  const mid: [number, number, number] = [
    ((map.w - 1) / 2) * VOXEL,
    ((map.h - 1) / 2) * VOXEL,
    ((map.d - 1) / 2) * VOXEL,
  ];
  const spin = ((o.rotation ?? 0) * Math.PI) / 180;

  /**
   * 반투명하게 깔면 **속이 다 비쳐서 안쪽 면 경계가 그물처럼 뜬다.**
   * 유리 한 장씩은 얇은데 겹치면 진해지는 것과 같은 문제다 —
   * 메인 구조물의 판유리에서 이미 한 번 겪었다 (결정 ⑨).
   *
   * 거기서는 **맞닿는 면을 아예 안 만들어서** 풀었지만, 여기는 사정이 다르다.
   * 비행기는 껍데기 안에 또 껍데기가 있는 속 빈 덩어리라, 서로 맞닿지 않은
   * 앞뒤 면이 겹쳐 보이는 것이라서 면을 지운다고 사라지지 않는다.
   *
   * 그래서 **색을 칠하지 않고 깊이만 먼저 찍는다.** 그 다음 색을 칠할 때
   * 제일 앞면만 깊이 검사를 통과하므로, 한 픽셀은 딱 한 번만 칠해진다.
   * 결과적으로 덩어리 전체가 **한 겹짜리 반투명**으로 읽힌다 — 안쪽 경계 없이.
   *
   * 불투명(1.00)일 때는 원래도 이런 문제가 없으니 건너뛴다.
   */
  const seeThrough = o.opacity < 1;
  const depthOnly = seeThrough
    ? [geo.opaque, ...geo.glows.map((g) => g.geometry), geo.glass]
      .filter((g): g is THREE.BufferGeometry => !!g)
    : [];

  return (
    <Float phase={phaseOf(id)} amp={o.floatAmp} speed={o.floatSpeed}>
      <group position={pos} scale={sc}>
       <group position={mid} rotation={[0, spin, 0]}>
        <group position={[-mid[0], -mid[1], -mid[2]]}>
        {/* 깊이만 찍는 밑칠. 색을 안 쓰니 화면에는 아무것도 안 나온다. */}
        {depthOnly.map((g, i) => (
          <mesh key={i} geometry={g} renderOrder={-1}>
            <meshBasicMaterial colorWrite={false} />
          </mesh>
        ))}

        {/* 이 구조물 안 조명 블록을 진짜 광원으로.
            **세기가 0 이면 아예 안 단다.** 세기 0 짜리 `pointLight` 는 화면에
            아무것도 안 보태면서 셰이더의 광원 루프는 그대로 돈다 — 재 보니
            전구 여섯 개가 2.5ms 였다. 1구역 구름 둘이 그렇게 달려 있었다.
            빛나는 블록은 `glows` 메시가 이미 환하게 그린다(결정 ㉛). */}
        {o.lightIntensity > 0 && (
          <BlockLights
            map={map}
            scale={sc}
            intensity={o.lightIntensity}
            distance={o.lightDistance}
            color={o.lightColor}
          />
        )}

        {geo.opaque && (
          <mesh geometry={geo.opaque}>
            {/* 그림자를 주고받지 않는다. 배경이 앞 무대 조명에 반응하면 거리가 무너진다. */}
            {/* 칠했으면 조명을 아예 안 받는다 — 고른 색이 그대로 나와야 한다. */}
            {painted ? (
              <meshBasicMaterial
                vertexColors
                transparent={seeThrough}
                opacity={o.opacity}
                depthWrite={!seeThrough}
              />
            ) : (
              <meshStandardMaterial
                vertexColors
                roughness={0.95}
                metalness={0}
                transparent={seeThrough}
                opacity={o.opacity}
                // 깊이는 밑칠이 이미 찍었다. 여기서 또 쓰면 그리는 순서대로 겹친다.
                depthWrite={!seeThrough}
              />
            )}
          </mesh>
        )}
        {geo.glows.map(({ color, geometry }) => (
          <mesh key={color} geometry={geometry}>
            {/* 멀리 있는 불빛도 흐려지지만, 광원이라 형태보다는 덜 잠긴다.
                색은 블록 제 색이다 (`GlowPart`) */}
            <meshStandardMaterial
              vertexColors
              emissive={color}
              emissiveIntensity={0.55}
              roughness={0.6}
              transparent={seeThrough}
              opacity={o.opacity}
              depthWrite={!seeThrough}
            />
          </mesh>
        ))}
        {geo.glass && (
          <mesh geometry={geo.glass} renderOrder={1}>
            <meshStandardMaterial
              vertexColors
              transparent
              opacity={0.22 * o.opacity}
              side={THREE.DoubleSide}
              depthWrite={false}
              roughness={0.3}
            />
          </mesh>
        )}
        </group>
       </group>
      </group>
    </Float>
  );
}
