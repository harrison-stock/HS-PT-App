import React from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const invite = React.useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return { code: p.get('invite'), tid: p.get('tid'), name: p.get('name'), mc: p.get('mc') };
  }, []);

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [mode, setMode] = React.useState(invite.code ? 'signup' : 'signin')
  const [signedUp, setSignedUp] = React.useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (mode === 'signin') {
      const { error: err } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (err) setError(err.message)
    } else {
      const opts = invite.code
        ? { options: { data: { name: invite.name || '', trainer_id: invite.tid || '', managed_client_id: invite.mc || '' } } }
        : {};
      const { error: err } = await supabase.auth.signUp({ email: email.trim(), password, ...opts })
      if (err) {
        setError(err.message)
      } else {
        if (invite.code) localStorage.setItem('pt_pending_invite', invite.code);
        setSignedUp(true)
      }
    }

    setLoading(false)
  }

  if (signedUp) {
    return (
      <div style={wrapStyle}>
        <div style={{ textAlign: 'center', maxWidth: 300 }}>
          <div className="h-bold" style={{ fontSize: 20, marginBottom: 12, color: 'var(--heading-deep)' }}>
            CHECK YOUR EMAIL
          </div>
          <div className="mono" style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, letterSpacing: '0.04em' }}>
            We've sent a confirmation link to <span style={{ color: 'var(--accent)' }}>{email}</span>.
            Click it to activate your account, then sign in.
          </div>
          <button onClick={() => { setSignedUp(false); setMode('signin') }}
            className="btn-primary"
            style={{ marginTop: 24, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--heading-deep)' }}>
            BACK TO SIGN IN
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={wrapStyle}>
      {/* Brand mark */}
      <div style={{ marginBottom: 36, textAlign: 'center' }}>
        <div style={{
          display: 'flex', justifyContent: 'center', marginBottom: 16,
          filter: 'drop-shadow(0 0 calc(22px * var(--glow)) var(--accent-glow))',
        }}>
          <img src="/logo-mark.png" alt="HS PT" width={104} style={{ display: 'block', height: 'auto' }} />
        </div>
        <div className="h-bold" style={{ fontSize: 20, letterSpacing: '0.1em', color: 'var(--heading-deep)' }}>
          HS PT
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.18em', marginTop: 5 }}>
          HARRISON STOCK PERFORMANCE
        </div>
      </div>

      {/* Form */}
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 340, display: 'grid', gap: 14 }}>
        {invite.code && mode === 'signup' && (
          <div style={{
            padding: '12px 14px', borderRadius: 10,
            background: 'var(--accent-soft)', border: '1px solid var(--accent)',
          }}>
            <div className="mono" style={{ fontSize: 9, color: 'var(--accent)', letterSpacing: '0.14em', fontWeight: 700, marginBottom: 4 }}>
              YOU'VE BEEN INVITED
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
              {invite.name ? `Welcome, ${invite.name}. ` : ''}
              Create your account to connect with your trainer.
            </div>
          </div>
        )}
        <div>
          <div className="label" style={{ marginBottom: 7 }}>EMAIL</div>
          <input
            type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@email.com" required autoComplete="email"
            style={inputStyle}
          />
        </div>
        <div>
          <div className="label" style={{ marginBottom: 7 }}>PASSWORD</div>
          <input
            type="password" value={password} onChange={e => setPassword(e.target.value)}
            placeholder="••••••••" required minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            style={inputStyle}
          />
        </div>

        {error && (
          <div className="mono" style={{
            fontSize: 11, color: 'var(--c-coral)', padding: '10px 12px',
            background: 'color-mix(in srgb, var(--c-coral) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--c-coral) 35%, transparent)',
            borderRadius: 8, letterSpacing: '0.04em', lineHeight: 1.5,
          }}>
            {error}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn-primary"
          style={{
            marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 10, color: 'var(--heading-deep)', opacity: loading ? 0.6 : 1,
          }}>
          {loading ? '…' : mode === 'signin' ? 'SIGN IN' : 'CREATE ACCOUNT'}
        </button>
      </form>

      <button
        onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(null) }}
        className="mono"
        style={{
          all: 'unset', cursor: 'pointer', marginTop: 22,
          fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em',
        }}>
        {mode === 'signin' ? "NO ACCOUNT? SIGN UP" : 'ALREADY REGISTERED? SIGN IN'}
      </button>
    </div>
  )
}

// Set-password screen — shown after an invite/recovery email link (the user has
// a session but no usable password yet). Also used by the coach's reset flow.
export function SetPassword({ onDone, onSignOut }) {
  const [pw, setPw] = React.useState('')
  const [pw2, setPw2] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (pw.length < 6) { setError('Password must be at least 6 characters'); return }
    if (pw !== pw2) { setError('Passwords do not match'); return }
    setLoading(true); setError(null)
    const { error: err } = await supabase.auth.updateUser({ password: pw })
    setLoading(false)
    if (err) setError(err.message)
    else onDone()
  }

  return (
    <div style={wrapStyle}>
      <div style={{ marginBottom: 30, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14, filter: 'drop-shadow(0 0 calc(22px * var(--glow)) var(--accent-glow))' }}>
          <img src="/logo-mark.png" alt="HS PT" width={88} style={{ display: 'block', height: 'auto' }} />
        </div>
        <div className="h-bold" style={{ fontSize: 20, letterSpacing: '0.1em', color: 'var(--heading-deep)' }}>SET YOUR PASSWORD</div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.08em', marginTop: 6, lineHeight: 1.5, maxWidth: 300 }}>
          Choose a password to finish setting up your account. You'll use it to sign in from now on.
        </div>
      </div>
      <form onSubmit={submit} style={{ width: '100%', maxWidth: 340, display: 'grid', gap: 14 }}>
        <div>
          <div className="label" style={{ marginBottom: 7 }}>NEW PASSWORD</div>
          <input type="password" value={pw} onChange={e => setPw(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" style={inputStyle} />
        </div>
        <div>
          <div className="label" style={{ marginBottom: 7 }}>CONFIRM PASSWORD</div>
          <input type="password" value={pw2} onChange={e => setPw2(e.target.value)} placeholder="••••••••" required minLength={6} autoComplete="new-password" style={inputStyle} />
        </div>
        {error && (
          <div className="mono" style={{ fontSize: 11, color: 'var(--c-coral)', padding: '10px 12px', background: 'color-mix(in srgb, var(--c-coral) 12%, transparent)', border: '1px solid color-mix(in srgb, var(--c-coral) 35%, transparent)', borderRadius: 8, letterSpacing: '0.04em', lineHeight: 1.5 }}>{error}</div>
        )}
        <button type="submit" disabled={loading} className="btn-primary" style={{ marginTop: 4, color: 'var(--heading-deep)', opacity: loading ? 0.6 : 1 }}>
          {loading ? '…' : 'SAVE PASSWORD & CONTINUE'}
        </button>
      </form>
      {onSignOut && (
        <button onClick={onSignOut} className="mono" style={{ all: 'unset', cursor: 'pointer', marginTop: 22, fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em' }}>
          SIGN OUT
        </button>
      )}
    </div>
  )
}

const wrapStyle = {
  minHeight: '100dvh',
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  padding: '24px 24px 56px',
  background: 'var(--bg-0)',
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 12,
  padding: '13px 14px', color: 'var(--text)',
  fontFamily: 'JetBrains Mono, monospace', fontSize: 14, fontWeight: 500,
  outline: 'none',
}
