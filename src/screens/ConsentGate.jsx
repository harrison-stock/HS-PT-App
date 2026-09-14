import React from 'react'
import { CONSENT_PURPOSES, recordConsent } from '../lib/consent'

// Asked once, before a client uses the app, and again only if the wording
// changes in a way that alters what they agreed to.
//
// Nothing is pre-ticked. A box already ticked when the screen loads is not a
// positive act by the person reading it, and a positive act is the whole
// requirement - it is the difference between someone agreeing and someone not
// having disagreed.
//
// Declining the required one is a real option that really works: it signs them
// out with an explanation rather than looping them back to the same screen. A
// choice you cannot make is not a choice, and a consent flow with only one exit
// is a checkbox pretending to be one.
export function ConsentGate({ userId, name, onDone, onDecline }) {
  const [picked, setPicked] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');
  const [declining, setDeclining] = React.useState(false);

  const required = CONSENT_PURPOSES.filter(p => p.required);
  const ready = required.every(p => picked[p.id] === true);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true); setErr('');
    // Everything is recorded, including the noes. "They didn't tick it" and
    // "they said no" are different facts and only one of them is evidence.
    const decisions = Object.fromEntries(CONSENT_PURPOSES.map(p => [p.id, picked[p.id] === true]));
    const { error } = await recordConsent(userId, decisions, { recordedBy: userId });
    setBusy(false);
    if (error) { setErr(error.message || 'Could not save that. Try again in a moment.'); return; }
    onDone?.();
  };

  const decline = async () => {
    if (!declining) { setDeclining(true); return; }
    setBusy(true);
    await recordConsent(userId, Object.fromEntries(CONSENT_PURPOSES.map(p => [p.id, false])), { recordedBy: userId });
    setBusy(false);
    onDecline?.();
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300, background: 'var(--bg-0)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div className="scroller" style={{
        height: '100%', padding: 'max(48px, calc(var(--safe-top) + 20px)) 20px 28px',
        maxWidth: 560, margin: '0 auto', width: '100%', boxSizing: 'border-box',
      }}>
        <div className="label">// BEFORE YOU START</div>
        <h1 className="h-bold" style={{ fontSize: 24, margin: '6px 0 12px', lineHeight: 1.2 }}>
          {name ? `${name.split(' ')[0].toUpperCase()}, ` : ''}A QUICK WORD ABOUT YOUR HEALTH INFORMATION
        </h1>
        <p className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.7, marginBottom: 22 }}>
          Coaching you means holding information about your body, and the law treats that as
          more sensitive than an email address - rightly. So we ask properly rather than
          burying it in terms nobody reads. You can change any of these later in Settings.
        </p>

        <div style={{ display: 'grid', gap: 12, marginBottom: 22 }}>
          {CONSENT_PURPOSES.map(p => {
            const on = picked[p.id] === true;
            const off = picked[p.id] === false;
            return (
              <div key={p.id} className="card" style={{
                padding: 15, display: 'grid', gap: 9,
                borderColor: on ? 'color-mix(in srgb, var(--accent) 50%, var(--line))' : 'var(--line)',
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{p.title}</div>
                  <span className="mono" style={{
                    fontSize: 8, letterSpacing: '0.1em', fontWeight: 700, flexShrink: 0,
                    color: p.required ? 'var(--c-amber)' : 'var(--text-3)',
                  }}>{p.required ? 'NEEDED' : 'OPTIONAL'}</span>
                </div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.65 }}>{p.wording}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.55 }}>{p.note}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 2 }}>
                  <Choice active={on} accent onClick={() => setPicked(s => ({ ...s, [p.id]: true }))}>YES</Choice>
                  <Choice active={off} onClick={() => setPicked(s => ({ ...s, [p.id]: false }))}>NO</Choice>
                </div>
              </div>
            );
          })}
        </div>

        {err && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--c-coral)', marginBottom: 12, lineHeight: 1.6 }}>{err}</div>
        )}

        <button onClick={submit} disabled={!ready || busy} className="btn-primary"
          style={{ width: '100%', opacity: ready ? 1 : 0.4, pointerEvents: ready && !busy ? 'auto' : 'none' }}>
          {busy ? 'SAVING…' : 'AGREE AND CONTINUE'}
        </button>

        <button onClick={decline} disabled={busy} style={{
          all: 'unset', cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center',
          marginTop: 14, padding: '10px 0',
          fontFamily: 'JetBrains Mono', fontSize: 10.5, letterSpacing: '0.06em', lineHeight: 1.6,
          color: declining ? 'var(--c-coral)' : 'var(--text-3)',
        }}>
          {declining
            ? 'Tap again to decline and sign out — your coach will need to hear from you'
            : 'I do not agree'}
        </button>
      </div>
    </div>
  );
}

function Choice({ active, accent, onClick, children }) {
  return (
    <button onClick={onClick} className="mono" style={{
      all: 'unset', cursor: 'pointer', textAlign: 'center', padding: '10px 0', borderRadius: 8,
      fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
      background: active ? (accent ? 'var(--accent-soft)' : 'var(--bg-3)') : 'transparent',
      border: `1px solid ${active ? (accent ? 'var(--accent)' : 'var(--line-strong)') : 'var(--line)'}`,
      color: active ? (accent ? 'var(--accent)' : 'var(--text)') : 'var(--text-3)',
    }}>{children}</button>
  );
}
