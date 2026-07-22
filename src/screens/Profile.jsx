import React from 'react'
import { HexBackButton, Hex } from '../components/hex'
import { IconSun, IconMoon, IconCheck } from '../components/icons'
import { InstallPrompt } from './InstallPrompt'
import { loadConnections, startWearableConnect } from '../lib/health'

// Half-filled circle = "auto / follow system" appearance.
const IconAuto = ({ size = 22, sw = 1.6 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3 a9 9 0 0 1 0 18 z" fill="currentColor" stroke="none" />
  </svg>
);

export function Profile({ go, user, profile, onSave, onLogout, theme, onThemeChange, home = 'dashboard' }) {
  const [activeTab, setActiveTab] = React.useState('profile');

  const initials = (user?.name || 'U').replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase() || 'U';

  return (
    <div className="scroller" style={{ padding: '0 16px 28px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0 18px' }}>
        <HexBackButton onClick={() => go(home)} size={36} />
        <div>
          <div className="label" style={{ marginBottom: 4 }}>// ACCOUNT</div>
          <div className="h-bold" style={{ fontSize: 18, lineHeight: 1, color: 'var(--heading-deep)' }}>SETTINGS</div>
        </div>
      </div>

      {/* Identity */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, margin: '8px 0 20px' }}>
        <Hex size={84} square style={{
          background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
          fontFamily: 'Orbitron', fontSize: 26, color: 'var(--on-accent)', fontWeight: 800,
          boxShadow: '0 0 calc(22px * var(--glow)) var(--accent-glow)',
        }}>{initials}</Hex>
        <div style={{ textAlign: 'center' }}>
          <div className="h-bold" style={{ fontSize: 18, color: 'var(--heading-deep)' }}>{user?.name || '-'}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 3, letterSpacing: '0.04em' }}>{user?.email || '-'}</div>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {[{ id: 'profile', label: 'PROFILE' }, { id: 'subscription', label: 'SUBSCRIPTION' }].map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            flex: 1, padding: '10px 6px',
            background: activeTab === t.id ? 'var(--accent-soft)' : 'var(--bg-2)',
            border: '1px solid ' + (activeTab === t.id ? 'var(--accent)' : 'var(--line)'),
            borderRadius: 10, cursor: 'pointer',
            color: activeTab === t.id ? 'var(--accent)' : 'var(--text-2)',
            fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
            boxShadow: activeTab === t.id ? '0 0 calc(8px * var(--glow)) var(--accent-glow)' : 'none',
          }}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'profile' && (
        <ProfileTab
          user={user}
          userId={profile?.id}
          onSave={onSave}
          theme={theme}
          onThemeChange={onThemeChange}
        />
      )}
      {activeTab === 'subscription' && (
        <SubscriptionTab profile={profile} />
      )}

      {/* Log out - always visible at the bottom of Settings */}
      <button onClick={onLogout} style={{
        width: '100%', marginTop: 24,
        padding: '14px 16px', borderRadius: 12,
        background: 'transparent',
        border: '1px solid color-mix(in srgb, var(--c-coral) 45%, var(--line))',
        color: 'var(--c-coral)', cursor: 'pointer',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 700, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        Log Out
      </button>
    </div>
  );
}

