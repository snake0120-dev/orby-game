import * as THREE from 'three';
import { create } from 'zustand';
import type { PaintFn, Tint } from '../engine/voxelGeometry';
import type { PaintDef } from './types';

/**
 * 화면 톤을 손으로 맞춰보는 개발용 상태.
 *
 * 색·크기는 코드에 상수로 박혀 있어서, 값을 하나 바꿔 보려면 매번 파일을 열고
 * 저장하고 새로고침해야 했다. 디자이너가 눈으로 맞춰야 하는 값들이라 그 왕복이
 * 제일 비싸다. 슬라이더로 즉시 보고, 마음에 드는 값이 나오면 **코드 조각을
 * 복사해서** 스테이지 파일에 붙이는 흐름으로 만든다.
 *
 * 전시 빌드에는 패널이 붙지 않는다. 이 스토어의 값은 전부 기본값 그대로다.
 */

/** 블록 색을 통째로 물들이는 템플릿. 색상 방향만 정하고 세기는 슬라이더가 맡는다. */
export interface ColorTemplate {
  key: string;
  label: string;
  hint: string;
  apply: (c: THREE.Color, hsl: { h: number; s: number; l: number }) => void;
}

export const COLOR_TEMPLATES: ColorTemplate[] = [
  {
    key: 'original',
    label: '원본',
    hint: '마인크래프트에서 본 색 그대로',
    apply: () => {},
  },
  {
    key: 'mono',
    label: '모노톤',
    hint: '색을 빼고 명암만 남긴다',
    apply: (c, hsl) => c.setHSL(hsl.h, 0, hsl.l),
  },
  {
    key: 'pastel',
    label: '파스텔',
    hint: '밝게 띄우고 채도를 낮춘다 (Monument Valley 쪽)',
    apply: (c, hsl) => c.setHSL(hsl.h, hsl.s * 0.55, Math.min(1, hsl.l * 1.12 + 0.08)),
  },
  {
    key: 'warm',
    label: '따뜻하게',
    hint: '색조를 주황 쪽으로 당긴다',
    apply: (c, hsl) => c.setHSL(shiftHue(hsl.h, 0.08, 0.18), hsl.s * 1.15 + 0.04, hsl.l),
  },
  {
    key: 'cool',
    label: '차갑게',
    hint: '색조를 청록 쪽으로 당긴다',
    apply: (c, hsl) => c.setHSL(shiftHue(hsl.h, 0.52, 0.18), hsl.s * 1.15 + 0.04, hsl.l),
  },
  {
    key: 'contrast',
    label: '고대비',
    hint: '밝은 건 더 밝게, 어두운 건 더 어둡게',
    apply: (c, hsl) => c.setHSL(hsl.h, hsl.s, clamp01((hsl.l - 0.5) * 1.5 + 0.5)),
  },
];

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** 색조를 target 쪽으로 amount 만큼 당긴다 (0~1 원형 좌표) */
function shiftHue(h: number, target: number, amount: number): number {
  let diff = target - h;
  if (diff > 0.5) diff -= 1;
  if (diff < -0.5) diff += 1;
  return (h + diff * amount + 1) % 1;
}

/**
 * 개체 하나를 **직접 칠하는** 설정.
 *
 * 여기까지 오기 전에는 색이 마인크래프트 블록에서만 나왔다. 블록으로 낼 수 없는
 * 색을 쓰려면 마인크래프트로 돌아가 다시 지어야 했다는 뜻이다.
 *
 * 아이소 화면에는 한 블록의 **세 면**만 보인다 — 윗면(+Y) · 왼쪽(+Z) · 오른쪽(+X).
 * 그래서 개체 하나에 색 세 개면 충분하고, 그 셋을 벌려 잡는 것만으로 조명 없이도
 * 입체가 선다. Monument Valley 의 면 처리가 정확히 이 방식이다.
 */
export type PaintMode = 'off' | 'on';

/**
 * 면 하나의 색.
 *
 * 그라디언트는 **면마다 따로 켠다.** 개체 전체에 한 번 거는 것과 다르다 —
 * 윗면만 물들이고 옆면은 단색으로 두는 식의 조합이 실제로 필요하다.
 * 켜면 `color` 가 위쪽, `gradTo` 가 아래쪽이고 개체 높이를 따라 섞인다.
 */
export interface FacePaint {
  color: string;
  /** 이 면에 그라디언트를 걸지 */
  grad: boolean;
  /** 그라디언트 아래쪽 색 */
  gradTo: string;
}

