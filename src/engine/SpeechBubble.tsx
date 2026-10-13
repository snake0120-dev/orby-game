import { useEffect, useState } from 'react';
import { Html } from '@react-three/drei';
import { useGame } from '../game/store';
import { CHARACTER_H, VOXEL } from '../theme';

/**
 * 아이 머리 위에 뜨는 말풍선.
 *
 * 화면 아래 동반자 말풍선(`ui/Companion.tsx`)과 다른 물건이다. 저쪽은 여정 내내
 * 같은 목소리로 안내하는 자막이고, 이쪽은 **지금 이 자리에서 아이가 품는 생각**이라
 * 아이 곁에 붙어 같이 움직인다.
 *
 * 그림은 천우태가 그린 `말풍선/말풍선.png` 다 (흰 바탕 + 주황 테두리 + 꼬리).
 * 여백을 잘라 `public/ui/bubble.png` 로 넣었다 — 원본이 10475×7348 이라 그대로
 * 쓰면 텍스처 한 장에 300MB 다.
 *
 * **글자는 그림에 굽지 않는다.** DOM 으로 얹어야 대사를 바꿀 때 그림을 다시
 * 뽑지 않고, 한글도 화면 해상도 그대로 또렷하다. drei 의 `Html` 이 이 자리의
 * 3D 좌표를 화면 좌표로 옮겨준다 — 아이가 걸으면 말풍선도 따라간다.
 */

/* ── 그림에서 잰 값들 (scripts 없이 눈이 아니라 픽셀로 쟀다) ── */

/** 가로 ÷ 세로 */
const RATIO = 1.2724;
/** 꼬리 끝이 가로로 몇 % 지점인가 — 이 점을 아이 머리에 맞춘다 */
const TAIL_X = 17.8;
/** 무대 가로의 몇 %를 차지하는가. 예시 사진이 20.3%(= `--u` 30) 였고, 그 80%. */
const WIDTH_U = 24;

/**
 * 글자 크기 ÷ 말풍선 가로.
 *
 * `--u` 로 직접 적지 않는 이유: 말풍선 크기를 바꿀 때 글자 크기를 **따로**
 * 고치는 걸 잊으면 글자가 테두리를 뚫는다. 가로에 비례시켜 한 값만 만지게 한다.
 */
const FONT_RATIO = 0.13;

/** 말풍선이 사라지는 데 걸리는 시간 */
const FADE_MS = 1000;

/** 글자 하나가 찍히는 간격 — 사람이 또박또박 쓰는 속도 */
const TYPE_MS = 80;
/** 글자 하나가 떠오르는 시간. 짧게 줘야 "찍힌다" 로 읽힌다 */
const CHAR_MS = 90;

/** 테두리 주황 (#F5A03C) 보다 살짝 밝다 — 예시 사진에서 뽑은 글자색 */
const INK = '#ffa74b';

export function SpeechBubble({ text }: { text: string }) {
  // 걷기 시작하면 조용히 사라진다. 아이가 답을 찾았는데 계속 물으면 잔소리다.
  const moved = useGame((s) => s.moved);
  const shown = useTyping(text);

  return (
    <Html
      // 머리 꼭대기(약 0.97 블록) 바로 위. 이 좌표가 꼬리 끝이 된다.
      position={[0, VOXEL * CHARACTER_H * 1.15, 0]}
      style={{ pointerEvents: 'none' }}
    >
      <div
        style={{
          position: 'relative',
          width: `calc(var(--u) * ${WIDTH_U})`,
          aspectRatio: `${RATIO}`,
          // 꼬리 끝(가로 TAIL_X%, 맨 아래)이 위 좌표에 오게 끌어올린다
          transform: `translate(-${TAIL_X}%, calc(-100% - var(--u) * 0.4))`,
          backgroundImage: `url(${import.meta.env.BASE_URL}ui/bubble.png)`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          opacity: moved ? 0 : 1,
          // linear 이어야 2초를 다 쓴다. ease 로 두면 0.9초 만에 20%까지 떨어져서
          // "서서히" 가 아니라 툭 꺼진 뒤 잔상만 남는 것처럼 보인다.
          transition: `opacity ${FADE_MS}ms linear`,
        }}
      >
        <div
          style={{
            // 꼬리를 뺀 몸통 안쪽. 그림의 흰 바탕이 세로 5~73% 다.
            position: 'absolute',
            inset: '7% 9% 29% 9%',
            display: 'grid',
            placeItems: 'center',
            textAlign: 'center',
            // 고딕. 한글은 단어 중간에서 끊지 않는다 — "어디로 / 가야할까?" 로 접힌다.
            fontFamily: "'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif",
            fontSize: `calc(var(--u) * ${(WIDTH_U * FONT_RATIO).toFixed(2)})`,
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.01em',
            wordBreak: 'keep-all',
            color: INK,
          }}
        >
          {/*
            한 글자씩 **자리는 그대로 두고 켠다.**

            글자를 하나씩 붙여 넣으면(`text.slice(0, n)`) 가운데 정렬이라 줄이
            찍힐 때마다 좌우로 밀리고, 두 줄로 접히는 지점도 중간에 바뀐다.
            다 그려두고 투명도만 올리면 자리가 한 번도 안 움직인다.
          */}
          <span>
            {[...text].map((ch, i) => (
              <span
                key={i}
                style={{
                  opacity: i < shown ? 1 : 0,
                  transition: `opacity ${CHAR_MS}ms ease-out`,
                }}
              >
                {ch}
              </span>
            ))}
          </span>
        </div>
      </div>
    </Html>
  );
}

/**
 * 글자가 하나씩 찍히는 타이밍. 지금까지 보여줄 글자 수를 돌려준다.
 *
 * 대사가 통째로 툭 나타나면 안내문처럼 읽힌다. 한 글자씩 써지면 **아이가 지금
 * 떠올린 생각**으로 읽힌다 — 같은 문장인데 말을 거는 쪽이 달라진다.
 */
function useTyping(text: string): number {
  const [shown, setShown] = useState(0);

  /* 대사가 바뀌면 처음부터 다시 쓴다. effect 로 미루면 새 대사가 한 프레임
     통째로 보였다가 지워져서 깜빡인다 — 렌더 도중 되돌리는 쪽이 맞다.
     (React 가 권하는 "props 가 바뀌면 state 를 맞추는" 꼴이다.) */
  const [typing, setTyping] = useState(text);
  if (typing !== text) {
    setTyping(text);
    setShown(0);
  }

  // 한 글자 찍고 다음 타이머를 건다. 한 번에 도는 interval 보다 멈추기 쉽다.
  useEffect(() => {
    if (shown >= text.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), TYPE_MS);
    return () => clearTimeout(t);
  }, [shown, text]);

  return shown;
}
