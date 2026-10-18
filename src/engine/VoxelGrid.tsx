import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { buildGeometry } from './voxelGeometry';
import { DRAWN } from './drawnTop';
import { type VoxelMap } from './voxelMap';
import { makePaint, makeTint, useTune } from '../game/tuneStore';
import { nearGlowParams } from './nearGlow';
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
/**
 * **아이 둘레에서만 켜지는 빛** (`Stage.glowNear`).
 *
 * 2구역은 바닥 유도 동선뿐 아니라 벽 띠·부스 사인까지 전부 빛나는 블록이다.
 * 늘 켜 두면 홀 전체가 한꺼번에 타올라 "따라오라"는 신호가 안 된다 — 아이 앞이
 * 밝아져야 길로 읽힌다. 그래서 이 구역의 **빛나는 블록 전부**에 건다.
 * 한쪽만 걸면 꺼진 길 옆에서 벽이 혼자 타올라 "여기가 길이다"가 안 읽힌다.
 *
 * 그렇다고 아이가 한 칸 걸을 때마다 블록을 바꿔 다시 구울 수는 없다(한 번에
 * 30ms 넘게 든다). 대신 **셰이더에서 거리로 끈다** — 메시도 지오메트리도 그대로
 * 두고, 픽셀이 속한 **블록 칸**과 아이 자리의 거리만 본다. 아이가 뛰어다녀도
 * 비용은 0 이다.
 *
 * ## 칸 단위로 끊어야 '블록에 불이 들어온다'로 보인다
 *
 * 처음에는 픽셀의 거리를 그대로 `smoothstep` 에 넣었다. 그러면 밝기가 블록
 * 경계와 무관하게 매끄럽게 흐르고, 결과는 **아이 발밑의 둥근 빛 무리** 였다 —
 * 길이 켜진 게 아니라 아이가 손전등을 든 것처럼 보인다. 길을 따라가게 만드는
 * 신호는 "저 앞 블록에 불이 들어왔다"는 **낱낱의 블록**이다.
 *
 * 그래서 픽셀 좌표를 먼저 **칸 번호로 내림**하고, 그 칸 중심까지의 거리로
 * 밝기를 정한다. 한 블록 안의 모든 픽셀이 같은 값을 받으므로 블록이 통째로
 * 켜지고 통째로 꺼진다. 단계도 세 개(환함 · 어스름 · 꺼짐)만 둔다 — 매끄럽게
 * 이으면 다시 빛 무리가 된다.
 *
 * ## 거리는 바닥(x·z)에서만 센다
 *
 * `POSE.at` 은 아이 **발**이고 길은 그 두 칸 아래다(지면 y12, 빛 y11).
 * 3차원 거리로 재면 그 두 칸이 반경을 먹어서, 5칸을 줘도 바닥에서는 네 칸
 * 남짓만 켜졌다. 길은 한 층짜리라 높이는 볼 이유가 없다.
 *
 * ## 1인칭에서는 빛이 **아이 앞으로 뻗는다**
 *
 * 아이 눈은 바닥에서 세 칸 반쯤 위라(`FirstPerson` 의 `EYE`), 발밑 열 칸쯤까지의
 * 바닥이 **화면 아래로 빠진다.** 그래서 아이를 가운데 둔 동그라미로는 반경을
 * 아무리 줘도 1인칭에 한 칸도 안 나온다 — 켜진 블록이 전부 턱 밑에 깔려 있어서다.
 * 실제로 5칸·7칸·12칸 모두 1인칭 화면에서는 아무것도 안 보였다.
 *
 * 그렇다고 동그라미를 통째로 앞으로 **밀면** 안 된다. 그러면 길이 꺾이거나
 * 끝나는 데서 동그라미가 길 밖으로 나가 **빛이 통째로 꺼진다** — 홀 아래 직선
 * 구간 끝에서 실제로 그랬다.
 *
 * 그래서 동그라미가 아니라 **띠**로 켠다. 아이 자리에서 보는 쪽으로
 * `FPV_LEAD` 칸 뻗은 **선분까지의 거리**를 재는 것이다. 발밑부터 앞까지가
 * 한 줄로 이어지므로 중간이 끊기지 않고, 길이 꺾여도 아이 가까운 쪽은 켜져 있다.
 * 아이소(전시 화면)는 위에서 내려다보니 뻗을 이유가 없어 선분 길이가 0 이다 —
 * 그러면 식이 저절로 원래의 동그라미가 된다(선분 한 점까지의 거리).
 *
 * 꺼진 칸은 발광만 빼는 게 아니라 색도 눌러 둔다. 안 그러면 꺼진 자리가
 * 그냥 '밝은 노란 블록'으로 보여서 켜진 데와 구분이 흐릿하다.
 */
