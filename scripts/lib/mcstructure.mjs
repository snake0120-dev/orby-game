import { readNbtLE } from './nbt-le.mjs';

/**
 * `.mcstructure` (Bedrock 구조 파일) 디코더.
 *
 * 구조 (bedrock wiki 기준):
 *   format_version        : Int
 *   size                  : List<Int>[3]  — [X, Y, Z]
 *   structure_world_origin: List<Int>[3]
 *   structure
 *     ├ block_indices     : List<List<Int>>[2]   레이어 2개 (0번이 주 레이어)
 *     ├ entities          : List
 *     └ palette.default
 *         ├ block_palette : List<Compound{ name, states, version }>
 *         └ block_position_data
 *
 * 인덱스는 ZYX 순서다:  i = SZ*SY*x + SZ*y + z
 * 값 -1 은 "구조 빈칸(structure void)" — 블록 없음.
 */
export function readMcStructure(bytes) {
  const { value: root } = readNbtLE(bytes);

  const size = root.size;
  if (!Array.isArray(size) || size.length !== 3) {
    throw new Error('size 태그가 없거나 형식이 다릅니다. .mcstructure 파일이 맞습니까?');
  }
  const structure = root.structure;
  if (!structure) throw new Error('structure 태그가 없습니다.');

  const layers = structure.block_indices;
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new Error('block_indices 가 없습니다.');
  }

  const palette = structure.palette?.default?.block_palette;
  if (!Array.isArray(palette)) throw new Error('palette.default.block_palette 가 없습니다.');

  const [sx, sy, sz] = size;
  const expected = sx * sy * sz;
  if (layers[0].length !== expected) {
    throw new Error(
      `블록 개수가 안 맞습니다: ${layers[0].length}개인데 size ${sx}×${sy}×${sz} = ${expected}개여야 합니다.`,
    );
  }

  return {
    size: [sx, sy, sz],
    origin: root.structure_world_origin ?? [0, 0, 0],
    /** 주 레이어. 인덱스는 palette 참조, -1은 빈칸 */
    indices: layers[0],
    /** 보조 레이어(주로 물). 있으면 배열, 없으면 null */
    indices2: layers[1] ?? null,
    /** [{ name: 'minecraft:obsidian', states: {...} }, ...] */
    palette: palette.map((p) => ({ name: p.name, states: p.states ?? {} })),
  };
}

/** 배열 인덱스 → [x, y, z] */
export const indexToXYZ = (i, [, sy, sz]) => [
  Math.floor(i / (sz * sy)),
  Math.floor(i / sz) % sy,
  i % sz,
];

/** [x, y, z] → 배열 인덱스 */
export const xyzToIndex = (x, y, z, [, sy, sz]) => sz * sy * x + sz * y + z;
