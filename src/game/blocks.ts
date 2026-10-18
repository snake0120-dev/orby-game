/**
 * 마인크래프트 블록 → 게임에서의 의미.
 *
 * 임포터는 블록 **이름**만 뽑아 넘긴다. 색을 정하는 건 여기다.
 * 그래서 색을 고칠 때 재임포트가 필요 없다 — 이 파일을 저장하면 바로 반영된다.
 *
 * 색값은 실제 블록 텍스처의 평균색이다. 즉 **마인크래프트에서 본 그대로 나온다.**
 * 다만 브랜드 색을 실어야 하는 두 블록만 정확한 ORBY 색으로 덮어쓴다(아래 참고).
 */

import markersJson from './markers.json';

interface MarkerEntry { role: string; ko: string }

/**
 * markers.json 은 사람이 읽기 좋게 방식별로 묶여 있다("양탄자 방식" / "블록 방식").
 * 코드에서는 한 장의 표로 펴서 쓴다. `_` 로 시작하는 키는 주석이라 건너뛴다.
 */
const markerTable: Record<string, MarkerEntry> = Object.fromEntries(
  Object.entries(markersJson as Record<string, unknown>)
    .filter(([k, v]) => !k.startsWith('_') && v !== null && typeof v === 'object' && !Array.isArray(v))
    .flatMap(([, group]) => Object.entries(group as Record<string, MarkerEntry>)),
);

/** 마커 블록의 역할. 이 블록들은 화면에 그려지지 않는다. */
export type BlockRole =
  | 'walk'    // 아이가 걸을 수 있는 칸을 손으로 지정 (구버전)
  | 'spawn'   // 시작 위치
  | 'gate'    // 관문
  | 'prop'    // 상호작용 지점 — 놓인 순서대로 ①②③④ 가 된다
  | 'slot1' | 'slot2' | 'slot3' | 'slot4'; // 물건 자리를 블록 색으로 직접 지정 (구버전)

export interface BlockDef {
  /** 렌더 색. 없으면 그리지 않는다(마커이거나 공기). */
  color?: string;
  role?: BlockRole;
}

/**
 * 마커 — 위치 정보만 담고 화면에는 안 나온다.
 *
 * 표는 `markers.json` 한 군데에만 있다. 임포터(Node)와 검사기도 같은 파일을 읽으므로
 * 셋이 어긋날 일이 없다. 제작 가이드의 표도 이 파일을 따른다.
 */
const MARKERS: Record<string, BlockDef> = Object.fromEntries(
  Object.entries(markerTable).map(([name, m]) => [name, { role: m.role as BlockRole }]),
);

/** 마커 블록의 한국어 이름 — 검사기 메시지에 쓴다 */
export const markerLabel = (name: string): string =>
  markerTable[stripNamespace(name)]?.ko ?? stripNamespace(name);

/** role 로 마커의 한국어 이름 찾기 (없으면 null) */
export const markerLabelForRole = (role: BlockRole): string | null =>
  Object.values(markerTable).find((m) => m.role === role)?.ko ?? null;

/**
 * 브랜드 색 고정.
 *
 * 이 두 블록만 마인크래프트 원래 색 대신 ORBY 색으로 나온다.
 * 마인크래프트의 주황 콘크리트(#C96418)는 브랜드 오렌지보다 어둡고 탁해서,
 * 그대로 쓰면 "만질 수 있는 것"이 눈에 안 띈다.
 *
 * 값은 `src/theme.ts` 의 PALETTE 와 같다 — 블록으로 지은 오렌지와 캐릭터의
 * 오렌지가 한 화면에 같이 나오므로 어긋나면 바로 보인다.
 *
 * 색 규칙: 오렌지 = 아이가 만질 수 있는 것 / 틸 = 길을 알려주는 것.
 * WYSIWYG를 우선하고 싶으면 이 두 줄을 지우면 된다.
 */
const BRAND: Record<string, BlockDef> = {
  orange_concrete: { color: '#E39F44' },
  cyan_concrete: { color: '#61B7AF' },
};

