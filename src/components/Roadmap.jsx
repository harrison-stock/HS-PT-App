import React from 'react'

const DAY = 86400000;

// Weeks-based programme maths. Progress is how far through the programme's
// total weeks we are today; each phase carries its own weeks + share of total.
//   e.g. phases 2 / 9 / 1 weeks (12 total); 6 weeks elapsed → 50% progress.
export function computeRoadmap(phases, startDate) {
  const list = (phases || []).map((p, i) => ({ ...p, weeks: Math.max(1, p.weeks || 1), idx: p.idx ?? i }));
  const W = list.reduce((n, p) => n + p.weeks, 0) || 1;

  let elapsed = 0;
  if (startDate) {
    const start = new Date(startDate);
    if (!isNaN(start)) elapsed = (Date.now() - start.getTime()) / (7 * DAY);
  }
  elapsed = Math.max(0, Math.min(W, elapsed));
  const progress = elapsed / W;

  let cum = 0;
  const nodes = list.map((p) => {
    const startWeek = cum;
    cum += p.weeks;
    // How much of THIS phase has elapsed (0..1), and its share of the whole.
    const fill = Math.max(0, Math.min(1, (elapsed - startWeek) / p.weeks));
    return { ...p, startWeek, endWeek: cum, endFrac: cum / W, share: p.weeks / W, fill, done: elapsed >= cum - 1e-6 };
  });
  const curIdx = nodes.findIndex((n) => !n.done);
  nodes.forEach((n, i) => { n.current = i === curIdx; n.upcoming = !n.done && i !== curIdx; });

  return { W, nodes, progress, weeksElapsed: elapsed, currentWeek: Math.min(W, Math.floor(elapsed) + 1) };
}

// A segmented progress bar: one chunk per phase, each sized to its share of the
// programme's total weeks. Chunks fill left-to-right with elapsed progress, and
// each is labelled with its name and % of the plan. Used identically on the
// client dashboard, the coach's client card, and the programme-builder preview.
export function RoadmapTrack({ phases, startDate }) {
  const { nodes, W } = computeRoadmap(phases, startDate);
  if (!nodes.length) return null;

  return (
    <div style={{ margin: '2px 0 0' }}>
      {/* Segmented bar - flex weights = each phase's weeks. Completed phases
          fade back so the active phase stands out. */}
      <div style={{ display: 'flex', gap: 3, height: 12 }}>
        {nodes.map((p) => (
          <div key={p.id} style={{
            flex: `${p.weeks} 1 0`, minWidth: 0, position: 'relative',
            background: 'var(--track)', borderRadius: 4, overflow: 'hidden',
            opacity: p.done ? 0.45 : 1,
            border: p.current ? '1px solid color-mix(in srgb, var(--accent) 55%, transparent)' : '1px solid transparent',
          }}>
            <span style={{
              position: 'absolute', inset: 0, transformOrigin: 'left',
              transform: `scaleX(${p.fill})`, transition: 'transform .7s cubic-bezier(.22,.61,.36,1)',
              background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
              boxShadow: p.fill > 0 && !p.done ? '0 0 calc(6px * var(--glow)) var(--accent-glow)' : 'none',
            }} />
          </div>
        ))}
      </div>

      {/* Per-chunk labels - phase name only; completed phases fade back. */}
      <div style={{ display: 'flex', gap: 3, marginTop: 6 }}>
        {nodes.map((p) => (
          <div key={p.id} style={{ flex: `${p.weeks} 1 0`, minWidth: 0, textAlign: 'center', opacity: p.done ? 0.45 : 1 }}>
            <div className="mono" style={{
              fontSize: 8.5, fontWeight: 700, letterSpacing: '0.02em',
              color: p.current ? 'var(--accent)' : 'var(--text-2)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>{p.name || `Phase ${p.idx + 1}`}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