export interface PaintTune {
  mode: PaintMode;
  /** 아이소에서 보이는 세 면 */
  top: FacePaint;
  left: FacePaint;
  right: FacePaint;
}

export const PAINT_MODES: { key: PaintMode; label: string; hint: string }[] = [
  { key: 'off', label: '원본', hint: '마인크래프트 블록 색 그대로' },
  { key: 'on', label: '직접 칠하기', hint: '윗면·왼쪽·오른쪽을 따로 칠한다' },
];

export const DEFAULT_PAINT: PaintTune = {
  mode: 'off',
  top: { color: '#efefef', grad: false, gradTo: '#c6cbd1' },
  left: { color: '#c6cbd1', grad: false, gradTo: '#6f7a86' },
  right: { color: '#9aa3ac', grad: false, gradTo: '#4a5058' },
};

/** 스테이지 파일의 `paint:` → 패널 값. 빠진 칸은 기본값으로 채운다. */
export function paintFromDef(d: PaintDef): PaintTune {
  return {
    mode: d.mode,
    top: { ...DEFAULT_PAINT.top, ...d.top },
    left: { ...DEFAULT_PAINT.left, ...d.left },
    right: { ...DEFAULT_PAINT.right, ...d.right },
  };
}

/** 배경 구조물 하나의 조절값 */
export interface ObjTune {
  x: number;
  y: number;
  z: number;
  /** Y축 회전(도). 개체 한가운데가 축이라, 돌려도 제자리에 있는다. */
  rotation: number;
  scale: number;
  saturation: number;
  brightness: number;
  haze: number;
  /** 불투명도. 구름을 옅게 깔 때 쓴다 */
  opacity: number;
  /** 이 구조물 안 조명 블록의 세기 (0 이면 광원 없음) */
  lightIntensity: number;
  /** 도달 거리 (블록) */
  lightDistance: number;
  lightColor: string;
  /** 이 구조물만의 부유 폭·속도. 비우면 전역 값을 쓴다. */
  floatAmp?: number;
  floatSpeed?: number;
}

/** 배경이 아닌 고정 대상들 — 개체 선택 바의 앞쪽에 온다 */
export const FIXED_TARGETS = [
  { id: 'main', label: '메인 구조물' },
  { id: 'character', label: '캐릭터' },
  { id: 'gate', label: '관문 사인' },
  { id: 'light', label: '메인 조명' },
  { id: 'bg', label: '배경' },
  { id: 'motion', label: '부유 모션' },
] as const;

export interface TuneState {
  open: boolean;

  /** 블록 색 템플릿 키 */
  template: string;
  /* ── 색은 메인/배경을 따로 잡는다 ──
     둘을 한 값으로 묶어두면 배경을 흐리게 미는 순간 앞 무대까지 같이 흐려져서
     공기 원근법이 안 만들어진다. 거리감은 두 값의 **차이**에서 나온다. */
  /** 메인 구조물 채도 배수. 1 = 그대로 */
  mainSaturation: number;
  /** 메인 구조물 명도 배수. 1 = 그대로 */
  mainBrightness: number;

