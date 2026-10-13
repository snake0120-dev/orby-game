import type { Stage } from '../types';

/**
 * 1구역 · 환승 게이트 — 비행기에서 막 내린 구간.
 *
 * 맵은 천우태가 마인크래프트로 지은 `gate02` 그대로다 (gate1 의 갱신본).
 * ㄴ자 석영 계단으로 몰딩·처마를 두른 판이라, 계단 방향까지 살려서 그린다.
 * 레퍼런스 `래퍼런스/gate.jpeg` (탑승교 내부: 좁고 긴 통로, 양옆 통유리).
 *
 * 지금은 지형·동선 확인 단계라 상호작용을 붙이지 않는다.
 * 스폰(오른쪽 x=44) → 통로 → 계단 y=1→10 → 위층 관문(왼쪽 x=0).
 */
export const gate: Stage = {
  id: '01-gate',
  index: 1,
  title: '환승 게이트',
  learningGoal: '비행기에서 내려 다음 게이트까지 혼자 걸어간다',
  tier: 'mid',

  map: 'gate02.json',

  props: [],
  missions: [],
  gate: { opensOn: [] },

  /**
   * 근경 절단을 끈다 (맵 높이보다 큰 값).
   * 복층이라 앞쪽 벽을 자르면 위층과 계단이 통째로 사라진다.
   * 유리가 알아서 반투명이라 안이 들여다보인다.
   */
  cutaway: 99,

  /**
   * 뒤에 세우는 장식 구조물들.
   * 값은 전부 개발 패널(`1` 키)에서 눈으로 맞춘 뒤 옮겨온 것이다.
   */
  backdrops: [
    {
      id: 'lighthouse-a',
      label: '등대 A',
      map: 'background.json',
      at: [-1.95, -4.06, -6.91],
      scale: 1.47,
      saturation: 0,
      brightness: 0.32,
      haze: 0.78,
      opacity: 1,
      lightIntensity: 1.83,
      lightDistance: 26,
      lightColor: '#FFD9A0',
      // `래퍼런스/등대 a,b 색상 수정.png` — 등대 둘이 같은 값이다
      paint: {
        mode: 'on',
        top: { color: '#c7c7c7' },
        left: { color: '#2ec3b6' },
        right: { color: '#2ec3b6', grad: true, gradTo: '#4a5058' },
      },
    },
    {
      id: 'lighthouse-b',
      label: '등대 B',
      map: 'background.json',
      at: [0.25, -3.02, 2.42],
      scale: 1.68,
      saturation: 0,
      brightness: 1.05,
      haze: 0.61,
      opacity: 1,
      lightIntensity: 6,
      lightDistance: 37,
      lightColor: '#FFD9A0',
      paint: {
        mode: 'on',
        top: { color: '#c7c7c7' },
        left: { color: '#2ec3b6' },
        right: { color: '#2ec3b6', grad: true, gradTo: '#4a5058' },
      },
    },
    {
      /**
       * 비행기. 천우태가 마인크래프트로 지었다 (`../비행기` 월드).
       * 파일명 `airplain.json` 은 구조 블록 이름 그대로다 — 다시 임포트하면
       * 같은 이름으로 덮인다.
       *
       * 통로 **위 하늘을 크게 가로지른다.** 동체가 x 축으로 누워 있는 걸
       * 270° 돌려 세웠다 (마인크래프트에서 다시 짓지 않아도 되게).
       * 반투명(0.87)이라 앞 무대를 밟지 않고 지나간다.
       *
       * 값은 전부 개발 패널(`1` 키)에서 눈으로 맞춘 뒤 옮겨온 것이다.
       */
      id: 'airplane',
      label: '비행기',
      map: 'airplain.json',
      at: [4.74, 2.57, -2.2],
      rotation: 270,
      scale: 1.41,
      saturation: 2,
      brightness: 2,
      haze: 0,
      opacity: 0.87,
      lightIntensity: 0,
      lightDistance: 26,
      lightColor: '#FFD9A0',
      // 하늘에 떠 있으니 구름 쪽에 가깝게 — 등대처럼 굳어 있으면 얹어놓은 판으로 보인다
      floatAmp: 0.03,
      floatSpeed: 0.93,
      // 메인 구조물과 같은 값이다 — 같은 세계의 물건으로 읽혀야 한다.
      // 270° 돌아가 있어서 왼쪽·오른쪽의 아래 색이 서로 바뀌어 붙는다.
      paint: {
        mode: 'on',
        top: { color: '#efefef' },
        left: { color: '#ff9f1c', grad: true, gradTo: '#6f7a86' },
        right: { color: '#ff9f1c', grad: true, gradTo: '#4a5058' },
      },
    },
    {
      id: 'cloud-a',
      label: '구름 A',
      map: 'cloud1.json',
      at: [1.84, 1.8, -1.2],
      scale: 0.89,
      saturation: 2,
      brightness: 2,
      haze: 0.34,
      opacity: 0.42,
      lightIntensity: 0,
      lightDistance: 26,
      lightColor: '#FFD9A0',
      // 구름은 크고 느리게 — 등대보다 확실히 더 움직여야 하늘에 뜬 게 읽힌다
      floatAmp: 0.08,
      floatSpeed: 1.25,
      // `래퍼런스/구름 a,b 색상수정.png` — 구름 둘이 같은 값이다
      paint: {
        mode: 'on',
        top: { color: '#efefef' },
        left: { color: '#cbf3f0', grad: true, gradTo: '#6f7a86' },
        right: { color: '#cbf3f0', grad: true, gradTo: '#4a5058' },
      },
    },
    {
      id: 'cloud-b',
      label: '구름 B',
      map: 'cloud2.json',
      at: [4.57, 1.75, 3.31],
      scale: 1.61,
      saturation: 0.48,
      brightness: 1.15,
      haze: 0.64,
      opacity: 0.42,
      lightIntensity: 3.86,
      lightDistance: 8,
      lightColor: '#FFD9A0',
      // 구름은 크고 느리게 — 등대보다 확실히 더 움직여야 하늘에 뜬 게 읽힌다
      floatAmp: 0.08,
      floatSpeed: 1.25,
      paint: {
        mode: 'on',
        top: { color: '#efefef' },
        left: { color: '#cbf3f0', grad: true, gradTo: '#6f7a86' },
        right: { color: '#cbf3f0', grad: true, gradTo: '#4a5058' },
      },
    },
  ],

  /** 패널에서 맞춘 값 */
  cameraPadding: 1.0,

  /**
   * 메인 구조물 직접 칠하기 (`래퍼런스/비행기, 메인구조물 색상 수정.png`).
   *
   * 윗면은 흰색으로 두고 **옆면만 주황에서 회색으로 떨어뜨린다.** 위에서 빛이
   * 내려와 벽을 타고 식는 것처럼 읽힌다 — 윗면까지 물들이면 덩어리가 통째로
   * 주황이 되어 형태가 안 갈린다.
   *
   * 왼쪽과 오른쪽의 아래 색을 다르게 둔 게 핵심이다(#6f7a86 vs #4a5058).
   * 두 면이 같은 색으로 끝나면 모서리가 사라진다.
   */
  paint: {
    mode: 'on',
    top: { color: '#efefef' },
    left: { color: '#ff9f1c', grad: true, gradTo: '#6f7a86' },
    right: { color: '#ff9f1c', grad: true, gradTo: '#4a5058' },
  },

  intro: '도착했어. 다음 게이트까지 같이 가자.',

  /* 아이 머리 위 말풍선 (`말풍선/말풍선 넣는 예시.png`). 지금은 빼둔 상태 —
     아래 줄의 주석만 풀면 그대로 돌아온다. 만드는 코드는 그대로 살아 있다. */
  // bubble: '어디로 가야할까?',
};
