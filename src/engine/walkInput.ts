/**
 * 키보드로 걷기 — 눌린 키와 1인칭 시선.
 *
 * 저장소를 안 쓴다. 프레임마다 보는 값이라 저장소에 넣으면 그때마다 리액트가
 * 다시 그린다 (`characterPose.ts` 와 같은 이유).
 */
export const INPUT = {
  keys: new Set<string>(),
  /** 1인칭에서 Q·E 로 돌린 시선 (라디안) */
  heading: 0,
  /** 1인칭을 켠 뒤 시선을 아이가 보던 쪽으로 한 번 맞췄는가 */
  synced: false,
};

/** 화면 기준 네 방향 → (x, z). 아이소는 비스듬히 누워 있어 대각선이 "위"다. */
const ISO: Record<string, [number, number]> = {
  w: [-1, -1],   // 화면 위
  s: [1, 1],     // 화면 아래
  a: [-1, 1],    // 화면 왼쪽
  d: [1, -1],    // 화면 오른쪽
};

const clamp1 = (n: number) => (n > 0 ? 1 : n < 0 ? -1 : 0);

/**
 * 지금 눌린 키 → 한 칸 이동량 `(dx, dz)`. 누른 게 없으면 null.
 *
 * `heading` 을 주면 **그 방향 기준**이다 (1인칭: 앞뒤좌우). 안 주면 화면
 * 기준이다 (탑뷰: 아이소라 대각선이 "위"다).
 */
export function walkStep(keys: Set<string>, heading: number | null): [number, number] | null {
  let dx = 0, dz = 0;

  if (heading === null) {
    for (const [k, [x, z]] of Object.entries(ISO)) {
      if (keys.has(k)) { dx += x; dz += z; }
    }
    if (!dx && !dz) return null;
    return [clamp1(dx), clamp1(dz)];
  }

  /* 아이 모델은 +Z 가 앞이고 회전이 `atan2(dx, dz)` 라(`Character`),
     앞 벡터는 `(sin, cos)` 이다.
     **오른쪽은 −X 쪽이다.** 오른손 좌표계에서 +Z 를 보고 +Y 가 위면
     오른쪽 = 앞 × 위 = `(0,0,1) × (0,1,0) = (−1,0,0)` 이기 때문이다.
     여기서 부호를 뒤집어 놔서 A·D 가 거꾸로 걸었다. */
  const fx = Math.sin(heading), fz = Math.cos(heading);
  if (keys.has('w')) { dx += fx; dz += fz; }
  if (keys.has('s')) { dx -= fx; dz -= fz; }
  if (keys.has('d')) { dx -= fz; dz += fx; }   // 오른쪽
  if (keys.has('a')) { dx += fz; dz -= fx; }   // 왼쪽

  const n = Math.hypot(dx, dz);
  if (n < 0.1) return null;
  return [Math.round(dx / n), Math.round(dz / n)];
}
