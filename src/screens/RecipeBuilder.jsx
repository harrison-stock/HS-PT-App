import React from 'react'
import { Hex, HexBackButton } from '../components/hex'
import { IconPlus, IconX2, IconCheck } from '../components/icons'
import { saveRecipe, deleteRecipe, kcalFromMacros, scaleQty, fmtQty } from '../lib/recipes'

const TAGS = ['BREAKFAST', 'LUNCH', 'DINNER', 'POST-WORKOUT', 'SNACK'];
const MACRO_C = { protein: '#F39E1F', carbs: '#46BBC0', fats: '#EE6A6A' };

const emptyDraft = () => ({
  id: null, title: '', tag: 'LUNCH', time: '', img: '', baseServings: 4,
  protein: '', carbs: '', fats: '',
  ingredients: [{ qty: '', unit: 'g', name: '' }],
  steps: [''],
});

// Coach-only recipe builder. Macros are entered per serving; ingredient
// quantities are entered for the chosen base servings and scale from there.
export function RecipeBuilder({ trainerId, recipe, onClose, onSaved }) {
  const [d, setD] = React.useState(() => recipe ? hydrate(recipe) : emptyDraft());
  const [saving, setSaving] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const [previewServings, setPreviewServings] = React.useState(recipe?.baseServings || 4);

  const set = (patch) => setD(prev => ({ ...prev, ...patch }));
  const kcal = kcalFromMacros(d);
  const canSave = d.title.trim() !== '' && !saving;

  // Ingredients
  const setIng = (i, patch) => set({ ingredients: d.ingredients.map((x, idx) => idx === i ? { ...x, ...patch } : x) });
  const addIng = () => set({ ingredients: [...d.ingredients, { qty: '', unit: 'g', name: '' }] });
  const delIng = (i) => set({ ingredients: d.ingredients.filter((_, idx) => idx !== i) });

  // Steps
  const setStep = (i, v) => set({ steps: d.steps.map((x, idx) => idx === i ? v : x) });
  const addStep = () => set({ steps: [...d.steps, ''] });
  const delStep = (i) => set({ steps: d.steps.filter((_, idx) => idx !== i) });

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const res = await saveRecipe(trainerId, d);
    setSaving(false);
    if (!res.error) onSaved();
  };

  const remove = async () => {
    if (!confirmDel) { setConfirmDel(true); return; }
    if (d.id) await deleteRecipe(d.id);
    onSaved();
  };

  const base = Math.max(1, parseInt(d.baseServings) || 1);
  const factor = previewServings / base;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'var(--bg-0)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', borderBottom: '1px solid var(--line)',
        background: 'var(--bg-1)', flexShrink: 0,
      }}>
        <HexBackButton onClick={onClose} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label" style={{ marginBottom: 2 }}>// {d.id ? 'EDIT RECIPE' : 'NEW RECIPE'}</div>
          <div className="h-bold" style={{ fontSize: 15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.title.trim() ? d.title.toUpperCase() : 'RECIPE BUILDER'}
          </div>
        </div>
        <button onClick={save} disabled={!canSave} className="mono" style={{
          all: 'unset', cursor: canSave ? 'pointer' : 'not-allowed', fontSize: 9, letterSpacing: '0.12em',
          color: canSave ? 'var(--accent)' : 'var(--text-3)', fontWeight: 700, padding: '6px 12px',
          border: `1px solid color-mix(in srgb, var(--accent) ${canSave ? 60 : 20}%, transparent)`, borderRadius: 6,
        }}>{saving ? 'SAVING…' : 'SAVE'}</button>
      </div>

      {/* Body */}
      <div className="scroller" style={{ flex: 1, minHeight: 0, padding: '14px 14px 40px', display: 'grid', gap: 16, alignContent: 'start' }}>

        {/* Basics */}
        <Section label="// BASICS">
          <FieldLabel label="TITLE">
            <input value={d.title} onChange={e => set({ title: e.target.value })} placeholder="e.g. Steak & Sweet Potato Bowl" style={fieldSt}/>
          </FieldLabel>
          <FieldLabel label="MEAL TYPE">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {TAGS.map(t => (
                <button key={t} onClick={() => set({ tag: t })} style={{
                  all: 'unset', cursor: 'pointer', padding: '6px 10px', borderRadius: 999, fontSize: 9,
                  fontFamily: 'JetBrains Mono', fontWeight: 700, letterSpacing: '0.08em',
                  background: d.tag === t ? 'var(--accent-soft)' : 'var(--bg-3)',
                  border: `1px solid ${d.tag === t ? 'var(--accent)' : 'var(--line)'}`,
                  color: d.tag === t ? 'var(--accent)' : 'var(--text-3)',
                }}>{t}</button>
              ))}
            </div>
          </FieldLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <FieldLabel label="TIME (MIN)">
              <input value={d.time} onChange={e => set({ time: e.target.value.replace(/[^\d]/g, '') })} inputMode="numeric" placeholder="25" style={fieldSt}/>
            </FieldLabel>
            <FieldLabel label="BASE SERVINGS">
              <Stepper value={base} min={1} max={12} onChange={v => { set({ baseServings: v }); setPreviewServings(v); }}/>
            </FieldLabel>
          </div>
          <FieldLabel label="IMAGE URL (OPTIONAL)">
            <input value={d.img} onChange={e => set({ img: e.target.value })} placeholder="https://…" style={fieldSt}/>
          </FieldLabel>
        </Section>

        {/* Macros per serving */}
        <Section label="// MACROS · PER SERVING">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {['protein', 'carbs', 'fats'].map(k => (
              <FieldLabel key={k} label={k.toUpperCase() + ' (G)'}>
                <input value={d[k]} onChange={e => set({ [k]: e.target.value.replace(/[^\d.]/g, '') })}
                  inputMode="decimal" placeholder="0"
                  style={{ ...fieldSt, color: MACRO_C[k], fontWeight: 700, textAlign: 'center' }}/>
              </FieldLabel>
            ))}
          </div>
          <div style={{
            marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px', borderRadius: 10, background: 'var(--bg-3)', border: '1px solid var(--line)',
          }}>
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.12em' }}>CALCULATED</span>
            <span className="h-bold" style={{ fontSize: 18, color: 'var(--c-blue)' }}>{kcal}</span>
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.12em' }}>KCAL / SERVING</span>
          </div>
        </Section>

        {/* Ingredients */}
        <Section label={`// INGREDIENTS · FOR ${base} SERVING${base > 1 ? 'S' : ''}`}>
          <Mono style={{ marginBottom: 2 }}>Enter quantities for {base} serving{base > 1 ? 's' : ''}. They scale automatically when a client changes portions.</Mono>
          <div style={{ display: 'grid', gap: 8 }}>
            {d.ingredients.map((ing, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '56px 52px 1fr 28px', gap: 6, alignItems: 'center' }}>
                <input value={ing.qty} onChange={e => setIng(i, { qty: e.target.value.replace(/[^\d.]/g, '') })}
                  inputMode="decimal" placeholder="qty" style={{ ...fieldSt, padding: '9px 8px', textAlign: 'center' }}/>
                <input value={ing.unit} onChange={e => setIng(i, { unit: e.target.value })}
                  placeholder="g" style={{ ...fieldSt, padding: '9px 8px', textAlign: 'center' }}/>
                <input value={ing.name} onChange={e => setIng(i, { name: e.target.value })}
                  placeholder="Ingredient" style={{ ...fieldSt, padding: '9px 10px' }}/>
                <button onClick={() => delIng(i)} aria-label="Remove ingredient" style={iconBtnSt}><IconX2 size={13}/></button>
              </div>
            ))}
          </div>
          <button onClick={addIng} style={addRowSt}><IconPlus size={12}/> ADD INGREDIENT</button>
          <Mono style={{ marginTop: 4 }}>Leave qty blank for "to taste" items (e.g. salt &amp; pepper).</Mono>
        </Section>

        {/* Method */}
        <Section label="// METHOD">
          <div style={{ display: 'grid', gap: 8 }}>
            {d.steps.map((s, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr 28px', gap: 8, alignItems: 'flex-start' }}>
                <Hex size={26} square style={{
                  background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)',
                  fontFamily: 'Orbitron', fontWeight: 800, fontSize: 11, color: 'var(--accent)', marginTop: 4,
                }}>{i + 1}</Hex>
                <textarea value={s} onChange={e => setStep(i, e.target.value)} rows={2}
                  placeholder={`Step ${i + 1}…`} style={{ ...fieldSt, resize: 'vertical' }}/>
                <button onClick={() => delStep(i)} aria-label="Remove step" style={{ ...iconBtnSt, marginTop: 4 }}><IconX2 size={13}/></button>
              </div>
            ))}
          </div>
          <button onClick={addStep} style={addRowSt}><IconPlus size={12}/> ADD STEP</button>
        </Section>

        {/* Scaling preview */}
        {d.ingredients.some(i => i.name.trim() && i.qty !== '') && (
          <Section label="// SCALING PREVIEW">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <Mono>Preview at</Mono>
              <Stepper value={previewServings} min={1} max={12} onChange={setPreviewServings} compact/>
              <Mono>serving{previewServings > 1 ? 's' : ''}</Mono>
            </div>
            <div className="card" style={{ padding: 4, background: 'var(--bg-3)' }}>
              {d.ingredients.filter(i => i.name.trim()).map((ing, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '72px 1fr', gap: 10, alignItems: 'center',
                  padding: '8px 10px',
                  borderBottom: i < d.ingredients.filter(x => x.name.trim()).length - 1 ? '1px dashed var(--line)' : 'none',
                }}>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                    {ing.qty === '' || ing.qty == null
                      ? '—'
                      : `${fmtQty(scaleQty(parseFloat(ing.qty), factor))}${ing.unit}`}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text)' }}>{ing.name}</span>
                </div>
              ))}
            </div>
            <Mono style={{ marginTop: 8 }}>
              Total at {previewServings} serving{previewServings > 1 ? 's' : ''}: {kcal * previewServings} kcal ·
              {' '}{Math.round((+d.protein || 0) * previewServings)}P /
              {' '}{Math.round((+d.carbs || 0) * previewServings)}C /
              {' '}{Math.round((+d.fats || 0) * previewServings)}F
            </Mono>
          </Section>
        )}

        {/* Delete (edit mode only) */}
        {d.id && (
          <button onClick={remove} style={{
            all: 'unset', cursor: 'pointer', padding: '13px', borderRadius: 10, textAlign: 'center',
            background: 'transparent',
            border: `1px solid color-mix(in srgb, var(--c-coral) ${confirmDel ? 60 : 35}%, var(--line))`,
            color: confirmDel ? 'var(--c-coral)' : 'var(--text-3)',
            fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
          }}>{confirmDel ? 'CONFIRM DELETE — TAP AGAIN' : 'DELETE RECIPE'}</button>
        )}
      </div>
    </div>
  );
}

