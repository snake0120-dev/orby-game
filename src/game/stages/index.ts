import type { Stage } from '../types';
import { gate } from './01-gate';
import { immigration } from './02-immigration';
import { terminal } from './03-terminal';
import { lounge } from './04-lounge';
import { stage01 } from './01-checkin';

/**
 * 여정 순서대로. 지금은 **비행기에서 내린 뒤 네 구역**이다.
 *   환승 게이트 → 입국 수속 → 공항 터미널 → 대기실
 *
 * 이 단계의 목적은 맵 재현이라 상호작용은 아직 붙이지 않았다.
 * 확인하는 것은 셋뿐이다: 스폰 · 캐릭터 이동 · 관문 통과.
 *
 * 한 구역을 통과하면 바로 다음 구역으로 이어진다 — 네 구역이 한 여정이다.
 *
 * **3구역 자리는 `03-concourse`(환승 통로)에서 `03-terminal`(공항 터미널)로
 * 갈아끼웠다.** 터미널은 "2번 이후 이어지는 부분" 그림으로 지은 것이라 입국 수속
 * 바로 다음이 제자리고, 두 구역이 **유리 통로 하나로 이어진다** (결정 ㊷).
 * 환승 통로 파일(`03-concourse.ts` · `concourse.json`)은 지우지 않고 빼두기만 했다 —
 * 나중에 쓸 수 있다. 터미널의 `index` 가 이미 3이라 뒤 구역 번호는 안 밀렸다.
 */
export const STAGES: Stage[] = [gate, immigration, terminal, lounge];

/**
 * 여정에 없는 확인용 스테이지.
 * `?stage=01-checkin` 처럼 id 로 연다.
 */
export const DEV_STAGES: Stage[] = [stage01];
