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
  /** 위아래로 색을 흘릴 것인가 */
  grad?: boolean;
  /** 흘릴 때 **아래쪽** 색 */
  gradTo?: string;
}

/**
 * 직접 칠하기 — 마인크래프트 블록 색을 **덮어쓴다.**
 *
 * 아이소 화면에는 한 블록의 세 면(윗면 +Y · 왼쪽 +Z · 오른쪽 +X)만 보이므로,
 * 면마다 색을 따로 주면 조명 없이도 입체가 선다. 개발 패널에서 맞춘 뒤
 * **값 복사**로 뽑아 여기에 붙인다.
 */
export interface PaintDef {
  /** `'off'` 면 블록 색 그대로 */
  mode: 'off' | 'on';
  top?: FacePaintDef;
  left?: FacePaintDef;
  right?: FacePaintDef;
}

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

/**
 * **둥둥 떠 있는 ORBY 별 표식.**
 *
 * 맵의 한 칸 위에 심볼을 띄워 "여기"를 가리킨다 — 체크포인트처럼.
 * 블록이 아니라 그리는 것이라, 맵을 다시 굽지 않고 자리만 옮기면 된다.
 */
export interface MarkDef {
  /** 스테이지 안에서 유일한 키 */
  id: string;
  /** 맵의 칸 [x, z] */
  at: [number, number];
  /** 바닥에서 띄우는 높이(블록). 비우면 4 */
  height?: number;
  /** 심볼 크기 배수. 비우면 1 (관문 사인과 같은 크기) */
  scale?: number;
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

/**
 * 이 구역에서 아이가 **하는 일** 하나.
 *
 * 순서는 `requires` 가 정한다 — 번호를 매기지 않는 이유는, 중간에 하나를
 * 끼워 넣을 때 뒤 번호를 전부 밀어야 하기 때문이다.
 */
export interface MissionDef {
  id: string;
  /** HUD 에 보이는 이름 */
  label: string;
  /** HUD 아이콘 키 */
  icon?: string;
  /** 이것들이 끝나야 열린다 */
  requires?: string[];
  /** 끝냈을 때 동반자가 하는 말 */
  say?: string;
}

/** 관문 — 이 미션들이 전부 끝나면 열린다 */
export interface GateDef {
  opensOn: string[];
  /**
   * 이 관문이 다음 구역과 **이어진 통로**인가.
   *
   * 2구역의 먼 쪽 유리 통로는 3구역의 유리 통로 A 로 그대로 이어진다 — 같은
   * 건물의 한 복도다. 거기서 "통과!" 전체화면이 뜨면 한 건물이 두 동강 난다.
   * 켜 두면 화면 없이 **밝게 한 번 번졌다가 그대로 이어서 걷는다** (`Seam`).
   */
  seam?: boolean;
}

export interface Stage {
  /** `01-gate` 처럼 파일 이름과 같은 키 */
  id: string;
  /** 화면에 보이는 구역 번호 */
  index: number;
  title: string;
  /** **이 구역에서 아이가 배워갈 행동 한 문장.** 비면 검사기가 잡는다. */
  learningGoal: string;
  /** 정서적 무게 — `light` 튜토리얼 · `mid` 보통 · `deep` 긴장되는 구간 */
  tier: 'light' | 'mid' | 'deep';

  /** public/maps 아래 파일명 */
  map: string;

  /** 상호작용 지점. 자리는 맵의 하늘색 양탄자(①~④)가 정한다. */
  props: PropDef[];
  missions: MissionDef[];
  gate: GateDef;

  /** 구역에 들어설 때 동반자가 하는 말 */
  intro?: string;
  /** 아이 머리 위에 늘 띄워 둘 말풍선 (없으면 안 띄운다) */
  bubble?: string;

  /**
   * **앞쪽 벽을 턱 몇 칸만 남기고 자른다.**
   *
   * 카메라가 +x·+z 쪽 위에서 내려다보므로 그쪽 벽을 그대로 두면 방 안이
   * 가린다. 99 면 사실상 안 자른다(2층짜리 맵은 자르면 아래층이 썰린다).
   */
  cutaway?: number;
  /** 천장이 시작하는 높이. 아이소에서는 걷어내고 1인칭에서만 덮는다. */
  ceiling?: number;
  /**
   * **빛나는 블록이 아이 가까이에서만 켜진다.**
   *
   * 켜면 이 구역의 발광 블록 전부가 평소에는 꺼져 있다가, 아이가 `pathRadius`
   * 칸 안으로 들어오면 밝아진다 (`VoxelGrid` 의 `NearGlow` · 결정 ㊲).
   * 바닥 유도 동선만이 아니라 벽 띠·사인·전구까지 다 걸린다 — 한쪽만 걸면
   * 꺼진 길 옆에서 벽이 혼자 타올라 "여기가 길이다"가 안 읽힌다.
   *
   * 1구역처럼 등대 불빛이 **멀리 보여야** 하는 구역에서는 켜면 안 된다.
   */
  glowNear?: boolean;
  /**
   * **바닥 유도 동선에 깔린 빛 블록 이름.**
   *
   * `glowNear` 가 켜진 구역에서 이 블록만 `pathRadius`(좁게) 를 쓰고, 나머지
   * 조명은 `glowRadius`(넓게) 를 쓴다. 길은 발밑이라 좁아야 하고, 벽·천장
   * 조명은 둘러보는 것이라 넓어야 한다.
   */
  pathGlow?: string;
  /**
   * 뒤에 세울 장식 구조물들. 걷지도 부딪히지도 않는다.
   * 좌표·크기는 월드 단위 (1블록 = VOXEL).
   *
   * 배열인 이유: 등대·구름처럼 여러 개가 들어가고, 각자 위치와 거리감을
   * 따로 잡아야 한다. 개발 패널이 이 목록을 그대로 선택지로 쓴다.
   */
  backdrops?: BackdropDef[];
  /** 둥둥 떠 있는 ORBY 별 표식 (`FloatMarks`) */
  marks?: MarkDef[];
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