function hydrate(r) {
  return {
    id: r.id, title: r.title, tag: r.tag, time: String(r.time || ''),
    img: r.img && !r.img.includes('photo-1490645935967') ? r.img : '',
    baseServings: r.baseServings || 4,
    protein: String(r.protein ?? ''), carbs: String(r.carbs ?? ''), fats: String(r.fats ?? ''),
    ingredients: r.ingredients?.length
      ? r.ingredients.map(i => ({ qty: i.qty == null ? '' : String(i.qty), unit: i.unit, name: i.name }))
      : [{ qty: '', unit: 'g', name: '' }],
    steps: r.steps?.length ? [...r.steps] : [''],
  };
}

// ── Shared bits ───────────────────────────────────────────────────
function Section({ label, children }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 10 }}>{label}</div>
      <div style={{ display: 'grid', gap: 12 }}>{children}</div>
    </div>
  );
}

function FieldLabel({ label, children }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function Stepper({ value, min, max, onChange, compact }) {
  const sz = compact ? 30 : 36;
  const btn = {
    all: 'unset', cursor: 'pointer', width: sz, height: sz, borderRadius: 9,
    background: 'var(--bg-3)', border: '1px solid var(--line-strong)',
    display: 'grid', placeItems: 'center', fontSize: 18, color: 'var(--accent)', fontWeight: 700,
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button onClick={() => onChange(Math.max(min, value - 1))} style={btn} aria-label="Decrease">−</button>
      <div className="h-bold" style={{ fontSize: 18, minWidth: 24, textAlign: 'center' }}>{value}</div>
      <button onClick={() => onChange(Math.min(max, value + 1))} style={btn} aria-label="Increase">+</button>
    </div>
  );
}

function Mono({ children, style }) {
  return <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.05em', lineHeight: 1.5, ...style }}>{children}</div>;
}

const fieldSt = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 8,
  padding: '10px 11px', color: 'var(--text)', outline: 'none',
  fontFamily: 'JetBrains Mono', fontSize: 12, lineHeight: 1.4,
};

const iconBtnSt = {
  all: 'unset', cursor: 'pointer', display: 'grid', placeItems: 'center',
  width: 28, height: 28, borderRadius: 7, color: 'var(--text-3)',
  background: 'var(--bg-3)', border: '1px solid var(--line)',
};

const addRowSt = {
  all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  marginTop: 4, padding: '10px', borderRadius: 8,
  background: 'var(--accent-soft)', color: 'var(--accent)',
  fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
  border: '1px dashed color-mix(in srgb, var(--accent) 45%, transparent)',
};
