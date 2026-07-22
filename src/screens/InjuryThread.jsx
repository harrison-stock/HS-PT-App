import React from 'react'
import { IconPlus, IconCheck, IconChevronLeft } from '../components/icons'
import { SEV_COLOR, SEV_LABEL, injuryTitle, loadInjuryNotes, addInjuryNote, resolveInjury, reopenInjury } from '../lib/injuries'

const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Reusable injury detail: a note thread with "add note" and resolve/reopen.
// Used by both the coach (ClientDetail) and the client (Body) injury maps.
export function InjuryThread({ injury, authorId, onBack, onChanged }) {
  const [notes, setNotes]   = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [text, setText]     = React.useState('');
  const [busy, setBusy]     = React.useState(false);

  const reload = React.useCallback(() => {
    loadInjuryNotes(injury.id).then(setNotes);
  }, [injury.id]);
  React.useEffect(() => { reload(); }, [reload]);

  const resolved = !!injury.resolved_at;
  const sevColor = SEV_COLOR[injury.severity] || 'var(--c-coral)';

  const saveNote = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    await addInjuryNote(injury.id, authorId, text.trim());
    setBusy(false); setText(''); setAdding(false);
    reload();
  };

  const toggleResolve = async () => {
    if (busy) return;
    setBusy(true);
    resolved ? await reopenInjury(injury.id) : await resolveInjury(injury.id);
    setBusy(false);
    onChanged?.();
  };

  // The original report note shows first in the timeline.
  const timeline = [
    injury.note ? { id: 'orig', body: injury.note, created_at: injury.created_at, original: true } : null,
    ...(notes || []),
  ].filter(Boolean);

  return (
    <div className="card" style={{ padding: 14, border: `1px solid ${sevColor}`, display: 'grid', gap: 12 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onBack} aria-label="Back" style={{
          all: 'unset', cursor: 'pointer', display: 'grid', placeItems: 'center',
          width: 28, height: 28, borderRadius: 7, background: 'var(--bg-3)', border: '1px solid var(--line)', color: 'var(--text-2)',
        }}><IconChevronLeft size={14}/></button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="h-bold" style={{ fontSize: 15 }}>{injuryTitle(injury).toUpperCase()}</div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 2 }}>
            {(injury.body_side || 'front').toUpperCase()} · REPORTED {fmtDate(injury.created_at)}
          </div>
        </div>
        <span className="mono" style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', padding: '4px 8px', borderRadius: 999,
          color: resolved ? 'var(--accent)' : sevColor,
          background: `color-mix(in srgb, ${resolved ? 'var(--accent)' : sevColor} 14%, transparent)`,
          border: `1px solid color-mix(in srgb, ${resolved ? 'var(--accent)' : sevColor} 40%, transparent)`,
        }}>{resolved ? 'RESOLVED' : SEV_LABEL[injury.severity]}</span>
      </div>

      {/* Note timeline */}
      <div style={{ display: 'grid', gap: 6 }}>
        {notes === null && <Mono>LOADING NOTES…</Mono>}
        {timeline.map((n) => (
          <div key={n.id} style={{
            padding: '9px 11px', borderRadius: 8, background: 'var(--bg-3)', border: '1px solid var(--line)',
          }}>
            <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.45 }}>{n.body}</div>
            <div className="mono" style={{ fontSize: 8.5, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 4 }}>
              {n.original ? 'INITIAL REPORT' : 'NOTE'} · {fmtDate(n.created_at)}
            </div>
          </div>
        ))}
        {notes !== null && timeline.length === 0 && <Mono>No notes yet.</Mono>}
      </div>

      {/* Add note */}
      {adding ? (
        <div style={{ display: 'grid', gap: 8 }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus
            placeholder="Add an update - how it feels, progress, what your physio said…"
            style={{
              width: '100%', boxSizing: 'border-box', background: 'var(--bg-3)',
              border: '1px solid var(--line-strong)', borderRadius: 8, padding: '10px 11px',
              color: 'var(--text)', outline: 'none', fontFamily: 'JetBrains Mono', fontSize: 12, resize: 'vertical',
            }}/>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => { setAdding(false); setText(''); }} className="btn-ghost" style={{ flex: 1 }}>CANCEL</button>
            <button onClick={saveNote} className="btn-primary" style={{ flex: 1, opacity: text.trim() ? 1 : 0.4 }}>
              {busy ? 'SAVING…' : 'SAVE NOTE'}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setAdding(true)} style={{
            all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '11px',
            borderRadius: 9, background: 'var(--bg-3)', border: '1px solid var(--line-strong)',
            color: 'var(--text)', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          }}><IconPlus size={11} style={{ verticalAlign: -1, marginRight: 5 }}/>ADD MORE NOTES</button>
          <button onClick={toggleResolve} style={{
            all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '11px',
            borderRadius: 9,
            background: resolved ? 'var(--bg-3)' : 'var(--accent-soft)',
            border: `1px solid ${resolved ? 'var(--line-strong)' : 'var(--accent)'}`,
            color: resolved ? 'var(--text-2)' : 'var(--accent)',
            fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
          }}>
            {resolved ? 'REOPEN' : <><IconCheck size={11} sw={3} style={{ verticalAlign: -1, marginRight: 5 }}/>RESOLVE</>}
          </button>
        </div>
      )}
    </div>
  );
}

function Mono({ children }) {
  return <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em' }}>{children}</div>;
}
