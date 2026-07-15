import React from 'react'
import { HexBackButton, Hex } from '../components/hex'
import { IconUser, IconClipboard, IconCalendar, IconFlame, IconHeart, IconDoc, IconCheck } from '../components/icons'
import { loadNotifications, markAllRead } from '../lib/notifications'

function ago(iso) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d` : `${Math.floor(d / 7)}w`;
}

// Notifications — backed by the notifications table (workouts, tasks, forms,
// comments, injuries). Tapping a row marks it read and jumps to the target.
export function Notifications({ go, userId, home = 'dashboard' }) {
  const [items, setItems] = React.useState(null);

  React.useEffect(() => {
    if (!userId) { setItems([]); return; }
    loadNotifications(userId).then(setItems);
    // Mark everything read once the feed is opened.
    markAllRead(userId);
  }, [userId]);

  const today = (items || []).filter(n => new Date(n.created_at).toDateString() === new Date().toDateString());
  const earlier = (items || []).filter(n => new Date(n.created_at).toDateString() !== new Date().toDateString());

  return (
    <div className="scroller" style={{ padding: '0 16px 28px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <HexBackButton onClick={() => go(home)} size={36} />
          <div>
            <div className="label" style={{ marginBottom: 4 }}>// ACTIVITY</div>
            <div className="h-bold" style={{ fontSize: 20, lineHeight: 1, color: 'var(--heading-deep)' }}>NOTIFICATIONS</div>
          </div>
        </div>
      </div>

      {items === null && (
        <div className="card" style={{ padding: 28, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'JetBrains Mono', fontSize: 11, letterSpacing: '0.12em' }}>LOADING…</div>
      )}
      {items !== null && items.length === 0 && (
        <div className="card" style={{ padding: 28, textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em', lineHeight: 1.7 }}>
            ALL CAUGHT UP<br/><span style={{ fontSize: 9 }}>Activity from your clients shows here</span>
          </div>
        </div>
      )}

      {today.length > 0 && <>
        <div className="label" style={{ margin: '4px 4px 8px' }}>// TODAY</div>
        <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
          {today.map(n => <NotifRow key={n.id} n={n} onTap={() => go(n.link?.screen || 'dashboard')} />)}
        </div>
      </>}
      {earlier.length > 0 && <>
        <div className="label" style={{ margin: '4px 4px 8px' }}>// EARLIER</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {earlier.map(n => <NotifRow key={n.id} n={n} onTap={() => go(n.link?.screen || 'dashboard')} />)}
        </div>
      </>}
    </div>);
}

function NotifRow({ n, onTap }) {
  const meta = NOTIF_META[n.kind] || NOTIF_META.info;
  const Icon = meta.icon;
  const unread = !n.read_at;
  return (
    <button onClick={onTap} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
      <div className="card" style={{
        padding: 12, display: 'grid', gridTemplateColumns: '38px 1fr', gap: 12, alignItems: 'flex-start',
        borderColor: unread ? `color-mix(in srgb, ${meta.color} 40%, var(--line))` : 'var(--line)',
        background: unread ? `color-mix(in srgb, ${meta.color} 7%, var(--bg-2))` : 'var(--bg-2)',
      }}>
        <Hex size={40} square style={{ background: `color-mix(in srgb, ${meta.color} 16%, transparent)`, color: meta.color, flexShrink: 0 }}>
          <Icon size={17} />
        </Hex>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{n.title}</span>
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
              {unread && <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color, boxShadow: `0 0 5px ${meta.color}` }} />}
              {ago(n.created_at)}
            </span>
          </div>
          {n.body && <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.45, marginTop: 4 }}>{n.body}</div>}
        </div>
      </div>
    </button>);
}

const NOTIF_META = {
  done:     { icon: (p) => <IconFlame {...p} />,     color: 'var(--accent)' },
  task:     { icon: (p) => <IconClipboard {...p} />, color: 'var(--c-amber)' },
  form:     { icon: (p) => <IconDoc {...p} />,        color: 'var(--accent-2)' },
  comment:  { icon: (p) => <IconClipboard {...p} />,  color: 'var(--c-blue)' },
  injury:   { icon: (p) => <IconHeart {...p} />,      color: 'var(--c-coral)' },
  schedule: { icon: (p) => <IconCalendar {...p} />,   color: 'var(--accent-2)' },
  info:     { icon: (p) => <IconCheck {...p} />,      color: 'var(--accent)' },
};