/**
 * 2구역(입국 수속) 팔레트.
 *
 * 천우태가 그린 미리보기(`2,3,4번 맵 가이드/2번 맵.png`)에서 스포이드한 색이다.
 * 민트 홀 + 주황 자동심사대라는 구성 자체가 이 구역의 성격이라, 1구역의 흰
 * 콘크리트와 **온도부터 갈라야** 두 구역이 다른 곳으로 읽힌다.
 *
 * 브랜드 색(위)과 같은 이유로 마인크래프트 원래 색을 덮어쓴다. 다만 블록 이름은
 * **실제로 놓을 수 있는 것들**로 골랐다 — 나중에 천우태가 이 구역을 마인크래프트로
 * 다시 지을 때 같은 블록을 놓으면 화면도 똑같이 나온다.
 */
const ZONE2: Record<string, BlockDef> = {
  /**
   * 옅은 민트 — 바닥 윗면.
   *
   * 미리보기 그림의 바닥(#cfd8d7)보다 **일부러 어둡게** 잡았다. 윗면은 방향광을
   * 정면으로 받아 그대로 밝아지는데, 그림 값을 그대로 넣으면 하얗게 날아간다.
   */
  cyan_concrete_powder: { color: '#9FD2CC' },
  /** 민트 — 플린스 옆면·부스 몸체. 바닥과 한 단 차이로 면을 가른다. */
  cyan_terracotta: { color: '#5FC4BD' },
  /** 짙은 민트 — 부스 지붕. 세 단 중 제일 어두워서 처마가 또렷하게 선다. */
  prismarine: { color: '#58C3BB' },
  /**
   * 자동심사대 문틀의 주황.
   *
   * 마인크래프트 원래 색(#A0501E)도, 처음 잡았던 #D08F3C 도 그림보다 탁해서
   * 문틀이 흙덩어리로 보였다. 그림에서 스포이드한 값으로 올린다.
   * 브랜드 오렌지(#E39F44)와는 한 끗 다른 색이라 "만질 수 있는 것" 규칙과
   * 섞이지 않는다 — 브랜드 색은 `orange_concrete` 쪽이다.
   */
  orange_terracotta: { color: '#E8A253' },
  /**
   * 사인·카운터의 노란 판.
   *
   * 발광 블록(글로스톤)으로 깔면 판 전체가 하얗게 뭉쳐서 글자판으로 안 읽힌다.
   * 판은 **빛나지 않는 노랑**으로 두고, 진짜 등은 그 안에 한 칸만 심는다.
   */
  yellow_terracotta: { color: '#F3CA6E' },
  /** 밝은 나무 — 상판·탁자. 자작나무(#C0AF79)보다 한 단 밝다. */
  smooth_sandstone: { color: '#E6D3A8' },
  /** 화분의 초록. 3·4구역에서 유일한 유채색 휴식이다. */
  moss_block: { color: '#5AA45C' },
  /**
   * 선명한 틸 — 심사대 상태등·직원. 작게 쓰는 강조색이라 제일 쨍하다.
   * 다이아몬드 블록은 **물건 자리 마커(②)** 라 쓰면 안 된다 (markers.json).
   */
  prismarine_bricks: { color: '#3ECAC3' },
};

/** 콘크리트 16색 — 텍스처 평균색 */
const CONCRETE: Record<string, string> = {
  white_concrete: '#CFD5D6',
  light_gray_concrete: '#7D7D73',
  gray_concrete: '#373A3E',
  black_concrete: '#080A0F',
  brown_concrete: '#603C20',
  red_concrete: '#743B3B',
  orange_concrete: '#C96418',
  yellow_concrete: '#F1AF15',
  lime_concrete: '#5F8D35',
  green_concrete: '#495B24',
  cyan_concrete: '#356168',
  light_blue_concrete: '#3086BB',
  blue_concrete: '#41437B',
  purple_concrete: '#623A82',
  magenta_concrete: '#994092',
  pink_concrete: '#D6658F',
};

