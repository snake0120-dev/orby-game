import * as THREE from 'three';

/**
 * ORBY 심볼 — 가느다란 십자, 중심에서만 오목하게 부푼다.
 *
 * `관문사인/관문사인.png` 를 그대로 옮긴 것이다. 특징은 둘뿐이다:
 *   · 팔이 **끝까지 같은 두께로 가는** 직선
 *   · 팔과 팔이 만나는 안쪽 모서리만 **중심 쪽으로 오목하게** 이어진다
 *
 * 오목함이 이 마크의 정체성이라 직선 두 개를 겹쳐서는 안 나온다.
 * 네 모서리를 2차 곡선으로 잇되, 제어점을 원점 가까이(w, w) 두면 곡선이
 * 안쪽으로 빨려 들어간다.
 *
 * 관문 사인과 아이 곁을 도는 동반자가 **같은 마크**다 — 브랜드 은유가
 * "아이의 궤도를 도는 위성"이라, 길을 알려주는 사인과 동반자가 같은 모양이어야
 * 아이가 둘을 하나로 읽는다. 그래서 지오메트리를 한 군데서만 만든다.
 */
export function orbySymbolGeometry(radius: number): THREE.ExtrudeGeometry {
  const R = radius;
  const w = R * 0.052;   // 팔 두께의 절반 — 가늘어야 한다
  const f = R * 0.34;    // 이 지점부터 모서리 곡선이 시작된다

  const sh = new THREE.Shape();
  sh.moveTo(w, R);                       // 위쪽 팔, 오른쪽 변, 끝에서 시작
  sh.lineTo(w, f);
  sh.quadraticCurveTo(w, w, f, w);       // 오목 — 제어점이 원점에 붙어 있다
  sh.lineTo(R, w);                       // 오른쪽 팔
  sh.lineTo(R, -w);
  sh.lineTo(f, -w);
  sh.quadraticCurveTo(w, -w, w, -f);
  sh.lineTo(w, -R);                      // 아래쪽 팔
  sh.lineTo(-w, -R);
  sh.lineTo(-w, -f);
  sh.quadraticCurveTo(-w, -w, -f, -w);
  sh.lineTo(-R, -w);                     // 왼쪽 팔
  sh.lineTo(-R, w);
  sh.lineTo(-f, w);
  sh.quadraticCurveTo(-w, w, -w, f);
  sh.lineTo(-w, R);
  sh.closePath();

  const g = new THREE.ExtrudeGeometry(sh, {
    depth: R * 0.06,     // 얇은 판. 두꺼우면 십자가 뭉툭해 보인다
    bevelEnabled: false,
    curveSegments: 20,
  });
  g.center();
  return g;
}

/**
 * 동반자는 관문 사인의 35% 크기다 — 같은 마크지만 아이 곁의 것이 훨씬 작다.
 * (처음 70% 로 뒀다가 절반으로 줄인 값이다. 사인은 멀리서 찾는 이정표고
 *  동반자는 아이 어깨 옆에 붙는 것이라 같은 크기면 사인이 안 읽힌다.)
 */
export const COMPANION_RATIO = 0.35;
