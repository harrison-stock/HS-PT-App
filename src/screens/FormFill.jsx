import React from 'react'
import { Hex } from '../components/hex'
import { IconCheck } from '../components/icons'
import { loadForm, submitFormResponse } from '../lib/forms'

// Client fills an assigned form (opened from a 'form' task on the dashboard).
export function FormFill({ formId, taskId, clientId, onClose, onSubmitted }) {
  const [form, setForm] = React.useState(null);
  const [answers, setAnswers] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => { loadForm(formId).then(setForm); }, [formId]);

  const set = (id, v) => setAnswers(a => ({ ...a, [id]: v }));
  const fields = form?.fields || [];
  const complete = fields.filter(f => f.required).every(f => {
    const v = answers[f.id];
    return v != null && v !== '';
  });

  const submit = async () => {
    if (!complete || saving) return;
    setSaving(true);
    const { error } = await submitFormResponse({ formId, clientId, taskId, answers });
    setSaving(false);
    if (error) return;
    setDone(true);
    onSubmitted?.();
    setTimeout(onClose, 1000);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(7,7,12,0.7)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxHeight: '90%', background: 'var(--bg-1)', borderTopLeftRadius: 20, borderTopRightRadius: 20, border: '1px solid var(--line-strong)', borderBottom: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, background: 'var(--line-strong)', borderRadius: 2, margin: '0 auto 12px' }} />
          {done ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <Hex size={56} square style={{ margin: '0 auto 12px', background: 'var(--accent)', color: 'var(--on-accent)' }}><IconCheck size={24} sw={3}/></Hex>
              <div className="h-bold" style={{ fontSize: 18 }}>SUBMITTED</div>
            </div>
          ) : (
            <>
              <div className="label">// FORM</div>
              <div className="h-bold" style={{ fontSize: 19, marginTop: 4 }}>{form?.title || 'LOADING…'}</div>
              {form?.description && <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 8 }}>{form.description}</div>}
            </>
          )}
        </div>

        {!done && (
          <>
            <div className="scroller" style={{ flex: 1, padding: '8px 16px 4px', minHeight: 0, display: 'grid', gap: 16 }}>
              {fields.map(f => <FormField key={f.id} f={f} value={answers[f.id]} onChange={v => set(f.id, v)} />)}
            </div>
            <div style={{ padding: '12px 16px 26px', flexShrink: 0 }}>
              <button onClick={submit} disabled={!complete || saving} className="btn-primary"
                style={{ width: '100%', opacity: complete ? 1 : 0.45, pointerEvents: complete && !saving ? 'auto' : 'none' }}>
                {saving ? 'SUBMITTING…' : 'SUBMIT TO COACH'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FormField({ f, value, onChange }) {
  const label = <div className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', color: 'var(--text-2)', fontWeight: 600, marginBottom: 8 }}>{f.label || 'Question'}{f.required ? ' *' : ''}</div>;
  if (f.type === 'number' || f.type === 'text') {
    return <div>{label}<input value={value || ''} inputMode={f.type === 'number' ? 'decimal' : 'text'} onChange={e => onChange(e.target.value)} style={inp}/></div>;
  }
  if (f.type === 'textarea') {
    return <div>{label}<textarea value={value || ''} rows={3} onChange={e => onChange(e.target.value)} style={{ ...inp, resize: 'vertical' }}/></div>;
  }
  if (f.type === 'scale') {
    return (
      <div>{label}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          {[1, 2, 3, 4, 5].map(n => {
            const sel = value === n;
            return <button key={n} onClick={() => onChange(n)} style={{ all: 'unset', cursor: 'pointer', textAlign: 'center', padding: '11px 0', borderRadius: 9, background: sel ? 'var(--accent)' : 'var(--bg-2)', border: '1px solid ' + (sel ? 'var(--accent)' : 'var(--line-strong)'), color: sel ? 'var(--on-accent)' : 'var(--text-2)', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 14 }}>{n}</button>;
          })}
        </div>
      </div>
    );
  }
  if (f.type === 'yesno') {
    return (
      <div>{label}
        <div style={{ display: 'flex', gap: 8 }}>
          {['Yes', 'No'].map(o => { const sel = value === o; return <button key={o} onClick={() => onChange(o)} style={chip(sel)}>{o}</button>; })}
        </div>
      </div>
    );
  }
  // choice
  return (
    <div>{label}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {(f.options || []).map(o => { const sel = value === o; return <button key={o} onClick={() => onChange(o)} style={chip(sel)}>{o}</button>; })}
      </div>
    </div>
  );
}

const inp = { width: '100%', boxSizing: 'border-box', background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 10, padding: '11px 12px', color: 'var(--text)', outline: 'none', fontFamily: 'JetBrains Mono', fontSize: 13 };
const chip = (sel) => ({ all: 'unset', cursor: 'pointer', padding: '9px 14px', borderRadius: 999, background: sel ? 'var(--accent-soft)' : 'var(--bg-2)', border: '1px solid ' + (sel ? 'var(--accent)' : 'var(--line-strong)'), color: sel ? 'var(--accent)' : 'var(--text-2)', fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 600 });