  /** 캐릭터 키 배수 */
  characterScale: number;
  /** 높이 그라디언트 — 아래쪽에서 섞을 색과 양 */
  gradLow: string;
  gradLowMix: number;
  /** 위쪽에서 섞을 색과 양 */
  gradHigh: string;
  gradHighMix: number;
  /** 그라디언트가 시작하는 높이(= 판 윗면)와 구간 길이 */
  gradFloor: number;
  gradSpan: number;
  /** 카메라를 **화면 기준**으로 민다 (블록 단위). 좌우 / 상하 */
  panX: number;
  panY: number;
  /** 아이의 1인칭 눈으로 볼 것인가 */
  fpv: boolean;
  /**
   * 그림자를 드리울 것인가.
   *
   * 그림자 한 장을 만들려면 **맵 전체를 한 번 더 그려야 한다.** 2구역은 면이
   * 만 팔천 장이라 매 프레임에서 제일 큰 덩어리다. 끄면 그만큼이 통째로
   * 빠지므로, 전시 기기가 버거우면 여기서 먼저 끄고 본다.
   */
  shadows: boolean;
  /**
   * 빛길이 아이 둘레로 켜지는 반경 (칸).
   *
   * 2구역의 빛나는 블록은 평소엔 꺼져 있다가 아이가 다가오면 켜진다
   * (`Stage.glowNear`). 블록을 다시 굽는 게 아니라 셰이더에서 거리로 끄는 거라
   * 아이가 걸어다녀도 비용이 0이다. 진짜 전구(`BlockLights`)도 같은 값을 쓴다.
   *
   * **바닥에서 센 칸 수**다(높이는 안 본다). 바깥 두 줄은 반쯤 들어오므로,
   * 7이면 다섯 줄이 환하고 여섯·일곱째 줄이 예고처럼 켜진다.
   *
   * 1인칭에서는 이 반경이 **아이 앞으로 밀려서** 걸린다 — 눈높이 때문에
   * 발밑이 화면 밖이라 그렇다 (`VoxelGrid` 의 `FPV_LEAD`).
   */
  pathRadius: number;
  /**
   * **바닥 길이 아닌 조명**이 켜지는 반경 (칸).
   *
   * 벽·천장 띠, 부스 사인, 전구. 길(`pathRadius`)보다 넓어야 한다 — 길은
   * 발밑이라 좁게 켜져야 "여기를 밟아라"가 되고, 방 조명은 둘러보는 것이라
   * 좁으면 아이가 깜깜한 데 갇힌 것처럼 보인다.
   */
  glowRadius: number;
  /** 관문 ORBY 사인 크기 배수 */
  gateScale: number;
  /** ORBY 심볼(관문 사인 + 동반자)에서 나오는 빛의 세기 */
  symbolLight: number;

  /**
   * 배경 구조물별 값. 키는 스테이지의 `backdrops[].id`.
   *
   * 등대 둘에 구름 둘까지 붙으면서 낱개 슬라이더로는 감당이 안 됐다.
   * 개체를 골라 그 개체만 만지는 구조로 바꾼다.
   */
  objects: Record<string, ObjTune>;
  /** 지금 패널에서 만지고 있는 대상 */
  selected: string;

  /**
   * 개체별 칠하기. 키는 `'main'` 또는 배경 구조물 id.
   *
   * `objects` 와 따로 두는 이유: 메인 구조물에는 위치·크기가 없어서 ObjTune 을
   * 못 쓰는데, 칠하기는 메인에도 똑같이 걸려야 하기 때문이다.
   */
  paints: Record<string, PaintTune>;

  /** 카메라 여백 배수. 클수록 전부 작게 보인다 */
  cameraPadding: number;

  /* ── 배경 하늘 ── */
  bgTop: string;
  bgMid: string;
  bgBottom: string;
  /** 일렁임 세기. 0 이면 정지한 그라데이션 */
  bgShimmer: number;
  /** 일렁임 속도 */
  bgShimmerSpeed: number;
  /** 그라데이션이 갈리는 높이 (0=아래, 1=위) */
  bgMidStop: number;

  /* ── 부유 모션 ── */
  /** 위아래로 흔들리는 폭 (월드 단위) */
  floatAmp: number;
  /** 흔들리는 속도 */
  floatSpeed: number;

  /* ── 메인 구조물 하단 페이드 ── */
  /** 이 높이(블록)부터 완전히 불투명. 그 아래는 바닥으로 갈수록 투명해진다 */
  fadeTop: number;
  /** 페이드 세기. 0 이면 안 걸린다 */
  fadeStrength: number;

  /* ── 메인 맵의 조명 블록 ── */
  /** 세기. 0 이면 광원을 아예 안 만든다 */
  lightIntensity: number;
  /** 도달 거리 (블록) */
  lightDistance: number;
  /** 빛 색 */
  lightColor: string;

  set: (patch: Partial<TuneState>) => void;
  /** 배경 구조물 하나의 값만 고친다 */
  setObj: (id: string, patch: Partial<ObjTune>) => void;
  /** 개체 하나의 칠하기 값만 고친다 */
  setPaint: (id: string, patch: Partial<PaintTune>) => void;
  reset: () => void;
}

/**
 * 스테이지가 값을 안 적었을 때 쓸 메인 구조물 색.
 * 1구역(흰 콘크리트)에서 눈으로 맞춘 값이라, 새 구역은 대개 자기 값을 적는다.
 */
export const DEFAULT_MAIN = {
  saturation: 0.47, brightness: 1.3, fadeTop: 3, fadeStrength: 1, lightIntensity: 1.83,
} as const;