function ProfileTab({ user, userId, onSave, theme, onThemeChange }) {
  const [name, setName] = React.useState(user?.name || '');
  const [dob, setDob] = React.useState(user?.dob || '');
  const [showInstall, setShowInstall] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const dirty = name.trim() !== (user?.name || '') || dob !== (user?.dob || '');

  const save = () => {
    if (!dirty || !name.trim()) return;
    onSave({ name: name.trim(), email: (user?.email || '').trim(), dob });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <>
      {/* Fields */}
      <div style={{ display: 'grid', gap: 14 }}>
        <Field label="FULL NAME">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
            style={inputStyle} />
        </Field>
        <Field label="EMAIL">
          <input value={user?.email || ''} readOnly type="email" placeholder="you@email.com"
            style={{ ...inputStyle, color: 'var(--text-3)', cursor: 'default' }} />
          <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.05em', marginTop: 5 }}>
            Your login email - contact your coach to change it.
          </div>
        </Field>
        <Field label="DATE OF BIRTH">
          <input value={dob} onChange={e => setDob(e.target.value)} type="date"
            style={inputStyle} />
        </Field>
      </div>

      {/* Appearance */}
      <div className="label" style={{ margin: '22px 0 7px' }}>// APPEARANCE</div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[
          { v: 'light',  label: 'LIGHT', Icon: IconSun },
          { v: 'dark',   label: 'DARK',  Icon: IconMoon },
          { v: 'system', label: 'AUTO',  Icon: IconAuto },
        ].map(opt => {
          const active = (theme || 'system') === opt.v;
          return (
            <button key={opt.v} onClick={() => onThemeChange && onThemeChange(opt.v)} style={{
              all: 'unset', cursor: 'pointer', flex: 1,
              padding: '14px 12px', borderRadius: 12, textAlign: 'center',
              background: active ? 'var(--accent-soft)' : 'var(--bg-2)',
              border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'),
              boxShadow: active ? '0 0 calc(10px * var(--glow)) var(--accent-glow)' : 'none',
            }}>
              <div style={{ display: 'grid', placeItems: 'center', color: active ? 'var(--accent)' : 'var(--text-3)' }}>
                <opt.Icon size={22} sw={active ? 2 : 1.6} />
              </div>
              <div className="mono" style={{
                fontSize: 11, letterSpacing: '0.14em', fontWeight: 700, marginTop: 8,
                color: active ? 'var(--accent)' : 'var(--text-2)',
              }}>{opt.label}</div>
            </button>
          );
        })}
      </div>

      {/* Save */}
      <button onClick={save} disabled={!dirty || !name.trim()} className="btn-primary"
        style={{
          width: '100%', marginTop: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          color: 'var(--heading-deep)',
          opacity: (!dirty || !name.trim()) ? 0.5 : 1,
          cursor: (!dirty || !name.trim()) ? 'not-allowed' : 'pointer',
        }}>
        {saved ? <><IconCheck size={14} /> SAVED</> : 'SAVE CHANGES'}
      </button>

      {/* Install / add to home screen */}
      <button onClick={() => setShowInstall(true)} style={{
        width: '100%', marginTop: 14,
        padding: '13px 16px', borderRadius: 12,
        background: 'transparent',
        border: '1px solid color-mix(in srgb, var(--accent) 45%, var(--line))',
        color: 'var(--accent)', cursor: 'pointer',
        fontFamily: 'JetBrains Mono, monospace',
        fontWeight: 600, fontSize: 13, letterSpacing: '0.08em', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        Add to Home Screen
      </button>

      {showInstall && <InstallPrompt onClose={() => setShowInstall(false)} />}

      <ConnectedDevices userId={userId} />
    </>
  );
}

// Wearable connections (steps / heart rate / weight from Garmin, Fitbit, etc.)
function ConnectedDevices({ userId }) {
  const [conns, setConns] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);

  React.useEffect(() => { if (userId) loadConnections(userId).then(setConns); }, [userId]);

  const connect = async () => {
    setBusy(true); setErr(null);
    const r = await startWearableConnect();
    setBusy(false);
    if (r.error) setErr(r.error);
  };

  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '-';

  return (
    <div style={{ marginTop: 24 }}>
      <div className="label" style={{ marginBottom: 10 }}>// CONNECTED DEVICES</div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 10 }}>
        Sync steps, heart rate and weight from your wearable (Garmin, Fitbit, Withings, Oura…).
      </div>

      {conns && conns.length > 0 && (
        <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
          {conns.map(c => (
            <div key={c.provider} className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: c.status === 'connected' ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }}/>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>{c.provider}</span>
              <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>{c.last_sync ? `SYNCED ${fmt(c.last_sync)}` : 'CONNECTED'}</span>
            </div>
          ))}
        </div>
      )}

      <button onClick={connect} disabled={busy} className="btn-ghost" style={{ width: '100%', borderColor: 'var(--accent)', color: 'var(--accent)' }}>
        {busy ? 'OPENING…' : (conns && conns.length ? '+ CONNECT ANOTHER DEVICE' : '+ CONNECT A DEVICE')}
      </button>
      {err && (
        <div className="mono" style={{ fontSize: 10, color: 'var(--c-coral)', marginTop: 8, lineHeight: 1.5 }}>{err}</div>
      )}
    </div>
  );
}

