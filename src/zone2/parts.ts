import { compileVoxelMap, type VoxelMap } from '../engine/voxelMap';
import { blockKey, parseBlockKey, type BlockEdits } from '../game/brushStore';
import { MARK_DEFAULT, type Mark } from '../game/markStore';

/**
 * 2구역 맵을 **개체 단위로** 읽고 다시 합친다.
 *
 * 생성기(`scripts/make-zone2.mjs`)가 `immigration-parts.json` 에
 * **바탕(판)** 과 **개체 목록** 을 따로 담아 둔다. 여기서 둘을 합치면서
 * 패널이 옮긴 만큼 자리를 밀고, 지운 개체는 건너뛴다.
 *
 * 왜 브라우저에서 합치나 — 맵은 한 덩어리로 구워진 복셀이라, 다 구워진 뒤에는
 * "부스 하나만 두 칸 옮기기"가 불가능하다. 개체를 따로 들고 있다가 합쳐야
 * 패널에서 바로바로 움직여 볼 수 있다.
 */
export interface PartDef {
  id: string;
  no: number;
  kind: string;
  label: string;
  /** 바탕 좌표에서 이 개체가 놓인 자리 (최소 모서리) */
  at: [number, number, number];
  size: [number, number, number];
  rle: number[];
  /** 양탄자를 깔면 안 되는 바닥 칸 (개체 기준 상대 좌표 x0,z0,x1,z1) */
  blocked: [number, number, number, number] | null;
}

/** 손으로 놓은(또는 지운) 블록 한 칸 — `block: null` 은 지운 칸이다 */
export interface HandBlock {
  at: [number, number, number];
  block: string | null;
}

export interface PartsFile {
  /** 개체 자리의 지문 — 생성기에 값을 반영하면 바뀐다 */
  stamp: string;
  size: [number, number, number];
  palette: string[];
  /** 판 맨 윗단의 y — 이 위가 걷는 높이다 */
  floorTop: number;
  walk: string;
  spawn: [number, number, number];
  gate: [number, number, number][];
  base: number[];
  parts: PartDef[];
  /**
   * 생성기가 이미 **구워 넣은** 손 블록 (`zone2-edits.json` 에서 읽어 온 것).
   *
   * 바탕에 섞지 않고 따로 들고 있는 이유: 개체보다 **나중에** 얹혀야 한다.
   * 바탕에 섞으면 부스를 옮겼을 때 손으로 놓은 블록이 부스에 덮인다.
   */
  handBlocks?: HandBlock[];
}

/** 개체마다의 편집 — 밀어낸 칸 수와 숨김 여부 */
export interface PartEdit {
  d?: [number, number, number];
  hidden?: boolean;
}
export type Edits = Record<string, PartEdit>;

/** 화면 전체에 걸리는 값 — 비어 있으면 스테이지 파일 값을 그대로 쓴다 */
export interface ViewTune {
  cameraPadding?: number;
  characterScale?: number;
  gradLow?: string;
  gradLowMix?: number;
  gradHigh?: string;
  gradHighMix?: number;
  gradFloor?: number;
  gradSpan?: number;
  /** 카메라를 화면 기준으로 민 거리 (블록) */
  panX?: number;
  panY?: number;
  /** 아이의 1인칭 눈으로 볼 것인가 */
  fpv?: boolean;
  /** 그림자를 드리울 것인가 */
  shadows?: boolean;
  /** 빛길이 아이 둘레로 켜지는 반경 (칸) */
  pathRadius?: number;
  glowRadius?: number;
}

/* 풀어 둔 결과를 들고 있는다. 개체를 한 칸 밀 때마다 바탕 56만 칸과 개체
   열아홉 벌을 다시 푸는 건 그대로 멈칫거림이 된다. */
const cache = new WeakMap<number[], Int16Array>();
const decode = (rle: number[]): Int16Array => {
  let v = cache.get(rle);
  if (!v) { v = rleDecode(rle); cache.set(rle, v); }
  return v;
};

const rleDecode = (rle: number[]): Int16Array => {
  let n = 0;
  for (let i = 1; i < rle.length; i += 2) n += rle[i];
  const out = new Int16Array(n);
  let p = 0;
  for (let i = 0; i < rle.length; i += 2) out.fill(rle[i], p, (p += rle[i + 1]));
  return out;
};

