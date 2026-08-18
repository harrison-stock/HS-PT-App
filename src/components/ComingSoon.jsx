import React from 'react'
import { BrandIcon } from './BrandIcon'

// A screen that exists in the nav but has nothing to show yet.
//
// Better than removing the tab: the client can see the thing is planned rather
// than wondering whether it broke, and nothing has to move in the nav when it
// arrives. Deliberately quiet - it is a placeholder, not an announcement.
// `inline` drops the screen chrome so it can sit inside a screen that already
// has its own header and tabs, which is how the client's library uses it - the
// tabs stay, only what is under them changes.
export function ComingSoon({ title = 'Coming soon', label = '// RESOURCES', sub, icon = 'Recipe', inline = false }) {
  const panel = (
    <div style={{ display: 'grid', placeItems: 'center', padding: inline ? '10px 0 24px' : '32px 0 64px', flex: inline ? undefined : 1 }}>
        <div className="card" style={{
          padding: '32px 24px', display: 'grid', justifyItems: 'center', gap: 14,
          textAlign: 'center', maxWidth: 320, width: '100%',
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', display: 'grid', placeItems: 'center',
            background: 'var(--accent-soft)', color: 'var(--accent)',
          }}>
            <BrandIcon name={icon} size={30} />
          </div>

          <span className="mono" style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em',
            color: 'var(--accent)', background: 'var(--accent-soft)',
            border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
            borderRadius: 999, padding: '5px 12px',
          }}>COMING SOON</span>

          <div style={{ fontSize: 17, fontWeight: 700 }}>{title}</div>
          {sub && (
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.6 }}>{sub}</div>
          )}
        </div>
    </div>
  );

  if (inline) return panel;
  return (
    <div className="scroller" style={{
      padding: '0 20px', paddingTop: 'calc(var(--safe-top) + 18px)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div className="label">{label}</div>
      {panel}
    </div>
  );
}
