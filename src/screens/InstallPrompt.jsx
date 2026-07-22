import React from 'react'
import { canInstall, promptInstall, subscribeInstall, getPlatform, isStandalone } from '../lib/installPrompt'

// Share icon (iOS Safari toolbar) - used in the instructions.
const IconShare = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 16V4M8 8l4-4 4 4"/><path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7"/>
  </svg>
);
const IconPlusSquare = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/>
  </svg>
);

// "Add to home screen" sheet. Shows a native install button when the browser
// supports it (Android/desktop Chromium), otherwise platform-specific steps.
export function InstallPrompt({ onClose }) {
  const [, force] = React.useReducer(x => x + 1, 0);
  React.useEffect(() => subscribeInstall(force), []);
  const platform = getPlatform();
  const native = canInstall();
  const installed = isStandalone();

  const doInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') onClose();
  };

  const Step = ({ n, children }) => (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <div style={{ flexShrink: 0, width: 22, height: 22, borderRadius: 7, background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--accent)', display: 'grid', placeItems: 'center', fontFamily: 'Orbitron', fontWeight: 800, fontSize: 11 }}>{n}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, paddingTop: 1 }}>{children}</div>
    </div>
  );

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 410, background: 'rgba(6,10,12,0.66)', backdropFilter: 'blur(6px)', display: 'grid', placeItems: 'center', padding: 24, animation: 'fadeIn .15s ease' }}>
      <div onClick={e => e.stopPropagation()} className="card" style={{ width: '100%', maxWidth: 340, padding: 22, background: 'var(--bg-2)', textAlign: 'center' }}>
        <div style={{ padding: 14, margin: '4px auto 14px', width: 'fit-content' }}>
          <img src="/logo-mark.png" alt="HS PT" width={84} style={{ display: 'block', height: 'auto', filter: 'drop-shadow(0 6px 18px rgba(0,0,0,0.35))' }}/>
        </div>
        <div className="h-bold" style={{ fontSize: 19, marginBottom: 8 }}>INSTALL THE HS PT APP</div>
        <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.55, marginBottom: 18 }}>
          You can add the HS PT to your home screen for quick, one-tap access to your programme, recipes and resources.
        </div>

        {installed ? (
          <div className="mono" style={{ fontSize: 11.5, color: 'var(--accent)', lineHeight: 1.6, marginBottom: 18 }}>
            ✓ You're already running the installed app.
          </div>
        ) : native ? (
          <>
            <button onClick={doInstall} className="btn-primary" style={{ width: '100%', color: 'var(--heading-deep)', marginBottom: 12 }}>INSTALL APP</button>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.5, marginBottom: 4 }}>
              Tap install and confirm - it'll appear on your home screen.
            </div>
          </>
        ) : platform === 'ios' ? (
          <div style={{ display: 'grid', gap: 12, textAlign: 'left', marginBottom: 18 }}>
            <Step n="1">In Safari, tap the <strong style={{ color: 'var(--text)' }}>Share</strong> button <span style={{ display: 'inline-flex', verticalAlign: 'middle', color: 'var(--accent)' }}><IconShare size={14}/></span> at the bottom of the screen.</Step>
            <Step n="2">Scroll down and tap <strong style={{ color: 'var(--text)' }}>Add to Home Screen</strong> <span style={{ display: 'inline-flex', verticalAlign: 'middle', color: 'var(--accent)' }}><IconPlusSquare size={14}/></span>.</Step>
            <Step n="3">Tap <strong style={{ color: 'var(--text)' }}>Add</strong> - the app icon lands on your home screen.</Step>
          </div>
        ) : platform === 'android' ? (
          <div style={{ display: 'grid', gap: 12, textAlign: 'left', marginBottom: 18 }}>
            <Step n="1">Open your browser menu <strong style={{ color: 'var(--text)' }}>⋮</strong> (top-right).</Step>
            <Step n="2">Tap <strong style={{ color: 'var(--text)' }}>Install app</strong> or <strong style={{ color: 'var(--text)' }}>Add to Home screen</strong>.</Step>
            <Step n="3">Confirm - the app icon lands on your home screen.</Step>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 12, textAlign: 'left', marginBottom: 18 }}>
            <Step n="1">Click the <strong style={{ color: 'var(--text)' }}>install icon</strong> in the address bar (or browser menu ⋮).</Step>
            <Step n="2">Choose <strong style={{ color: 'var(--text)' }}>Install</strong>.</Step>
            <Step n="3">The app opens in its own window and is added to your apps.</Step>
          </div>
        )}

        <button onClick={onClose} className="btn-ghost" style={{ width: '100%' }}>{installed ? 'CLOSE' : 'MAYBE LATER'}</button>
      </div>
    </div>
  );
}