/** 자주 쓸 만한 나머지 블록들. 필요하면 여기에 계속 추가한다. */
const OTHERS: Record<string, string> = {
  white_wool: '#EAECED',
  light_gray_wool: '#8E8E87',
  gray_wool: '#3F4448',
  black_wool: '#15151A',
  white_terracotta: '#D2B2A1',
  white_concrete_powder: '#E2E3E4',
  quartz_block: '#ECE6DF',
  smooth_stone: '#9F9F9F',
  stone: '#7E7E7E',
  polished_andesite: '#848686',
  birch_planks: '#C0AF79',
  oak_planks: '#9E8253',
  glass: '#ACD3DB',

  // 빛나는 블록 — 아래 isEmissive 가 잡아서 발광 재질로 그린다
  glowstone: '#F6E3B4',
  sea_lantern: '#DCF0EC',
  shroomlight: '#F3A05A',
  ochre_froglight: '#F6EFC0',
  /**
   * 벽·천장의 빛 띠.
   *
   * 색은 위 ochre 와 **일부러 똑같이** 맞췄다(실제 텍스처는 더 희읍스름하다).
   * 블록을 가른 이유는 색이 아니라 **엔진이 빛 종류마다 메시를 나누기**
   * 때문이다 — 한때 바닥 빛길만 아이 둘레에서 켜지게 하려고 갈랐다.
   * 지금은 `Stage.glowNear` 가 **구역의 빛을 통째로** 걸므로 나눌 이유가
   * 없어졌지만, 블록을 되돌리면 맵을 다시 구워야 해서 그대로 둔다.
   */
  pearlescent_froglight: '#F6EFC0',

  // 유리 계열 — 반투명이라 평균색이 밝다
  white_stained_glass: '#EDF0F0',
  light_gray_stained_glass: '#9DA1A1',
  gray_stained_glass: '#4A4E4E',
  black_stained_glass: '#191919',
  glass_pane: '#ACD3DB',
  white_stained_glass_pane: '#EDF0F0',

  /**
   * 석영 계단 — ㄴ자로 쓰는 몰딩·난간·처마.
   *
   * 색은 흰 콘크리트(#CFD5D6)와 **똑같이** 맞춘다. 마인크래프트 석영은 실제로
   * 조금 더 따뜻한 크림색인데, 벽이 콘크리트고 테두리만 석영이면 그 미세한
   * 차이가 얼룩처럼 보인다. 형태만 살리고 색은 하나로 간다.
   */
  quartz_stairs: '#CFD5D6',
  smooth_quartz_stairs: '#CFD5D6',
  quartz_slab: '#CFD5D6',
  smooth_quartz_slab: '#CFD5D6',
  smooth_quartz: '#CFD5D6',
  chiseled_quartz_block: '#EAE3DB',
  quartz_pillar: '#ECE6DF',

  // 등대의 광원
  lit_redstone_lamp: '#F4CE8A',
  lever: '#6E5B44',
};

/**
 * 그리지도 않고 마커도 아닌 것 — 빈 공간으로 친다.
 * `structure_block` 은 맵을 저장하려고 놓은 도구라 게임에 나오면 안 된다.
 */
const EMPTY = new Set([
  'air', 'structure_void', 'cave_air', 'void_air', 'bedrock', 'structure_block',
]);

const TABLE: Record<string, BlockDef> = {
  ...Object.fromEntries(Object.entries(CONCRETE).map(([k, color]) => [k, { color }])),
  ...Object.fromEntries(Object.entries(OTHERS).map(([k, color]) => [k, { color }])),
  ...BRAND, // 브랜드 색이 콘크리트 기본색을 덮는다
  ...ZONE2,
  /* 마커가 **맨 마지막**이다. 색 표에 실수로 마커 블록(다이아몬드·금·에메랄드…)을
     적어도 역할이 지워지지 않는다 — 한 번 그렇게 깨뜨려 봤다. */
  ...MARKERS,
};

