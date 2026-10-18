/**
 * **화면에 실제로 그려진 높이** — 칸마다 "이 y 부터는 안 그렸다".
 *
 * 아이소에서는 앞쪽 벽과 천장을 걷어내고 그린다(결정 ㉟). 그런데 맵 데이터에는
 * 그대로 있어서, 블록 붓의 조준선이 **안 보이는 벽을 먼저 맞힌다** — 홀 바닥을
 * 가리켰는데 블록이 머리 위 허공에 놓인다.
 *
 * 면을 구울 때 이미 계산해 둔 값이라(`voxelGeometry` 의 `cutAt`) 다시 재지 않고
 * 그대로 받아 둔다. 그리는 쪽과 맞히는 쪽이 **같은 숫자**를 봐야 어긋나지 않는다.
 */
export const DRAWN: { cutAt: Int32Array | null; w: number } = { cutAt: null, w: 0 };

/** (x, z) 칸에서 그려진 꼭대기. 모르면 무한대로 친다. */
export const drawnTop = (x: number, z: number): number =>
  DRAWN.cutAt && x >= 0 && z >= 0 && x < DRAWN.w
    ? DRAWN.cutAt[z * DRAWN.w + x] ?? Infinity
    : Infinity;
