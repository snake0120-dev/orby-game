import type { VoxelMap } from './voxelMap';

/**
 * 구역 맵 → **위에서 내려다본 작은 그림.**
 *
 * 그림을 따로 그리지 않는다. 맵이 이미 메모리에 있으니 한 칸에 한 픽셀씩
 * 찍으면 그게 미니맵이다 — **맵을 고치면 미니맵이 따라 바뀐다.** 손으로 그린
 * 그림이면 맵을 고칠 때마다 같이 고쳐야 하고, 한 번 잊으면 거짓말을 하게 된다.
 *
 * ― 색은 네 가지뿐이다 (`ui 가이드` 의 미니맵이 그렇다) ―───────
 *   관문      주황    여기로 가면 다음 구역이다
 *   열린 길   흰색    걸을 수 있고 **머리 위에 아무것도 없는** 칸
 *   덮인 것   민트    지붕·벽·기둥 — 위에서 보면 덩어리로 보이는 것
 *   빈칸      투명    바탕색이 비친다
 *
 * **"걸을 수 있나"가 아니라 "위에서 보면 뭐가 보이나"로 가른다.** 처음엔 걸을
 * 수 있는 칸을 전부 흰색으로 칠했더니 2구역이 통째로 하얘졌다 — 심사장 안도
 * 바닥이라 걸을 수 있기 때문이다. 가이드의 미니맵은 **심사장 지붕이 민트
 * 덩어리**로 보이고 그 옆 열린 복도만 흰 띠다. 위에서 내려다본 그림이니
 * 그게 맞다.
 *
 * 유리는 **덮은 것으로 안 친다** — 유리 지붕 아래 통로는 위에서도 길로 보인다.
 *
 * 블록 색을 그대로 쓰지 않는 이유: 맵에는 살구·유리·콘크리트가 섞여 있어서
 * 그대로 찍으면 **얼룩덜룩해서 길이 안 읽힌다.** 미니맵은 그림이 아니라
 * "어디로 갈 수 있나" 한 가지를 답하는 물건이다.
 *
 * 구역마다 **한 번만** 부른다 (`MiniMap` 이 useMemo 로 쥔다). 100×134 칸이라
 * 만 삼천 번 도는데, 걷는 동안 다시 돌 일이 없으니 비용이 아니다.
 */

/** 미니맵 색 — `index.css` 의 `--ui-*` 와 같은 값이어야 한다 */
const 관문 = [243, 151, 0, 255];
const 길 = [255, 255, 255, 255];
const 구조물 = [0, 191, 181, 255];

export function miniMapImage(map: VoxelMap): ImageData {
  const { w, d, h, cells, colors, translucent, walkY, gate } = map;
  const img = new ImageData(w, d);
  const out = img.data;

  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const flat = z * w + x;

      /* 위에서 내려다본다 — **제일 높은 블록**이 보이는 블록이다.
         `colors` 가 null 인 칸은 마커·공기라 세지 않고(`voxelMap`),
         유리는 비쳐 보이므로 덮은 것으로 안 친다. */
      let top = -1;
      for (let y = h - 1; y >= 0; y--) {
        const p = cells[x * h * d + y * d + z];
        if (p >= 0 && colors[p] && !translucent[p]) { top = y; break; }
      }

      /* 아이가 밟는 바닥은 `walkY - 1` 에 있다 (`DevReadout` 과 같은 규칙).
         제일 위 블록이 바로 그 바닥이면 **머리 위가 트여 있다** = 열린 길. */
      const foot = walkY[flat];
      let c: number[] | null = null;
      if (gate[flat]) c = 관문;
      else if (foot >= 0 && top < foot) c = 길;
      else if (top >= 0) c = 구조물;

      if (!c) continue;
      const o = flat * 4;
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = c[3];
    }
  }
  return img;
}

/**
 * 내용을 `deg` 만큼 돌렸을 때, **정사각 틀 안에 들어가게 하는 축척.**
 *
 * 미니맵을 화면 방향에 맞추면(아이소는 45°) 지도가 비스듬히 선다. 그대로 두면
 * 네 귀퉁이가 틀 밖으로 잘려서 맵 끝이 안 보인다 — 돌린 만큼 줄여야 한다.
 *
 * `a`, `b` 는 세로·가로 비율(0~1). 돌린 사각형의 바깥 상자는
 * `a·|cos| + b·|sin|` 이고, 두 변 중 긴 쪽에 맞춘다.
 */
export function fitRotated(a: number, b: number, deg: number): number {
  const r = (deg * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return 1 / Math.max(a * c + b * s, a * s + b * c);
}