/**
 * 스테이지가 안 적었을 때 쓸 아이 키 배수 (1구역에서 눈으로 맞춘 값).
 * 맵 축척이 다른 구역은 자기 값을 적는다 — `Stage.characterScale` 참고.
 */
export const DEFAULT_CHARACTER_SCALE = 1.44;

/** 높이 그라디언트 기본값 — 안 건 상태 (섞는 양 0) */
export const DEFAULT_GRAD = {
  low: '#1f4a55', lowMix: 0, high: '#ffffff', highMix: 0, floor: 0, span: 20,
} as const;

const DEFAULTS = {
  open: false,
  template: 'original',
  mainSaturation: DEFAULT_MAIN.saturation,
  mainBrightness: DEFAULT_MAIN.brightness,
  characterScale: DEFAULT_CHARACTER_SCALE,
  /* 높이 그라디언트 — 기본은 꺼져 있다 (섞는 양 0) */
  gradLow: '#1f4a55',
  gradLowMix: 0,
  gradHigh: '#ffffff',
  gradHighMix: 0,
  gradFloor: 0,
  gradSpan: 20,
  panX: 0,
  panY: 0,
  fpv: false,
  shadows: true,
  pathRadius: 7,
  glowRadius: 10,
  gateScale: 0.76,
  symbolLight: 1.2,
  cameraPadding: 0.9,
  lightIntensity: 1.83,
  lightDistance: 26,
  lightColor: '#FFD9A0',

  /* 위와 가운데가 같은 남보라라 **위쪽 절반은 평평한 밤하늘**이고,
     bgMidStop(0.62) 아래에서만 검정으로 떨어진다 — 맵이 어둠에서 솟고
     그 위로 하늘이 넓게 펼쳐진 것처럼 보인다. */
  bgTop: '#27255d',
  bgMid: '#27255d',
  bgBottom: '#000300',
  bgShimmer: 2,
  bgShimmerSpeed: 0.35,
  bgMidStop: 0.62,

  floatAmp: 0.02,
  floatSpeed: 0.5,

  fadeTop: 3,
  fadeStrength: 1,
} as const;

export const useTune = create<TuneState>((set) => ({
  ...DEFAULTS,
  objects: {},
  paints: {},
  selected: 'main',
  set: (patch) => set(patch),
  setObj: (id, patch) =>
    set((s) => ({ objects: { ...s.objects, [id]: { ...s.objects[id], ...patch } } })),
  setPaint: (id, patch) =>
    set((s) => ({
      paints: { ...s.paints, [id]: { ...(s.paints[id] ?? DEFAULT_PAINT), ...patch } },
    })),
  reset: () => set({ ...DEFAULTS, paints: {} }),
}));

/* 개발 중에만 콘솔에서 값을 만질 수 있게 열어 둔다 — 헤드리스 크롬으로 화면을
   확인할 때 패널을 클릭하지 않고 `__tune.setState({ pathRadius: 40 })` 로
   바로 바꿀 수 있다. 빌드에는 안 들어간다. */
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__tune = useTune;
}

/** 값이 없을 때 쓸 기본 (스테이지가 안 넘겨준 경우) */
export const DEFAULT_OBJ: ObjTune = {
  x: 0, y: 0, z: 0, rotation: 0, scale: 1, saturation: 0.5, brightness: 1, haze: 0.5,
  opacity: 1, lightIntensity: 1.83, lightDistance: 26, lightColor: '#FFD9A0',
};

/**
 * 지금 설정으로 블록 색 하나를 물들인다.
 *
 * 지오메트리를 지을 때 색마다 한 번씩 통과한다. 셰이더를 건드리지 않고 정점 색을
 * 다시 굽는 방식이라, 슬라이더를 움직이면 지오메트리가 다시 만들어진다.
 * 맵 하나가 블록 수천 개 규모라 다시 굽는 데 몇 ms 밖에 안 걸린다.
 *
 * 색 템플릿은 메인·배경이 같이 쓴다 — 화면 전체의 색 방향이라 갈라놓으면
 * 두 구조물이 다른 세계처럼 보인다. 채도·명도만 따로 잡는다.
 */
