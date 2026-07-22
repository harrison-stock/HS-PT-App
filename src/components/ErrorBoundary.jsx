import React from 'react'

// Catches render/runtime errors in a screen so a crash shows a recovery card
// instead of a blank white screen. Keyed by screen in App, so navigating away
// (or reloading) clears the error and the rest of the app keeps working.
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // Surface for debugging; a real logger could ship this somewhere.
    console.error('Screen crashed:', error, info?.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', background: 'var(--bg-0)', padding: 24 }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 12, margin: '0 auto 14px', display: 'grid', placeItems: 'center',
            background: 'color-mix(in srgb, var(--c-coral) 16%, transparent)',
            border: '1px solid color-mix(in srgb, var(--c-coral) 45%, transparent)',
            color: 'var(--c-coral)', fontSize: 22, fontWeight: 800,
          }}>!</div>
          <div className="h-bold" style={{ fontSize: 18, marginBottom: 8 }}>SOMETHING WENT WRONG</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 18 }}>
            This screen hit an error. Your workout progress is saved - reload to carry on.
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <button onClick={() => window.location.reload()} className="btn-primary" style={{ width: '100%', color: 'var(--heading-deep)' }}>RELOAD</button>
            {this.props.onHome && (
              <button onClick={() => { this.setState({ error: null }); this.props.onHome(); }} className="btn-ghost" style={{ width: '100%' }}>
                GO HOME
              </button>
            )}
          </div>
          {this.state.error?.message && (
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 16, wordBreak: 'break-word', lineHeight: 1.5 }}>
              {String(this.state.error.message).slice(0, 240)}
            </div>
          )}
        </div>
      </div>
    );
  }
}