export async function loadParts(): Promise<PartsFile> {
  const bust = import.meta.env.DEV ? `?t=${Date.now()}` : '';
  const url = `${import.meta.env.BASE_URL}maps/immigration-parts.json${bust}`;
  const res = await fetch(url, import.meta.env.DEV ? { cache: 'no-store' } : undefined);
  if (!res.ok) {
    throw new Error(
      '개체 파일을 못 찾았습니다: maps/immigration-parts.json\n' +
        "  'npm run map:zone2' 을 먼저 돌리세요.",
    );
  }
  return res.json();
}

/** 개체가 지금 놓인 자리 (편집 반영) */
export const placedAt = (p: PartDef, e: Edits): [number, number, number] => {
  const d = e[p.id]?.d ?? [0, 0, 0];
  return [p.at[0] + d[0], p.at[1] + d[1], p.at[2] + d[2]];
};

/**
 * 바탕 + 개체를 합쳐 맵 하나로 만든다.
 *
 * **양탄자는 여기서 다시 깐다.** 생성기가 구워 넣은 걸 그대로 쓰면, 부스를
 * 옮겼을 때 옛 자리에 양탄자가 남고 새 자리는 벽 밑으로 깔려서 길이 엉킨다.
 * 규칙은 생성기와 같다 — 판 윗면이 있고 그 위가 비었으면 걸을 수 있다.
 */
export function compose(f: PartsFile, edits: Edits, hand: BlockEdits = {}): VoxelMap {
  const [W, H, D] = f.size;
  const idx = (x: number, y: number, z: number) => x * H * D + y * D + z;
  const cells = decode(f.base).slice();   // 바탕은 캐시에서 복사만 한다

  /* 팔레트는 **늘어날 수 있다.** 붓으로 이 구역에 없던 블록을 놓으면
     이름을 뒤에 붙인다 — 맵 파일을 다시 굽지 않아도 바로 보인다. */
  const palette = f.palette.slice();
  const idOf = (name: string) => {
    const i = palette.indexOf(name);
    return i >= 0 ? i : palette.push(name) - 1;
  };

  const blocks: [number, number, number, number][] = [];
  for (const p of f.parts) {
    if (edits[p.id]?.hidden) continue;
    const [ax, ay, az] = placedAt(p, edits);
    const buf = decode(p.rle);
    const [sw, sh, sd] = p.size;
    for (let x = 0; x < sw; x++) {
      const wx = ax + x;
      if (wx < 0 || wx >= W) continue;
      for (let y = 0; y < sh; y++) {
        const wy = ay + y;
        if (wy < 0 || wy >= H) continue;
        for (let z = 0; z < sd; z++) {
          const wz = az + z;
          if (wz < 0 || wz >= D) continue;
          const v = buf[x * sh * sd + y * sd + z];
          if (v >= 0) cells[idx(wx, wy, wz)] = v;
        }
      }
    }
    if (p.blocked) {
      blocks.push([ax + p.blocked[0], az + p.blocked[1], ax + p.blocked[2], az + p.blocked[3]]);
    }
  }

  /* ── 손으로 놓은 블록 ───────────────────────────────────
     **개체 다음, 양탄자 앞**이다. 개체 다음이라야 부스 위에 창틀 한 칸을 얹을
     수 있고, 양탄자 앞이라야 놓은 블록 위로 걷는 칸이 안 깔린다.
     생성기가 이미 구운 것(`f.handBlocks`)을 먼저, 아직 안 구운 것(`hand`)을
     그 위에 얹는다 — 같은 칸이면 지금 손에 든 쪽이 이긴다. */
  const putHand = (at: [number, number, number], name: string | null) => {
    const [x, y, z] = at;
    if (x < 0 || y < 0 || z < 0 || x >= W || y >= H || z >= D) return;
    cells[idx(x, y, z)] = name === null ? -1 : idOf(name);
  };
  for (const h of f.handBlocks ?? []) putHand(h.at, h.block);
  for (const [key, name] of Object.entries(hand)) putHand(parseBlockKey(key), name);

  const walkId = palette.indexOf(f.walk);
  const Y = f.floorTop + 1;
  if (walkId >= 0 && Y < H) {
    for (let x = 0; x < W; x++)
      for (let z = 0; z < D; z++) {
        if (cells[idx(x, f.floorTop, z)] < 0) continue;
        if (cells[idx(x, Y, z)] >= 0) continue;
        cells[idx(x, Y, z)] = walkId;
      }
    for (const [x0, z0, x1, z1] of blocks)
      for (let x = Math.max(0, x0); x <= Math.min(W - 1, x1); x++)
        for (let z = Math.max(0, z0); z <= Math.min(D - 1, z1); z++)
          if (cells[idx(x, Y, z)] === walkId) cells[idx(x, Y, z)] = -1;
  }

  /* 시작·관문 자리는 **맨 마지막**이다. 붓으로 그 위에 뭘 놓아도 자리는 남는다 —
     지워 버리면 아이가 설 곳이 없어 구역이 열리지 않는다. */
  const mark = (p: [number, number, number], name: string) => {
    cells[idx(p[0], p[1], p[2])] = idOf(name);
  };
  mark(f.spawn, 'minecraft:lime_carpet');
  for (const g of f.gate) mark(g, 'minecraft:red_carpet');

  return compileVoxelMap({
    source: '(개체 패널)', structure: 'immigration',
    size: f.size, palette, rle: [], cells,
  });
}

