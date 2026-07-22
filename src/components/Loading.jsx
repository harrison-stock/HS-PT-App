import React from 'react'
import { HexShape } from './hex'
import { BrandIcon } from './BrandIcon'

// The brand hex loader - a hexagon "track" with an accent arc that chases
// around its perimeter (ported from the HS PT Menu Scanner boot screen).
const HEX_PATH = 'M194.489,30.721c-3.782,0 -7.574,0.799 -10.995,2.417l-141.142,66.762c-6.877,3.253 -11.356,9.426 -11.356,16.346l0,133.524c0,6.921 4.479,13.093 11.356,16.346l141.142,66.762c6.776,3.205 15.227,3.205 22.002,0l141.136,-66.762c6.876,-3.253 11.362,-9.424 11.362,-16.346l0,-133.524c0,-6.922 -4.486,-13.093 -11.362,-16.346l-141.136,-66.762c-3.418,-1.617 -7.23,-2.417 -11.007,-2.417Z';

export function HexLoader({ size = 120, label, sub, gap = 22 }) {
  const w = size;
  const h = Math.round(size * 365 / 389);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap }}>
      <svg viewBox="0 0 389 365" width={w} height={h} style={{ overflow: 'visible' }}>
        <path d={HEX_PATH} fill="none" stroke="var(--line-strong)" strokeWidth="14" strokeLinejoin="round" />
        <path d={HEX_PATH} fill="none" stroke="var(--accent)" strokeWidth="14"
          strokeLinejoin="round" strokeLinecap="round" strokeDasharray="285 855"
          style={{ animation: 'hexdash 1.4s linear infinite', filter: 'drop-shadow(0 0 calc(8px * var(--glow)) var(--accent-glow))' }} />
      </svg>
      {(label || sub) && (
        <div style={{ textAlign: 'center' }}>
          {label && <div className="h-bold" style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--heading-deep)' }}>{label}</div>}
          {sub && <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', marginTop: 8 }}>{sub}</div>}
        </div>
      )}
    </div>
  );
}

// Small inline spinner - an accent ring that rotates. Sizeable anywhere.
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

// Three pulsing hexes - the brand-flavoured "working…" motif.
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

// A single shimmer block. Size it via width/height (numbers = px).
export function Skel({ w = '100%', h = 12, r = 8, style }) {
  return <span className="skel" style={{ display: 'block', width: w, height: h, borderRadius: r, ...style }} />;
}

// Card-shaped skeleton - mimics a media-row card (thumb + two text lines).
// Use in place of "LOADING…" text tiles so lists feel alive while fetching.
//   <SkeletonCard />            one row card
//   <SkeletonCard rows={3} />   a stack of three
//   <SkeletonCard variant="stat" /> compact stat-tile shape
export function SkeletonCard({ rows = 1, variant = 'row', style }) {
  const one = (key) => (
    <div key={key} className="card" style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center', ...style }}>
      {variant === 'row' && <Skel w={46} h={46} r={12} style={{ flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 8 }}>
        <Skel w="62%" h={12} />
        <Skel w="38%" h={9} />
      </div>
    </div>
  );
  if (rows === 1) return one();
  return <div className="stagger-in" style={{ display: 'grid', gap: 10 }}>{Array.from({ length: rows }, (_, i) => one(i))}</div>;
}

// Empty-state card - an icon, a headline, optional supporting line and CTA.
// Keeps every "nothing here yet" moment on-brand and actionable.
export function EmptyState({ icon = 'Target', title, sub, actionLabel, onAction, style }) {
  return (
    <div className="card" style={{ padding: '30px 22px', textAlign: 'center', animation: 'popIn .25s ease', ...style }}>
      <div style={{ display: 'grid', placeItems: 'center', marginBottom: 12, opacity: 0.9 }}>
        <BrandIcon name={icon} size={44} color="var(--text-3)" />
      </div>
      <div className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>{title}</div>
      {sub && <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.04em', lineHeight: 1.6, marginTop: 6 }}>{sub}</div>}
      {actionLabel && onAction && (
        <button onClick={onAction} className="btn-ghost" style={{ marginTop: 16, fontSize: 11, color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 45%, var(--line-strong))' }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// Centered loading tile on a dimmed backdrop - use for any processing that
// runs longer than a beat (saving a session, generating a PDF, uploading…).
// Render conditionally: {busy && <LoadingTile label="Saving…" />}
export function LoadingTile({ label = 'Working…', sub, variant = 'hex', blocking = true }) {
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
        {variant === 'pulse' ? <HexPulse /> : variant === 'ring' ? <Spinner size={30} /> : <HexLoader size={62} gap={0} />}
        <div style={{ textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--text)', textTransform: 'uppercase' }}>{label}</div>
          {sub && <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 5 }}>{sub}</div>}
        </div>
      </div>
    </div>
  );
}
