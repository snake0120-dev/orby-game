/**
 * 스테이지 스키마.
 *
 * 역할 분담이 핵심이다:
 *   - **마인크래프트**가 "어디" 를 담당한다 (지형·외형·마커 위치)
 *   - **이 파일**이 "무엇" 을 담당한다 (미션·순서·대사)
 *
 * 그래서 맵을 다시 임포트하지 않고도 미션과 대사를 계속 고칠 수 있다.
 */

/** 면 하나의 색. `grad` 를 켜면 `color`(위) → `gradTo`(아래) 로 섞인다. */
export interface FacePaintDef {
  color: string;
  /** 이 면에만 거는 그라디언트 */
  grad?: boolean;
  gradTo?: string;
}

/**
 * 개체를 **직접 칠하는** 설정. 개발 패널(`1` 키)의 "칠하기" 에서 맞춘 뒤
 * `값 복사` 로 그대로 옮겨온다.
 *
 * 마인크래프트 블록 색을 덮어쓴다. 아이소에서는 한 블록의 세 면만 보이므로
 * 개체 하나에 면이 셋이다 — 윗면 · 왼쪽(+Z) · 오른쪽(+X).
 * **그라디언트는 면마다 따로 켠다** (윗면만 물들이고 옆면은 단색, 같은 조합).
 *
 * 칠해진 개체는 **조명도 채도·명도도 안 받는다** (고른 색이 그대로 나온다).
 * 유리와 발광 블록은 칠하지 않는다.
 */
export interface PaintDef {
  /** `'on'` 직접 칠하기 · `'off'` 마인크래프트 블록 색 그대로 */
  mode: 'off' | 'on';
  top: FacePaintDef;
  left: FacePaintDef;
  right: FacePaintDef;
}

/** 배경 장식 구조물 하나 */
export interface BackdropDef {
  /** 패널에서 고를 때 쓰는 키. 스테이지 안에서 유일해야 한다. */
  id: string;
  /** 패널에 보일 이름 */
  label: string;
  /** public/maps 아래 파일명 */
  map: string;
  at: [number, number, number];
  /**
   * Y축 회전(도). 개체의 **한가운데를 축으로** 돈다 — 0 이면 마인크래프트에서 지은 방향 그대로.
   * 마인크래프트에서 지은 방향은 고정이라, 세워둔 각도를 바꾸려면 여기서 돌린다.
   */
  rotation?: number;
  scale?: number;
  saturation?: number;
  brightness?: number;
  /** 배경색에 물드는 정도 */
  haze?: number;
  /** 불투명도 (구름을 옅게 깔 때) */
  opacity?: number;
  /** 이 구조물 안 조명 블록의 세기·거리·색 */
  lightIntensity?: number;
  lightDistance?: number;
  lightColor?: string;
  /** 이 구조물만의 부유 폭·속도. 비우면 전역 값 */
  floatAmp?: number;
  floatSpeed?: number;
  /** 직접 칠하기. 비우면 마인크래프트 블록 색 그대로 */
  paint?: PaintDef;
}

/** 마인크래프트의 물건 자리 마커 번호 (금=1, 다이아=2, 청금석=3, 철=4) */
export type SlotNumber = 1 | 2 | 3 | 4;

export interface PropDef {
  id: string;
  /** 마인크래프트에서 이 물건을 표시한 마커 번호 */
  slot: SlotNumber;
  /** 사람이 읽는 이름 (검사기 메시지에 쓰인다) */
  label: string;
  /** 클릭하면 완료되는 미션 id. 없으면 배경 소품이다. */
  interact?: string;
  /** 다가가는 동안 동반자가 주는 힌트 */
  hint?: string;
}

export interface MissionDef {
  id: string;
  /** HUD에 뜨는 짧은 할 일 */
  label: string;
  /** 아이콘 키 (아이 대상이라 텍스트보다 아이콘이 우선) */
  icon: string;
  /** 선행 미션. 다 끝나기 전엔 잠겨 있다. */
  requires?: string[];
  /** 완료 순간 동반자 대사 */
  say?: string;
}

export interface Stage {
  id: string;
  /** 여정 순서 (1~6) */
  index: number;
  title: string;
  /**
   * 이 구역에서 아이가 **실제로 배워가야 할 행동**.
   * 예습 게임이라는 걸 구조가 붙잡아주는 필드다. missions가 이 문장과
   * 1:1로 대응하지 않으면 데이터를 쓸 때 바로 티가 난다.
   * 클리어 화면과 도록에 그대로 쓰인다.
   */
  learningGoal: string;
  tier: 'deep' | 'mid' | 'light';

