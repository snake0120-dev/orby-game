import { useEffect, useState } from 'react';
import { useEdit } from './editStore';
import { POSE } from '../engine/characterPose';
import { VOXEL } from '../theme';
import { useBrush } from '../game/brushStore';
import { useMarks } from '../game/markStore';
import { immigration } from '../game/stages/02-immigration';
import { PLACEABLE, isEmissive, lookupBlock, stripNamespace } from '../game/blocks';
import { useTune } from '../game/tuneStore';
import { placedAt, saveToFile, toSnippet, type PartsFile } from './parts';

/**
 * 개체 패널 — 2구역의 부스·심사대·난간·통로·밑동을 **번호로 골라** 옮기고 지운다.
 *
 * `1` 로 열고 `2` 로 닫는다. 개체를 고른 뒤 **방향키**로 밀 수도 있다
 * (↑↓ = z, ←→ = x, Shift+↑↓ = 높이).
 *
 * 여기서 옮긴 자리는 브라우저에만 남는다. 마음에 들면 **값 복사** 로 뽑아
 * `scripts/make-zone2.mjs` 에 반영하고 `npm run map:zone2` 를 돌려야
 * 여정(1→2→3→4)에서도 같은 자리가 나온다.
 */
export function PartsPanel({ file }: { file: PartsFile }) {
  const e = useEdit();
  const handCount = useBrush((s) => Object.keys(s.blocks).length);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<'' | '저장했습니다' | '저장 실패'>('');

  if (!e.open) return null;

  const kinds = [...new Set(file.parts.map((p) => p.kind))];
  const changed = Object.keys(e.edits).length + handCount;

  const copy = () => {
    void navigator.clipboard.writeText(toSnippet(file, e.edits));
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const save = () => {
    saveToFile(file, e.edits, e.view, useBrush.getState().blocks).then(
      () => setSaved('저장했습니다'),
      () => setSaved('저장 실패'),
    );
    setTimeout(() => setSaved(''), 2200);
  };

  return (
    <div style={S.panel}>
      <div>
        <div style={S.title}>개체 {file.parts.length}개</div>
        <div style={S.hint}>
          개체를 고른 뒤 방향키로 민다 — ←→ 가로 · ↑↓ 세로 · Shift+↑↓ 높이.
          <br />아이는 <b>W A S D</b> 로 걷는다. 1인칭에서는 <b>Q E</b> 로 돈다.
          <br />닫기는 <b>2</b> 번.
        </div>
      </div>

      <ChildCell />

      <div style={S.row}>
        <span style={S.dim}>한 번에</span>
        {[1, 2, 5].map((n) => (
          <button
            key={n}
            style={{ ...S.chip, ...(e.step === n ? S.chipOn : null) }}
            onClick={() => e.set({ step: n })}
          >
            {n}칸
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button style={S.chip} onClick={e.resetAll} disabled={!changed}>
          전부 되돌리기
        </button>
      </div>

      <BrushSection file={file} />
      <MarkSection />
      <ViewSection />

      {kinds.map((kind) => (
        <div key={kind}>
          <div style={S.group}>{kind}</div>
          {file.parts.filter((p) => p.kind === kind).map((p) => {
            const ed = e.edits[p.id];
            const at = placedAt(p, e.edits);
            const on = e.selected === p.id;
            const moved = !!ed?.d && (ed.d[0] !== 0 || ed.d[1] !== 0 || ed.d[2] !== 0);
            return (
              <div key={p.id} style={{ ...S.item, ...(on ? S.itemOn : null) }}>
                <button style={S.name} onClick={() => e.set({ selected: on ? null : p.id })}>
                  <span style={S.no}>{p.no}</span>
                  <span style={{ opacity: ed?.hidden ? 0.4 : 1 }}>{p.label}</span>
                </button>

                <div style={S.coords}>
                  <span style={moved ? S.hot : S.dim}>x {at[0]}</span>
                  <span style={moved ? S.hot : S.dim}>y {at[1]}</span>
                  <span style={moved ? S.hot : S.dim}>z {at[2]}</span>
                </div>

                <div style={S.pad}>
                  <button style={S.key} onClick={() => e.nudge(p.id, -e.step, 0, 0)}>←</button>
                  <button style={S.key} onClick={() => e.nudge(p.id, e.step, 0, 0)}>→</button>
                  <button style={S.key} onClick={() => e.nudge(p.id, 0, 0, -e.step)}>↑</button>
                  <button style={S.key} onClick={() => e.nudge(p.id, 0, 0, e.step)}>↓</button>
                  <button style={S.key} onClick={() => e.nudge(p.id, 0, e.step, 0)}>▲</button>
                  <button style={S.key} onClick={() => e.nudge(p.id, 0, -e.step, 0)}>▼</button>
                  <span style={{ flex: 1 }} />
                  <button
                    style={{ ...S.key, ...(ed?.hidden ? S.keyOn : null) }}
                    onClick={() => e.toggleHidden(p.id)}
                    title={ed?.hidden ? '되살리기' : '지우기'}
                  >
                    {ed?.hidden ? '＋' : '✕'}
                  </button>
                  <button style={S.key} onClick={() => e.resetPart(p.id)} title="제자리로">
                    ⟲
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      <button style={S.copy} onClick={save}>
        {saved || `지금 저장 ${changed ? `(${changed}개)` : ''}`}
      </button>
      <div style={S.hint}>
        {e.savedAt
          ? `자동 저장됨 · ${new Date(e.savedAt).toLocaleTimeString('ko-KR')}`
          : '바꾸는 즉시 파일에 저장됩니다.'}
      </div>
      <button style={S.copy2} onClick={copy} disabled={!changed}>
        {copied ? '복사했습니다' : '값 복사'}
      </button>
      <div style={S.hint}>
        값은 프로젝트 폴더의 <code>zone2-edits.json</code> 에 적힙니다 — 창을 바꿔
        열어도, 제가 열어도 <b>같은 걸 봅니다.</b>
        <br />손으로 놓은 블록은 <code>npm run map:zone2</code> 를 돌리면
        여정(1→2→3→4)에도 그대로 들어갑니다. 개체를 <b>옮긴 자리</b>는 아직
        <code>scripts/make-zone2.mjs</code> 에 제가 옮겨 적어야 합니다.
      </div>
    </div>
  );
}

/**
 * **블록 붓** — 마우스로 블록을 하나씩 놓는다 (`BlockBrush`).
 *
 * 생성기를 고치지 않고 칸 하나를 얹거나 파내는 자리다. 켜 두면 **클릭이
 * 이동이 아니라 설치**가 되므로, 아이를 걸려 보려면 다시 꺼야 한다 —
 * 그래서 켜져 있는 동안 제목에 표시를 남긴다.
 */
/**
 * 구역 팔레트에 없어도 **붓 앞줄에 늘 두는** 블록.
 *
 * 버섯등(주황 발광)이 여기 있는 이유: 2구역이 쓰는 발광 블록은 글로스톤과
 * froglight 둘 다 흰 계열이라, 따뜻한 등을 하나 놓고 싶을 때 마흔다섯 종을
 * 펼쳐서 찾아야 했다.
 */
const EXTRA = ['minecraft:shroomlight'];

/**
 * **아이가 선 칸**을 패널에 실시간으로 띄운다.
 *
 * 블록을 놓다 보면 "지금 아이가 몇 번 칸에 있나"를 계속 묻게 된다 — 길을 깔거나
 * 벽을 세울 때 그 숫자가 기준이 되기 때문이다. 지금까지는 개발자 콘솔
 * (`window.__pose`)에만 있어서 천우태가 볼 수가 없었다.
 *
 * 값은 `POSE` 에서 읽는다 — `Character` 가 프레임마다 적어 두는 월드 좌표다.
 * 거기에 구독할 방법이 없으니(zustand 가 아니다) 프레임마다 들여다본다.
 *
 * **패널 전체가 아니라 이 조각만 다시 그린다.** 패널에는 개체 열다섯 개와
 * 색 입력이 줄줄이 달려 있어서, 아이가 걸을 때마다 통째로 다시 그리면 블록을
 * 놓는 손이 뻑뻑해진다. 그래서 칸이 **실제로 바뀌었을 때만** state 를 건드린다
 * (같으면 같은 배열을 그대로 돌려줘서 React 가 건너뛴다).
 */
function ChildCell() {
  const [at, setAt] = useState<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      // 월드 좌표 → 칸. 블록 중심이 (x,y,z)·VOXEL 이라 반올림하면 칸 번호다.
      const x = Math.round(POSE.at.x / VOXEL);
      const y = Math.round(POSE.at.y / VOXEL);
      const z = Math.round(POSE.at.z / VOXEL);
      setAt((p) => (p[0] === x && p[1] === y && p[2] === z ? p : [x, y, z]));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div style={S.row}>
      <span style={S.dim}>아이 자리</span>
      <span style={S.hot}>x {at[0]}</span>
      <span style={S.hot}>z {at[2]}</span>
      {/* 높이는 거의 안 변해서(바닥이 한 층) 흐리게 둔다 */}
      <span style={S.dim}>y {at[1]}</span>
    </div>
  );
}


function BrushSection({ file }: { file: PartsFile }) {
  const b = useBrush();
  const [all, setAll] = useState(false);

  /* 이 구역에 **실제로 쓰인** 블록을 먼저 보여준다. 쉰 가지 중에서 고르는 건
     느린데, 구역의 색을 벗어난 블록을 놓으면 어차피 다시 지우게 된다. */
  const mine = [
    ...file.palette.filter((n) => !!lookupBlock(n)?.color),
    ...EXTRA.filter((n) => !file.palette.includes(n)),
  ];
  const rest = PLACEABLE.map((p) => p.name).filter((n) => !mine.includes(n));
  const count = Object.keys(b.blocks).length;

  const swatch = (name: string) => {
    const color = lookupBlock(name)?.color ?? '#888';
    return (
      <button
        key={name}
        title={stripNamespace(name) + (isEmissive(name) ? ' (빛남)' : '')}
        onClick={() => b.set({ block: name, on: true })}
        style={{
          ...S.sw,
          background: color,
          // 빛나는 블록은 **제 색으로 번지게** 그린다 — 눌러보기 전에 구분된다
          boxShadow: b.block === name
            ? '0 0 0 2px #e39f44'
            : isEmissive(name) ? `0 0 6px 1px ${color}` : 'inset 0 0 0 1px #0006',
        }}
      />
    );
  };

  return (
    <div>
      <div style={S.group}>블록 놓기</div>
      <div style={S.item}>
        <div style={S.pad}>
          <button
            style={{ ...S.chip, ...(b.on ? S.chipOn : null) }}
            onClick={() => b.set({ on: !b.on })}
          >
            {b.on ? '붓 켜짐 (B)' : '붓 켜기 (B)'}
          </button>
          {b.on && (
            <>
              <button
                style={{ ...S.chip, ...(b.mode === 'place' ? S.chipOn : null) }}
                onClick={() => b.set({ mode: 'place' })}
              >
                놓기
              </button>
              <button
                style={{ ...S.chip, ...(b.mode === 'erase' ? S.chipOn : null) }}
                onClick={() => b.set({ mode: 'erase' })}
              >
                지우기
              </button>
            </>
          )}
        </div>

        <div style={S.hint}>
          {b.on ? (
            <>
              면을 누르면 그 면에 한 칸 붙는다 · <b>끌면</b> 이어서 놓인다
              <br />오른쪽 단추나 <b>Alt</b> 는 반대 손짓 · 가운데 단추는 스포이드
              <br /><b>Ctrl+Z</b> 되돌리기 · <b>Ctrl+Shift+Z</b> 다시
              <br />켜져 있는 동안은 눌러도 <b>아이가 안 움직인다.</b>
            </>
          ) : (
            '켜면 마우스로 블록을 하나씩 놓고 지울 수 있습니다.'
          )}
        </div>

        <div style={S.vrow}>
          <span style={S.vlabel}>지금 블록</span>
          <span
            style={{ ...S.sw, background: lookupBlock(b.block)?.color ?? '#888', cursor: 'default' }}
          />
          <span style={{ fontSize: 'calc(var(--u) * 0.88)' }}>{stripNamespace(b.block)}</span>
        </div>

        <div style={S.swrow}>{mine.map(swatch)}</div>
        <button style={S.groupBtn} onClick={() => setAll(!all)}>
          {all ? '▾' : '▸'} 다른 블록 {rest.length}종
        </button>
        {all && <div style={S.swrow}>{rest.map(swatch)}</div>}

        <div style={S.pad}>
          <span style={S.dim}>놓은 블록 {count}칸</span>
          <span style={{ flex: 1 }} />
          <button style={S.key} onClick={b.undo} disabled={!b.past.length} title="되돌리기">⟲</button>
          <button style={S.key} onClick={b.redo} disabled={!b.future.length} title="다시">⟳</button>
          <button style={S.chip} onClick={b.reset} disabled={!count}>전부 지우기</button>
        </div>
      </div>
    </div>
  );
}

/**
 * **전체 뷰** — 개체 하나가 아니라 화면 전체에 걸리는 값.
 *
 * 여기서 만진 값은 `useTune` 에 바로 꽂히고 브라우저에도 남는다. 개체를 옮길
 * 때마다 맵을 통째로 다시 싣는데(`Zone2.tsx`), 그때 `useTune` 이 스테이지
 * 기본값으로 되돌아가기 때문에 **다시 꽂아 줘야** 맞춰 둔 톤이 안 날아간다.
 */
/**
 * **체크포인트 ✦** — 떠 있는 별 표식을 놓고 옮긴다.
 *
 * 블록이 아니라 그려 넣는 것이라(결정 ㊳) 여기서 미는 건 **맵을 다시 굽지
 * 않는다.** 개체를 미는 것과 달리 한 칸 옮길 때마다 멈칫하지 않는 이유다.
 *
 * **놓는 자리는 아이가 선 칸**이다. 좌표를 손으로 적는 것보다, 보고 싶은 데로
 * 걸어가서 누르는 쪽이 훨씬 빠르다 — 숫자는 놓고 나서 맞추면 된다.
 */
function MarkSection() {
  const marks = useMarks((m) => m.marks);
  const selected = useMarks((m) => m.selected);
  const [open, setOpen] = useState(true);

  const add = () => {
    const x = Math.round(POSE.at.x / VOXEL);
    const z = Math.round(POSE.at.z / VOXEL);
    useMarks.getState().add([x, z]);
  };

  return (
    <div>
      <button style={S.groupBtn} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} 체크포인트 ✦ {marks.length}개
      </button>
      {open && (
        <div style={S.item}>
          <div style={S.vrow}>
            <button style={S.chip} onClick={add}>아이 자리에 추가</button>
            <span style={{ flex: 1 }} />
            <button
              style={S.chip}
              onClick={() => useMarks.getState().select(null)}
              disabled={!selected}
            >
              고르기 해제
            </button>
            <button
              style={S.chip}
              onClick={() => useMarks.getState().restore(immigration.marks)}
              title="스테이지 파일에 적힌 기본값으로"
            >
              되돌리기
            </button>
          </div>
          <div style={S.hint}>
            고른 뒤 <b>방향키</b>로 민다 — ←→ 가로 · ↑↓ 세로 · Shift+↑↓ 높이.
            <br />한 번에 미는 칸 수는 맨 위 <b>한 번에</b> 를 따른다.
          </div>

          {marks.length === 0 && <div style={S.hint}>아직 없습니다.</div>}

          {marks.map((m) => {
            const on = m.id === selected;
            const step = (k: 'height' | 'scale', by: number) => {
              const cur = useMarks.getState().marks.find((q) => q.id === m.id);
              if (!cur) return;
              useMarks.getState().set(m.id, {
                [k]: Math.max(k === 'scale' ? 0.2 : 0, +(cur[k] + by).toFixed(2)),
              });
            };
            return (
              <div key={m.id} style={{ ...S.item, ...(on ? S.itemOn : null) }}>
                <button style={S.name} onClick={() => useMarks.getState().select(on ? null : m.id)}>
                  <span style={S.no}>✦</span>
                  <span>{m.id}</span>
                </button>
                <div style={S.coords}>
                  <span style={on ? S.hot : S.dim}>x {m.at[0]}</span>
                  <span style={on ? S.hot : S.dim}>z {m.at[1]}</span>
                </div>
                <div style={S.vrow}>
                  <span style={S.vlabel}>높이(칸)</span>
                  <button style={S.key} onClick={() => step('height', -1)}>−</button>
                  <span style={S.vval}>{m.height.toFixed(0)}</span>
                  <button style={S.key} onClick={() => step('height', 1)}>＋</button>
                </div>
                <div style={S.vrow}>
                  <span style={S.vlabel}>크기</span>
                  <button style={S.key} onClick={() => step('scale', -0.2)}>−</button>
                  <span style={S.vval}>{m.scale.toFixed(1)}</span>
                  <button style={S.key} onClick={() => step('scale', 0.2)}>＋</button>
                </div>
                <div style={S.pad}>
                  <span style={{ flex: 1 }} />
                  <button
                    style={S.key}
                    onClick={() => useMarks.getState().remove(m.id)}
                    title="지우기"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ViewSection() {
  const { view, setView, resetView } = useEdit();
  const t = useTune();
  const [open, setOpen] = useState(true);

  /* 값을 **누를 때 store 에서 다시 읽는다.** 그릴 때의 값을 들고 있으면 빠르게
     여러 번 눌렀을 때 전부 같은 값에서 계산해 한 번만 움직인다 — 그렇게 겪었다. */
  const step = (k: keyof typeof view, by: number) =>
    setView({ [k]: +(((useTune.getState()[k] as number) ?? 0) + by).toFixed(3) });

  const num = (k: keyof typeof view, label: string, cur: number, by: number, digits = 2) => (
    <div style={S.vrow} key={k}>
      <span style={S.vlabel}>{label}</span>
      <button style={S.key} onClick={() => step(k, -by)}>−</button>
      <span style={S.vval}>{cur.toFixed(digits)}</span>
      <button style={S.key} onClick={() => step(k, by)}>＋</button>
    </div>
  );
  const hue = (k: keyof typeof view, label: string, cur: string) => (
    <div style={S.vrow} key={k}>
      <span style={S.vlabel}>{label}</span>
      <input
        type="color" value={cur} style={S.swatch}
        onChange={(ev) => setView({ [k]: ev.target.value })}
      />
      <span style={S.vval}>{cur}</span>
    </div>
  );

  return (
    <div>
      <button style={S.groupBtn} onClick={() => setOpen(!open)}>
        {open ? '▾' : '▸'} 전체 뷰
      </button>
      {open && (
        <div style={S.item}>
          <div style={S.vrow}>
            <span style={S.vlabel}>보기</span>
            <button
              style={{ ...S.chip, ...(t.fpv ? S.chipOn : null) }}
              onClick={() => setView({ fpv: !useTune.getState().fpv })}
            >
              {t.fpv ? '아이 눈으로 보는 중' : '아이 눈으로 보기'}
            </button>
          </div>
          <div style={S.hint}>
            {t.fpv ? 'W A S D 앞뒤·옆걸음 · Q E 돌기' : 'W A S D 로 아이가 걷는다'}
          </div>

          <div style={S.vrow}>
            <span style={S.vlabel}>그림자</span>
            <button
              style={{ ...S.chip, ...(t.shadows ? S.chipOn : null) }}
              onClick={() => setView({ shadows: !useTune.getState().shadows })}
            >
              {t.shadows ? '켜짐' : '꺼짐'}
            </button>
          </div>
          <div style={S.hint}>
            그림자 한 장을 만들려면 <b>맵 전체를 한 번 더 그린다</b> — 매 프레임에서
            제일 큰 덩어리입니다. 전시 기기가 버거우면 여기서 먼저 꺼 보세요.
          </div>

          <div style={S.vsep}>카메라 밀기 (화면 기준)</div>
          <div style={S.pad}>
            <button style={S.key} onClick={() => step('panX', -2)}>←</button>
            <button style={S.key} onClick={() => step('panX', 2)}>→</button>
            <button style={S.key} onClick={() => step('panY', 2)}>↑</button>
            <button style={S.key} onClick={() => step('panY', -2)}>↓</button>
            <span style={S.vval}>{t.panX}, {t.panY}</span>
            <span style={{ flex: 1 }} />
            <button style={S.key} onClick={() => setView({ panX: 0, panY: 0 })} title="가운데로">
              ⟲
            </button>
          </div>

          <div style={S.vsep}>화면</div>
          {num('pathRadius', '빛길 반경(칸)', t.pathRadius, 1, 0)}
          {num('glowRadius', '조명 반경(칸)', t.glowRadius, 1, 0)}
          {num('cameraPadding', '줌(여백)', t.cameraPadding, 0.02)}
          {num('characterScale', '아이 키', t.characterScale, 0.1)}
          <div style={S.vsep}>색 그라디언트</div>
          {hue('gradLow', '아래 색', t.gradLow)}
          {num('gradLowMix', '아래 세기', t.gradLowMix, 0.02)}
          {hue('gradHigh', '위 색', t.gradHigh)}
          {num('gradHighMix', '위 세기', t.gradHighMix, 0.02)}
          {num('gradFloor', '시작 높이', t.gradFloor, 1, 0)}
          {num('gradSpan', '구간', t.gradSpan, 1, 0)}
          <div style={S.pad}>
            <span style={{ flex: 1 }} />
            <button style={S.chip} onClick={resetView} disabled={!Object.keys(view).length}>
              전체 뷰 되돌리기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    left: 'calc(var(--u) * 1.6)',
    top: 'calc(var(--u) * 1.6)',
    bottom: 'calc(var(--u) * 1.6)',
    width: 'calc(var(--u) * 26)',
    overflowY: 'auto',
    pointerEvents: 'auto',
    padding: 'calc(var(--u) * 1.6)',
    borderRadius: 'calc(var(--u) * 1)',
    background: '#12141ceb',
    border: '1px solid #ffffff1a',
    color: '#e8e4dc',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 'calc(var(--u) * 1.05)',
    lineHeight: 1.5,
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(var(--u) * 1.1)',
    zIndex: 40,
  },
  title: { fontSize: 'calc(var(--u) * 1.4)', fontWeight: 700 },
  hint: { opacity: 0.55, fontSize: 'calc(var(--u) * 0.92)', lineHeight: 1.5 },
  groupBtn: {
    all: 'unset', cursor: 'pointer', opacity: 0.6,
    margin: 'calc(var(--u) * 0.6) 0 calc(var(--u) * 0.3)', display: 'block',
  },
  vrow: {
    display: 'flex', alignItems: 'center', gap: 'calc(var(--u) * 0.4)',
    fontSize: 'calc(var(--u) * 0.95)',
  },
  vlabel: { flex: 1, opacity: 0.7 },
  vval: { minWidth: 'calc(var(--u) * 3.4)', textAlign: 'right' },
  vsep: { opacity: 0.45, marginTop: 'calc(var(--u) * 0.5)' },
  swatch: {
    width: 'calc(var(--u) * 2.2)', height: 'calc(var(--u) * 1.3)',
    padding: 0, border: 'none', background: 'none', cursor: 'pointer',
  },
  group: {
    opacity: 0.5, textTransform: 'none', letterSpacing: '0.04em',
    margin: 'calc(var(--u) * 0.6) 0 calc(var(--u) * 0.3)',
  },
  row: { display: 'flex', gap: 'calc(var(--u) * 0.5)', alignItems: 'center' },
  dim: { opacity: 0.5 },
  hot: { color: '#e6b877' },
  item: {
    border: '1px solid #ffffff14', borderRadius: 'calc(var(--u) * 0.6)',
    padding: 'calc(var(--u) * 0.6)', marginBottom: 'calc(var(--u) * 0.5)',
    display: 'flex', flexDirection: 'column', gap: 'calc(var(--u) * 0.4)',
  },
  itemOn: { border: '1px solid #e39f44', background: '#e39f4414' },
  name: {
    all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center',
    gap: 'calc(var(--u) * 0.6)',
  },
  no: {
    display: 'inline-block', minWidth: 'calc(var(--u) * 1.8)', textAlign: 'center',
    background: '#ffffff1a', borderRadius: 'calc(var(--u) * 0.35)',
    fontSize: 'calc(var(--u) * 0.9)',
  },
  coords: { display: 'flex', gap: 'calc(var(--u) * 0.9)', fontSize: 'calc(var(--u) * 0.92)' },
  pad: { display: 'flex', gap: 'calc(var(--u) * 0.3)', alignItems: 'center' },
  key: {
    all: 'unset', cursor: 'pointer', textAlign: 'center',
    minWidth: 'calc(var(--u) * 1.8)', padding: 'calc(var(--u) * 0.15) 0',
    background: '#ffffff12', borderRadius: 'calc(var(--u) * 0.35)',
  },
  keyOn: { background: '#e39f4455', color: '#fff' },
  chip: {
    all: 'unset', cursor: 'pointer', padding: 'calc(var(--u) * 0.15) calc(var(--u) * 0.6)',
    background: '#ffffff12', borderRadius: 'calc(var(--u) * 0.35)',
    fontSize: 'calc(var(--u) * 0.92)',
  },
  chipOn: { background: '#e39f44', color: '#1a1a1a' },
  swrow: { display: 'flex', flexWrap: 'wrap', gap: 'calc(var(--u) * 0.25)' },
  sw: {
    all: 'unset', cursor: 'pointer', display: 'inline-block',
    width: 'calc(var(--u) * 1.5)', height: 'calc(var(--u) * 1.5)',
    borderRadius: 'calc(var(--u) * 0.3)', boxShadow: 'inset 0 0 0 1px #0006',
  },
  swOn: { boxShadow: '0 0 0 2px #e39f44' },
  copy: {
    all: 'unset', cursor: 'pointer', textAlign: 'center',
    padding: 'calc(var(--u) * 0.6)', background: '#e39f44', color: '#1a1a1a',
    borderRadius: 'calc(var(--u) * 0.5)', fontWeight: 700,
  },
  copy2: {
    all: 'unset', cursor: 'pointer', textAlign: 'center',
    padding: 'calc(var(--u) * 0.45)', background: '#ffffff14',
    borderRadius: 'calc(var(--u) * 0.5)',
  },
};
