import { useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGame } from '../game/store';
import { useTune } from '../game/tuneStore';
import { INPUT, KEY, WALK_KEYS, walkStep } from './walkInput';

/**
 * Q·E 로 도는 속도 (라디안/초).
 * 2.0 으로 뒀더니 1초만 눌러도 반 바퀴 가까이 돌아 조준이 안 됐다. 1.1 이면
 * 1초에 63°쯤이라 "조금만 더 왼쪽" 이 손에 붙는다.
 */
const TURN = 1.1;

/**
 * **C D E F 로 걷고, 1인칭에서는 I·G 로 돈다** (`walkInput.ts` 의 `KEY`).
 * 전시에서 쓸 **컨트롤러가 그 글자들을 보낸다** — 그래서 W A S D Q E 는 뗐다.
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
      const m = /^Key([A-Z])$/.exec(e.code);
      const k = m ? m[1].toLowerCase() : e.key?.toLowerCase();
      // `code` 가 없는 환경(옛 브라우저·일부 가상 키보드)을 위한 대비책이 뒷쪽이다
      return k && k.length === 1 && WALK_KEYS.includes(k) ? k : null;
    };
    /* 거들쇠(Shift·Ctrl·⌘·Alt)가 같이 눌린 건 **걷기가 아니다.** 개발용 단축키가
       같은 글자를 Shift 와 함께 쓰고 있어서(`App.tsx` 의 C·G), 여기서 안 걸러내면
       `preventDefault` 로 삼켜 버린다. 컨트롤러는 거들쇠를 안 보낸다. */
    const mod = (e: KeyboardEvent) => e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
    const down = (e: KeyboardEvent) => {
      if (typing(e.target) || mod(e)) return;
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
      /* 시선 이어받기는 **`Character` 가 한다.** r3f 는 useFrame 을 붙은
         순서대로 도는데 `Character` 가 여기보다 먼저라, 여기서 이어받으면
         아이가 이미 옛 시선 쪽으로 한 프레임 돈 뒤다 (3구역에서 1인칭이
         맵 밖을 보던 원인). 여기서는 돌리기만 한다. */
      if (keys.has(KEY.고개왼)) INPUT.heading += TURN * dt;
      if (keys.has(KEY.고개오른)) INPUT.heading -= TURN * dt;
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
