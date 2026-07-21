import React from 'react'
import { supabase } from '../lib/supabase'

export function Login() {
  const invite = React.useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return { code: p.get('invite'), tid: p.get('tid'), name: p.get('name'), mc: p.get('mc'), email: p.get('email') };
  }, []);

  const [name, setName] = React.useState(invite.name || '')
  const [email, setEmail] = React.useState(invite.email || '')
  const [password, setPassword] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [mode, setMode] = React.useState(invite.code ? 'signup' : 'signin')
  const [signedUp, setSignedUp] = React.useState(false)
  const [resetMsg, setResetMsg] = React.useState(null)

  const [resetting, setResetting] = React.useState(false)

  const sendReset = async () => {
    if (!email.trim()) { setError('Enter your email above, then tap "Forgot password".'); return; }
    if (resetting) return;
    setError(null); setResetMsg(null); setResetting(true)
    const addr = email.trim()
    // Prefer the Resend-backed function (the project's built-in SMTP isn't
    // configured, which is why the default flow errored). Fall back to the
    // built-in method only if the function isn't available.
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('send-reset', {
        body: { email: addr, redirectTo: window.location.origin },
      })
      if (!fnErr && data && !data.error) {
        setResetMsg(`If an account exists for ${addr}, a reset link is on its way — check your inbox (and spam).`)
        setResetting(false)
        return
      }
    } catch (_) { /* fall through to built-in */ }
    const { error: err } = await supabase.auth.resetPasswordForEmail(addr, { redirectTo: window.location.origin })
    if (err) setError('Couldn\'t send a reset email right now. Please try again shortly, or contact your coach.')
    else setResetMsg(`A password reset link has been sent to ${addr}.`)
    setResetting(false)
  }

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
      const meta = { name: (name.trim() || invite.name || '') };
      if (invite.code) { meta.trainer_id = invite.tid || ''; meta.managed_client_id = invite.mc || ''; }
      const { error: err } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: meta } })
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
        <div style={{ fontFamily: 'Orbitron', fontWeight: 900, fontSize: 30, letterSpacing: '0.06em', color: '#189caa' }}>
          HS PT
        </div>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-3)', letterSpacing: '0.14em', marginTop: 7 }}>
          HARRISON STOCK | PERSONAL TRAINING &amp; NUTRITION
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
              {invite.name ? `Welcome, ${invite.name.trim().split(/\s+/)[0]}. ` : 'Welcome. '}
              Create your account to access your programme, recipes and resources.
            </div>
          </div>
        )}
        {mode === 'signup' && (
          <div>
            <div className="label" style={{ marginBottom: 7 }}>FULL NAME</div>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. John Smith" required autoComplete="name"
              style={inputStyle}
            />
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
          <PasswordField
            value={password} onChange={e => setPassword(e.target.value)}
            minLength={6}
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
          />
          {mode === 'signin' && (
            <div style={{ textAlign: 'right', marginTop: 7 }}>
              <button type="button" onClick={sendReset} className="mono" style={{
                all: 'unset', cursor: 'pointer', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em',
              }}>FORGOT PASSWORD?</button>
            </div>
          )}
        </div>

        {resetMsg && (
          <div className="mono" style={{
            fontSize: 11, color: 'var(--accent)', padding: '10px 12px',
            background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
            borderRadius: 8, letterSpacing: '0.04em', lineHeight: 1.5,
          }}>
            {resetMsg}
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--text-3)', fontSize: 10, lineHeight: 1.5 }}>
              Didn't arrive within a couple of minutes? Check your spam/junk folder, then{' '}
              <button type="button" onClick={sendReset} disabled={resetting} className="mono" style={{
                all: 'unset', cursor: resetting ? 'default' : 'pointer',
                color: 'var(--accent)', fontWeight: 700, textDecoration: 'underline', opacity: resetting ? 0.5 : 1,
              }}>{resetting ? 'sending…' : 'send it again'}</button>.
            </div>
          </div>
        )}

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
          <PasswordField value={pw} onChange={e => setPw(e.target.value)} minLength={6} autoComplete="new-password" />
        </div>
        <div>
          <div className="label" style={{ marginBottom: 7 }}>CONFIRM PASSWORD</div>
          <PasswordField value={pw2} onChange={e => setPw2(e.target.value)} minLength={6} autoComplete="new-password" />
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

// Password input with a peek (eye) toggle so users can check what they typed.
function PasswordField({ value, onChange, placeholder = '••••••••', autoComplete, minLength = 6, required = true }) {
  const [show, setShow] = React.useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'} value={value} onChange={onChange}
        placeholder={placeholder} required={required} minLength={minLength} autoComplete={autoComplete}
        style={{ ...inputStyle, paddingRight: 46 }}
      />
      <button type="button" onClick={() => setShow(s => !s)}
        aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}
        style={{ all: 'unset', cursor: 'pointer', position: 'absolute', top: 0, bottom: 0, right: 4, width: 38, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>
        {show
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><path d="M1 1l22 22"/></svg>
          : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>}
      </button>
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
