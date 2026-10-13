/**
 * 문자열에서 안정적인 위상값을 뽑는다.
 *
 * 부유 모션에서 개체마다 시작 지점을 어긋내려고 쓴다. 같은 위상이면 전부
 * 한 덩어리로 오르내려서 움직임이 아니라 카메라 흔들림처럼 보인다.
 * 난수가 아니라 id 에서 뽑는 이유는 새로고침해도 같은 배치를 유지하려는 것이다.
 */
export const phaseOf = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000;
  return (h / 1000) * Math.PI * 2;
};