function SubscriptionTab({ profile }) {
  const credits        = profile?.credits ?? 0;
  const clientStatus   = profile?.client_status || 'online';
  const subDue         = profile?.subscription_due;

  const statusLabel = {
    online:    'ONLINE CLIENT',
    in_person: 'IN-PERSON CLIENT',
    hybrid:    'HYBRID',
  }[clientStatus] || clientStatus.toUpperCase();

  const statusColor = {
    online:    'var(--accent)',
    in_person: 'var(--c-amber)',
    hybrid:    'var(--accent-2)',
  }[clientStatus] || 'var(--text-2)';

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Credits */}
      <div className="card" style={{ padding: '20px 18px', textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.14em', marginBottom: 10 }}>
          // IN-PERSON SESSIONS REMAINING
        </div>
        <div className="h-bold" style={{ fontSize: 56, color: credits > 0 ? 'var(--c-amber)' : 'var(--text-3)', lineHeight: 1, marginBottom: 6 }}>
          {credits}
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em' }}>
          {credits === 1 ? 'SESSION LEFT' : 'SESSIONS LEFT'}
        </div>
        {credits === 0 && (
          <div className="mono" style={{ fontSize: 10, color: 'var(--c-coral)', marginTop: 10, letterSpacing: '0.08em' }}>
            Contact Harrison to top up credits
          </div>
        )}
      </div>

      {/* Status */}
      <div className="card" style={{ padding: '16px 18px' }}>
        <div className="label" style={{ marginBottom: 10 }}>// CLIENT STATUS</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: statusColor,
            boxShadow: `0 0 6px ${statusColor}`,
            flexShrink: 0,
          }}/>
          <span className="mono" style={{ fontSize: 13, color: statusColor, fontWeight: 700, letterSpacing: '0.08em' }}>
            {statusLabel}
          </span>
        </div>
      </div>

      {/* Subscription due */}
      {subDue && (
        <div className="card" style={{ padding: '16px 18px' }}>
          <div className="label" style={{ marginBottom: 8 }}>// SUBSCRIPTION RENEWAL</div>
          <div className="mono" style={{ fontSize: 15, color: 'var(--text)', fontWeight: 600, letterSpacing: '0.06em' }}>
            {new Date(subDue).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6, letterSpacing: '0.06em' }}>
            {daysUntil(subDue)}
          </div>
        </div>
      )}

      {!subDue && (
        <div className="card" style={{ padding: '16px 18px', opacity: 0.5 }}>
          <div className="label" style={{ marginBottom: 6 }}>// SUBSCRIPTION RENEWAL</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em' }}>
            No renewal date set
          </div>
        </div>
      )}
    </div>
  );
}

function daysUntil(dateStr) {
  const diff = Math.ceil((new Date(dateStr) - new Date()) / 86400000);
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Due today';
  if (diff === 1) return 'Due tomorrow';
  return `${diff} days remaining`;
}

const inputStyle = {
  width: '100%',
  background: 'var(--bg-2)',
  border: '1px solid var(--line)',
  borderRadius: 12,
  padding: '13px 14px',
  color: 'var(--text)',
  fontFamily: 'JetBrains Mono, monospace',
  fontSize: 14, fontWeight: 500,
  outline: 'none',
  boxSizing: 'border-box',
};

function Field({ label, children }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}
