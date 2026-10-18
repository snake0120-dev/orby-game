import type { Stage } from './../types';

/**
 * 3구역 — 공항 터미널. 2구역 유리 통로가 닿는 곳이다.
 *
 * **아직 여정(`STAGES`)에 넣지 않았다.** 끝(관문)을 안 놓기로 해서, 넣으면
 * "시작 → 관문까지 길이 있는가" 검사가 깨진다. 지금은 `zone3.html` 로만 본다.
 * 끝자리를 정하면 그때 빨간 양탄자 한 칸 놓고 `stages/index.ts` 에 끼우면 된다.
 *
 * 값은 2구역(`02-immigration.ts`)과 **같은 세계**로 맞춘다. 갈리면 통로 하나
 * 건너왔을 뿐인데 다른 공항처럼 보인다 (결정 ⑯).
 */
export const terminal: Stage = {
  id: '03-terminal',
  index: 3,
  title: '공항 터미널',
  learningGoal: '안내를 보고 탑승구를 찾아간다',
  tier: 'deep',

  map: 'airport.json',

  // 한 칸이 40cm 남짓이라 아이를 키운다. 2구역과 **같은 값이어야** 한다 —
  // 유리 통로는 두 구역에 걸친 같은 물건이라, 다르면 걸어오다 아이가 커진다.
  characterScale: 1.7,

  mainSaturation: 1,
  mainBrightness: 1.1,
  lightIntensity: 0.5,
  fadeStrength: 0,
  /* 맵 상자가 바뀔 때마다 `IsoCamera` 공식으로 **풀어서** 넣는다 (눈대중 금지 — 결정 ㉓).
     104×54×104 · VOXEL 0.1 기준:
       ex+ez = 20.6
       projW = 0.707 × 20.6               = 14.57
       projH = 0.408 × 20.6 + 0.816 × 5.4 = 12.82   ← 세로가 먼저 찬다
     1400×783 화면에서 zoom = min(1400/14.57, 783/12.82) = 61.1 ÷ padding
     상자는 네모인데 지은 건 ㄱ자라, 1.0 이면 빈 모서리까지 담느라 그림이 작아진다 */
  cameraPadding: 0.78,

  gradient: { low: '#1f4a55', lowMix: 0.18, high: '#ffffff', highMix: 0.05, floor: 4, span: 34 },

  /* 가까운 쪽 벽을 **턱 세 칸만 남기고** 자른다 — 2구역과 같은 방식 (결정 ㉟).
     자르는 기준 높이는 "제일 먼저 찾은 걷는 칸" 하나다 (`voxelGeometry.ts:231`).
     이 맵에선 (0, 23, 0) = **윗층**이라 자르는 선이 y 26 아래로는 안 내려온다.
     그래서 아래 섬·다리·가구(전부 y 20 아래)는 안 썰린다 — 재서 확인했다.
     걸을 수 있는 칸은 애초에 안 자르므로 계단과 유리 통로도 안전하다. */
  cutaway: 3,


  /* 창 너머의 회색 구름. **블록으로 짓지 않는다** — 천우태가 마인크래프트로
     지어 둔 `cloud1/cloud2.json` 을 배경으로 띄운다 (1구역이 등대에 쓰는 방식).
     맵 상자 밖(z 가 음수)에 두니 칸 수에도, 걷는 칸에도 영향이 없다.
     자리는 월드 단위다 — 한 블록이 0.1, 이 맵은 x·z 가 0~10.3 이다. */
  backdrops: [
    { id: 'cloud-a', label: '구름 A', map: 'cloud1.json', at: [0.4, 4.2, -4.2] as [number, number, number], scale: 1.6 },
    { id: 'cloud-b', label: '구름 B', map: 'cloud2.json', at: [3.1, 3.3, -5.1] as [number, number, number], scale: 1.3 },
    { id: 'cloud-c', label: '구름 C', map: 'cloud1.json', at: [5.6, 4.6, -3.8] as [number, number, number], scale: 1.8 },
    { id: 'cloud-d', label: '구름 D', map: 'cloud2.json', at: [8.2, 3.6, -4.6] as [number, number, number], scale: 1.4 },
    { id: 'cloud-e', label: '구름 E', map: 'cloud1.json', at: [-3.6, 2.4, 6.2] as [number, number, number], scale: 1.5 },
  ].map((b) => ({
    ...b,
    /* 멀리 떠 있는 **옅은 회색** 덩어리로 읽혀야 한다.
       처음엔 brightness 0.62 로 뒀다가 시커먼 덩어리가 창을 가렸다 —
       배경은 어두운 남색이라 어둡게 칠하면 그냥 구멍으로 보인다. */
    saturation: 0.1, brightness: 1.85, haze: 0.5, opacity: 0.5,
    lightIntensity: 0, lightDistance: 20, lightColor: '#FFD9A0',
    // 구름은 크고 느리게 — 하늘에 뜬 게 읽혀야 한다
    floatAmp: 0.08, floatSpeed: 1.25,
  })),

  props: [],
  missions: [],
  gate: { opensOn: [] },

  intro: '여기가 공항 안이야. 안내판을 보고 탑승구를 찾아가자.',
};