  /** `public/maps/` 아래 맵 파일명. 임포터가 만든다. */
  map: string;

  props: PropDef[];
  missions: MissionDef[];
  /** 관문(에메랄드 블록) 위치는 맵에서 읽는다. 여기엔 여는 조건만 적는다. */
  gate: { opensOn: string[] };
  /** 스테이지 진입 시 동반자 첫 대사 (화면 아래 말풍선, 몇 초 뒤 사라진다) */
  intro?: string;
  /**
   * **아이 머리 위**에 계속 떠 있는 말풍선. 비우면 안 나온다.
   *
   * `intro` 와 다른 물건이다 — 저쪽은 안내 자막이고 이쪽은 아이의 생각이라
   * 아이를 따라 움직이고 사라지지 않는다. 지금은 1구역에만 붙인다.
   */
  bubble?: string;
  /**
   * 근경 절단 높이(블록). 카메라 앞쪽 벽이 방을 가릴 때 이 높이 위를 숨긴다.
   * 생략하면 자동으로 계산한다.
   */
  cutaway?: number;
  /**
   * 뒤에 세울 장식 구조물들. 걷지도 부딪히지도 않는다.
   * 좌표·크기는 월드 단위 (1블록 = VOXEL).
   *
   * 배열인 이유: 등대·구름처럼 여러 개가 들어가고, 각자 위치와 거리감을
   * 따로 잡아야 한다. 개발 패널이 이 목록을 그대로 선택지로 쓴다.
   */
  backdrops?: BackdropDef[];
  /** 카메라 여백 배수. 배경 구조물이 프레임에 들어오게 넓힐 때 쓴다. */
  cameraPadding?: number;
  /**
   * 메인 구조물 채도·명도 배수. 비우면 패널 기본값(0.47 · 1.30).
   *
   * 구역마다 달라야 한다. 1구역은 흰 콘크리트라 채도를 눌러야 차분하지만,
   * 2구역은 민트와 주황이 성격이라 같은 값으로 누르면 통째로 회색이 된다.
   */
  mainSaturation?: number;
  mainBrightness?: number;
  /**
   * 밑동을 배경에 녹이는 페이드. 비우면 패널 기본값(y3 까지 · 세기 1).
   *
   * 1구역은 구조물이 높아 밑동만 잠기지만, 바닥판이 낮은 구역에서는 **바닥 전체가**
   * 페이드 구간에 들어가 회색으로 비쳐 버린다. 판이 또렷하게 떠 있어야 하는
   * 구역은 세기를 0 으로 둔다.
   */
  fadeTop?: number;
  fadeStrength?: number;
  /**
   * 맵 안 조명 블록이 내는 빛의 세기. 비우면 패널 기본값(1.83).
   *
   * 등이 몇 개 없는 구역에서 맞춘 값이라, 사인마다 등이 달린 구역에 그대로
   * 걸면 바닥이 하얗게 날아간다.
   */
  lightIntensity?: number;
  /**
   * 아이 키 배수. 비우면 패널 기본값(1.44 = 키 약 2.9칸).
   *
   * **구역마다 맵의 축척이 다를 수 있어서 있는 값이다.** 2구역은 천우태가 그린
   * 미리보기 그림의 복셀 격자를 그대로 쓰는데, 그 한 칸이 1·3·4구역의 한 칸보다
   * 세 배쯤 작다. 아이를 그대로 두면 심사대 문(높이 8칸)에 비해 무릎까지밖에
   * 안 오는 크기가 된다. 맵을 줄이는 대신 **아이를 키워서** 비율을 맞춘다.
   */
  characterScale?: number;
  /**
   * 높이 그라디언트 — 블록 색을 **위아래로 흘린다.**
   *
   * 2구역 미리보기 그림의 색이 단색이 아니라 전부 그라디언트라 넣었다.
   * `floor` 에서 `floor + span` 까지가 구간이고, 아래쪽은 `low` 를 `lowMix`
   * 만큼, 위쪽은 `high` 를 `highMix` 만큼 섞는다. 구간은 **개체 키만큼** 잡아야
   * 개체마다 위아래가 생긴다 — 맵 높이로 잡으면 낮은 가구가 통째로 어두워진다.
   */
  gradient?: {
    low?: string; lowMix?: number;
    high?: string; highMix?: number;
    floor?: number; span?: number;
  };
  /** 메인 구조물 직접 칠하기. 비우면 마인크래프트 블록 색 그대로 */
  paint?: PaintDef;
}