/**
 * 맞춘 자리를 **프로젝트 폴더의 `zone2-edits.json` 에 적는다** (개발 서버에서만).
 *
 * 패널 값은 브라우저 저장소에만 남아서, 넘기려면 사람이 복사해 붙여야 했다.
 * 보고 있는 브라우저와 확인용 헤드리스 브라우저는 저장소가 따로라 그 복사를
 * 건너뛸 방법이 없었다 — 파일로 떨어뜨리면 둘 다 같은 걸 본다.
 * 받는 쪽은 `vite.config.ts` 의 `zone2Edits` 플러그인.
 */
/** 개발 서버의 편집 파일 창구 (`vite.config.ts` 의 `zoneEdits`) */
const EDITS_URL = '/__zone2-edits';

/** 파일에서 읽어 온 편집 — 브라우저 저장소보다 **이쪽이 우선**이다 */
export interface SavedEdits {
  stamp: string | null;
  parts: Edits;
  blocks: BlockEdits;
  view: ViewTune;
  /** 떠 있는 별 표식. `null` 이면 파일에 적힌 적이 없다 — 스테이지 기본값을 쓴다. */
  marks: Mark[] | null;
}

/**
 * **프로젝트 폴더의 `zone2-edits.json` 을 읽어 온다** (개발 서버에서만).
 *
 * 패널 값이 브라우저 저장소에만 있으면 **창마다 다른 걸 본다** — 천우태가
 * 보는 크롬과 미리보기 창과 확인용 헤드리스가 전부 저장소가 따로다.
 * "웹에서 블록을 놓았는데 다른 창에서는 안 보인다"가 정확히 그거였다.
 * 그래서 파일을 한 군데 두고 셋 다 그걸 읽는다.
 *
 * 개체를 **민 거리**는 지문이 같을 때만 쓴다. 지문이 달라졌다는 건 생성기가
 * 그 값을 이미 반영했다는 뜻이라, 또 밀면 두 배로 밀린다(결정 ㉔).
 * 손으로 놓은 블록은 **절대 좌표**라 두 번 적용돼도 결과가 같다 — 그래서
 * 지문과 상관없이 항상 쓴다.
 */
