import React from 'react'
import { Hex } from '../components/hex'

// Tiny global toast bus — no dependencies, no context wiring at call sites.
// Call `toast('Saved')` from anywhere; mount a single <ToastHost/> in App.
let seq = 0;
const listeners = new Set();

export function toast(message, opts = {}) {
  if (!message) return;
  const t = { id: ++seq, message, kind: opts.kind || 'success', duration: opts.duration ?? 2600 };
  listeners.forEach((fn) => fn(t));
  return t.id;
}

function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

const KIND = {
  success: { color: 'var(--accent)', glyph: '✓' },
  error:   { color: 'var(--c-coral)', glyph: '✕' },
  info:    { color: 'var(--accent-2)', glyph: 'ℹ' },
};

export function ToastHost() {
  const [items, setItems] = React.useState([]);

  React.useEffect(() => subscribe((t) => {
    setItems((prev) => [...prev, t]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), t.duration);
  }), []);

  if (items.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, zIndex: 500,
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 96px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      padding: '0 16px', pointerEvents: 'none',
    }}>
      {items.map((t) => {
        const meta = KIND[t.kind] || KIND.success;
        return (
          <div key={t.id} style={{
            pointerEvents: 'auto', maxWidth: 420, width: 'fit-content',
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '11px 16px', borderRadius: 12,
            background: 'color-mix(in srgb, var(--bg-3) 92%, transparent)',
            backdropFilter: 'blur(12px)',
            border: `1px solid color-mix(in srgb, ${meta.color} 45%, var(--line-strong))`,
            boxShadow: `0 8px 30px rgba(0,0,0,0.4), 0 0 calc(14px * var(--glow)) color-mix(in srgb, ${meta.color} 30%, transparent)`,
            animation: 'sheetUp .28s cubic-bezier(.22,.61,.36,1)',
          }}>
            <Hex size={20} square style={{
              flexShrink: 0, background: meta.color, color: 'var(--on-accent)',
              fontSize: 11, fontWeight: 800,
            }}>{meta.glyph}</Hex>
            <span className="mono" style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.02em', color: 'var(--text)' }}>
              {t.message}
            </span>
          </div>
        );
      })}
    </div>
  );
}
