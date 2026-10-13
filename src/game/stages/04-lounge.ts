import type { Stage } from '../types';

/**
 * 4구역 · 대기실 — 앉아서 기다렸다가 다음 게이트로.
 *
 * 천우태가 그린 미리보기(`2,3,4번 맵 가이드/4번 맵.png`) 그대로 지었다:
 *   민트 판을 가로지르는 네 갈래 흰 통로 · 호박색 파티션 ·
 *   사무 구역(책상·모니터·의자) · 소파와 안락의자와 화분.
 *
 * **여정에서 처음으로 쉬어가는 곳이다.** 앞 세 구역이 전부 지나가는 길이라,
 * 여기만 앉는 가구로 채운다. 아이가 "여기선 서두르지 않아도 된다"를 가구로
 * 읽을 수 있어야 한다.
 *
 * 맵은 생성기가 만든다 (`npm run map:stages`).
 */
export const lounge: Stage = {
  id: '04-lounge',
  index: 4,
  title: '대기실',
  learningGoal: '대기실에서 기다렸다가 다음 게이트로 간다',
  tier: 'light',

  map: 'lounge.json',

  mainSaturation: 1,
  mainBrightness: 0.95,
  fadeStrength: 0,
  lightIntensity: 0.5,
  cameraPadding: 0.95,

  props: [],
  missions: [],
  gate: { opensOn: [] },
  cutaway: 99,

  intro: '여기서 잠깐 쉬어도 돼. 준비되면 저쪽으로 가자.',
};
