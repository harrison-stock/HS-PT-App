import React from 'react'
import { HexShape } from './hex'

// Small inline spinner — an accent ring that rotates. Sizeable anywhere.
export function Spinner({ size = 22, stroke = 3, color = 'var(--accent)' }) {
  return (
    <span style={{
      display: 'inline-block', width: size, height: size, borderRadius: '50%',
      border: `${stroke}px solid color-mix(in srgb, ${color} 22%, transparent)`,
      borderTopColor: color,
      animation: 'spin .7s linear infinite',
      filter: `drop-shadow(0 0 calc(5px * var(--glow)) color-mix(in srgb, ${color} 45%, transparent))`,
    }} />
  );
}

// Three pulsing hexes — the brand-flavoured "working…" motif.
function HexPulse() {
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{ display: 'grid', placeItems: 'center', animation: `tilePulse 1.1s ease-in-out ${i * 0.16}s infinite` }}>
          <HexShape size={12} fill="var(--accent)" />
        </span>
      ))}
    </div>
  );
}

// Centered loading tile on a dimmed backdrop — use for any processing that
// runs longer than a beat (saving a session, generating a PDF, uploading…).
// Render conditionally: {busy && <LoadingTile label="Saving…" />}
export function LoadingTile({ label = 'Working…', sub, variant = 'ring', blocking = true }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 320,
      display: 'grid', placeItems: 'center', padding: 28,
      background: 'rgba(6,10,12,0.55)', backdropFilter: 'blur(4px)',
      pointerEvents: blocking ? 'auto' : 'none',
      animation: 'fadeIn .15s ease',
    }}>
      <div style={{
        minWidth: 150, maxWidth: 280, padding: '22px 26px', borderRadius: 16,
        background: 'color-mix(in srgb, var(--bg-2) 94%, transparent)',
        border: '1px solid var(--line-strong)',
        boxShadow: '0 18px 44px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
        animation: 'sheetUp .24s cubic-bezier(.22,.61,.36,1)',
      }}>
        {variant === 'hex' ? <HexPulse /> : <Spinner size={30} />}
        <div style={{ textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text)', textTransform: 'uppercase' }}>{label}</div>
          {sub && <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 5 }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}
