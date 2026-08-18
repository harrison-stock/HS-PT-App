import React from 'react'
import { BrandIcon } from './BrandIcon'

// A screen that exists in the nav but has nothing to show yet.
//
// Better than removing the tab: the client can see the thing is planned rather
// than wondering whether it broke, and nothing has to move in the nav when it
// arrives. Deliberately quiet - it is a placeholder, not an announcement.
export function ComingSoon({ title = 'Coming soon', label = '// RESOURCES', sub, icon = 'Recipe' }) {
  return (
    <div className="scroller" style={{
      padding: '0 20px', paddingTop: 'calc(var(--safe-top) + 18px)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div className="label">{label}</div>

      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: '32px 0 64px' }}>
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
    </div>
  );
}
