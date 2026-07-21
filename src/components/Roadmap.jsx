import React from 'react'
import { Hex } from './hex'

const DAY = 86400000;

// Geometry for a weeks-based programme roadmap. Nodes sit at the END of each
// phase, positioned by cumulative weeks, and progress is how far through the
// programme's total weeks we are today.
//   e.g. phases 2 / 9 / 1 weeks (12 total); 6 weeks elapsed → 50% progress,
//   phase 1 ticked, the line halfway through phase 2.
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
    cum += p.weeks;
    return { ...p, endWeek: cum, endFrac: cum / W, done: elapsed >= cum - 1e-6 };
  });
  const curIdx = nodes.findIndex((n) => !n.done);
  nodes.forEach((n, i) => { n.current = i === curIdx; n.upcoming = !n.done && i !== curIdx; });

  return { W, nodes, progress, weeksElapsed: elapsed, currentWeek: Math.min(W, Math.floor(elapsed) + 1) };
}

// Shared roadmap track — used identically on the client dashboard and the
// coach's client overview so the two always mirror each other.
export function RoadmapTrack({ phases, startDate, hexSize = 26 }) {
  const { nodes, progress, W, weeksElapsed } = computeRoadmap(phases, startDate);
  if (!nodes.length) return null;
  const half = hexSize / 2 + 1;

  // Only tiny P-numbers sit under the hexes (they never collide, unlike the
  // phase names, which caused the truncation). The active phase's name + week
  // is shown once, centred, as a caption below the whole track.
  const current = nodes.find((n) => n.current);
  const allDone = nodes.every((n) => n.done);
  const caption = allDone
    ? 'PROGRAMME COMPLETE'
    : current
      ? `NOW · P${current.idx + 1} ${(current.name || '').toUpperCase()} · WEEK ${Math.min(W, Math.floor(weeksElapsed) + 1)}/${W}`
      : `STARTS · P${nodes[0].idx + 1} ${(nodes[0].name || '').toUpperCase()}`;

  return (
    <div style={{ margin: '2px 2px 0' }}>
      <div style={{ position: 'relative', height: hexSize + 20 }}>
        {/* Rail + fill span the node coordinate space (inset by half a hex so the
            end nodes sit fully on-canvas). */}
        <div style={{ position: 'absolute', left: half, right: half, top: hexSize / 2 - 1, height: 2, background: 'var(--line-strong)', borderRadius: 2 }} />
        <div style={{
          position: 'absolute', left: half, top: hexSize / 2 - 1, height: 2, borderRadius: 2,
          width: `calc((100% - ${half * 2}px) * ${progress})`,
          background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
          boxShadow: '0 0 calc(6px * var(--glow)) var(--accent-glow)',
        }} />

        {nodes.map((p) => {
          const left = `calc(${half}px + (100% - ${half * 2}px) * ${p.endFrac})`;
          const hexStyle = p.done
            ? { background: 'var(--accent)', border: '0' }
            : p.current
              ? { background: 'color-mix(in srgb, var(--accent) 22%, var(--bg-2))', border: '2px solid var(--accent)', boxShadow: '0 0 calc(9px * var(--glow)) var(--accent-glow)' }
              : { background: 'color-mix(in srgb, var(--accent) 16%, var(--bg-2))', border: '2px solid color-mix(in srgb, var(--accent) 50%, var(--line-strong))' };

          return (
            <React.Fragment key={p.id}>
              <div style={{ position: 'absolute', left, top: 0, transform: 'translateX(-50%)', width: hexSize, height: hexSize, display: 'grid', placeItems: 'center' }}>
                {p.current && (
                  <span style={{ position: 'absolute', width: hexSize + 4, height: hexSize + 4, borderRadius: '50%', background: 'var(--accent)', filter: 'blur(9px)', opacity: 0.5, animation: 'phasePulse 1.8s ease-in-out infinite' }} />
                )}
                <Hex size={hexSize} square style={{ position: 'relative', color: 'var(--on-accent)', ...hexStyle }}>
                  {p.done && (
                    <svg width={hexSize * 0.42} height={hexSize * 0.42} viewBox="0 0 12 12" fill="none" stroke="var(--on-accent)" strokeWidth="2.5"><path d="M2 6l3 3 5-6" /></svg>
                  )}
                </Hex>
              </div>
              <div className="mono" style={{ position: 'absolute', left, top: hexSize + 4, transform: 'translateX(-50%)', fontSize: 8, letterSpacing: '0.08em', fontWeight: 700, color: p.done || p.current ? 'var(--accent)' : 'var(--text-3)' }}>P{p.idx + 1}</div>
            </React.Fragment>
          );
        })}
      </div>
      <div className="mono" style={{ textAlign: 'center', marginTop: 8, fontSize: 9.5, letterSpacing: '0.08em', color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {caption}
      </div>
    </div>
  );
}
