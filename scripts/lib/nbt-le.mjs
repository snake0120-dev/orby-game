/**
 * 리틀엔디안 NBT 리더/라이터.
 *
 * Bedrock의 `.mcstructure`는 **압축되지 않은 리틀엔디안 NBT**다.
 * (Java판은 빅엔디안 + gzip이라 기존 파서를 그대로 못 쓴다.)
 *
 * 태그 타입:
 *   0 END  1 BYTE  2 SHORT  3 INT  4 LONG  5 FLOAT  6 DOUBLE
 *   7 BYTE_ARRAY  8 STRING  9 LIST  10 COMPOUND  11 INT_ARRAY  12 LONG_ARRAY
 */

export const TAG = {
  END: 0, BYTE: 1, SHORT: 2, INT: 3, LONG: 4, FLOAT: 5, DOUBLE: 6,
  BYTE_ARRAY: 7, STRING: 8, LIST: 9, COMPOUND: 10, INT_ARRAY: 11, LONG_ARRAY: 12,
};

const utf8Decode = new TextDecoder();
const utf8Encode = new TextEncoder();

/**
 * @param {Uint8Array} bytes
 * @returns {{ name: string, value: any }} 루트 컴파운드
 */
export function readNbtLE(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 0;

  const u8 = () => view.getUint8(off++);
  const i8 = () => view.getInt8(off++);
  const i16 = () => { const v = view.getInt16(off, true); off += 2; return v; };
  const u16 = () => { const v = view.getUint16(off, true); off += 2; return v; };
  const i32 = () => { const v = view.getInt32(off, true); off += 4; return v; };
  const i64 = () => { const v = view.getBigInt64(off, true); off += 8; return v; };
  const f32 = () => { const v = view.getFloat32(off, true); off += 4; return v; };
  const f64 = () => { const v = view.getFloat64(off, true); off += 8; return v; };

  const str = () => {
    const len = u16();
    const s = utf8Decode.decode(bytes.subarray(off, off + len));
    off += len;
    return s;
  };

  function payload(type) {
    switch (type) {
      case TAG.BYTE: return i8();
      case TAG.SHORT: return i16();
      case TAG.INT: return i32();
      case TAG.LONG: return i64();
      case TAG.FLOAT: return f32();
      case TAG.DOUBLE: return f64();
      case TAG.BYTE_ARRAY: {
        const n = i32();
        const a = bytes.subarray(off, off + n);
        off += n;
        return a;
      }
      case TAG.STRING: return str();
      case TAG.LIST: {
        const itemType = u8();
        const n = i32();
        const out = new Array(n);
        for (let i = 0; i < n; i++) out[i] = payload(itemType);
        return out;
      }
      case TAG.COMPOUND: {
        const out = {};
        for (;;) {
          const t = u8();
          if (t === TAG.END) break;
          const key = str();
          out[key] = payload(t);
        }
        return out;
      }
      case TAG.INT_ARRAY: {
        const n = i32();
        const a = new Int32Array(n);
        for (let i = 0; i < n; i++) a[i] = i32();
        return a;
      }
      case TAG.LONG_ARRAY: {
        const n = i32();
        const a = new BigInt64Array(n);
        for (let i = 0; i < n; i++) a[i] = i64();
        return a;
      }
      default:
        throw new Error(`알 수 없는 NBT 태그 타입 ${type} (offset ${off - 1})`);
    }
  }

  const rootType = u8();
  if (rootType !== TAG.COMPOUND) {
    throw new Error(`NBT 루트가 컴파운드가 아닙니다 (타입 ${rootType}). .mcstructure 파일이 맞는지 확인하세요.`);
  }
  const name = str();
  return { name, value: payload(TAG.COMPOUND) };
}

/* ── 라이터 (테스트 픽스처 생성용) ─────────────────────────── */

/**
 * 값에서 타입을 추론할 수 없는 경우가 많아서, 테스트에서는
 * `{ __tag: TAG.INT, value: 3 }` 형태로 명시한다.
 */
export function writeNbtLE(rootName, compound) {
  const chunks = [];
  const push = (arr) => chunks.push(arr);

  const num = (bytes, fn) => { const b = new Uint8Array(bytes); fn(new DataView(b.buffer)); push(b); };
  const wU8 = (v) => num(1, (d) => d.setUint8(0, v));
  const wI16 = (v) => num(2, (d) => d.setInt16(0, v, true));
  const wU16 = (v) => num(2, (d) => d.setUint16(0, v, true));
  const wI32 = (v) => num(4, (d) => d.setInt32(0, v, true));
  const wI64 = (v) => num(8, (d) => d.setBigInt64(0, BigInt(v), true));
  const wF32 = (v) => num(4, (d) => d.setFloat32(0, v, true));
  const wF64 = (v) => num(8, (d) => d.setFloat64(0, v, true));
  const wStr = (s) => { const b = utf8Encode.encode(s); wU16(b.length); push(b); };

  function writePayload(tag, value) {
    switch (tag) {
      case TAG.BYTE: return wU8(value & 0xff);
      case TAG.SHORT: return wI16(value);
      case TAG.INT: return wI32(value);
      case TAG.LONG: return wI64(value);
      case TAG.FLOAT: return wF32(value);
      case TAG.DOUBLE: return wF64(value);
      case TAG.STRING: return wStr(value);
      case TAG.BYTE_ARRAY: { wI32(value.length); push(Uint8Array.from(value)); return; }
      case TAG.LIST: {
        // { __tag: LIST, itemTag, items: [...] }
        wU8(value.itemTag);
        wI32(value.items.length);
        for (const it of value.items) writePayload(value.itemTag, it);
        return;
      }
      case TAG.COMPOUND: {
        for (const [k, v] of Object.entries(value)) {
          wU8(v.__tag);
          wStr(k);
          writePayload(v.__tag, v.__tag === TAG.LIST || v.__tag === TAG.COMPOUND ? v.value : v.value);
        }
        wU8(TAG.END);
        return;
      }
      default: throw new Error(`쓸 수 없는 태그 ${tag}`);
    }
  }

  wU8(TAG.COMPOUND);
  wStr(rootName);
  writePayload(TAG.COMPOUND, compound);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}