export function makeTint(
  t: TuneState,
  /** 'main' 이거나 배경 구조물 id */
  which = 'main',
): Tint | undefined {
  const tpl = COLOR_TEMPLATES.find((x) => x.key === t.template) ?? COLOR_TEMPLATES[0];
  const o = t.objects[which];
  const sat = which === 'main' ? t.mainSaturation : (o?.saturation ?? 0.5);
  const bri = which === 'main' ? t.mainBrightness : (o?.brightness ?? 1);
  /* 높이 그라디언트는 메인 구조물에만 건다. 배경(구름·등대)은 제 불투명도와
     공기 원근법으로 이미 거리가 읽혀서, 여기까지 걸면 탁해진다. */
  const grad = which === 'main' ? makeGrad(t) : null;
  if (tpl.key === 'original' && sat === 1 && bri === 1 && !grad) return undefined;

  const hsl = { h: 0, s: 0, l: 0 };
  return (c: THREE.Color, y: number) => {
    c.getHSL(hsl);
    tpl.apply(c, hsl);
    c.getHSL(hsl);
    c.setHSL(hsl.h, clamp01(hsl.s * sat), clamp01(hsl.l * bri));
    grad?.(c, y);
  };
}

/* ── 높이 그라디언트 ─────────────────────────────────────────
 * 2구역 미리보기 그림의 색은 **단색이 아니다.** 같은 주황 문틀도 위는 쨍하고
 * 아래로 갈수록 깊어진다 (그림에서 잰 값: #ce9853 → #b18252, 약 12% 어두워짐).
 * 블록 색은 그대로 두고 **높이에 따라 두 색을 섞어** 그 느낌을 낸다.
 *
 * 구간은 `gradFloor`(판 윗면) 에서 `gradFloor + gradSpan` 까지다. 맵 전체
 * 높이로 잡으면 낮은 가구는 그라디언트의 아랫동아리만 받아 통째로 어두워진다 —
 * 개체 키만큼만 잡아야 개체마다 위아래가 생긴다.
 */
function makeGrad(t: TuneState): ((c: THREE.Color, y: number) => void) | null {
  if (t.gradSpan <= 0 || (t.gradLowMix <= 0 && t.gradHighMix <= 0)) return null;
  const low = new THREE.Color(t.gradLow);
  const high = new THREE.Color(t.gradHigh);
  const span = t.gradSpan;
  return (c, y) => {
    const k = clamp01((y - t.gradFloor) / span);
    if (t.gradLowMix > 0) c.lerp(low, t.gradLowMix * (1 - k));
    if (t.gradHighMix > 0) c.lerp(high, t.gradHighMix * k);
  };
}

/* ── 칠하기 ─────────────────────────────────────────────────
 * 아이소 카메라는 (1,1,1) 방향에서 내려다본다. 화면 오른쪽 벡터가 (1,0,-1)/√2 라
 * **+X 면이 화면 오른쪽, +Z 면이 화면 왼쪽**, +Y 면이 윗면이다 (IsoCamera 참고).
 * 이 대응이 어긋나면 왼쪽 색과 오른쪽 색이 뒤바뀐다.
 */

/** 뒷면(-X·-Z) — 유리 너머나 절단면으로 가끔 보인다. 살짝 눌러 안팎을 구분한다. */
const BACK_FACE = 0.82;
/** 아랫면 — 방향광이 안 닿는 자리라 원래도 제일 어둡다 */
const BOTTOM_FACE = 0.7;

/**
 * 패널의 칠하기 값 → 지오메트리가 쓸 함수. 꺼져 있으면 undefined.
 *
 * **고른 색에는 아무 보정도 걸지 않는다.** 채도·명도·흐림은 마인크래프트 블록 색을
 * 손보려고 있는 값들인데, 칠하기는 그 색을 통째로 갈아치우는 것이라 둘을 겹쳐
 * 걸면 "넣은 색과 나오는 색이 다른" 상태가 된다 — 색을 지정하는 의미가 없어진다.
 * 멀리 있어 보이게 하려면 **흐린 색을 직접 고르면 된다.**
 *
 * 면 명암(아랫면·뒷면)만 곱한다. 색은 여섯 개뿐이라 여기서 미리 만들어두고
 * 꼭짓점 루프에서는 복사만 한다.
 */
