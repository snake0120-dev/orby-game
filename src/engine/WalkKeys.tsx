import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGame } from '../game/store';
import { useTune } from '../game/tuneStore';
import { POSE } from './characterPose';
import { INPUT, walkStep } from './walkInput';

/**
 * Q·E 로 도는 속도 (라디안/초).
 * 2.0 으로 뒀더니 1초만 눌러도 반 바퀴 가까이 돌아 조준이 안 됐다. 1.1 이면
 * 1초에 63°쯤이라 "조금만 더 왼쪽" 이 손에 붙는다.
 */
const TURN = 1.1;

/**
 * **WASD 로 걷고, 1인칭에서는 Q·E 로 돈다.**
 *
 * 클릭해서 가는 길찾기는 그대로 둔다 — 전시 키오스크에는 키보드가 없고, 아이가
 * 배워야 할 조작이 하나여야 한다는 원칙이 그대로다. 키보드는 **만드는 사람이
 * 맵을 돌아다니며 확인할 때** 쓰는 길이다.
 *
 * 한 번 누를 때마다 **한 칸**을 길찾기에 맡긴다(`requestMove`). 직접 좌표를
 * 밀지 않는 이유는, 그래야 벽·계단·구멍 같은 규칙이 클릭으로 갈 때와 완전히
 * 같아지기 때문이다. 누르고 있으면 도착할 때마다 다음 칸을 잇는다.
 */
export function WalkKeys() {
  const fpv = useTune((s) => s.fpv);

  useEffect(() => {
    const typing = (el: EventTarget | null) => {
      const e = el as HTMLInputElement | null;
      return e?.tagName === 'TEXTAREA' ||
        (e?.tagName === 'INPUT' &&
          ['text', 'number', 'search', 'email', 'password', 'url'].includes(e.type));
    };
    /**
     * **자판 위치(`code`)로 읽는다.** `key` 로 읽으면 한글 입력기가 켜져 있을 때
     * W 가 `ㅈ`, A 가 `ㅁ` 으로 들어와서 아무것도 안 잡힌다 — 실제로 그렇게
     * 안 움직였다. `code` 는 입력기·자판 배열과 무관하게 `KeyW` 로 온다.
     */
    const nameOf = (e: KeyboardEvent): string | null => {
      const m = /^Key([WASDQE])$/.exec(e.code);
      if (m) return m[1].toLowerCase();
      // `code` 가 없는 환경(옛 브라우저·일부 가상 키보드)을 위한 대비책
      const k = e.key?.toLowerCase();
      return k && k.length === 1 && 'wasdqe'.includes(k) ? k : null;
    };
    const down = (e: KeyboardEvent) => {
      if (typing(e.target)) return;
      const k = nameOf(e);
      if (k) { INPUT.keys.add(k); e.preventDefault(); }
    };
    const up = (e: KeyboardEvent) => {
      const k = nameOf(e);
      if (k) INPUT.keys.delete(k);
    };
    // 창 밖으로 나가면 눌린 채로 남는다 — 그러면 아이가 혼자 계속 걷는다
    const clear = () => INPUT.keys.clear();

    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      INPUT.keys.clear();
    };
  }, []);

  // 1인칭을 켤 때마다 시선을 "아이가 보던 쪽"에서 새로 이어받는다
  useEffect(() => { INPUT.synced = false; }, [fpv]);

  useFrame((_, dt) => {
    const keys = INPUT.keys;

    if (fpv) {
      /* 시선 이어받기는 **첫 프레임에** 한다. 효과(useEffect)에서 하면 아직
         `Character` 가 한 번도 안 돌아 `POSE.yaw` 가 0 이고, 1인칭을 켜는 순간
         아이가 엉뚱한 쪽으로 홱 돈다 — 저장소에 켜진 채로 들어오면 늘 그랬다. */
      if (!INPUT.synced) { INPUT.heading = POSE.yaw; INPUT.synced = true; }
      if (keys.has('q')) INPUT.heading += TURN * dt;
      if (keys.has('e')) INPUT.heading -= TURN * dt;
    }

    /* 아직 걷는 중이면 새 목적지를 주지 않는다. 매 프레임 길찾기를 돌리면
       아이가 한 칸도 못 가고 제자리에서 떤다. */
    const { path, playerCell, map, phase } = useGame.getState();
    if (!map || phase !== 'playing' || path.length) return;

    const step = walkStep(keys, fpv ? INPUT.heading : null);
    if (!step) return;
    useGame.getState().requestMove([playerCell[0] + step[0], playerCell[1] + step[1]]);
  });

  return null;
}
