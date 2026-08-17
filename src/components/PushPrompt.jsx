import React from 'react'
import { enablePush, isPushEnabled, pushBlockedReason } from '../lib/push'

// Notifications can't be switched on for everybody from the outside. The
// permission belongs to the browser and only a real tap can raise the prompt -
// there is no server-side way to opt a client in, on any platform.
//
// So this is the nearest honest thing: everyone who could have them and doesn't
// is asked once, where they'll actually see it, with a single button that does
// the whole job. Dismissing is remembered, because a banner that keeps coming
// back is how people learn to ignore banners - the setting stays in Profile for
// anyone who changes their mind later.
//
// Nothing is shown when it can't work: no keys deployed, permission already
// refused at the OS level, or an iPhone that hasn't been added to the home
// screen (the install prompt covers that case, and asking twice for two
// different things in a row is worse than asking once for the right one).

const KEY = 'hs_push_prompt_dismissed';

export function PushPrompt({ userId }) {
  const [show, setShow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try { if (localStorage.getItem(KEY) === '1') return; } catch (e) { /* ignore */ }
      if (pushBlockedReason()) return;
      if (await isPushEnabled()) return;
      if (alive) setShow(true);
    })();
    return () => { alive = false; };
  }, [userId]);

  if (!show) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* ignore */ }
    setShow(false);
  };

  const turnOn = async () => {
    setBusy(true); setErr('');
    const r = await enablePush(userId);
    setBusy(false);
    if (r?.error) { setErr(r.error); return; }
    // Don't ask again on this device, whichever way it went.
    dismiss();
  };

  return (
    <div className="card" style={{
      padding: 14, display: 'grid', gap: 10,
      borderColor: 'color-mix(in srgb, var(--accent) 45%, var(--line))',
      background: 'color-mix(in srgb, var(--accent) 6%, var(--bg-1))',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label" style={{ color: 'var(--accent)' }}>// STAY IN THE LOOP</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 5 }}>Turn on notifications</div>
          <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-3)', marginTop: 4, lineHeight: 1.55 }}>
            Check-ins and tasks when they're due, and your rest timer when it runs out.
          </div>
        </div>
        <button onClick={dismiss} aria-label="Not now"
          style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)', fontSize: 14, lineHeight: 1, padding: 2, flexShrink: 0 }}>✕</button>
      </div>
      {err && <div className="mono" style={{ fontSize: 9.5, color: 'var(--c-coral)', lineHeight: 1.5 }}>{err}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={turnOn} disabled={busy} className="btn-primary"
          style={{ flex: 1, fontSize: 11, padding: '10px 0', opacity: busy ? 0.5 : 1 }}>
          {busy ? 'TURNING ON…' : 'TURN ON'}
        </button>
        <button onClick={dismiss} className="btn-ghost" style={{ fontSize: 10, padding: '10px 14px' }}>NOT NOW</button>
      </div>
    </div>
  );
}
