import { Clouds } from './Clouds';
import { Layer } from './Layer';
import { Sky } from './Sky';
import { SKY_MID } from './palette';

const base = import.meta.env.BASE_URL;

/**
 * 대기화면 한 장 — 뒤에서 앞으로 네 겹이다.
 *
 *   ① 하늘      3D 그라데이션
 *   ② 구름      3D · 왼쪽으로 흐른다
 *   ③ 날개      그림 (`날개 파츠.png`)
 *   ④ 객실 벽 + 창틀  그림 (`비행기 창문 파츠.png` — 창구멍을 투명으로 뚫어둔 것)
 *
 * ④ 가 창밖을 오려내는 판 노릇을 한다. 하늘과 구름은 화면 전체에 그려두고,
 * 창구멍 밖은 ④ 가 덮는다. 창 모양을 3D 쪽에서 흉내 낼 필요가 없다.
 *
 * 날개(③)를 창틀과 따로 받은 덕에 **구름 앞·창틀 뒤**에 끼울 수 있다.
 * 한 장으로 합쳐져 있으면 구름이 날개 위로 지나가버린다.
 */
export function OpeningScene() {
  return (
    <>
      {/* 멀리 있는 구름은 하늘색에 잠긴다 — 창밖 깊이가 이 안개에서 나온다 */}
      <fog attach="fog" args={[SKY_MID, 45, 115]} />
      <Sky />

      {/* 구름 덩어리가 읽히게 하는 최소한의 빛. 위에서 비스듬히 하나면 충분하다. */}
      <ambientLight intensity={1.15} />
      <directionalLight position={[-8, 12, 10]} intensity={1.5} />

      <Clouds />

      <Layer url={`${base}opening/wing.png`} z={-2.4} order={1} />
      <Layer url={`${base}opening/wall.png`} z={0.4} order={2} />
    </>
  );
}