export function makePaint(
  p: PaintTune | undefined,
  /** 개체의 월드 높이 — 그라디언트를 여기에 맞춘다 */
  topY: number,
): PaintFn | undefined {
  if (!p || p.mode === 'off') return undefined;

  const prep = (f: FacePaint) => ({
    hi: new THREE.Color(f.color),
    // 그라디언트를 끈 면은 아래 색을 아예 안 만든다 — 꼭짓점마다 하는 판단을 하나 줄인다
    lo: f.grad ? new THREE.Color(f.gradTo) : null,
  });
  const top = prep(p.top), left = prep(p.left), right = prep(p.right);
  const span = Math.max(topY, 0.001);

  return (out, nx, ny, nz, worldY) => {
    // 윗면 +Y · 오른쪽 ±X · 왼쪽 ±Z (아이소 카메라 기준, 위 주석 참고)
    const f = ny !== 0 ? top : nx !== 0 ? right : left;
    if (f.lo) out.copy(f.lo).lerp(f.hi, clamp01(worldY / span));
    else out.copy(f.hi);

    if (ny < 0) out.multiplyScalar(BOTTOM_FACE);
    else if (nx < 0 || nz < 0) out.multiplyScalar(BACK_FACE);
  };
}

/** 스테이지 파일에 붙일 칠하기 조각. 꺼져 있으면 빈 배열 */
function paintLines(p: PaintTune | undefined, indent: string): string[] {
  if (!p || p.mode === 'off') return [];
  const face = (f: FacePaint) =>
    f.grad
      ? `{ color: '${f.color}', grad: true, gradTo: '${f.gradTo}' }`
      : `{ color: '${f.color}' }`;
  return [
    `${indent}paint: {`,
    `${indent}  mode: 'on',`,
    `${indent}  top: ${face(p.top)},`,
    `${indent}  left: ${face(p.left)},`,
    `${indent}  right: ${face(p.right)},`,
    `${indent}},`,
  ];
}

/** 지금 값을 스테이지 파일에 붙일 수 있는 코드 조각으로 */
export function toSnippet(t: TuneState, labels: Record<string, string> = {}): string {
  const lines = [
    '// TunePanel 에서 맞춘 값',
    `//   블록 템플릿  ${t.template}`,
    `//   메인 채도 ${t.mainSaturation.toFixed(2)} · 명도 ${t.mainBrightness.toFixed(2)}`,
    `//   캐릭터 ${t.characterScale.toFixed(2)} · 관문 사인 ${t.gateScale.toFixed(2)} · 심볼 빛 ${t.symbolLight.toFixed(2)}`,
    `//   조명  세기 ${t.lightIntensity.toFixed(2)} · 거리 ${t.lightDistance.toFixed(0)} · 색 ${t.lightColor}`,
    '',
    `//   배경  ${t.bgTop} → ${t.bgMid} → ${t.bgBottom}  일렁임 ${t.bgShimmer.toFixed(2)}`,
    `//   부유  폭 ${t.floatAmp.toFixed(3)} · 속도 ${t.floatSpeed.toFixed(2)}`,
    `//   하단 페이드  y${t.fadeTop.toFixed(1)} 까지 · 세기 ${t.fadeStrength.toFixed(2)}`,
    '',
    `cameraPadding: ${t.cameraPadding.toFixed(2)},`,
    ...paintLines(t.paints.main, ''),
    'backdrops: [',
  ];
  for (const [id, o] of Object.entries(t.objects)) {
    lines.push(
      '  {',
      `    id: '${id}',`,
      `    label: '${labels[id] ?? id}',`,
      `    map: '${(labels[id + ':map'] ?? '')}',`,
      `    at: [${o.x.toFixed(2)}, ${o.y.toFixed(2)}, ${o.z.toFixed(2)}],`,
      ...(o.rotation ? [`    rotation: ${o.rotation.toFixed(0)},`] : []),
      `    scale: ${o.scale.toFixed(3)},`,
      `    saturation: ${o.saturation.toFixed(2)},`,
      `    brightness: ${o.brightness.toFixed(2)},`,
      `    haze: ${o.haze.toFixed(2)},`,
      `    opacity: ${o.opacity.toFixed(2)},`,
      `    lightIntensity: ${o.lightIntensity.toFixed(2)},`,
      `    lightDistance: ${o.lightDistance.toFixed(0)},`,
      `    lightColor: '${o.lightColor}',`,
      ...(o.floatAmp !== undefined ? [`    floatAmp: ${o.floatAmp.toFixed(3)},`] : []),
      ...(o.floatSpeed !== undefined ? [`    floatSpeed: ${o.floatSpeed.toFixed(2)},`] : []),
      ...paintLines(t.paints[id], '    '),
      '  },',
    );
  }
  lines.push('],');
  return lines.join('\n');
}
