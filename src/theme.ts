/**
 * ORBY 브랜드 토큰 + 월드 단위 규약.
 *
 * 색 규칙 (기획 "정보의 선택적 노출"을 렌더링으로 옮긴 것):
 *   - orange 계열은 "아이가 만질 수 있는 것"에만
 *   - teal 계열은 "길을 알려주는 것"에만
 * 이 규칙을 깨면 아이가 색으로 조작법을 학습하지 못한다.
 */
export const PALETTE = {
  primary: '#E39F44',
  primaryLt: '#E6B877',
  mintPale: '#C9E4E2',
  teal: '#61B7AF',
  white: '#EFEFEF',
} as const;

/** 그레이박스 단계용 무채색. .vox 에셋이 들어오면 순차 대체된다. */
export const GRAYBOX = {
  floor: '#E8E4DC',
  floorAlt: '#D9D3C7',
  wall: '#F2EFE9',
  wallTop: '#FBF9F5',
  barrier: '#C9C2B4',
  void: '#B5AEA0',
} as const;

/* ── 월드 단위 규약 ───────────────────────────────────────────
 * 계획서의 `.vox` 교체 규약을 코드에 못박아 둔다.
 * 나중에 MagicaVoxel 모델을 붙일 때 이 값들이 어긋나면 전부 재작업이다.
 */

/** 1 복셀 = 0.1 월드 유닛 */
export const VOXEL = 0.1;

/** 그리드 1타일 = 8복셀 = 0.8 유닛 */
export const TILE = VOXEL * 8;

/** 프롭 표준 바운딩: 16×16×16 복셀 안에 수납 */
export const PROP_BOUND = 16;

/**
 * 캐릭터 키 (블록).
 *
 * 맵을 마인크래프트 실제 축척으로 짓기 때문에 캐릭터도 마인크래프트 사람 크기다.
 * 블록 두 개를 쌓은 높이 — 이 값이 흔들리면 맵과 캐릭터의 비율이 깨진다.
 */
export const CHARACTER_H = 2;
