import React from 'react'
import { HexBackButton, Hex } from '../components/hex'
import { IconPlus, IconX2 } from '../components/icons'
import { FIELD_TYPES, saveForm, deleteForm } from '../lib/forms'

let _fid = 0;
const newField = (type = 'text') => ({ id: `f${Date.now()}_${_fid++}`, type, label: '', options: type === 'choice' ? ['Option 1', 'Option 2'] : [], required: true });
const emptyDraft = () => ({ id: null, title: '', description: '', fields: [newField('scale')] });

// Coach form builder — mirrors the recipe / guide makers.
export function FormBuilder({ trainerId, form, onClose, onSaved }) {
  const [d, setD] = React.useState(() => form ? { id: form.id, title: form.title, description: form.description, fields: form.fields?.length ? form.fields : [newField()] } : emptyDraft());
  const [saving, setSaving] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);

  const set = (patch) => setD(prev => ({ ...prev, ...patch }));
  const setField = (i, patch) => set({ fields: d.fields.map((f, idx) => idx === i ? { ...f, ...patch } : f) });
  const addField = (type) => { set({ fields: [...d.fields, newField(type)] }); setAddOpen(false); };
  const delField = (i) => set({ fields: d.fields.filter((_, idx) => idx !== i) });
  const canSave = d.title.trim() && d.fields.length && !saving;

  const save = async (close) => {
    if (!canSave) return;
    setSaving(true);
    const res = await saveForm(trainerId, d);
    setSaving(false);
    if (res.error) return;
    if (close) onSaved(); else { setD(prev => ({ ...prev, id: res.id })); onSaved(true); }
  };
  const remove = async () => { if (!confirmDel) { setConfirmDel(true); return; } if (d.id) await deleteForm(d.id); onSaved(); };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--bg-0)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--line)', background: 'var(--bg-1)', flexShrink: 0 }}>
        <HexBackButton onClick={onClose} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label" style={{ marginBottom: 2 }}>// {d.id ? 'EDIT FORM' : 'NEW FORM'}</div>
          <div className="h-bold" style={{ fontSize: 16, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title.trim() || 'FORM BUILDER'}</div>
        </div>
        <button onClick={() => save(false)} disabled={!canSave} className="btn-ghost" style={{ fontSize: 11, padding: '8px 12px', opacity: canSave ? 1 : 0.4 }}>SAVE</button>
        <button onClick={() => save(true)} disabled={!canSave} className="btn-primary" style={{ fontSize: 11, padding: '8px 12px', opacity: canSave ? 1 : 0.4 }}>SAVE & CLOSE</button>
      </div>

      <div className="scroller" style={{ flex: 1, minHeight: 0, padding: 16, display: 'grid', gap: 14, alignContent: 'start', maxWidth: 620, margin: '0 auto', width: '100%' }}>
        <input value={d.title} onChange={e => set({ title: e.target.value })} placeholder="Form title (e.g. Weekly Check-In)"
          style={{ ...fieldSt, fontSize: 18, fontWeight: 700 }}/>
        <textarea value={d.description} onChange={e => set({ description: e.target.value })} rows={2} placeholder="Intro / instructions (optional)" style={{ ...fieldSt, resize: 'vertical' }}/>

        <div className="label">// QUESTIONS</div>
        {d.fields.map((f, i) => (
          <div key={f.id} className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 700 }}>{i + 1}.</span>
              <input value={f.label} onChange={e => setField(i, { label: e.target.value })} placeholder="Question" style={{ ...fieldSt, flex: 1 }}/>
              <button onClick={() => delField(i)} aria-label="Remove" style={iconBtnSt}><IconX2 size={13}/></button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <select value={f.type} onChange={e => setField(i, { type: e.target.value, options: e.target.value === 'choice' ? (f.options?.length ? f.options : ['Option 1', 'Option 2']) : [] })} style={{ ...fieldSt, width: 'auto', appearance: 'auto', padding: '8px 10px' }}>
                {FIELD_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
              </select>
              <label className="mono" style={{ fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                <input type="checkbox" checked={f.required} onChange={e => setField(i, { required: e.target.checked })} style={{ accentColor: 'var(--accent)' }}/> REQUIRED
              </label>
            </div>
            {f.type === 'choice' && (
              <div style={{ display: 'grid', gap: 6 }}>
                {(f.options || []).map((o, oi) => (
                  <div key={oi} style={{ display: 'flex', gap: 6 }}>
                    <input value={o} onChange={e => setField(i, { options: f.options.map((x, xi) => xi === oi ? e.target.value : x) })} placeholder={`Option ${oi + 1}`} style={{ ...fieldSt, flex: 1, padding: '8px 10px' }}/>
                    <button onClick={() => setField(i, { options: f.options.filter((_, xi) => xi !== oi) })} style={iconBtnSt}><IconX2 size={12}/></button>
                  </div>
                ))}
                <button onClick={() => setField(i, { options: [...(f.options || []), `Option ${(f.options?.length || 0) + 1}`] })} style={addRowSt}><IconPlus size={11}/> ADD OPTION</button>
              </div>
            )}
          </div>
        ))}

        <div style={{ position: 'relative' }}>
          <button onClick={() => setAddOpen(o => !o)} style={addRowSt}><IconPlus size={12}/> ADD QUESTION</button>
          {addOpen && (
            <>
              <div onClick={() => setAddOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 20 }}/>
              <div style={{ position: 'absolute', left: 0, right: 0, top: 44, zIndex: 21, background: 'var(--bg-3)', border: '1px solid var(--line-strong)', borderRadius: 10, padding: 6, display: 'grid', gap: 2 }}>
                {FIELD_TYPES.map(t => (
                  <button key={t.type} onClick={() => addField(t.type)} style={{ all: 'unset', cursor: 'pointer', padding: '9px 12px', borderRadius: 7, fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--text)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>{t.label}</button>
                ))}
              </div>
            </>
          )}
        </div>

        {d.id && (
          <button onClick={remove} style={{
            all: 'unset', cursor: 'pointer', padding: '13px', borderRadius: 10, textAlign: 'center', marginTop: 4,
            border: `1px solid color-mix(in srgb, var(--c-coral) ${confirmDel ? 60 : 35}%, var(--line))`,
            color: confirmDel ? 'var(--c-coral)' : 'var(--text-3)', fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
          }}>{confirmDel ? 'CONFIRM DELETE — TAP AGAIN' : 'DELETE FORM'}</button>
        )}
      </div>
    </div>
  );
}

const fieldSt = {
  width: '100%', boxSizing: 'border-box', background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 8,
  padding: '10px 11px', color: 'var(--text)', outline: 'none', fontFamily: 'JetBrains Mono', fontSize: 13, lineHeight: 1.4,
};
const iconBtnSt = {
  all: 'unset', cursor: 'pointer', display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 7,
  color: 'var(--text-3)', background: 'var(--bg-3)', border: '1px solid var(--line)', flexShrink: 0,
};
const addRowSt = {
  all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 8,
  background: 'var(--accent-soft)', color: 'var(--accent)', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
  border: '1px dashed color-mix(in srgb, var(--accent) 45%, transparent)',
};
