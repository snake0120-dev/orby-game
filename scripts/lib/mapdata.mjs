import { xyzToIndex } from './mcstructure.mjs';

/** 값이 반복되는 구간을 [값, 개수] 쌍으로 접는다. 복셀 맵은 빈칸이 많아 크게 줄어든다. */
export function rleEncode(arr) {
  if (arr.length === 0) return [];
  const out = [];
  let prev = arr[0], run = 0;
  for (const v of arr) {
    if (v === prev) run++;
    else { out.push(prev, run); prev = v; run = 1; }
  }
  out.push(prev, run);
  return out;
}

export function rleDecode(rle) {
  let total = 0;
  for (let i = 1; i < rle.length; i += 2) total += rle[i];
  const out = new Int16Array(total);
  let o = 0;
  for (let i = 0; i < rle.length; i += 2) {
    out.fill(rle[i], o, o + rle[i + 1]);
    o += rle[i + 1];
  }
  return out;
}

/** 실제로 블록이 있는 범위만 남긴다. 64×64로 잡아놓고 구석에만 지어도 낭비가 없다. */
export function crop(indices, [sx, sy, sz]) {
  let x0 = sx, y0 = sy, z0 = sz, x1 = -1, y1 = -1, z1 = -1;
  for (let x = 0; x < sx; x++)
    for (let y = 0; y < sy; y++)
      for (let z = 0; z < sz; z++) {
        if (indices[xyzToIndex(x, y, z, [sx, sy, sz])] < 0) continue;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (z < z0) z0 = z; if (z > z1) z1 = z;
      }
  if (x1 < 0) {
    throw new Error('구조 안에 블록이 하나도 없습니다. 구조 블록 범위가 빈 곳을 잡았을 수 있습니다.');
  }

  const w = x1 - x0 + 1, h = y1 - y0 + 1, d = z1 - z0 + 1;
  const out = new Int16Array(w * h * d);
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++)
      for (let z = 0; z < d; z++) {
        out[xyzToIndex(x, y, z, [w, h, d])] =
          indices[xyzToIndex(x + x0, y + y0, z + z0, [sx, sy, sz])];
      }
  return { size: [w, h, d], indices: out, offset: [x0, y0, z0] };
}