export async function loadEdits(stamp: string): Promise<SavedEdits | null> {
  if (!import.meta.env.DEV) return null;
  let saved: Record<string, unknown>;
  try {
    const res = await fetch(EDITS_URL, { cache: 'no-store' });
    if (!res.ok) return null;
    saved = (await res.json()) as Record<string, unknown>;
  } catch {
    return null;   // 개발 서버가 아니거나 아직 저장한 적이 없다
  }

  const blocks: BlockEdits = {};
  for (const h of (saved.손블록 ?? []) as { 자리: number[]; 블록?: string; 지움?: boolean }[]) {
    if (!Array.isArray(h.자리) || h.자리.length !== 3) continue;
    blocks[blockKey(h.자리[0], h.자리[1], h.자리[2])] = h.지움 ? null : h.블록 ?? null;
  }

  const parts: Edits = {};
  const fileStamp = (saved.지문 as string) ?? null;
  if (fileStamp === stamp) {
    for (const q of (saved.바뀐개체 ?? []) as { id: string; 민칸: [number, number, number]; 지움: boolean }[]) {
      if (!q?.id) continue;
      parts[q.id] = { d: q.민칸, hidden: q.지움 };
    }
  }

  /* 표식은 **지문을 안 본다.** 블록이 아니라 그려 넣는 것이라, 생성기가
     구워 넣는 일이 없어서 두 번 적용될 걱정이 없다. */
  const rawMarks = saved.표식 as { id?: string; 자리?: number[]; 높이?: number; 크기?: number }[] | undefined;
  const marks = rawMarks
    ? rawMarks
      .filter((m) => m?.id && Array.isArray(m.자리) && m.자리.length === 2)
      .map((m) => ({
        id: m.id!,
        at: [m.자리![0], m.자리![1]] as [number, number],
        height: m.높이 ?? MARK_DEFAULT.height,
        scale: m.크기 ?? MARK_DEFAULT.scale,
      }))
    : null;

  return {
    stamp: fileStamp, parts, blocks, marks,
    view: (saved.전체뷰 ?? {}) as ViewTune,
  };
}

export async function saveToFile(
  f: PartsFile, edits: Edits, view: ViewTune, hand: BlockEdits = {}, marks: Mark[] = [],
): Promise<void> {
  const moved = f.parts.map((p) => {
    const e = edits[p.id];
    const d = e?.d ?? [0, 0, 0];
    if (!e || (!e.hidden && !d[0] && !d[1] && !d[2])) return null;
    return {
      id: p.id, label: p.label, kind: p.kind,
      지움: !!e.hidden,
      처음자리: p.at,
      지금자리: placedAt(p, edits),
      민칸: d,
    };
  }).filter(Boolean);

  /* 손으로 놓은 블록. **생성기가 이걸 그대로 읽어 굽는다**
     (`scripts/make-zone2.mjs`) — 백 칸을 사람이 옮겨 적을 수는 없다. */
  const handBlocks = Object.entries(hand).map(([key, block]) => {
    const [x, y, z] = parseBlockKey(key);
    return block === null ? { 자리: [x, y, z], 지움: true } : { 자리: [x, y, z], 블록: block };
  });

  const res = await fetch(EDITS_URL, {
    method: 'POST',
    body: JSON.stringify(
      {
        적은때: new Date().toISOString(), 지문: f.stamp, 전체뷰: view,
        바뀐개체: moved, 손블록: handBlocks,
        표식: marks.map((m) => ({ id: m.id, 자리: m.at, 높이: m.height, 크기: m.scale })),
      },
      null, 2,
    ),
  });
  if (!res.ok) throw new Error(`저장 실패 (${res.status})`);
}

/** 패널에서 옮긴 자리를 생성기에 붙여 넣을 코드 조각으로 */
export function toSnippet(f: PartsFile, edits: Edits): string {
  const lines = ['// 개체 패널에서 옮긴 자리 — scripts/make-zone2.mjs 의 값에 반영하세요'];
  let n = 0;
  for (const p of f.parts) {
    const e = edits[p.id];
    if (!e) continue;
    if (e.hidden) { lines.push(`${p.label}  → 지움`); n++; continue; }
    const d = e.d ?? [0, 0, 0];
    if (!d[0] && !d[1] && !d[2]) continue;
    const a = placedAt(p, edits);
    lines.push(`${p.label}  x ${a[0]} · y ${a[1]} · z ${a[2]}   (${d[0] >= 0 ? '+' : ''}${d[0]}, ${d[1] >= 0 ? '+' : ''}${d[1]}, ${d[2] >= 0 ? '+' : ''}${d[2]})`);
    n++;
  }
  return n ? lines.join('\n') : '바꾼 개체가 없습니다.';
}
