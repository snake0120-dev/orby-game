import { useState } from 'react';
import type { EditStore } from './editStore';
import type { ZoneSpec } from './spec';
import { useTune } from '../game/tuneStore';
import { placedAt, saveToFile, toSnippet, type PartsFile } from './parts';

/**
 * 개체 패널 — 구역 안의 개체를 **번호로 골라** 옮기고 지운다.
 *
 * `1` 로 열고 `2` 로 닫는다. 개체를 고른 뒤 **방향키**로 밀 수도 있다
 * (↑↓ = z, ←→ = x, Shift+↑↓ = 높이).
 *
 * 여기서 옮긴 자리는 브라우저에만 남는다. 마음에 들면 **파일로 저장** 으로
 * 떨어뜨려 생성기에 반영하고 맵을 다시 구워야 여정에도 같은 자리가 나온다.
 *
 * 2구역은 개체가 15개라 쭉 늘어놔도 됐지만 3구역은 서른 개가 넘는다.
 * 그래서 **종류별로 접는다** — 한 종류만 펴 놓고 맞추는 쪽이 훨씬 빠르다.
 */
export function PartsPanel(
  { file, useEdit, spec }: { file: PartsFile; useEdit: EditStore; spec: ZoneSpec },
) {
  const e = useEdit();
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState<'' | '저장했습니다' | '저장 실패'>('');

  if (!e.open) return null;

  const kinds = [...new Set(file.parts.map((p) => p.kind))];
  const changed = Object.keys(e.edits).length;

  const copy = () => {
    void navigator.clipboard.writeText(toSnippet(spec, file, e.edits));
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const save = () => {
    saveToFile(spec, file, e.edits, e.view).then(
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
          <br />아이는 <b>C D E F</b> 로 걷는다 (앞·뒤·왼·오른). 1인칭에서는 <b>I G</b> 로 돈다.
          <br />닫기는 <b>2</b> 번.
        </div>
      </div>

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

      <ViewSection useEdit={useEdit} />

      {kinds.map((kind) => {
        const mine = file.parts.filter((p) => p.kind === kind);
        /* 개체가 적은 종류는 처음부터 펴 둔다 — 접는 수고가 더 크다 */
        const shown = open[kind] ?? mine.length <= 3;
        return (
        <div key={kind}>
          <button style={S.kindBtn} onClick={() => setOpen({ ...open, [kind]: !shown })}>
            <span>{shown ? '▾' : '▸'} {kind}</span>
            <span style={S.dim}>{mine.length}개</span>
          </button>
          {shown && mine.map((p) => {
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
        );
      })}

      <button style={S.copy} onClick={save} disabled={!changed}>
        {saved || `파일로 저장 ${changed ? `(${changed}개 바뀜)` : ''}`}
      </button>
      <button style={S.copy2} onClick={copy} disabled={!changed}>
        {copied ? '복사했습니다' : '값 복사'}
      </button>
      <div style={S.hint}>
        <b>파일로 저장</b> 을 누르면 프로젝트 폴더에 적힙니다 — 그대로 두면 제가 읽습니다.
        <br />여기서 옮긴 자리 자체는 이 브라우저에만 남고,
        생성기(<code>{spec.generator}</code>)에 반영해야 여정에도 들어갑니다.
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
function ViewSection({ useEdit }: { useEdit: EditStore }) {
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
            {t.fpv ? 'C 앞 · D 뒤 · E 왼 · F 오른 · I G 고개돌리기' : 'C D E F 로 아이가 걷는다'}
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
  /* 종류 머리 — 눌러서 접는다. 개체가 서른 개 넘으면 이게 없으면 못 쓴다. */
  kindBtn: {
    all: 'unset', cursor: 'pointer', opacity: 0.6, width: '100%',
    display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
    margin: 'calc(var(--u) * 0.7) 0 calc(var(--u) * 0.3)',
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
