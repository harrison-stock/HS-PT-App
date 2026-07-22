import React from 'react'

// Resistance-band levels (coach's colour code).
export const BANDS = [
  { key: 'xlight', label: 'Extra Light', short: 'X-LIGHT', color: '#F2C200' }, // yellow
  { key: 'light',  label: 'Light',       short: 'LIGHT',   color: '#E0312F' }, // red
  { key: 'medium', label: 'Medium',      short: 'MEDIUM',  color: '#111111' }, // black
  { key: 'heavy',  label: 'Heavy',       short: 'HEAVY',   color: '#7A3FF2' }, // purple
  { key: 'xheavy', label: 'Extra Heavy', short: 'X-HEAVY', color: '#2FB457' }, // green
];
export const bandOf = (key) => BANDS.find(b => b.key === key) || null;

// Compact swatch + label for read-only display (rows, previews, plans).
export function BandChip({ band, size = 12 }) {
  const b = bandOf(band);
  if (!b) return <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>-</span>;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      <span style={{ width: size, height: size, borderRadius: 4, background: b.color, border: '1px solid rgba(255,255,255,0.35)', flexShrink: 0 }} />
      <span className="mono" style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.04em' }}>{b.short}</span>
    </span>
  );
}

// Full picker - a row of tappable swatches with labels. value is a band key.
export function BandPicker({ value, onChange, compact }) {
  return (
    <div style={{ display: 'flex', gap: compact ? 4 : 6 }}>
      {BANDS.map(b => {
        const on = value === b.key;
        return (
          <button key={b.key} onClick={() => onChange(b.key)} title={b.label} style={{
            all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
            padding: compact ? '4px 0' : '6px 0', borderRadius: 8,
            background: on ? `color-mix(in srgb, ${b.color} 18%, var(--bg-2))` : 'var(--bg-2)',
            border: `1px solid ${on ? b.color : 'var(--line)'}`,
            boxShadow: on ? `0 0 0 1px ${b.color} inset` : 'none',
          }}>
            <span style={{ display: 'block', width: '100%', height: compact ? 10 : 14, borderRadius: 3, background: b.color, border: '1px solid rgba(255,255,255,0.3)' }} />
            {!compact && <span className="mono" style={{ display: 'block', fontSize: 7.5, fontWeight: 700, letterSpacing: '0.04em', marginTop: 4, color: on ? b.color : 'var(--text-3)' }}>{b.short}</span>}
          </button>
        );
      })}
    </div>
  );
}
