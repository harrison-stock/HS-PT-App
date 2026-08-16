import React from 'react'
import { loadClientResponses, groupResponses, answerText } from '../lib/forms'
import { SkeletonCard, EmptyState } from '../components/Loading'

// A client's form history. Responses were being written and never read back -
// `loadResponses` existed but nothing called it - so a weekly check-in went
// into the database and stayed there. This is the other half: every submission
// they've made, grouped by form, with the numeric answers lined up across weeks
// so a trend is visible without opening each one.

const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export function FormArchive({ clientId, clientName }) {
  const [rows, setRows] = React.useState(null);
  const [openId, setOpenId] = React.useState(null);
  const [formFilter, setFormFilter] = React.useState('all');

  React.useEffect(() => {
    let alive = true;
    loadClientResponses(clientId).then(r => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [clientId]);

  const groups = React.useMemo(() => groupResponses(rows || []), [rows]);
  const shown = formFilter === 'all' ? groups : groups.filter(g => g.form.id === formFilter);
  const first = (clientName || '').split(' ')[0] || 'This client';

  if (rows === null) return <SkeletonCard rows={3} />;
  if (!groups.length) {
    return (
      <EmptyState icon="Checklist" title="No check-ins yet"
        sub={`Responses appear here once ${first} submits a form. Assign one from the Tasks tab and set it to repeat weekly.`} />
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div className="label">// CHECK-IN ARCHIVE</div>

      {groups.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <FilterPill active={formFilter === 'all'} onClick={() => setFormFilter('all')}>ALL</FilterPill>
          {groups.map(g => (
            <FilterPill key={g.form.id} active={formFilter === g.form.id} onClick={() => setFormFilter(g.form.id)}>
              {g.form.title.toUpperCase()}
            </FilterPill>
          ))}
        </div>
      )}

      {shown.map(g => (
        <div key={g.form.id} style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>{g.form.title}</span>
            <span className="mono" style={{ fontSize: 9.5, color: 'var(--text-3)', letterSpacing: '0.08em' }}>
              {g.entries.length} SUBMISSION{g.entries.length === 1 ? '' : 'S'} · LATEST {fmtShort(g.entries[0].submitted_at)}
            </span>
          </div>

          {/* Numbers across weeks. The whole point of a repeating check-in is
              the comparison, which reading one entry at a time doesn't give. */}
          {g.trend.length > 0 && <TrendTable trend={g.trend} />}

          <div style={{ display: 'grid', gap: 6 }}>
            {g.entries.map(e => (
              <Entry key={e.id} entry={e} form={g.form}
                open={openId === e.id} onToggle={() => setOpenId(id => id === e.id ? null : e.id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// One row per tracked field, one column per submission. Capped at the last
// eight so a year of weekly check-ins doesn't run off the side; the full set is
// always in the entries below.
function TrendTable({ trend }) {
  const MAX = 8;
  const dates = React.useMemo(() => {
    const all = new Set();
    trend.forEach(t => t.points.forEach(p => all.add(p.at)));
    return [...all].sort().slice(-MAX);
  }, [trend]);

  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: dates.length * 58 + 130 }}>
        <thead>
          <tr>
            <th style={{ ...cellSt, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--bg-1)', zIndex: 1, minWidth: 118 }}>
              <span className="mono" style={{ fontSize: 8.5, letterSpacing: '0.1em', color: 'var(--text-3)' }}>FIELD</span>
            </th>
            {dates.map(d => (
              <th key={d} style={{ ...cellSt, minWidth: 56 }}>
                <span className="mono" style={{ fontSize: 8.5, letterSpacing: '0.06em', color: 'var(--text-3)' }}>{fmtShort(d)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {trend.map(t => {
            const byDate = new Map(t.points.map(p => [p.at, p.v]));
            const seen = dates.map(d => byDate.get(d)).filter(v => v != null);
            return (
              <tr key={t.field.id} style={{ borderTop: '1px solid var(--line)' }}>
                <td style={{ ...cellSt, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--bg-1)', zIndex: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 600 }}>{t.field.label}</span>
                </td>
                {dates.map((d, i) => {
                  const v = byDate.get(d);
                  const prev = [...dates.slice(0, i)].reverse().map(x => byDate.get(x)).find(x => x != null);
                  const delta = v != null && prev != null ? v - prev : null;
                  const isLast = seen.length > 1 && v != null && d === dates[dates.length - 1];
                  return (
                    <td key={d} style={{ ...cellSt }}>
                      {v == null
                        ? <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>–</span>
                        : <>
                            <div className="mono" style={{ fontSize: 12, fontWeight: isLast ? 700 : 500, color: isLast ? 'var(--text)' : 'var(--text-2)' }}>{v}</div>
                            {/* Signed, but not coloured. Whether up is good
                                depends entirely on the field - green for a
                                rising number would call a client's weight loss
                                a decline. The sign says which way it went; what
                                that means is the coach's call. */}
                            {delta != null && delta !== 0 && (
                              <div className="mono" style={{ fontSize: 8.5, marginTop: 1, color: 'var(--text-3)' }}>
                                {delta > 0 ? '+' : ''}{Math.round(delta * 10) / 10}
                              </div>
                            )}
                          </>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const cellSt = { padding: '8px 10px', textAlign: 'center', verticalAlign: 'middle' };

function Entry({ entry, form, open, onToggle }) {
  const fields = form.fields || [];
  const answered = fields
    .map(f => ({ field: f, text: answerText(f, entry.answers?.[f.id]) }))
    .filter(a => a.text != null);
  // Enough of the first written answer to tell two weeks apart at a glance.
  const preview = answered.find(a => a.field.type === 'textarea' || a.field.type === 'text')?.text
    || answered.map(a => `${a.field.label}: ${a.text}`)[0]
    || 'No answers';

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{
        all: 'unset', cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto',
        gap: 10, alignItems: 'center', padding: '10px 12px', width: '100%', boxSizing: 'border-box',
      }}>
        <span style={{ minWidth: 0 }}>
          <span className="mono" style={{ display: 'block', fontSize: 9.5, letterSpacing: '0.08em', color: 'var(--text-3)' }}>
            {fmtDate(entry.submitted_at)}
          </span>
          <span style={{
            display: 'block', fontSize: 12, marginTop: 3, color: 'var(--text-2)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: open ? 'normal' : 'nowrap',
          }}>{open ? `${answered.length} answer${answered.length === 1 ? '' : 's'}` : preview}</span>
        </span>
        <span className="mono" style={{ fontSize: 9, color: 'var(--accent)', letterSpacing: '0.08em' }}>
          {open ? 'CLOSE' : 'OPEN'}
        </span>
      </button>

      {open && (
        <div style={{ borderTop: '1px solid var(--line)', padding: '10px 12px', display: 'grid', gap: 10 }}>
          {answered.length === 0 && (
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>Submitted with no answers filled in.</span>
          )}
          {answered.map(a => (
            <div key={a.field.id}>
              <div className="mono" style={{ fontSize: 8.5, letterSpacing: '0.1em', color: 'var(--text-3)', marginBottom: 3 }}>
                {a.field.label.toUpperCase()}
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{a.text}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterPill({ active, onClick, children }) {
  return (
    <button onClick={onClick} className="mono" style={{
      all: 'unset', cursor: 'pointer', padding: '6px 10px', borderRadius: 999,
      fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
      background: active ? 'var(--accent-soft)' : 'var(--bg-3)',
      color: active ? 'var(--accent)' : 'var(--text-3)',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
    }}>{children}</button>
  );
}
