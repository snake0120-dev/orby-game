import { useState } from 'react';
import {
  COLOR_TEMPLATES,
  DEFAULT_OBJ,
  DEFAULT_PAINT,
  FIXED_TARGETS,
  PAINT_MODES,
  toSnippet,
  useTune,
  type FacePaint,
  type ObjTune,
  type PaintTune,
  type TuneState,
} from '../game/tuneStore';
import { useGame } from '../game/store';

/**
 * 화면 톤을 눈으로 맞추는 좌측 패널 (개발 전용).
 *
 * `1` 로 열고 `2` 로 닫는다. 전시 빌드에는 붙지 않는다.
 *
 * 맨 위에서 **개체를 먼저 고르고** 그 개체만 만진다. 등대 둘에 구름 둘까지
 * 붙으면서 모든 값을 한 화면에 늘어놓으면 스크롤만 하다 끝나기 때문이다.
 *
 * 맞춘 값은 **코드 조각으로 복사**해서 스테이지 파일에 붙이는 흐름이다 —
 * 패널 값은 새로고침하면 사라지니, 마음에 들면 반드시 복사해 둘 것.
 */
export function TunePanel() {
  const t = useTune();
  const backdrops = useGame((s) => s.stage.backdrops) ?? [];
  const [copied, setCopied] = useState(false);

  if (!t.open) return null;

  const labels: Record<string, string> = {};
  for (const b of backdrops) {
    labels[b.id] = b.label;
    labels[`${b.id}:map`] = b.map;
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toSnippet(t, labels));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const targets = [...FIXED_TARGETS, ...backdrops.map((b) => ({ id: b.id, label: b.label }))];
  const sel = t.selected;

  return (
    <aside style={S.panel}>
      <header style={S.head}>
        <span style={S.title}>화면 맞추기</span>
        <span style={S.key}>2 로 닫기</span>
      </header>

      {/* 개체 고르기 — 아래 내용이 전부 여기에 따라 바뀐다 */}
      <div style={S.picker}>
        {targets.map((o) => (
          <button
            key={o.id}
            onClick={() => t.set({ selected: o.id })}
            style={{ ...S.chip, ...(sel === o.id ? S.chipOn : null) }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* 칠하기는 메인 구조물과 배경 구조물 전부에 똑같이 붙는다 */}
      {(sel === 'main' || backdrops.some((b) => b.id === sel)) && <PaintSection t={t} id={sel} />}

      {sel === 'main' && <MainSection t={t} />}

      {sel === 'character' && (
        <Section label="캐릭터">
          <Slider k="characterScale" label="크기" min={0.4} max={3} t={t} />
          <p style={S.hint}>
            위치는 맵의 연두색 양탄자에서 나온다. 옮기려면 마인크래프트에서 옮겨야 한다.
          </p>
        </Section>
      )}

      {sel === 'gate' && (
        <Section label="관문 사인">
          <Slider k="gateScale" label="크기" min={0.3} max={3} t={t} />
          <Slider k="symbolLight" label="심볼 빛" min={0} max={5} t={t} />
          <p style={S.hint}>
            빛은 <strong>관문 사인과 아이 곁의 동반자 둘 다</strong>에 걸린다 —
            같은 ORBY 심볼이라 따로 놀면 안 된다. 동반자는 사인의 70% 크기다.
          </p>
          <p style={S.hint}>
            위치는 맵의 빨간색 양탄자에서 나온다. 판정과 붙어 있어 패널로는 안 옮긴다.
          </p>
        </Section>
      )}

      {sel === 'light' && <LightSection t={t} />}
      {sel === 'bg' && <BgSection t={t} />}
      {sel === 'motion' && <MotionSection t={t} />}

      {backdrops.some((b) => b.id === sel) && <ObjectSection t={t} id={sel} />}

      <div style={S.foot}>
        <button onClick={copy} style={{ ...S.btn, ...S.btnMain }}>
          {copied ? '복사됨' : '값 복사'}
        </button>
        <button onClick={t.reset} style={S.btn}>되돌리기</button>
      </div>
      <p style={S.hint}>
        복사한 코드는 <code style={S.code}>src/game/stages/01-gate.ts</code> 에 붙인다.
        패널 값은 새로고침하면 사라진다.
      </p>
    </aside>
  );
}

function MainSection({ t }: { t: TuneState }) {
  return (
    <>
      <Section label="블록 색 템플릿">
        <div style={S.chips}>
          {COLOR_TEMPLATES.map((tpl) => (
            <button
              key={tpl.key}
              title={tpl.hint}
              onClick={() => t.set({ template: tpl.key })}
              style={{ ...S.chip, ...(t.template === tpl.key ? S.chipOn : null) }}
            >
              {tpl.label}
            </button>
          ))}
        </div>
        <p style={S.hint}>
          {COLOR_TEMPLATES.find((x) => x.key === t.template)?.hint} 배경 구조물에도 같이 걸린다.
        </p>
      </Section>

      <Section label="메인 구조물 색">
        <Slider k="mainSaturation" label="채도" min={0} max={2} t={t} />
        <Slider k="mainBrightness" label="명도" min={0.4} max={1.8} t={t} />
      </Section>

      <Section label="하단 페이드">
        <Slider k="fadeTop" label="불투명 높이" min={1} max={10} t={t} />
        <Slider k="fadeStrength" label="세기" min={0} max={1} t={t} />
        <p style={S.hint}>
          밑동을 배경에 녹여 떠 있는 섬처럼 보이게 한다. 바닥이 가장 투명하고
          <strong> 불투명 높이</strong> 블록부터 완전히 불투명. 메인 구조물에만 걸린다.
        </p>
      </Section>

      <Section label="카메라">
        <Slider k="cameraPadding" label="여백" min={0.45} max={2.4} t={t} />
        <p style={S.hint}>
          맵 자체는 카메라가 화면에 꽉 맞추므로 크기를 바꿔도 달라지지 않는다.
          <strong> 1 아래로 내리면 확대</strong>된다 — 0.5 면 두 배.
        </p>
      </Section>
    </>
  );
}

function LightSection({ t }: { t: TuneState }) {
  return (
    <Section label="조명 블록">
      <Slider k="lightIntensity" label="세기" min={0} max={6} t={t} />
      <Slider k="lightDistance" label="도달 거리" min={2} max={80} t={t} />
      <Swatch label="색" v={t.lightColor} onChange={(lightColor) => t.set({ lightColor })} />
      <p style={S.hint}>
        <strong>메인 맵</strong>의 글로스톤·시랜턴·레드스톤 램프에만 걸린다.
        등대 조명은 등대를 골라서 따로 잡는다.
        세기를 0 으로 두면 광원을 아예 안 만든다 (발광 재질만 남는다).
      </p>
    </Section>
  );
}

function BgSection({ t }: { t: TuneState }) {
  return (
    <>
      <Section label="하늘 그라데이션">
        <Swatch label="위" v={t.bgTop} onChange={(bgTop) => t.set({ bgTop })} />
        <Swatch label="가운데" v={t.bgMid} onChange={(bgMid) => t.set({ bgMid })} />
        <Swatch label="아래" v={t.bgBottom} onChange={(bgBottom) => t.set({ bgBottom })} />
        <Slider k="bgMidStop" label="갈리는 높이" min={0.05} max={0.95} t={t} />
      </Section>

      <Section label="일렁임">
        <Slider k="bgShimmer" label="세기" min={0} max={2} t={t} />
        <Slider k="bgShimmerSpeed" label="속도" min={0} max={2} t={t} />
        <p style={S.hint}>
          색이 아니라 <strong>그라데이션이 갈리는 높이</strong>를 흔든다.
          색을 흔들면 지저분해지는데, 경계를 흔들면 결이 천천히 흐르는 것처럼 보인다.
          세기 0 이면 정지한 그라데이션.
        </p>
      </Section>
    </>
  );
}

function MotionSection({ t }: { t: TuneState }) {
  return (
    <Section label="부유 모션">
      <Slider k="floatAmp" label="흔들림 폭" min={0} max={0.15} t={t} />
      <Slider k="floatSpeed" label="속도" min={0} max={2} t={t} />
      <p style={S.hint}>
        메인 구조물과 배경 개체 전부에 걸린다. 개체마다 시작 지점이 어긋나 있어서
        한 덩어리로 오르내리지 않는다. 폭 0 이면 완전히 정지.
      </p>
    </Section>
  );
}

/**
 * 개체 하나를 직접 칠한다.
 *
 * 아이소 화면에는 한 블록의 **세 면**만 보인다 — 윗면·왼쪽·오른쪽. 그래서
 * 개체 하나에 면이 셋이고, 그 셋을 벌려 잡는 것만으로 조명 없이 입체가 선다.
 * 그라디언트는 **면마다 따로** 켠다.
 */
function PaintSection({ t, id }: { t: TuneState; id: string }) {
  const p = t.paints[id] ?? DEFAULT_PAINT;
  const set = (patch: Partial<PaintTune>) => t.setPaint(id, patch);
  const setFace = (k: 'top' | 'left' | 'right', patch: Partial<FacePaint>) =>
    set({ [k]: { ...p[k], ...patch } } as Partial<PaintTune>);

  return (
    <Section label="칠하기">
      <div style={S.chips}>
        {PAINT_MODES.map((m) => (
          <button
            key={m.key}
            title={m.hint}
            onClick={() => set({ mode: m.key })}
            style={{ ...S.chip, ...(p.mode === m.key ? S.chipOn : null) }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {p.mode === 'on' && (
        <>
          <FaceRow label="윗면" f={p.top} onChange={(x) => setFace('top', x)} />
          <FaceRow label="왼쪽면" f={p.left} onChange={(x) => setFace('left', x)} />
          <FaceRow label="오른쪽면" f={p.right} onChange={(x) => setFace('right', x)} />

          <p style={S.hint}>
            아이소라 한 블록의 <strong>세 면</strong>만 보인다 — 윗면, 화면 왼쪽으로
            난 면(Z), 오른쪽으로 난 면(X). 셋을 <strong>벌려 잡을수록</strong> 형태가
            또렷해진다. 윗면을 제일 밝게 두는 게 기본이다.
          </p>
          <p style={S.hint}>
            <strong>그라디언트는 면마다 따로</strong> 켠다. 켜면 위 색에서 아래 색으로
            개체 높이를 따라 섞인다 — 아래 색을 하늘색에 가깝게 두면 밑동이 배경에 잠긴다.
          </p>
          <p style={S.hint}>
            칠하는 동안 이 개체는 <strong>조명도 채도·명도도 안 받는다</strong> — 고른 색이
            그대로 나온다. 구석 그늘(AO)만 남는다.
            <strong> 유리와 조명 블록은 안 칠한다</strong> — 창이 벽 색이 되면 창으로 안 읽힌다.
          </p>
          {id !== 'main' && (
            <>
              <p style={S.hint}>
                아래 <strong>거리감</strong>의 채도·명도·흐림은 칠한 색에 안 걸린다.
                멀어 보이게 하려면 <strong>흐린 색을 직접 고른다</strong> (크기·불투명도는 그대로 먹는다).
              </p>
              <p style={S.hint}>
                회전을 준 개체는 <strong>왼쪽·오른쪽이 돌아간다</strong> (색은 마인크래프트
                기준 면에 붙어 있다). 90°·270° 면 두 색을 맞바꾸면 된다.
              </p>
            </>
          )}
        </>
      )}
    </Section>
  );
}

/** 면 하나 — 색 + 그라디언트 켜기 + 아래쪽 색 */
function FaceRow({
  label, f, onChange,
}: { label: string; f: FacePaint; onChange: (patch: Partial<FacePaint>) => void }) {
  return (
    <div style={S.face}>
      <Swatch label={label} v={f.color} onChange={(color) => onChange({ color })} />
      <label style={S.check}>
        <input
          type="checkbox"
          checked={f.grad}
          onChange={(e) => onChange({ grad: e.target.checked })}
          style={S.box}
        />
        <span>그라디언트</span>
      </label>
      {f.grad && (
        <Swatch label="↓ 아래" v={f.gradTo} onChange={(gradTo) => onChange({ gradTo })} />
      )}
    </div>
  );
}

/** 배경 구조물 하나 — 위치·크기·거리감 */
function ObjectSection({ t, id }: { t: TuneState; id: string }) {
  const o = t.objects[id] ?? DEFAULT_OBJ;
  const set = (patch: Partial<ObjTune>) => t.setObj(id, patch);

  return (
    <>
      <Section label="위치">
        <ObjSlider label="X" v={o.x} min={-10} max={10} onChange={(x) => set({ x })} />
        <ObjSlider label="Y" v={o.y} min={-6} max={8} onChange={(y) => set({ y })} />
        <ObjSlider label="Z" v={o.z} min={-14} max={8} onChange={(z) => set({ z })} />
        <ObjSlider label="회전°" v={o.rotation ?? 0} min={0} max={360} onChange={(rotation) => set({ rotation })} />
        <p style={S.hint}>
          아이소라 축이 화면과 어긋난다 — X 는 오른쪽 아래, Z 는 왼쪽 아래, Y 는 위.
          오른쪽 위로 보내려면 Z 를 줄인다.
        </p>
        <p style={S.hint}>
          <strong>회전</strong>은 개체 한가운데를 축으로 돈다 — 각도를 바꿔도 제자리다.
          마인크래프트에서 지은 방향을 여기서 돌릴 수 있다 (90° 씩이 깔끔하다).
        </p>
      </Section>

      <Section label="거리감">
        <ObjSlider label="크기" v={o.scale} min={0.1} max={3} onChange={(scale) => set({ scale })} />
        <ObjSlider label="채도" v={o.saturation} min={0} max={2} onChange={(saturation) => set({ saturation })} />
        <ObjSlider label="명도" v={o.brightness} min={0.2} max={2} onChange={(brightness) => set({ brightness })} />
        <ObjSlider label="흐림" v={o.haze} min={0} max={1} onChange={(haze) => set({ haze })} />
        <ObjSlider label="불투명도" v={o.opacity} min={0.05} max={1} onChange={(opacity) => set({ opacity })} />
        <p style={S.hint}>
          거리감은 메인 구조물과의 <strong>차이</strong>에서 나온다 — 멀수록 작게 ·
          채도 낮게 · 흐리게 · 옅게. 배경끼리도 값을 벌려야 앞뒤가 갈린다.
        </p>
      </Section>

      <Section label="이 구조물의 부유">
        <ObjSlider
          label="흔들림 폭" v={o.floatAmp ?? t.floatAmp} min={0} max={0.15}
          onChange={(floatAmp) => set({ floatAmp })}
        />
        <ObjSlider
          label="속도" v={o.floatSpeed ?? t.floatSpeed} min={0} max={2}
          onChange={(floatSpeed) => set({ floatSpeed })}
        />
        <p style={S.hint}>
          손대는 순간 전역 값에서 떨어져 나와 이 구조물만 따로 움직인다.
          구름은 크게·느리게, 등대는 거의 멈춘 정도가 자연스럽다.
        </p>
      </Section>

      <Section label="이 구조물의 조명">
        <ObjSlider label="세기" v={o.lightIntensity} min={0} max={6} onChange={(lightIntensity) => set({ lightIntensity })} />
        <ObjSlider label="도달 거리" v={o.lightDistance} min={2} max={80} onChange={(lightDistance) => set({ lightDistance })} />
        <Swatch label="색" v={o.lightColor} onChange={(lightColor) => set({ lightColor })} />
        <p style={S.hint}>
          등대 안 레드스톤 램프에서 나오는 빛이다. 구조물마다 따로 잡을 수 있다 —
          멀리 있는 등대는 세기를 낮춰야 거리가 유지된다.
        </p>
      </Section>
    </>
  );
}

/**
 * 색 하나를 고르는 줄 — 스포이드와 **색 코드 칸**을 같이 둔다.
 *
 * 코드 칸이 있어야 피그마·컬러시스템에서 복사한 값을 그대로 붙일 수 있다.
 * 스포이드만 두면 눈으로 맞춘 근사값밖에 못 넣는다.
 */
function Swatch({ label, v, onChange }: { label: string; v: string; onChange: (v: string) => void }) {
  return (
    <label style={S.rowColor}>
      <span style={S.rowLabel}>{label}</span>
      <input type="color" value={v} onChange={(e) => onChange(e.target.value)} style={S.color} />
      <HexField v={v} onChange={onChange} />
    </label>
  );
}

/**
 * 색 코드를 직접 치거나 붙여넣는 칸.
 *
 * 타이핑 도중에는 아직 색이 아닌 글자가 들어오므로(`#27`) 화면 값과 분리해서
 * 들고 있다가, **색으로 읽히는 순간에만** 위로 올린다. 칸을 벗어날 때까지도
 * 못 읽으면 원래 값으로 되돌린다 — 잘못 붙인 채로 남지 않게.
 */
function HexField({ v, onChange }: { v: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(v);

  /* 스포이드로 고르면 코드 칸도 따라온다.
     단, **내가 친 글자가 만든 변화면 그대로 둔다** — `27255d` 까지 쳤을 때
     `#27255d` 로 덮어쓰면 커서가 끝으로 튀어서 이어 치질 못한다. */
  const [last, setLast] = useState(v);
  if (last !== v) {
    setLast(v);
    if (readHex(text) !== v) setText(v);
  }

  const type = (raw: string) => {
    setText(raw);
    const hex = readHex(raw);
    if (hex) onChange(hex);
  };

  return (
    <input
      value={text}
      onChange={(e) => type(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => setText(readHex(text) ?? v)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
      spellCheck={false}
      style={S.hex}
    />
  );
}

/** `27255D` · `#27255d` · `#fff` 를 전부 `#27255d` 로. 색이 아니면 null */
function readHex(raw: string): string | null {
  const h = raw.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(h)) return `#${[...h].map((c) => c + c).join('').toLowerCase()}`;
  if (/^[0-9a-fA-F]{6}$/.test(h)) return `#${h.toLowerCase()}`;
  return null;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section style={S.section}>
      <h3 style={S.label}>{label}</h3>
      {children}
    </section>
  );
}

/** 스토어의 최상위 숫자 하나 */
function Slider({
  k, label, min, max, t,
}: { k: keyof TuneState; label: string; min: number; max: number; t: TuneState }) {
  return (
    <ObjSlider
      label={label}
      v={t[k] as number}
      min={min}
      max={max}
      onChange={(v) => t.set({ [k]: v } as Partial<TuneState>)}
    />
  );
}

/** 값 하나를 다루는 슬라이더. 값이 항상 보여야 코드로 옮길 수 있다. */
function ObjSlider({
  label, v, min, max, onChange,
}: { label: string; v: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <label style={S.row}>
      <span style={S.rowLabel}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.01}
        value={v}
        onChange={(e) => onChange(Number(e.target.value))}
        style={S.range}
      />
      <span style={S.value}>{v.toFixed(2)}</span>
    </label>
  );
}

/* ── 스타일 ─────────────────────────────────────────────────
   패널은 3D 위에 얹히므로 클릭을 되살려야 한다(.overlay 는 통과시킨다). */
const S: Record<string, React.CSSProperties> = {
  panel: {
    position: 'absolute',
    left: 'calc(var(--u) * 1.6)',
    top: 'calc(var(--u) * 1.6)',
    bottom: 'calc(var(--u) * 1.6)',
    width: 'calc(var(--u) * 24)',
    overflowY: 'auto',
    pointerEvents: 'auto',
    padding: 'calc(var(--u) * 1.6)',
    borderRadius: 'calc(var(--u) * 1)',
    background: '#12141ceb',
    border: '1px solid #ffffff1a',
    color: '#e8e4dc',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 'calc(var(--u) * 1.05)',
    lineHeight: 1.6,
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(var(--u) * 1.4)',
  },
  head: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 'calc(var(--u) * 1.35)', fontWeight: 700, letterSpacing: '0.02em' },
  key: { opacity: 0.45, fontSize: 'calc(var(--u) * 0.95)' },

  picker: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 'calc(var(--u) * 0.5)',
    paddingBottom: 'calc(var(--u) * 1.2)',
    borderBottom: '1px solid #ffffff1f',
  },

  section: { display: 'flex', flexDirection: 'column', gap: 'calc(var(--u) * 0.6)' },
  label: {
    margin: 0,
    fontSize: 'calc(var(--u) * 0.9)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    opacity: 0.5,
    fontWeight: 500,
  },

  chips: { display: 'flex', flexWrap: 'wrap', gap: 'calc(var(--u) * 0.5)' },
  chip: {
    padding: '0.25em 0.7em',
    borderRadius: 'calc(var(--u) * 0.5)',
    border: '1px solid #ffffff26',
    background: 'transparent',
    color: '#cfcabf',
    font: 'inherit',
    cursor: 'pointer',
  },
  chipOn: { background: '#E39F44', borderColor: '#E39F44', color: '#20160a', fontWeight: 700 },

  row: { display: 'grid', gridTemplateColumns: '4.4em 1fr 2.8em', alignItems: 'center', gap: '0.4em' },
  // 색 줄은 코드 칸(#rrggbb) 이 들어가 마지막 칸이 더 넓다
  rowColor: { display: 'grid', gridTemplateColumns: '4.4em 1fr 5.4em', alignItems: 'center', gap: '0.4em' },
  hex: {
    width: '100%',
    padding: '0.15em 0.3em',
    border: '1px solid #ffffff26',
    borderRadius: 'calc(var(--u) * 0.35)',
    background: '#ffffff0d',
    color: '#e8e4dc',
    font: 'inherit',
    fontSize: '0.85em',
    textAlign: 'center',
  },
  // 면 하나를 한 덩어리로 묶는다 — 셋이 나란히 붙으면 어느 색이 어느 면인지 헷갈린다
  face: {
    display: 'flex',
    flexDirection: 'column',
    gap: 'calc(var(--u) * 0.35)',
    padding: 'calc(var(--u) * 0.5) calc(var(--u) * 0.6)',
    borderRadius: 'calc(var(--u) * 0.5)',
    background: '#ffffff08',
  },
  check: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.45em',
    paddingLeft: '4.8em',
    fontSize: '0.9em',
    opacity: 0.8,
    cursor: 'pointer',
  },
  box: { accentColor: '#E39F44', margin: 0, cursor: 'pointer' },
  rowLabel: { opacity: 0.75 },
  range: { width: '100%', accentColor: '#E39F44' },
  color: {
    width: '100%',
    height: 'calc(var(--u) * 1.8)',
    padding: 0,
    border: '1px solid #ffffff26',
    borderRadius: 'calc(var(--u) * 0.4)',
    background: 'transparent',
    cursor: 'pointer',
  },
  value: { textAlign: 'right', fontVariantNumeric: 'tabular-nums', opacity: 0.9 },

  hint: { margin: 0, fontSize: 'calc(var(--u) * 0.92)', opacity: 0.45, lineHeight: 1.5 },
  code: { color: '#E6B877' },

  foot: { display: 'flex', gap: 'calc(var(--u) * 0.6)' },
  btn: {
    flex: 1,
    padding: '0.5em',
    borderRadius: 'calc(var(--u) * 0.5)',
    border: '1px solid #ffffff26',
    background: 'transparent',
    color: '#cfcabf',
    font: 'inherit',
    cursor: 'pointer',
  },
  btnMain: { background: '#E39F44', borderColor: '#E39F44', color: '#20160a', fontWeight: 700 },
};