/** `minecraft:orange_concrete` → `orange_concrete` */
export const stripNamespace = (name: string): string =>
  name.includes(':') ? name.slice(name.indexOf(':') + 1) : name;

/**
 * 블록 이름 → 정의. 표에 없으면 null (호출부가 경고하고 회색으로 그린다).
 * 빈 공간 블록은 `{}` 를 돌려준다 — 알고 있지만 안 그린다는 뜻.
 */
export function lookupBlock(rawName: string): BlockDef | null {
  const name = stripNamespace(rawName);
  if (EMPTY.has(name)) return {};
  return TABLE[name] ?? null;
}

/**
 * **붓으로 놓을 수 있는 블록들** — 색이 있는 표의 항목 전부.
 *
 * 마커(시작·관문·물건 자리)는 빠진다. 색이 없어 화면에 안 그려지는데
 * 목록에 두면 "놓았는데 아무것도 안 보인다"가 된다 — 자리 표시는 생성기가
 * 할 일이라 붓으로 놓을 것도 아니다.
 */
export const PLACEABLE: { name: string; color: string }[] = Object.entries(TABLE)
  .filter(([, d]) => !!d.color && !d.role)
  .map(([name, d]) => ({ name: `minecraft:${name}`, color: d.color as string }));

/** 표에 없는 블록에 임시로 쓸 색 */
export const UNKNOWN_COLOR = '#B9B2A6';

/**
 * 유리 계열인가 — 반투명으로 그린다.
 *
 * 이름으로 판별한다. 마인크래프트의 유리는 `glass` / `stained_glass` /
 * `stained_glass_pane` / `tinted_glass` 로 끝나거나 그 조합이라, 새 색이
 * 추가돼도 표를 따로 고칠 필요가 없다.
 */
export const isTranslucent = (rawName: string): boolean =>
  stripNamespace(rawName).includes('glass');

/**
 * 스스로 빛나는 블록인가.
 *
 * Monument Valley 레퍼런스에서 어두운 배경에 공간이 읽히는 건 곳곳의 작은
 * 광원 덕이다. 조명을 더 밝히는 대신 **맵 안에 등을 심는다** — 어두운 데는
 * 어둡게 두고 필요한 자리만 밝혀야 깊이가 생긴다.
 */
const EMISSIVE = new Set([
  'glowstone', 'sea_lantern', 'shroomlight', 'ochre_froglight',
  'verdant_froglight', 'pearlescent_froglight', 'lantern',
  'lit_redstone_lamp',   // 꺼진 redstone_lamp 와 다른 블록이다
]);
export const isEmissive = (rawName: string): boolean => EMISSIVE.has(stripNamespace(rawName));

/**
 * 진짜 **전구**인가 — 둘레를 비추는 광원을 하나 켤 블록인가.
 *
 * `isEmissive` 와 나눠 둔 이유: 밝게 보이는 것과 빛을 뿜는 것은 다르다.
 * 빛나는 블록은 `buildGeometry` 가 따로 밝은 메시(`glow`)로 빼기 때문에
 * 전구가 없어도 환하게 보인다. 그런데 `voxelMap` 은 빛나는 칸을 4×4×4 로 묶어
 * 묶음마다 `pointLight` 를 하나씩 켠다 — **길이 60칸짜리 빛 띠 하나가 전구 15개**다.
 *
 * 3구역(공항)은 가장자리마다·기둥마다·처마마다 빛 띠가 있어서, 나누지 않으면
 * 전구가 300개쯤 켜지고 아이패드에서 안 돈다.
 *
 * → **긴 띠는 froglight** (밝게만 보인다), **진짜 등은 glowstone 류** (전구를 켠다).
 * 2구역은 glowstone 만 써서 전구 9개 그대로다.
 */
const LAMP = new Set([
  'glowstone', 'sea_lantern', 'lantern', 'lit_redstone_lamp',
]);
export const isLamp = (rawName: string): boolean => LAMP.has(stripNamespace(rawName));
