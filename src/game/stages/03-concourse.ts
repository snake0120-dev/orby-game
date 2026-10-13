import type { Stage } from '../types';

/**
 * 3구역 · 환승 통로 — 계단을 올라 다음 층으로.
 *
 * 천우태가 그린 미리보기(`2,3,4번 맵 가이드/3번 맵.png`) 그대로 지었다:
 *   복층 테라스 · 나무 난간 · 테라스 아래 호박색 띠 · 안내 카운터 ·
 *   상점 쇼윈도 · 바닥을 꿰뚫는 큰 기둥 · 아래층 유리 키오스크.
 *
 * **여정에서 처음으로 층을 오르는 구역이다.** 앞 두 구역이 한 층짜리 판이라,
 * 여기서 위아래가 생기면 공항이 넓어진 것처럼 읽힌다. 관문을 위층에 둔 것도
 * 그래서다 — 계단을 올라야만 다음으로 간다.
 *
 * 맵은 생성기가 만든다 (`npm run map:stages`).
 */
export const concourse: Stage = {
  id: '03-concourse',
  index: 3,
  title: '환승 통로',
  learningGoal: '계단을 올라 위층 게이트로 간다',
  tier: 'mid',

  map: 'concourse.json',

  // 2구역과 같은 민트 세계다 — 값이 갈리면 다른 공항처럼 보인다
  mainSaturation: 1,
  mainBrightness: 0.95,
  fadeStrength: 0,
  lightIntensity: 0.5,
  cameraPadding: 0.95,

  props: [],
  missions: [],
  gate: { opensOn: [] },
  cutaway: 99,

  intro: '위층으로 올라가야 해. 계단 보이지?',
};