function NearGlow(
  { geometry, color, kind }:
    { geometry: THREE.BufferGeometry; color: string; kind: 'path' | 'other' },
) {
  const u = useRef({
    /** 아이 발 자리를 **칸 단위**로 (월드 좌표 ÷ VOXEL) */
    uChild: { value: new THREE.Vector2() },
    /** 아이에서 앞으로 뻗은 선분 (칸). 아이소에서는 (0,0) 이라 점이 된다. */
    uLead: { value: new THREE.Vector2() },
    /** 선분에서 이 칸 수만큼 떨어지면 꺼진다 */
    uFar: { value: 7 },
  });

  /* 값은 `nearGlow.ts` 한 군데서 낸다 — 진짜 전구(`BlockLights`)가 같은 식을
     써야 블록과 그 빛이 같이 켜지고 같이 꺼진다. */
  useFrame(() => {
    const p = nearGlowParams(kind);
    u.current.uFar.value = p.far;
    u.current.uChild.value.set(p.cx, p.cz);
    u.current.uLead.value.set(p.lx, p.lz);
  });

  return (
    <mesh geometry={geometry}>
      <meshStandardMaterial
        vertexColors
        emissive={color}
        emissiveIntensity={0.9}
        roughness={0.5}
        toneMapped={false}
        /* 이 재질만 셰이더가 다르다. 안 적어 주면 three 가 다른 표준 재질과
           프로그램을 같이 쓰려 해서, 어떤 건 켜지고 어떤 건 안 켜진다. */
        customProgramCacheKey={() => 'orby-nearglow'}
        onBeforeCompile={(shader) => {
          Object.assign(shader.uniforms, u.current);
          shader.vertexShader = shader.vertexShader
            .replace(
              '#include <common>',
              '#include <common>\nvarying vec3 vOrbyWP;\nvarying vec3 vOrbyFN;',
            )
            /* 면 법선을 같이 넘긴다 — 아래 '칸 번호 내림'에서 쓴다.
               `objectNormal` 은 바로 위 `beginnormal_vertex` 가 만들어 둔 값이다.
               구조물에는 회전·축척이 없으므로(`Float` 은 y 로만 민다) 월드 법선과 같다. */
            .replace(
              '#include <begin_vertex>',
              '#include <begin_vertex>\n' +
                'vOrbyWP = (modelMatrix * vec4(transformed, 1.0)).xyz;\n' +
                'vOrbyFN = objectNormal;',
            );
          shader.fragmentShader = shader.fragmentShader
            .replace(
              '#include <common>',
              '#include <common>\n' +
                'varying vec3 vOrbyWP;\n' +
                'varying vec3 vOrbyFN;\n' +
                'uniform vec2 uChild;\n' +
                'uniform vec2 uLead;\n' +
                'uniform float uFar;\n' +
                `const float ORBY_VOXEL = ${VOXEL.toFixed(6)};\n` +
                /* 이 픽셀이 **어느 블록 칸**인지. 블록 중심이 (x,y,z)·VOXEL 이라
                   칸 번호는 `round(좌표 / VOXEL)` 이다. 그런데 면 위의 픽셀은
                   법선 축에서 정확히 칸 **경계**에 놓여 있어서(+x 면이면 x 가
                   칸+0.5) 그 축만 반 칸 안으로 당겨 놓고 센다. 안 당기면 옆 칸과
                   반반씩 걸려서 벽면이 엉뚱한 칸의 밝기를 받는다. */
                'vec2 orbyCell() {\n' +
                '  vec3 inner = vOrbyWP / ORBY_VOXEL - vOrbyFN * 0.5;\n' +
                '  return floor(vec2(inner.x, inner.z) + 0.5);\n' +
                '}\n',
            )
            .replace(
              'vec3 totalEmissiveRadiance = emissive;',
              /* 칸 중심까지의 거리 → **세 계단**.
                 `smoothstep` 을 쓰면 블록 안에서 밝기가 흘러 다시 둥근 빛 무리가
                 된다. 그렇다고 켜짐/꺼짐 둘로만 두면 붙어 있는 블록이 전부 같은
                 밝기라 한 장의 띠로 보인다 — 낱낱의 블록으로 읽히려면 **이웃끼리
                 밝기가 달라야** 한다.

                 가운데(반경−2칸)는 **그냥 켠다.** 여기서 밝기를 깎으면 아이
                 바로 옆이 뿌예져서 또 빛 무리가 된다. 바깥 두 줄만 반쯤, 그
                 다음은 꺼짐 — 다가가는 대로 앞 블록이 한 줄씩 밝아진다. */
              /* 아이 자리에서 `uLead` 만큼 뻗은 **선분까지의 거리**.
                 선분이 0 이면(아이소) 그냥 아이까지의 거리가 된다. */
              'vec2 orbyP = orbyCell() - uChild;\n' +
                'float orbyL2 = max(dot(uLead, uLead), 1e-4);\n' +
                'float orbyT = clamp(dot(orbyP, uLead) / orbyL2, 0.0, 1.0);\n' +
                'float orbyD = length(orbyP - uLead * orbyT);\n' +
                'float orbyLit = 1.0\n' +
                '  - 0.30 * step(uFar - 2.0, orbyD)\n' +
                '  - 0.30 * step(uFar - 1.0, orbyD)\n' +
                '  - 0.40 * step(uFar, orbyD);\n' +
                'vec3 totalEmissiveRadiance = emissive * orbyLit;',
            )
            .replace(
              '#include <color_fragment>',
              '#include <color_fragment>\ndiffuseColor.rgb *= mix(0.85, 1.0, orbyLit);',
            );
        }}
      />
    </mesh>
  );
}

