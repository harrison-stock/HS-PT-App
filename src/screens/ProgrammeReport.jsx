import React from 'react'
import { HexBackButton } from '../components/hex'
import { BodyMap, SideSlider } from './Progress'
import { REGION_LABELS } from '../data/musclePaths'
import { loadExerciseMuscleMap } from '../lib/exercises'
import { loadReportProgrammes, buildProgrammeReport } from '../lib/report'
import { IconChevronRight } from '../components/icons'

const regionLabel = (g) => REGION_LABELS[g] || (g || '').replace(/([A-Z])/g, ' $1').trim();
const fmtDate = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// Full-screen programme performance report: first week vs final week strength
// progression, body-metric trends and a muscle map of where they grew most.
export function ProgrammeReport({ clientId, clientName, onClose }) {
  const [progs, setProgs]   = React.useState(null);
  const [progId, setProgId] = React.useState(null);
  const [report, setReport] = React.useState(null);   // null = loading, {} = data
  const [muscleMap, setMuscleMap] = React.useState(null);
  const [side, setSide]     = React.useState('front');
  const [picked, setPicked] = React.useState(null);

  React.useEffect(() => { loadExerciseMuscleMap().then(setMuscleMap); }, []);
  React.useEffect(() => {
    loadReportProgrammes(clientId).then(list => {
      setProgs(list);
      if (list.length) setProgId(list[0].id);
    });
  }, [clientId]);

  React.useEffect(() => {
    if (!progId || muscleMap === null) return;
    setReport(null); setPicked(null);
    buildProgrammeReport(clientId, progId, muscleMap).then(setReport);
  }, [progId, clientId, muscleMap]);

  const prog = progs?.find(p => p.id === progId);

  // Muscle-map heat from volume delta (growth = accent, decline = coral).
  const muscles = report?.muscles || {};
  const maxAbs = Math.max(1, ...Object.values(muscles).map(m => Math.abs(m.delta)));
  const intensity = (g) => Math.min(1, Math.abs(muscles[g]?.delta || 0) / maxAbs);
  const tintFor = (g) => { const m = muscles[g]; if (!m || m.delta === 0) return null; return m.delta > 0 ? 'var(--accent)' : 'var(--c-coral)'; };
  const topGrowers = Object.entries(muscles).filter(([, m]) => m.delta > 0).sort((a, b) => b[1].delta - a[1].delta).slice(0, 6);
  const pickedM = picked ? muscles[picked] : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 220, background: 'var(--bg-0)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--bg-1)', flexShrink: 0 }}>
        <HexBackButton onClick={onClose} size={34} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="label">// PERFORMANCE REPORT</div>
          <div className="h-bold" style={{ fontSize: 16, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{clientName.toUpperCase()}</div>
        </div>
      </div>

      <div className="scroller" style={{ flex: 1, minHeight: 0, padding: '14px 16px 48px', maxWidth: 820, margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
        {progs === null && <Mono>LOADING…</Mono>}
        {progs && progs.length === 0 && (
          <div className="card" style={{ padding: 28, textAlign: 'center' }}>
            <Mono style={{ lineHeight: 1.7 }}>NO COMPLETED SESSIONS YET<br/><span style={{ fontSize: 9 }}>Reports appear once {clientName.split(' ')[0]} has logged workouts from a programme</span></Mono>
          </div>
        )}

        {progs && progs.length > 0 && (
          <div style={{ display: 'grid', gap: 14 }}>
            {/* Programme picker */}
            {progs.length > 1 && (
              <div>
                <div className="label" style={{ marginBottom: 6 }}>PROGRAMME</div>
                <select value={progId || ''} onChange={e => setProgId(e.target.value)} style={selSt}>
                  {progs.map(p => <option key={p.id} value={p.id}>{p.name} · {p.sessions} sessions</option>)}
                </select>
              </div>
            )}

            {/* Summary */}
            {prog && (
              <div className="card" style={{ padding: 16 }}>
                <div className="h-bold" style={{ fontSize: 18, lineHeight: 1.2 }}>{prog.name}</div>
                <Mono style={{ marginTop: 6 }}>{fmtDate(prog.first)} → {fmtDate(prog.last)}</Mono>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 14 }}>
                  <Stat label="SESSIONS" value={report?.sessionCount ?? prog.sessions} />
                  <Stat label="DURATION" value={report ? Math.max(1, Math.round(report.spanDays / 7)) : '—'} unit="wk" />
                  <Stat label="EXERCISES" value={report?.exercises?.length ?? '—'} />
                </div>
              </div>
            )}

            {report === null && <Mono>BUILDING REPORT…</Mono>}
            {report?.empty && (
              <div className="card" style={{ padding: 24, textAlign: 'center' }}>
                <Mono style={{ lineHeight: 1.7 }}>NOT ENOUGH DATA<br/><span style={{ fontSize: 9 }}>At least two completed sessions are needed to compare first vs final week</span></Mono>
              </div>
            )}

            {report && !report.empty && (
              <>
                {/* ── Body metrics ── */}
                <SectionLabel>METRIC TRENDS</SectionLabel>
                <div style={{ display: 'grid', gap: 8 }}>
                  <MetricRow label="WEIGHT"   m={report.metrics.weight}  lowerBetter />
                  <MetricRow label="BODY FAT" m={report.metrics.bodyfat} lowerBetter />
                  <MetricRow label="WAIST"    m={report.metrics.waist}   lowerBetter />
                  {!report.metrics.weight && !report.metrics.bodyfat && !report.metrics.waist && (
                    <div className="card" style={{ padding: 16 }}><Mono>No body metrics recorded during this programme.</Mono></div>
                  )}
                </div>

                {/* ── Strength progression ── */}
                <SectionLabel>STRENGTH PROGRESSION · FIRST → FINAL WEEK</SectionLabel>
                {report.exercises.length === 0 ? (
                  <div className="card" style={{ padding: 16 }}><Mono>No exercises were logged in both the first and final week.</Mono></div>
                ) : (
                  <div style={{ display: 'grid', gap: 8 }}>
                    {report.exercises.map((ex, i) => <ExerciseRow key={ex.name} ex={ex} top={i === 0 && ex.pct > 0} />)}
                  </div>
                )}

                {/* ── Muscle growth ── */}
                <SectionLabel>MUSCLE GROWTH · TRAINING VOLUME</SectionLabel>
                <div className="card" style={{ padding: 14 }}>
                  <div style={{ marginBottom: 10 }}><SideSlider side={side} onChange={(s) => { setSide(s); setPicked(null); }} /></div>
                  <BodyMap side={side} data={muscles} intensity={intensity} tintFor={tintFor} neutralBase
                    picked={picked} onPick={(g) => setPicked(g === picked ? null : g)}
                    labels={REGION_LABELS} heatColor="var(--accent)" />
                  <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 8 }}>
                    <Legend color="var(--accent)" label="GREW" />
                    <Legend color="var(--c-coral)" label="DECLINED" />
                    <Legend color="color-mix(in srgb, var(--text-3) 40%, transparent)" label="UNCHANGED" />
                  </div>

                  {pickedM && (
                    <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'var(--bg-3)', border: '1px solid var(--line)' }}>
                      <div className="h-bold" style={{ fontSize: 14, marginBottom: 8 }}>{regionLabel(picked).toUpperCase()}</div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        <Stat label="FIRST WK" value={pickedM.first.toLocaleString()} unit="kg" />
                        <Stat label="FINAL WK" value={pickedM.final.toLocaleString()} unit="kg" />
                        <Stat label="CHANGE" value={`${pickedM.delta >= 0 ? '+' : ''}${Math.round(pickedM.pct)}`} unit="%" color={pickedM.delta >= 0 ? 'var(--accent)' : 'var(--c-coral)'} />
                      </div>
                    </div>
                  )}
                </div>

                {topGrowers.length > 0 && (
                  <div style={{ display: 'grid', gap: 6 }}>
                    {topGrowers.map(([g, m]) => (
                      <div key={g} className="card" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{regionLabel(g)}</span>
                        <span className="mono" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>+{Math.round(m.pct)}%<span style={{ color: 'var(--text-3)', marginLeft: 6, fontWeight: 400 }}>+{m.delta.toLocaleString()}kg</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bits ──────────────────────────────────────────────────────────
function ExerciseRow({ ex, top }) {
  const up = ex.pct >= 0;
  const col = up ? 'var(--accent)' : 'var(--c-coral)';
  const set = (w, r) => ex.weighted ? `${w}kg × ${r}` : `${r} reps`;
  return (
    <div className="card" style={{ padding: '12px 14px', borderColor: top ? 'color-mix(in srgb, var(--accent) 45%, var(--line))' : 'var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {top && <span style={{ color: 'var(--accent)', marginRight: 5 }}>★</span>}{ex.name}
          </div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>
            {set(ex.firstWeight, ex.firstReps)} <span style={{ color: 'var(--text-2)' }}>→</span> <span style={{ color: 'var(--text)' }}>{set(ex.finalWeight, ex.finalReps)}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div className="h-bold" style={{ fontSize: 16, color: col, lineHeight: 1 }}>{up ? '+' : ''}{Math.round(ex.pct)}%</div>
          {ex.weighted && ex.e1rmDelta !== 0 && (
            <div className="mono" style={{ fontSize: 8.5, color: 'var(--text-3)', marginTop: 3 }}>{ex.e1rmDelta > 0 ? '+' : ''}{Math.round(ex.e1rmDelta)}kg e1RM</div>
          )}
        </div>
      </div>
    </div>
  );
}

function MetricRow({ label, m, lowerBetter }) {
  if (!m) return null;
  const down = m.delta < 0;
  const good = lowerBetter ? m.delta < 0 : m.delta > 0;
  const col = m.delta === 0 ? 'var(--text-3)' : good ? 'var(--accent)' : 'var(--c-amber)';
  return (
    <div className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flexShrink: 0, minWidth: 84 }}>
        <Mono style={{ marginBottom: 3 }}>{label}</Mono>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {m.start}<span style={{ color: 'var(--text-3)' }}> → </span>{m.end}<span style={{ fontSize: 9, color: 'var(--text-3)' }}>{m.unit}</span>
        </div>
      </div>
      {m.series.length >= 2 && <div style={{ flex: 1, minWidth: 0 }}><MiniSpark values={m.series} color={col} /></div>}
      <div className="h-bold" style={{ fontSize: 15, color: col, flexShrink: 0 }}>
        {m.delta > 0 ? '+' : ''}{m.delta}<span style={{ fontSize: 9, color: 'var(--text-3)' }}>{m.unit}</span>
      </div>
    </div>
  );
}

function MiniSpark({ values, color = 'var(--accent)', height = 30 }) {
  const vals = (values || []).filter(v => v != null && !isNaN(v));
  if (vals.length < 2) return null;
  const min = Math.min(...vals), max = Math.max(...vals), range = max - min || 1, w = 100, pad = 3;
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * w, height - pad - ((v - min) / range) * (height - pad * 2)]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" width="100%" height={height} style={{ display: 'block' }}>
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Stat({ label, value, unit, color }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 4px', borderRadius: 8, background: 'var(--bg-3)', border: '1px solid var(--line)' }}>
      <div className="label" style={{ fontSize: 7, marginBottom: 4 }}>{label}</div>
      <div className="h-bold" style={{ fontSize: 18, color: color || 'var(--accent)', lineHeight: 1 }}>{value}{unit && <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 1 }}>{unit}</span>}</div>
    </div>
  );
}

function SectionLabel({ children }) {
  return <div className="label" style={{ marginTop: 4 }}>// {children}</div>;
}

function Legend({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
      <span className="mono" style={{ fontSize: 8.5, color: 'var(--text-3)', letterSpacing: '0.08em' }}>{label}</span>
    </div>
  );
}

function Mono({ children, style }) {
  return <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', ...style }}>{children}</div>;
}

const selSt = {
  width: '100%', boxSizing: 'border-box', appearance: 'auto',
  background: 'var(--bg-3)', border: '1px solid var(--line-strong)', borderRadius: 8,
  padding: '10px 11px', color: 'var(--text)', outline: 'none',
  fontFamily: 'JetBrains Mono', fontSize: 12,
};
