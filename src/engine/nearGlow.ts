import { POSE } from './characterPose';
import { VOXEL } from '../theme';
import { useTune } from '../game/tuneStore';

/**
 * **아이 가까이에서만 켜지는 빛** — 거리 재는 법 한 군데.
 *
 * 빛나는 메시(`VoxelGrid` 의 `NearGlow`)와 진짜 전구(`BlockLights`)가 **같은
 * 식**을 써야 한다. 블록은 꺼졌는데 그 자리 전구만 켜져 있으면 바닥에 빛
 * 웅덩이만 남아서, 꺼진 게 아니라 고장 난 것처럼 보인다.
 *
 * 셰이더 쪽은 이 파일의 상수와 식을 **GLSL 로 옮겨 적은 것**이다 (픽셀마다
 * 돌아야 해서 자바스크립트를 부를 수가 없다). 한쪽을 고치면 다른 쪽도 고친다.
 */

/**
 * 1인칭에서 빛 띠가 아이 앞으로 뻗는 길이 (칸).
 *
 * 아이 눈이 바닥에서 세 칸 반쯤 위라 발밑 열 칸쯤이 화면 아래로 빠진다.
 * 아이를 가운데 둔 동그라미로는 1인칭에 한 칸도 안 보인다(결정 ㊲).
 */
export const FPV_LEAD = 12;

/**
 * 지금 쓸 반경(칸)과 앞으로 뻗은 선분 — 셰이더에도 같은 값이 간다.
 *
 * `kind` 가 반경을 가른다. **바닥 길은 좁게, 방 조명은 넓게.** 같은 값으로
 * 두면 길이 켜지기도 전에 방이 먼저 밝아져서 길이 안 읽힌다.
 */
export function nearGlowParams(
  kind: 'path' | 'other' = 'other',
): { far: number; cx: number; cz: number; lx: number; lz: number } {
  const t = useTune.getState();
  // 세 단 계단이라 3보다 작으면 단이 안 나온다
  const far = Math.max(3, Math.round(kind === 'path' ? t.pathRadius : t.glowRadius));
  const lead = t.fpv ? FPV_LEAD : 0;
  return {
    far,
    cx: POSE.at.x / VOXEL,
    cz: POSE.at.z / VOXEL,
    // 아이 모델은 +Z 가 앞이다 (`FirstPerson`)
    lx: Math.sin(POSE.yaw) * lead,
    lz: Math.cos(POSE.yaw) * lead,
  };
}

/**
 * 칸 (x, z) 가 아이에게서 얼마나 떨어졌는가 — **선분까지의 거리**다.
 * 선분 길이가 0 이면(아이소) 그냥 아이까지의 거리가 된다.
 */
export function nearGlowDist(
  x: number, z: number,
  p: { cx: number; cz: number; lx: number; lz: number },
): number {
  const px = x - p.cx, pz = z - p.cz;
  const l2 = Math.max(p.lx * p.lx + p.lz * p.lz, 1e-4);
  const t = Math.min(1, Math.max(0, (px * p.lx + pz * p.lz) / l2));
  const dx = px - p.lx * t, dz = pz - p.lz * t;
  return Math.hypot(dx, dz);
}

/**
 * 거리 → 밝기 **세 계단** (1 · 0.7 · 0.4 · 0).
 *
 * 매끄럽게 이으면 블록 경계와 무관하게 밝기가 흘러서 아이 발밑의 둥근 빛
 * 무리가 된다. 켜짐/꺼짐 둘로만 두면 붙어 있는 블록이 전부 같은 밝기라 한 장의
 * 띠로 보인다. 낱낱의 블록으로 읽히려면 이웃끼리 밝기가 달라야 한다.
 */
export function nearGlowLit(d: number, far: number): number {
  return 1
    - (d >= far - 2 ? 0.3 : 0)
    - (d >= far - 1 ? 0.3 : 0)
    - (d >= far ? 0.4 : 0);
}