export function VoxelGrid(
  { map, cutMin, ceiling, glowNear, pathGlow }:
    { map: VoxelMap; cutMin?: number; ceiling?: number; glowNear?: boolean; pathGlow?: string },
) {
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

  const { opaque, glass, glows, roof } = useMemo(
    () => {
      const t0 = performance.now();
      /* **1인칭은 안에서 보는 눈이라 아무것도 자르지 않는다.**
         아이소는 위에서 내려다보니 앞쪽 벽(`cutMin`)과 천장(`ceiling`)을
         걷어내야 방 안이 보인다. 아이 눈높이에서는 그 둘이 다 있어야
         실내가 된다 — 없으면 벽이 턱만 남고 머리 위가 뻥 뚫린다.
         보기를 바꿀 때 어차피 한 번 다시 굽는다(`colorKey` 에 `fpv`). */
      const g = buildGeometry(
        map, tune.fpv ? map.h : cutMin, makeTint(tune, 'main'), fade, paint, tune.fpv,
        ceiling, !tune.fpv,
      );
      // 블록을 하나 놓을 때마다 여기를 다시 거친다 — `window.__ms` 로 본다
      /* 블록 붓이 **안 보이는 벽을 맞히지 않게** 그린 높이를 넘겨 준다 */
      DRAWN.cutAt = g.cutAt;
      DRAWN.w = map.w;
      if (import.meta.env.DEV) {
        const w = window as unknown as Record<string, unknown>;
        const quads = (g.opaque?.attributes.position.count ?? 0)
          + (g.roof?.attributes.position.count ?? 0)
          + (g.glass?.attributes.position.count ?? 0)
          + g.glows.reduce((n, p) => n + p.geometry.attributes.position.count, 0);
        w.__ms = {
          ...(w.__ms as object),
          면굽기: +(performance.now() - t0).toFixed(1),
          면: quads / 6,          // 네모 한 장이 꼭짓점 여섯 개 (인덱스를 안 쓴다)
          천장: (g.roof?.attributes.position.count ?? 0) / 6,
          유리: (g.glass?.attributes.position.count ?? 0) / 6,
        };
      }
      return g;
    },
    // fade·paint·tint 는 매번 새 객체라 값으로 비교한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [map, cutMin, ceiling, colorKey, fade.top, fade.strength],
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
      {/*
        빛나는 블록은 **자기 색으로** 빛난다.

        전에는 전부 한 덩어리에 흰 `emissive` 를 걸어서, 주황 버섯등을 놓아도
        하얗게 타올랐다 — `emissive` 는 재질 하나에 색 하나라 그렇다.
        색마다 메시를 나눠(`GlowPart`) 각자의 색을 넣는다. 맵 하나에 보통
        두셋이라 그리는 횟수는 거의 안 는다.
      */}
      {/*
        천장은 **그림자를 안 드리운다.**

        방 위를 덮는 판이라 그림자를 켜면 방향광을 통째로 막아 홀이 깜깜해진다.
        전에는 그래서 천장을 유리로 지었는데(유리 메시는 그림자를 안 만든다),
        반투명 판이 화면을 꽉 채우면서 **1인칭 프레임의 절반**을 먹었다
        (30.6ms → 천장을 걷어내면 16.7ms). 불투명하게 짓고 여기서 그림자만
        빼는 게 눈에도 낫고 훨씬 싸다.
      */}
      {roof && (
        <mesh geometry={roof} receiveShadow>
          <meshStandardMaterial vertexColors roughness={0.92} metalness={0} />
        </mesh>
      )}
      {glows.map(({ name, color, geometry }) =>
        glowNear ? (
          <NearGlow
            key={name}
            geometry={geometry}
            color={color}
            kind={name === pathGlow ? 'path' : 'other'}
          />
        ) : (
          <mesh key={name} geometry={geometry}>
            <meshStandardMaterial
              vertexColors
              emissive={color}
              emissiveIntensity={0.9}
              roughness={0.5}
              toneMapped={false}
            />
          </mesh>
        ),
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

