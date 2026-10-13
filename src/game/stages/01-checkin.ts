import type { Stage } from '../types';

/**
 * 1구역 · 체크인 · UM 접수 (light tier — 튜토리얼)
 *
 * 조작법을 배우는 구역이자 여정의 출발점.
 * 부모와의 이별이 가장 정서적으로 민감한 순간이라,
 * "헤어진다"가 아니라 "다녀올게 인사를 한다"로만 다룬다.
 *
 * ⚠ 지금은 합성 테스트 맵(test-room)을 쓰고 있다.
 *   진짜 마인크래프트 맵이 오면 `map` 만 바꾸면 된다.
 */
export const stage01: Stage = {
  id: '01-checkin',
  index: 1,
  title: '체크인',
  learningGoal: '부모님과 인사하고, 체크인 카운터에서 UM 목걸이를 받는다',
  tier: 'light',

  map: 'test-room.json',

  props: [
    {
      id: 'parent',
      slot: 1,                 // 금 블록
      label: '부모님',
      interact: 'sayBye',
      hint: '엄마 아빠에게 다녀올게 인사하기',
    },
    {
      id: 'agent',
      slot: 2,                 // 다이아몬드 블록
      label: '체크인 직원',
      interact: 'getLanyard',
      hint: '카운터에서 목걸이 받기',
    },
  ],

  missions: [
    {
      id: 'sayBye',
      label: '인사하기',
      icon: 'wave',
      say: '다녀올게! 도착하면 바로 만날 수 있어.',
    },
    {
      id: 'getLanyard',
      label: '목걸이 받기',
      icon: 'badge',
      requires: ['sayBye'],
      say: '이 목걸이가 있으면 헬퍼가 너를 바로 알아봐.',
    },
  ],

  gate: { opensOn: ['getLanyard'] },
  intro: '오늘은 혼자 비행기를 타는 날이야. 내가 끝까지 같이 갈게.',
};
