/**
 * 키보드로 걷기 — 눌린 키와 1인칭 시선.
 *
 * 저장소를 안 쓴다. 프레임마다 보는 값이라 저장소에 넣으면 그때마다 리액트가
 * 다시 그린다 (`characterPose.ts` 와 같은 이유).
 *
 * 키는 **컨트롤러에 맞춰** `KEY` 에 모아 뒀다 — 전시에서 쓸 컨트롤러가 글자로
 * 보내기 때문이다. 바꾸려면 거기 한 군데만 고치면 된다.
 */
export const INPUT = {
  keys: new Set<string>(),
  /** 1인칭에서 고개돌리기 키로 돌린 시선 (라디안) */
  heading: 0,
  /** 1인칭을 켠 뒤 시선을 아이가 보던 쪽으로 한 번 맞췄는가 */
  synced: false,
};

/**
 * 키 이름. **컨트롤러가 보내는 글자**다 (`WalkKeys` 가 자판 위치로 읽는다).
 * 한 군데서만 고치면 네 방향과 고개돌리기가 같이 따라오게 모아 둔다.
 */
export const KEY = {
  앞: 'c',
  뒤: 'd',
  왼: 'e',
  오른: 'f',
  고개왼: 'i',
  고개오른: 'g',
} as const;

/** `WalkKeys` 가 자판에서 골라낼 글자들 — **걷기만**이다 */
export const WALK_KEYS = Object.values(KEY) as readonly string[];

/**
 * **처음(인트로)으로 되돌리는 키.**
 *
 * 걷기 키 목록에는 **안 넣는다** — 넣으면 `WalkKeys` 가 먼저 집어삼켜서
 * 되돌리기가 안 먹는다. 여기 같이 적어 두는 건 컨트롤러 글자가 한자리에
 * 모여 있어야 바꿀 때 안 흘리기 때문이다.
 */
export const RESTART_KEY = 'h';

/** 화면 기준 네 방향 → (x, z). 아이소는 비스듬히 누워 있어 대각선이 "위"다. */
const ISO: Record<string, [number, number]> = {
  [KEY.앞]: [-1, -1],    // 화면 위
  [KEY.뒤]: [1, 1],      // 화면 아래
  [KEY.왼]: [-1, 1],     // 화면 왼쪽
  [KEY.오른]: [1, -1],   // 화면 오른쪽
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
  if (keys.has(KEY.앞)) { dx += fx; dz += fz; }
  if (keys.has(KEY.뒤)) { dx -= fx; dz -= fz; }
  if (keys.has(KEY.오른)) { dx -= fz; dz += fx; }
  if (keys.has(KEY.왼)) { dx += fz; dz -= fx; }

  const n = Math.hypot(dx, dz);
  if (n < 0.1) return null;
  return [Math.round(dx / n), Math.round(dz / n)];
}
