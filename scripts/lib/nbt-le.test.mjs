/**
 * NBT 파서 검증. `node scripts/lib/nbt-le.test.mjs`
 *
 * 왕복(write→read) 테스트만 하면 리더와 라이터가 **같은 실수**를 했을 때 통과해버린다.
 * 그래서 스펙을 보고 손으로 계산한 바이트 열로도 검증한다.
 */
import { readNbtLE, writeNbtLE, TAG } from './nbt-le.mjs';
import { readMcStructure, indexToXYZ, xyzToIndex } from './mcstructure.mjs';

let pass = 0, fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a === b) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}\n        got  ${a}\n        want ${b}`); }
};

/* ── 1. 손으로 만든 바이트 열 ────────────────────────────────
 * 0A 00 00                         루트 컴파운드, 이름 ""
 *   03 01 00 61  02 01 00 00       Int    "a" = 258   (0x00000102 리틀엔디안)
 *   08 01 00 62  03 00 68 69 21    String "b" = "hi!"
 *   09 01 00 63  03 02000000 07000000 09000000
 *                                  List<Int> "c" = [7, 9]
 *   00                             END
 */
const handmade = Uint8Array.from([
  0x0a, 0x00, 0x00,
  0x03, 0x01, 0x00, 0x61, 0x02, 0x01, 0x00, 0x00,
  0x08, 0x01, 0x00, 0x62, 0x03, 0x00, 0x68, 0x69, 0x21,
  0x09, 0x01, 0x00, 0x63, 0x03, 0x02, 0x00, 0x00, 0x00,
  0x07, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00,
  0x00,
]);
eq('손계산 바이트 → 파싱', readNbtLE(handmade).value, { a: 258, b: 'hi!', c: [7, 9] });

/* ── 2. 좌표 변환 (ZYX 순서) ────────────────────────────────
 * 스펙: i = SZ*SY*x + SZ*y + z
 */
const size = [2, 3, 4]; // sx=2, sy=3, sz=4
eq('xyzToIndex(0,0,0)', xyzToIndex(0, 0, 0, size), 0);
eq('xyzToIndex(0,0,1)', xyzToIndex(0, 0, 1, size), 1);   // z가 가장 빠르게 변한다
eq('xyzToIndex(0,1,0)', xyzToIndex(0, 1, 0, size), 4);   // y는 sz 만큼
eq('xyzToIndex(1,0,0)', xyzToIndex(1, 0, 0, size), 12);  // x는 sz*sy 만큼
eq('indexToXYZ(13)', indexToXYZ(13, size), [1, 0, 1]);
// 전 좌표 왕복
let roundTripOk = true;
for (let x = 0; x < size[0]; x++)
  for (let y = 0; y < size[1]; y++)
    for (let z = 0; z < size[2]; z++) {
      const [a, b, c] = indexToXYZ(xyzToIndex(x, y, z, size), size);
      if (a !== x || b !== y || c !== z) roundTripOk = false;
    }
eq('좌표 전수 왕복', roundTripOk, true);

/* ── 3. 합성 .mcstructure 를 만들어 디코더에 먹인다 ──────────
 * 2×2×2 짜리. palette: [obsidian, orange_concrete]
 * 아래층(y=0)은 전부 흑요석, 위층(y=1)은 주황 콘크리트 1개 + 나머지 빈칸(-1)
 */
const S = [2, 2, 2];
const idx = new Array(8).fill(-1);
for (let x = 0; x < 2; x++) for (let z = 0; z < 2; z++) idx[xyzToIndex(x, 0, z, S)] = 0;
idx[xyzToIndex(1, 1, 0, S)] = 1;

const paletteEntry = (name) => ({
  name: { __tag: TAG.STRING, value: name },
  states: { __tag: TAG.COMPOUND, value: {} },
  version: { __tag: TAG.INT, value: 18168865 },
});

const synthetic = writeNbtLE('', {
  format_version: { __tag: TAG.INT, value: 1 },
  size: { __tag: TAG.LIST, value: { itemTag: TAG.INT, items: S } },
  structure_world_origin: { __tag: TAG.LIST, value: { itemTag: TAG.INT, items: [10, 64, -20] } },
  structure: {
    __tag: TAG.COMPOUND,
    value: {
      block_indices: {
        __tag: TAG.LIST,
        value: {
          itemTag: TAG.LIST,
          items: [
            { itemTag: TAG.INT, items: idx },
            { itemTag: TAG.INT, items: new Array(8).fill(-1) },
          ],
        },
      },
      entities: { __tag: TAG.LIST, value: { itemTag: TAG.COMPOUND, items: [] } },
      palette: {
        __tag: TAG.COMPOUND,
        value: {
          default: {
            __tag: TAG.COMPOUND,
            value: {
              block_palette: {
                __tag: TAG.LIST,
                value: {
                  itemTag: TAG.COMPOUND,
                  items: [paletteEntry('minecraft:obsidian'), paletteEntry('minecraft:orange_concrete')],
                },
              },
            },
          },
        },
      },
    },
  },
});

const st = readMcStructure(synthetic);
eq('구조 크기', st.size, [2, 2, 2]);
eq('월드 원점', st.origin, [10, 64, -20]);
eq('팔레트 이름', st.palette.map((p) => p.name), ['minecraft:obsidian', 'minecraft:orange_concrete']);
eq('바닥이 흑요석', st.indices[xyzToIndex(0, 0, 0, S)], 0);
eq('위층 주황 콘크리트', st.indices[xyzToIndex(1, 1, 0, S)], 1);
eq('빈칸은 -1', st.indices[xyzToIndex(0, 1, 1, S)], -1);
eq('빈칸 개수', st.indices.filter((v) => v === -1).length, 3);

/* ── 4. 잘못된 입력은 명확히 실패해야 한다 ───────────────── */
const threw = (fn) => { try { fn(); return false; } catch { return true; } };
eq('빈 버퍼 거부', threw(() => readMcStructure(Uint8Array.from([0x08, 0x00, 0x00]))), true);

/* ── 5. crop + RLE ────────────────────────────────────────── */
import { crop, rleEncode, rleDecode } from './mapdata.mjs';

// 4×4×4 안의 구석에 2×1×2 블록만 놓는다 → 잘라내면 2×1×2 가 되어야 한다
const BIG = [4, 4, 4];
const sparse = new Int16Array(64).fill(-1);
for (const [x, z] of [[2, 1], [3, 1], [2, 2], [3, 2]]) sparse[xyzToIndex(x, 1, z, BIG)] = 5;
const c = crop(sparse, BIG);
eq('crop 크기', c.size, [2, 1, 2]);
eq('crop 오프셋', c.offset, [2, 1, 1]);
eq('crop 내용', Array.from(c.indices), [5, 5, 5, 5]);
eq('빈 구조는 거부', threw(() => crop(new Int16Array(8).fill(-1), [2, 2, 2])), true);

const sample = [-1, -1, -1, 3, 3, 7, -1];
eq('RLE 인코딩', rleEncode(sample), [-1, 3, 3, 2, 7, 1, -1, 1]);
eq('RLE 왕복', Array.from(rleDecode(rleEncode(sample))), sample);
// 실제 맵처럼 빈칸이 많은 경우 얼마나 줄어드는지
const bigArr = new Int16Array(64 * 20 * 64).fill(-1);
for (let i = 0; i < bigArr.length; i += 997) bigArr[i] = 1;
const enc = rleEncode(Array.from(bigArr));
eq('RLE 왕복 (대형)', rleDecode(enc).length, bigArr.length);
console.log(`      · 81,920칸 → RLE ${enc.length}개 (${(enc.length / bigArr.length * 100).toFixed(1)}%)`);

console.log(`\n최종 ${pass}/${pass + fail} 통과`);
process.exit(fail ? 1 : 0);
