import type { VoxelMap } from './voxelMap';

/**
 * 구역 맵 → **위에서 내려다본 작은 그림.**
 *
 * 그림을 따로 그리지 않는다. 맵이 이미 메모리에 있으니 한 칸에 한 픽셀씩
 * 찍으면 그게 미니맵이다 — **맵을 고치면 미니맵이 따라 바뀐다.** 손으로 그린
 * 그림이면 맵을 고칠 때마다 같이 고쳐야 하고, 한 번 잊으면 거짓말을 하게 된다.
 *
 * ― **천장을 걷어내고 위에서 본 평면도다** ―──────────────────
 *   관문      주황    여기로 가면 다음 구역이다
 *   안내 길   호박    바닥에 깔린 **발광석** — 따라가면 되는 길
 *   바닥      흰색    아이가 걸을 수 있는 나머지 칸
 *   벽        민트    못 걷는 데 서 있는 것 — 벽·기둥·가구
 *   빈칸      투명    바탕색이 비친다
 *
 * **빛길은 맵에 이미 깔려 있다.** 3D 화면에서는 발밑이 빛나서 어디로 가야
 * 하는지 알려주는데, 미니맵에 없으면 미니맵만 보고는 길을 못 찾는다.
 *
 * 따로 그려 넣지 않고 **스테이지의 `pathGlow` 블록**(2·3구역 모두
 * `minecraft:ochre_froglight`)이 발밑에 깔렸는지만 본다 — 3D 쪽 빛길과
 * **같은 한 값**을 보므로, 천우태가 맵에 더 깔면 미니맵에도 그대로 따라 나온다.
 *
 * **빛길은 밟는 블록이 아니라 그 아래 묻혀 있다.** 2구역을 세어 보니 걷는
 * 양탄자 마커에서 정확히 **두 칸 아래**였다 (935칸 전부). 그래서 발밑 한 칸만
 * 보면 하나도 안 잡힌다 — 두 칸까지 내려본다.
 *
 * `emissive` 로 가르면 안 된다 — 사인·난간에 박힌 글로스톤까지 길로 잡힌다
 * (`BlockLights` 가 같은 이유로 그걸 가려낸다).
 *
 * 처음엔 "위에서 보면 뭐가 보이나"로 그렸다 — 심사장 **지붕**이 민트 덩어리로
 * 덮여서 그 안이 어떻게 생겼는지 전혀 안 보였다. 미니맵은 풍경이 아니라
 * **"어디로 갈 수 있나"를 답하는 물건**이라, 천장을 걷어내고 바닥을 보여준다.
 *
 * ― 천장을 어떻게 걷어내나 ―────────────────────────────────
 * 못 걷는 칸의 블록을 셀 때 **걸을 수 있는 가장 높은 바닥보다 세 칸 위까지만**
 * 본다. 그보다 높은 것은 지붕·보·조명이라 평면도에 그리면 안 된다. 유리도
 * 안 친다 — 유리 칸막이를 벽으로 그리면 길이 막혀 보인다.
 *
 * 블록 색을 그대로 쓰지 않는 이유: 맵에는 살구·유리·콘크리트가 섞여 있어서
 * 그대로 찍으면 **얼룩덜룩해서 길이 안 읽힌다.**
 *
 * 구역마다 **한 번만** 부른다 (`MiniMap` 이 useMemo 로 쥔다). 100×134 칸이라
 * 만 삼천 번 도는데, 걷는 동안 다시 돌 일이 없으니 비용이 아니다.
 */

/** 미니맵 색 — `index.css` 의 `--ui-*` 와 같은 값이어야 한다 */
const 관문 = [243, 151, 0, 255];
/* 발광석 길. 관문 주황보다 밝은 호박색이라 **흰 바닥 위에서도 읽히고**
   관문과도 구별된다 — 둘 다 주황이면 "여기가 끝인가" 싶어진다. */
const 안내길 = [246, 195, 67, 255];
const 바닥 = [255, 255, 255, 255];
const 벽 = [0, 191, 181, 255];

/** 바닥보다 몇 칸 위까지를 "벽"으로 볼 것인가. 그 위는 천장이다. */
const 벽높이 = 3;

/** 빛길을 찾아 내려가는 깊이. 재 보니 걷는 높이에서 두 칸 아래에 묻혀 있다. */
const 빛길깊이 = 2;

export function miniMapImage(map: VoxelMap, pathGlow?: string): ImageData {
  const { w, d, h, cells, colors, translucent, walkY, gate } = map;
  /** 빛길 블록의 팔레트 자리. 맵마다 번호가 달라서 이름으로 찾는다. */
  const 빛길 = pathGlow ? map.palette.indexOf(pathGlow) : -1;
  const img = new ImageData(w, d);
  const out = img.data;

  /* **천장을 자를 높이.** 걸을 수 있는 제일 높은 바닥보다 세 칸 위. 층이 여럿인
     구역(3구역)이면 위층 바닥까지 포함되므로, 거기 선 벽도 같이 그려진다. */
  let ceiling = 0;
  for (let i = 0; i < walkY.length; i++) if (walkY[i] > ceiling) ceiling = walkY[i];
  ceiling = Math.min(h - 1, ceiling + 벽높이);

  for (let z = 0; z < d; z++) {
    for (let x = 0; x < w; x++) {
      const flat = z * w + x;

      let c: number[] | null = null;
      const foot = walkY[flat];
      if (gate[flat]) c = 관문;
      else if (foot >= 0) {
        /* 밟는 블록(`walkY - 1`)부터 그 아래까지 내려보며 빛길을 찾는다. */
        c = 바닥;
        if (빛길 >= 0) {
          for (let k = 1; k <= 빛길깊이; k++) {
            const y = foot - k;
            if (y < 0) break;
            if (cells[x * h * d + y * d + z] === 빛길) { c = 안내길; break; }
          }
        }
      } else {
        /* 못 걷는 칸. **천장 아래에** 속이 찬 블록이 하나라도 있으면 벽이다.
           `colors` 가 null 인 칸은 마커·공기라 세지 않고(`voxelMap`),
           유리는 길을 막아 보이게 하므로 안 친다. */
        for (let y = 0; y <= ceiling; y++) {
          const p = cells[x * h * d + y * d + z];
          if (p >= 0 && colors[p] && !translucent[p]) { c = 벽; break; }
        }
      }

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
