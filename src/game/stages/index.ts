import type { Stage } from '../types';
import { gate } from './01-gate';
import { immigration } from './02-immigration';
import { concourse } from './03-concourse';
import { lounge } from './04-lounge';
import { stage01 } from './01-checkin';

/**
 * 여정 순서대로. 지금은 **비행기에서 내린 뒤 네 구역**이다.
 *   환승 게이트 → 입국 수속 → 환승 통로 → 대기실
 *
 * 이 단계의 목적은 맵 재현이라 상호작용은 아직 붙이지 않았다.
 * 확인하는 것은 셋뿐이다: 스폰 · 캐릭터 이동 · 관문 통과.
 *
 * 한 구역을 통과하면 바로 다음 구역으로 이어진다 — 네 구역이 한 여정이다.
 */
export const STAGES: Stage[] = [gate, immigration, concourse, lounge];

/**
 * 여정에 없는 확인용 스테이지.
 * `?stage=01-checkin` 처럼 id 로 연다.
 */
export const DEV_STAGES: Stage[] = [stage01];
