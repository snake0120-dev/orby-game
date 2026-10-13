/**
 * 구역 편집기를 어느 구역에 붙일지 적은 쪽지.
 *
 * 2구역 편집기(`src/zone2/`)는 2구역 이름이 아홉 군데 박혀 있었다. 3구역이
 * 같은 장치를 쓰려면 그 아홉 군데만 밖으로 빼면 된다 — 그게 이 파일이다.
 * **`src/zone2/` 는 그대로 둔다.** 돌아가는 걸 흔들 이유가 없다.
 */
export interface ZoneSpec {
  /** 맵 파일 이름 (`public/maps/<map>.json`, `<map>-parts.json`) */
  map: string;
  /** `compileVoxelMap` 에 넘기는 이름 */
  structure: string;
  /** 자리를 적어 둘 개발 서버 경로 */
  editsRoute: string;
  /** 브라우저 저장소 열쇠 앞자리 — 구역끼리 섞이면 맞춰 둔 값이 날아간다 */
  storeKey: string;
  /** 맵이 없을 때 안내할 명령 */
  generator: string;
}

export const ZONE3: ZoneSpec = {
  map: 'airport',
  structure: 'airport',
  editsRoute: '/__zone3-edits',
  storeKey: 'orby.zone3',
  generator: 'npm run map:zone3',
};
