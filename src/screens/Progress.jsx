import React from 'react'
import { supabase } from '../lib/supabase'
import { loadMuscleVolume } from '../lib/muscleVolume'
import { loadExerciseMuscleMap } from '../lib/exercises'
import { loadPhotoHistory, uploadProgressPhoto, deleteProgressPhoto } from '../lib/progressPhotos'
import { loadHealthDaily } from '../lib/health'
import { ZoomPan } from '../components/ZoomPan'
import { MUSCLE_LABELS } from '../data/index'
import { MUSCLE_BODY } from '../data/musclePaths'
import { HexBackButton, Hex, HexShape } from '../components/hex'
import { IconHeart, IconDumbbell, IconCamera2, IconChevronRight, IconPlus, IconTrophy, IconCheck, IconBand, IconFlame, IconLeaf } from '../components/icons'

const ZONE_COLOR_ALL = {
  chest: '#3F84D9', back: '#F39E1F', legs: '#E0A5B8',
  shoulders: '#EE6A6A', arms: '#9D7CE0', core: '#8086A3',
  MAIN: 'var(--accent)', BANDED: 'var(--c-amber)',
  PULSE_RAISER: 'var(--c-coral)', COOLDOWN: 'var(--accent-2)',
};

const CAT_ICON = (id, sz) => {
  if (id === 'MAIN') return <IconDumbbell size={sz} />;
  if (id === 'BANDED') return <IconBand size={sz} />;
  if (id === 'PULSE_RAISER') return <IconFlame size={sz} />;
  if (id === 'COOLDOWN') return <IconLeaf size={sz} />;
  return null;
};

async function loadWeightData(userId) {
  const { data: sessions } = await supabase
    .from('workout_sessions')
    .select(`id, completed_at, logged_sets ( session_id, exercise_id, set_index, actual_weight_kg, actual_reps, section_exercises ( id, name, workout_sections ( kind ) ) )`)
    .eq('client_id', userId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false });

  if (!sessions?.length) return { cats: [], exs: [] };

  const exMap = new Map();
  for (const sess of sessions) {
    const d = new Date(sess.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    for (const ls of (sess.logged_sets || [])) {
      const se = ls.section_exercises;
      if (!se) continue;
      const kind = se.workout_sections?.kind || 'MAIN';
      if (!exMap.has(se.id)) exMap.set(se.id, { id: se.id, name: se.name, category: kind, sessMap: new Map() });
      const ex = exMap.get(se.id);
      if (!ex.sessMap.has(sess.id)) ex.sessMap.set(sess.id, { d, completedAt: sess.completed_at, sets: [] });
      ex.sessMap.get(sess.id).sets.push({ w: parseFloat(ls.actual_weight_kg) || 0, r: ls.actual_reps || 0 });
    }
  }

  const exs = [];
  for (const ex of exMap.values()) {
    const sessArr = [...ex.sessMap.values()].sort((a, b) => new Date(a.completedAt) - new Date(b.completedAt));
    const history = sessArr.map(sg => {
      const maxW = sg.sets.reduce((m, s) => Math.max(m, s.w), 0);
      const atMax = sg.sets.find(s => s.w === maxW) || sg.sets[0];
      return { d: sg.d, w: maxW, r: atMax?.r || 0, sets: sg.sets };
    });
    const best = history.reduce((b, h) => h.w > b.w ? h : b, history[0] || { w: 0, r: 0 });
    const prevBest = history.length > 1 ? history.slice(0, -1).reduce((b, h) => h.w > b.w ? h : b, history[0]) : null;
    const last = history[history.length - 1] || { w: 0, r: 0 };
    const isPR = !!prevBest && last.w > prevBest.w;
    const allSets = sessArr.flatMap(sg => sg.sets);
    const maxR = allSets.reduce((b, s) => s.r > b.r ? s : b, allSets[0] || { r: 0, w: 0 });
    exs.push({
      id: ex.id, name: ex.name, category: ex.category, muscle: '',
      pr: isPR,
      maxWeight: { value: best.w, unit: 'kg', reps: best.r, delta: isPR ? `+${(last.w - prevBest.w).toFixed(1)}kg` : null },
      maxReps: { value: maxR.r, weight: maxR.w },
      history,
    });
  }

  const kindSet = [...new Set(exs.map(e => e.category))];
  const KIND_LABEL = { MAIN: 'Main Lifts', BANDED: 'Activation', PULSE_RAISER: 'Pulse Raiser', COOLDOWN: 'Cooldown' };
  const cats = kindSet.map(k => ({ id: k, label: KIND_LABEL[k] || k, accent: ZONE_COLOR_ALL[k] || 'var(--accent)' }));

  return { cats, exs };
}

// Progress — Body metrics + Weight metrics tabs. `embedded` lets the coach
// render a client's exact Metrics view inside the client file.
export function Progress({ go, userId, embedded }) {
  const [tab, setTab] = React.useState('body');
  const [range, setRange] = React.useState('7d');

  return (
    <div className={embedded ? '' : 'scroller'} style={{ padding: embedded ? '0 0 24px' : '0 16px 110px', paddingTop: embedded ? 0 : 64 }} data-comment-anchor="2e58f3c1e8-div-7-5">
      <div style={{ display: 'flex', justifyContent: tab === 'photos' ? 'flex-end' : 'flex-end', alignItems: 'flex-end', marginBottom: 14 }}>
        {!embedded && (
          <div style={{ marginRight: 'auto' }}>
            <div className="label">// ANALYTICS</div>
            <div className="h-bold" style={{ fontSize: 24, marginTop: 4 }}>PROGRESS</div>
          </div>
        )}
        <div className="seg" style={{ visibility: tab === 'photos' ? 'hidden' : 'visible' }}>
          {['7d', '30d', '90d'].map((r) =>
          <button key={r} className={range === r ? 'active' : ''} onClick={() => setRange(r)}>{r.toUpperCase()}</button>
          )}
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <TabPill active={tab === 'body'} onClick={() => setTab('body')} icon={<IconHeart size={14} />} label="BODY" />
        <TabPill active={tab === 'weight'} onClick={() => setTab('weight')} icon={<IconDumbbell size={14} />} label="WEIGHTS" />
        <TabPill active={tab === 'photos'} onClick={() => setTab('photos')} icon={<IconCamera2 size={14} />} label="PHOTOS" />
      </div>

      {tab === 'body' && <HealthActivityCard userId={userId} />}
      {tab === 'body' ? <BodyTab userId={userId} /> : tab === 'photos' ? <PhotosTab userId={userId} /> : <WeightTab range={range} userId={userId} />}
    </div>);

}

// Steps + resting HR from connected wearables. Renders nothing if no data yet.
function HealthActivityCard({ userId }) {
  const [data, setData] = React.useState(null);
  React.useEffect(() => { if (userId) loadHealthDaily(userId, 14).then(setData); }, [userId]);
  if (!data || data.length === 0) return null;

  const desc = [...data].reverse();
  const stepsRows = data.filter(d => d.steps != null);
  const lastSteps = desc.find(d => d.steps != null)?.steps ?? null;
  const avgSteps = stepsRows.length ? Math.round(stepsRows.reduce((n, d) => n + d.steps, 0) / stepsRows.length) : null;
  const lastHr = desc.find(d => d.resting_hr != null)?.resting_hr ?? null;

  const Stat = ({ label, value, unit, sub }) => (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div className="label" style={{ fontSize: 7.5, marginBottom: 4 }}>{label}</div>
      <div className="h-bold" style={{ fontSize: 20, color: 'var(--accent)', lineHeight: 1 }}>
        {value == null ? '—' : value.toLocaleString()}{unit && value != null && <span style={{ fontSize: 9, color: 'var(--text-3)', marginLeft: 1 }}>{unit}</span>}
      </div>
      {sub && <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)', marginTop: 3 }}>{sub}</div>}
    </div>
  );

  return (
    <div className="card" style={{ padding: 14, marginBottom: 14 }}>
      <div className="label" style={{ marginBottom: 10 }}>// ACTIVITY · WEARABLE</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <Stat label="STEPS TODAY" value={lastSteps} />
        <div style={{ width: 1, background: 'var(--line)' }}/>
        <Stat label="AVG STEPS" value={avgSteps} sub="14 DAYS" />
        <div style={{ width: 1, background: 'var(--line)' }}/>
        <Stat label="RESTING HR" value={lastHr} unit="bpm" />
      </div>
    </div>
  );
}

function TabPill({ active, onClick, icon, label }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '12px 14px',
      background: active ? 'var(--accent-soft)' : 'var(--bg-2)',
      border: '1px solid ' + (active ? 'var(--accent)' : 'var(--line)'),
      borderRadius: 10, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      color: active ? 'var(--accent)' : 'var(--text-2)',
      fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
      textTransform: 'uppercase',
      boxShadow: active ? '0 0 calc(10px * var(--glow)) var(--accent-glow)' : 'none'
    }}>
      {icon}{label}
    </button>);

}

// ── PHOTOS TAB ────────────────────────────────────────────────────
// Progress-photo submission (3 poses) + dated history, stored in the
// private progress-photos bucket.
const PHOTO_POSES = [
{ id: 'front', label: 'FRONT' },
{ id: 'side', label: 'SIDE' },
{ id: 'back', label: 'BACK' }];

function fmtPhotoDate(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function PhotosTab({ userId }) {
  const [shots, setShots] = React.useState({ front: null, side: null, back: null }); // { file, preview }
  const [history, setHistory] = React.useState(null);
  const [uploading, setUploading] = React.useState(false);
  const fileInputs = { front: React.useRef(null), side: React.useRef(null), back: React.useRef(null) };

  const reload = React.useCallback(() => {
    if (!userId) { setHistory([]); return; }
    loadPhotoHistory(userId).then(setHistory);
  }, [userId]);
  React.useEffect(() => { reload(); }, [reload]);

  const onPickFile = (pose, e) => {
    const file = e.target.files?.[0];
    if (file) setShots((s) => ({ ...s, [pose]: { file, preview: URL.createObjectURL(file) } }));
    e.target.value = '';
  };

  const taken = PHOTO_POSES.filter((p) => shots[p.id]).length;

  const submit = async () => {
    if (taken === 0 || uploading) return;
    setUploading(true);
    for (const pose of PHOTO_POSES) {
      const s = shots[pose.id];
      if (s) await uploadProgressPhoto(userId, pose.id, s.file);
    }
    setShots({ front: null, side: null, back: null });
    setUploading(false);
    reload();
  };

  const removePhoto = async (row) => {
    await deleteProgressPhoto(row);
    reload();
  };

  return (
    <>
      {/* This week's submission */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 2px 8px' }}>
        <div className="label">// THIS WEEK · SUBMIT</div>
      </div>
      <div className="card" style={{ padding: 12, marginBottom: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {PHOTO_POSES.map((pose) => {
            const img = shots[pose.id]?.preview;
            return (
              <React.Fragment key={pose.id}>
                <input ref={fileInputs[pose.id]} type="file" accept="image/*" capture="environment"
                  style={{ display: 'none' }} onChange={(e) => onPickFile(pose.id, e)} />
                <button onClick={() => img
                  ? setShots((s) => ({ ...s, [pose.id]: null }))
                  : fileInputs[pose.id].current?.click()}
              style={{
                all: 'unset', cursor: 'pointer', position: 'relative',
                aspectRatio: '3/4', borderRadius: 10, overflow: 'hidden',
                border: img ? '1px solid color-mix(in srgb, var(--accent) 45%, transparent)' : '1.5px dashed var(--line-strong)',
                background: img ? `url('${img}') center/cover` : 'var(--bg-3)',
                display: 'grid', placeItems: 'center'
              }}>
                {!img &&
                <div style={{ textAlign: 'center', color: 'var(--text-3)' }}>
                  <IconCamera2 size={20} />
                  <div className="mono" style={{ fontSize: 8.5, letterSpacing: '0.12em', marginTop: 5, fontWeight: 600 }}>{pose.label}</div>
                </div>}
                {img &&
                <>
                  <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 55%, rgba(0,0,0,0.6))' }} />
                  <span className="mono" style={{ position: 'absolute', bottom: 5, left: 6, fontSize: 8.5, color: '#eceff4', letterSpacing: '0.1em', fontWeight: 700 }}>{pose.label}</span>
                  <span style={{ position: 'absolute', top: 5, right: 5 }}>
                    <Hex size={18} square style={{ background: 'var(--accent)', color: 'var(--on-accent)' }}>
                      <IconCheck size={9} sw={3} />
                    </Hex>
                  </span>
                </>}
              </button>
              </React.Fragment>);
          })}
        </div>
        <button onClick={submit} disabled={taken === 0 || uploading} className="btn-primary"
        style={{ width: '100%', marginTop: 12, opacity: taken === 0 ? 0.45 : 1, pointerEvents: taken === 0 || uploading ? 'none' : 'auto' }}>
          {uploading ? 'UPLOADING…' : `SUBMIT ${taken} PHOTO${taken === 1 ? '' : 'S'}`}
        </button>
        <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-3)', letterSpacing: '0.05em', textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>Tap a pose to attach a photo. Please note that these images will only be shared with Harrison and can be removed at any time from the history below.
        </div>
      </div>

      {/* History */}
      <div className="label" style={{ margin: '18px 2px 8px' }}>// HISTORY</div>
      {history === null && (
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.12em' }}>LOADING…</div>
        </div>
      )}
      {history?.length === 0 && (
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', lineHeight: 1.6 }}>
            NO PHOTOS YET — SUBMIT YOUR FIRST SET ABOVE
          </div>
        </div>
      )}
      <div style={{ display: 'grid', gap: 10 }}>
        {(history || []).map((h) =>
        <div key={h.date} className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text)' }}>{fmtPhotoDate(h.date)}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
            {PHOTO_POSES.map((pose) => {
              const row = h.shots[pose.id];
              return (
            <div key={pose.id} style={{
              aspectRatio: '3/4', borderRadius: 8, overflow: 'hidden', position: 'relative',
              background: row?.url ? `url('${row.url}') center/cover` : 'var(--bg-3)',
              border: '1px solid var(--line)'
            }}>
              <span style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 60%, rgba(0,0,0,0.55))' }} />
              <span className="mono" style={{ position: 'absolute', bottom: 4, left: 5, fontSize: 8, color: '#eceff4', letterSpacing: '0.1em', fontWeight: 700 }}>{pose.label}</span>
              {row && (
                <button onClick={() => removePhoto(row)} aria-label="Remove photo" style={{
                  all: 'unset', cursor: 'pointer', position: 'absolute', top: 4, right: 4,
                  width: 20, height: 20, borderRadius: 6, display: 'grid', placeItems: 'center',
                  background: 'rgba(0,0,0,0.55)', color: '#eceff4', fontSize: 11, lineHeight: 1,
                }}>✕</button>
              )}
            </div>);
            })}
          </div>
        </div>
        )}
      </div>
    </>);

}

// ── BODY TAB ──────────────────────────────────────────────────────
// Real body measurements from the body_metrics table.
const METRIC_DEFS = [
  { key: 'weight',  col: 'weight_kg',    label: 'Weight',   unit: 'kg' },
  { key: 'bodyfat', col: 'body_fat_pct', label: 'Body fat', unit: '%'  },
  { key: 'waist',   col: 'waist_cm',     label: 'Waist',    unit: 'cm' },
  { key: 'neck',    col: 'neck_cm',      label: 'Neck',     unit: 'cm' },
  { key: 'chest',   col: 'chest_cm',     label: 'Chest',    unit: 'cm' },
];

// rows must be ascending by recorded_at
function buildMetrics(rows) {
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const out = {};
  for (const def of METRIC_DEFS) {
    const series = rows.
    filter((r) => r[def.col] != null).
    map((r) => ({ v: parseFloat(r[def.col]), date: r.recorded_at }));
    if (!series.length) continue;
    const value = series[series.length - 1].v;
    const prior = [...series].reverse().find((p) => p.date <= cutoff) || series[0];
    const delta = +(value - prior.v).toFixed(1);
    const deltaPct = prior.v ? +(delta / prior.v * 100).toFixed(1) : 0;
    out[def.key] = { ...def, value, delta, deltaPct, series, history: series.map((p) => p.v) };
  }
  return out;
}

function fmtMetricDate(iso) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function BodyTab({ userId }) {
  const [rows, setRows] = React.useState(null);
  const [selected, setSelected] = React.useState('weight');
  const [detail, setDetail] = React.useState(null);   // metric key for full-history drill
  const [logging, setLogging] = React.useState(false); // log-measurement sheet

  const reload = React.useCallback(() => {
    if (!userId) { setRows([]); return; }
    supabase.from('body_metrics').select('*').
    eq('client_id', userId).
    order('recorded_at', { ascending: true }).
    then(({ data }) => setRows(data || []));
  }, [userId]);
  React.useEffect(() => { reload(); }, [reload]);

  const m = React.useMemo(() => buildMetrics(rows || []), [rows]);
  const keys = Object.keys(m);
  const sel = m[selected] || m[keys[0]];

  if (rows === null) return (
    <div className="card" style={{ padding: 28, textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.12em' }}>LOADING…</div>
    </div>
  );

  if (!sel) return (
    <>
      {logging && <LogMeasurementSheet userId={userId} metrics={m} onClose={() => setLogging(false)} onSaved={reload} />}
      <div className="card" style={{ padding: 28, textAlign: 'center', marginBottom: 14 }}>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em', lineHeight: 1.7 }}>
          NO MEASUREMENTS YET<br/>
          <span style={{ fontSize: 9 }}>Log your first weigh-in to start tracking</span>
        </div>
      </div>
      <button onClick={() => setLogging(true)} className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <IconPlus size={14} /> LOG MEASUREMENT
      </button>
    </>
  );

  return (
    <>
      {detail && <BodyMetricDetail met={m[detail]} onBack={() => setDetail(null)} onLog={() => {setDetail(null);setLogging(true);}} />}
      {logging && <LogMeasurementSheet userId={userId} metrics={m} onClose={() => setLogging(false)} onSaved={reload} />}

      {/* Hero metric */}
      <div className="card" style={{ padding: 16, marginBottom: 14, background: 'linear-gradient(135deg, rgba(0,245,255,0.08), rgba(176,114,255,0.04)), var(--bg-2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="label">// {sel.label.toUpperCase()}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span className="h-bold" style={{ fontSize: 36, color: 'var(--accent)' }}>{sel.value}</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)' }}>{sel.unit}</span>
            </div>
            {sel.series.length > 1 && (
              <div className="mono" style={{ fontSize: 11, color: '#189CAA', marginTop: 4, letterSpacing: '0.08em' }}>
                {sel.delta >= 0 ? '▲' : '▼'} {Math.abs(sel.delta)}{sel.unit} ({Math.abs(sel.deltaPct)}%) vs prior 30d
              </div>
            )}
          </div>
        </div>

        {sel.history.length > 1 ? (
          <Sparkline data={sel.history} accent />
        ) : (
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', padding: '14px 0', textAlign: 'center' }}>
            LOG MORE MEASUREMENTS TO SEE YOUR TREND
          </div>
        )}
        <button onClick={() => setDetail(sel.key)} style={{
          all: 'unset', cursor: 'pointer', marginTop: 10, width: '100%', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          padding: '8px', borderRadius: 8, border: '1px solid var(--line-strong)',
          color: 'var(--text-2)', fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em'
        }}>
          VIEW FULL HISTORY <IconChevronRight size={11} />
        </button>
      </div>

      <div className="label" style={{ margin: '4px 4px 8px' }}>// METRICS</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
        {Object.entries(m).map(([k, met]) =>
        <button key={k} onClick={() => setSelected(k)} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
            <div className="card" style={{
            padding: 12,
            borderColor: sel.key === k ? 'var(--accent)' : 'var(--line)',
            background: sel.key === k ? 'var(--accent-soft)' : undefined
          }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span className="label" style={{ color: sel.key === k ? 'var(--accent)' : 'var(--text-3)' }}>
                  {met.label.toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span className="h-bold" style={{ fontSize: 18 }}>{met.value}</span>
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>{met.unit}</span>
              </div>
              {met.series.length > 1 && (
                <div className="mono" style={{ fontSize: 9, color: '#189CAA', marginTop: 4, letterSpacing: '0.08em' }}>
                  {met.delta >= 0 ? '▲' : '▼'} {Math.abs(met.deltaPct)}%
                </div>
              )}
            </div>
          </button>
        )}
      </div>

      <button onClick={() => setLogging(true)} className="btn-ghost" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        <IconPlus size={14} /> LOG MEASUREMENT
      </button>
    </>);

}

// ── BODY METRIC DETAIL (full history drill) ──────────────────────
function BodyMetricDetail({ met, onBack, onLog }) {
  if (!met) return null;
  const rows = [...met.series].reverse(); // most recent first

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 60, background: 'var(--bg-1)',
      display: 'flex', flexDirection: 'column'
    }}>
      <div style={{ padding: '54px 16px 12px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--line)' }}>
        <HexBackButton onClick={onBack} size={36} />
        <div>
          <div className="label">// METRIC</div>
          <div className="h-bold" style={{ fontSize: 20, color: 'var(--heading-deep)' }}>{met.label.toUpperCase()}</div>
        </div>
      </div>

      <div className="scroller" style={{ flex: 1, padding: '14px 16px 30px', minHeight: 0 }}>
        {/* Hero value */}
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="h-bold" style={{ fontSize: 40, color: 'var(--accent)' }}>{met.value}</span>
              <span className="mono" style={{ fontSize: 13, color: 'var(--text-2)' }}>{met.unit}</span>
            </div>
          </div>
          {met.series.length > 1 && (
            <div className="mono" style={{ fontSize: 11, color: '#189CAA', marginTop: 4, letterSpacing: '0.08em' }}>
              {met.delta >= 0 ? '▲' : '▼'} {Math.abs(met.delta)}{met.unit} ({Math.abs(met.deltaPct)}%) vs prior 30d
            </div>
          )}
          {met.history.length > 1 && (
            <div style={{ marginTop: 10 }}>
              <Sparkline data={met.history} accent />
            </div>
          )}
        </div>

        {/* History log */}
        <div className="label" style={{ margin: '4px 2px 8px' }}>// HISTORY</div>
        <div className="card" style={{ padding: 4, marginBottom: 14 }}>
          {rows.map((r, i) => {
            const prev = rows[i + 1];
            const diff = prev ? +(r.v - prev.v).toFixed(1) : 0;
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12, alignItems: 'center',
                padding: '11px 12px',
                borderBottom: i < rows.length - 1 ? '1px dashed var(--line)' : 'none'
              }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', letterSpacing: '0.04em' }}>{fmtMetricDate(r.date)}</span>
                <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{r.v}{met.unit}</span>
                <span className="mono" style={{ fontSize: 10, fontWeight: 600, minWidth: 42, textAlign: 'right',
                  color: diff === 0 ? 'var(--text-3)' : diff > 0 ? 'var(--c-amber)' : 'var(--accent)' }}>
                  {diff === 0 ? '—' : `${diff > 0 ? '+' : ''}${diff}`}
                </span>
              </div>);
          })}
        </div>

        <button onClick={onLog} className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <IconPlus size={14} /> LOG NEW {met.label.toUpperCase()}
        </button>
      </div>
    </div>);

}

// ── LOG MEASUREMENT SHEET ────────────────────────────────────────
function LogMeasurementSheet({ userId, metrics, onClose, onSaved }) {
  const [vals, setVals] = React.useState(() => Object.fromEntries(METRIC_DEFS.map((f) => [f.key, ''])));
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const anyFilled = METRIC_DEFS.some((f) => vals[f.key].trim() !== '');

  const save = async () => {
    if (!anyFilled || saving) return;
    setSaving(true);
    const payload = { client_id: userId, recorded_at: new Date().toISOString().slice(0, 10) };
    METRIC_DEFS.forEach((f) => {
      if (vals[f.key].trim() !== '') payload[f.col] = parseFloat(vals[f.key]);
    });
    await supabase.from('body_metrics').insert(payload);
    setSaving(false);
    setSaved(true);
    onSaved?.();
    setTimeout(onClose, 900);
  };

  const todayLabel = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 65,
      background: 'rgba(6,10,12,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'flex-end'
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxHeight: '88%', overflowY: 'auto',
        background: 'var(--bg-1)', borderTopLeftRadius: 20, borderTopRightRadius: 20,
        border: '1px solid var(--line-strong)', borderBottom: 0, padding: '12px 16px 28px',
        animation: 'sheetUp .25s ease'
      }}>
        <style>{`@keyframes sheetUp { from { transform: translateY(40px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }`}</style>
        <div style={{ width: 36, height: 4, background: 'var(--line-strong)', borderRadius: 2, margin: '0 auto 14px' }} />

        {saved ?
        <div style={{ textAlign: 'center', padding: '24px 0 12px' }}>
          <Hex size={64} square style={{
            margin: '0 auto 16px', background: 'linear-gradient(160deg, var(--accent), var(--accent-2))',
            color: 'var(--on-accent)', boxShadow: '0 0 calc(22px * var(--glow)) var(--accent-glow)'
          }}><IconCheck size={28} sw={3} /></Hex>
          <div className="h-bold" style={{ fontSize: 20 }}>MEASUREMENTS LOGGED</div>
        </div> :
        <>
          <div className="label">// LOG MEASUREMENT</div>
          <div className="h-bold" style={{ fontSize: 20, marginTop: 4, marginBottom: 4 }}>TODAY · {todayLabel}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.05em', marginBottom: 16, lineHeight: 1.5 }}>
            Enter what you measured — leave the rest blank.
          </div>

          <div style={{ display: 'grid', gap: 10, marginBottom: 18 }}>
            {METRIC_DEFS.map((f) =>
            <div key={f.key} style={{
              display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center',
              padding: '10px 14px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 12
            }}>
              <div>
                <div className="mono" style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 600, letterSpacing: '0.06em' }}>{f.label.toUpperCase()}</div>
                <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>
                  {metrics?.[f.key] ? `last ${metrics[f.key].value}${f.unit}` : 'not logged yet'}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <input value={vals[f.key]} inputMode="decimal"
                  onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.value.replace(/[^\d.]/g, '') }))}
                  placeholder={metrics?.[f.key] ? String(metrics[f.key].value) : '—'}
                  style={{
                    width: 70, textAlign: 'right', background: 'var(--bg-1)', border: '1px solid var(--line-strong)',
                    borderRadius: 8, padding: '8px 10px', color: 'var(--accent)',
                    fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 700, outline: 'none'
                  }} />
                <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)', width: 22 }}>{f.unit}</span>
              </div>
            </div>
            )}
          </div>

          <button onClick={save} className="btn-primary" style={{ width: '100%', opacity: anyFilled ? 1 : 0.5, pointerEvents: anyFilled && !saving ? 'auto' : 'none' }}>
            {saving ? 'SAVING…' : 'SAVE MEASUREMENTS'}
          </button>
        </>}
      </div>
    </div>);

}

function Sparkline({ data }) {
  const [active, setActive] = React.useState(null);
  const max = Math.max(...data);const min = Math.min(...data);
  const range = max - min || 1;
  // Plot area inset to leave room for Y labels (left) and X labels (bottom)
  const W = 320,H = 96;
  const padL = 34,padR = 6,padT = 8,padB = 16;
  const plotW = W - padL - padR,plotH = H - padT - padB;
  const pts = data.map((v, i) => {
    const x = padL + i / (data.length - 1) * plotW;
    const y = padT + (1 - (v - min) / range) * plotH;
    return [x, y];
  });
  const path = pts.map((p, i) => i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`).join(' ');
  const area = path + ` L ${padL + plotW} ${padT + plotH} L ${padL} ${padT + plotH} Z`;
  // Y gridlines at min / mid / max
  const yTicks = [max, (max + min) / 2, min];
  const fmtY = (v) => Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : Number.isInteger(v) ? v : v.toFixed(1);
  // X labels in weeks (history is one point per week, ~12 weeks)
  const xLabels = ['WK 1', '', 'NOW'];
  const xIdx = [0, Math.floor((data.length - 1) / 2), data.length - 1];
  const sel = active != null ? data[active] : null;
  return (
    <div style={{ position: 'relative' }}>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block', marginTop: 4 }}>
      <defs>
        <linearGradient id="spark" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.3" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Y gridlines + labels */}
      {yTicks.map((v, i) => {
        const y = padT + i / 2 * plotH;
        return (
          <g key={i}>
            <line x1={padL} y1={y} x2={padL + plotW} y2={y}
            stroke="color-mix(in srgb, var(--text-3) 18%, transparent)" strokeWidth="1"
            strokeDasharray={i === 2 ? 'none' : '2 3'} />
            <text x={padL - 6} y={y + 3} textAnchor="end"
            fontFamily="JetBrains Mono" fontSize="8" fill="var(--text-3)">{fmtY(v)}</text>
          </g>);

      })}
      {/* Axes */}
      <line x1={padL} y1={padT} x2={padL} y2={padT + plotH} stroke="var(--line-strong)" strokeWidth="1" />
      <line x1={padL} y1={padT + plotH} x2={padL + plotW} y2={padT + plotH} stroke="var(--line-strong)" strokeWidth="1" />
      {/* X labels */}
      {xIdx.map((idx, i) => xLabels[i] &&
      <text key={i} x={padL + idx / (data.length - 1) * plotW} y={H - 3}
      textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
      fontFamily="JetBrains Mono" fontSize="8" fill="var(--text-3)">{xLabels[i]}</text>
      )}
      {/* Series */}
      <path d={area} fill="url(#spark)" />
      <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ filter: 'drop-shadow(0 0 calc(4px * var(--glow)) var(--accent-glow))' }} />
      {active != null &&
      <line x1={pts[active][0]} x2={pts[active][0]} y1={padT} y2={padT + plotH} stroke="var(--accent)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
      }
      {pts.map((p, i) =>
      (active === i || i === pts.length - 1) &&
      <circle key={i} cx={p[0]} cy={p[1]} r={active === i ? 5 : 4} fill="var(--accent)"
      stroke={active === i ? 'var(--bg-1)' : 'none'} strokeWidth={active === i ? 1.5 : 0}
      style={{ filter: 'drop-shadow(0 0 calc(6px * var(--glow)) var(--accent-glow))' }} />
      )}
      {/* tap/hover targets */}
      {pts.map((p, i) =>
      <rect key={`h${i}`} x={p[0] - (plotW / (data.length - 1)) / 2} y={0}
        width={plotW / (data.length - 1)} height={H - padB}
        fill="transparent" style={{ cursor: 'pointer' }}
        onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
        onClick={() => setActive(active === i ? null : i)} />
      )}
    </svg>
    {sel != null &&
    <div style={{
      position: 'absolute', top: 0,
      left: `clamp(6%, ${pts[active][0] / W * 100}%, 80%)`,
      transform: 'translateX(-50%)',
      background: 'var(--bg-3)', border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)',
      borderRadius: 8, padding: '5px 9px', pointerEvents: 'none',
      boxShadow: '0 6px 18px rgba(0,0,0,0.4)', whiteSpace: 'nowrap', zIndex: 2
    }}>
      <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: '0.1em' }}>
        {active === data.length - 1 ? 'NOW' : `WK ${active + 1}`}
      </div>
      <div className="h-bold" style={{ fontSize: 14, color: 'var(--accent)', lineHeight: 1.1, marginTop: 2 }}>{fmtY(sel)}</div>
    </div>
    }
    </div>);

}

// ── WEIGHT TAB ────────────────────────────────────────────────────
// Sub-views: 'cats' (categories grid), 'map' (muscle heatmap), drill-down on category, drill-down on exercise
function WeightTab({ range, userId }) {
  const [view, setView] = React.useState('cats');
  const [catId, setCatId] = React.useState(null);
  const [exId, setExId] = React.useState(null);
  const [dbLoading, setDbLoading] = React.useState(!!userId);
  const [liveCats, setLiveCats] = React.useState(null);
  const [liveExs, setLiveExs] = React.useState(null);

  React.useEffect(() => {
    if (!userId) return;
    setDbLoading(true);
    loadWeightData(userId).then(({ cats, exs }) => {
      setLiveCats(cats);
      setLiveExs(exs);
      setDbLoading(false);
    });
  }, [userId]);

  const cats = liveCats || [];
  const exs = liveExs || [];

  const drilledEx = exs.find(e => e.id === exId);
  if (drilledEx) return <ExerciseDrill ex={drilledEx} onBack={() => setExId(null)} />;

  if (catId) {
    const cat = cats.find(c => c.id === catId);
    return <CategoryDrill cat={cat} onBack={() => setCatId(null)} onPick={id => setExId(id)} exs={exs} />;
  }

  if (dbLoading) return (
    <div className="card" style={{ padding: 28, textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.12em' }}>LOADING…</div>
    </div>
  );

  // Muscle map lives in its own BODY tab now — Metrics shows categories only.
  return (
    <>
      <CategoriesView onPick={setCatId} cats={cats} exs={exs} />
    </>);

}

function SubTab({ active, onClick, label, icon }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '10px 12px',
      background: active ? 'var(--bg-3)' : 'transparent',
      border: '1px solid ' + (active ? 'var(--line-strong)' : 'var(--line)'),
      borderRadius: 8, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      color: active ? 'var(--text)' : 'var(--text-3)',
      fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em'
    }}>
      <span style={{ color: active ? 'var(--accent)' : 'var(--text-3)' }}>{icon}</span>
      {label}
    </button>);

}

// ── CATEGORIES VIEW ───────────────────────────────────────────────

// Per-category muscle zone: which side, which muscle slugs to highlight,
// and a cropped viewBox that "zooms in" on that region of the body.
const MUSCLE_ZONES = {
  chest: { side: 'front', focus: ['chest'], crop: '230 287 267 202' },
  back: { side: 'back', focus: ['upperBack', 'trapezius'], crop: '932 239 320 434' },
  legs: { side: 'front', focus: ['quadriceps', 'calves'], crop: '225 614 287 396' },
  shoulders: { side: 'front', focus: ['deltoids'], crop: '322 245 270 278' },
  arms: { side: 'front', focus: ['biceps', 'triceps', 'forearm'], crop: '85 357 228 302' },
  core: { side: 'front', focus: ['abs', 'obliques'], crop: '239 386 253 366' }
};

// Each zone its own faded colour.
const ZONE_COLOR = {
  chest: '#3F84D9',
  back: '#F39E1F',
  legs: '#E0A5B8',
  shoulders: '#EE6A6A',
  arms: '#9D7CE0',
  core: '#8086A3'
};

// Per-individual-muscle colour, grouped by body region, so heatmap +
// leaderboard graphs match the category card colours.
const MUSCLE_COLOR = {
  chest: '#3F84D9',
  upperBack: '#F39E1F', lats: '#F39E1F', lowerBack: '#F39E1F', traps: '#F39E1F', neck: '#F39E1F',
  shoulders: '#EE6A6A',
  biceps: '#9D7CE0', triceps: '#9D7CE0', forearms: '#9D7CE0', hands: '#9D7CE0',
  abs: '#8086A3', obliques: '#8086A3',
  quads: '#E0A5B8', hamstrings: '#E0A5B8', glutes: '#E0A5B8', calves: '#E0A5B8',
  adductors: '#E0A5B8', shins: '#E0A5B8', knees: '#E0A5B8', ankles: '#E0A5B8', feet: '#E0A5B8',
};

// Regions that read as one central section (never split left/right).
const CENTRAL_GROUPS = new Set(['neck', 'abs', 'upperBack', 'lowerBack']);

// Mini anatomical illustration zoomed onto one muscle region.
// Focus muscles render in the zone colour; everything else fades back.
function MuscleZoneGlyph({ zoneId, color, size = 104 }) {
  const zone = MUSCLE_ZONES[zoneId];
  if (!zone || !MUSCLE_BODY) return null;
  const body = MUSCLE_BODY[zone.side];
  const order = MUSCLE_BODY.order[zone.side] || Object.keys(body.parts);
  const focus = new Set(zone.focus);
  const focusFill = `color-mix(in srgb, ${color} 60%, transparent)`;
  const restFill = 'color-mix(in srgb, var(--text-3) 9%, transparent)';
  // Wide regions (shoulders/arms) fit fully; tall regions fill & bleed.
  const [,, cw, ch] = zone.crop.split(' ').map(Number);
  const par = cw / ch > 1.1 ? 'xMidYMid meet' : 'xMidYMid slice';
  return (
    <svg viewBox={zone.crop} width={size * 0.86} height={size}
    preserveAspectRatio={par}
    style={{ display: 'block', overflow: 'visible' }}>
      {order.map((slug) => {
        const paths = body.parts[slug];
        if (!paths) return null;
        const on = focus.has(slug);
        return paths.map((d, i) =>
        <path key={slug + i} d={d}
        fill={on ? focusFill : restFill}
        stroke={on ? color : 'color-mix(in srgb, var(--text-3) 18%, transparent)'}
        strokeWidth={on ? 2.2 : 1}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        style={on ? { filter: `drop-shadow(0 0 calc(5px * var(--glow)) color-mix(in srgb, ${color} 55%, transparent))` } : undefined} />
        );
      })}
    </svg>);

}

function CategoriesView({ onPick, cats, exs }) {
  const totalPRs = exs.filter(e => e.pr).length;
  const SECTION_KINDS = new Set(['MAIN', 'BANDED', 'PULSE_RAISER', 'COOLDOWN']);

  if (!cats.length) return (
    <div className="card" style={{ padding: 28, textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em', lineHeight: 1.7 }}>
        NO SESSIONS LOGGED YET<br/>
        <span style={{ fontSize: 9 }}>Complete workouts to see your exercise history here</span>
      </div>
    </div>
  );

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 4px 10px' }}>
        <div className="label">// EXERCISE CATEGORIES</div>
        {totalPRs > 0 && <span className="chip chip-lime">{totalPRs} NEW PR</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {cats.map((cat) => {
          const items = exs.filter(e => e.category === cat.id);
          const prs = items.filter(e => e.pr).length;
          const zoneColor = ZONE_COLOR_ALL[cat.id] || cat.accent || 'var(--accent)';
          const isSection = SECTION_KINDS.has(cat.id);
          return (
            <button key={cat.id} onClick={() => onPick(cat.id)}
            style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
              <div className="card" style={{
                padding: 14, position: 'relative', overflow: 'hidden', minHeight: 104,
                borderColor: 'var(--line)',
                background: `linear-gradient(135deg, color-mix(in srgb, ${zoneColor} 9%, transparent), transparent 55%), var(--bg-2)`
              }}>
                <div style={{
                  position: 'absolute', top: 0, right: 0, bottom: 0, width: 98,
                  display: 'grid', placeItems: 'center', pointerEvents: 'none',
                  WebkitMaskImage: 'linear-gradient(90deg, transparent 0%, #000 42%)',
                  maskImage: 'linear-gradient(90deg, transparent 0%, #000 42%)'
                }}>
                  {isSection ? (
                    <Hex size={58} square style={{ background: `color-mix(in srgb, ${zoneColor} 16%, var(--bg-3))`, border: `1px solid color-mix(in srgb, ${zoneColor} 30%, transparent)`, color: zoneColor }}>
                      {CAT_ICON(cat.id, 26)}
                    </Hex>
                  ) : (
                    <MuscleZoneGlyph zoneId={cat.id} color={zoneColor} size={132} />
                  )}
                </div>
                <div style={{ position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <HexShape size={11} fill={zoneColor} style={{ flexShrink: 0 }} />
                    <span className="label" style={{ color: 'var(--text)', opacity: 1 }}>{cat.label.toUpperCase()}</span>
                  </div>
                  <div className="h-bold" style={{ fontSize: 24, marginTop: 10 }}>{items.length}<span style={{ fontSize: 11, color: 'var(--text-2)', marginLeft: 4, fontFamily: 'JetBrains Mono', letterSpacing: '0.08em' }}>EXR</span></div>
                  {prs > 0 && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 12,
                      padding: '3px 8px', borderRadius: 999,
                      background: `color-mix(in srgb, ${zoneColor} 15%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${zoneColor} 38%, transparent)`,
                      fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.04em', fontWeight: 700,
                      color: zoneColor
                    }}><IconTrophy size={11} sw={1.8} />×{prs}</div>
                  )}
                </div>
              </div>
            </button>);

        })}
      </div>
    </>);

}

// ── CATEGORY DRILL-DOWN ───────────────────────────────────────────
function CategoryDrill({ cat, onBack, onPick, exs }) {
  const items = exs.filter(e => e.category === cat.id);
  const zc = ZONE_COLOR_ALL[cat.id] || cat.accent || 'var(--accent)';
  return (
    <>
      <HexBackButton onClick={onBack} label="CATEGORIES" size={34} style={{ marginBottom: 14 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Hex size={50} square style={{
          background: `color-mix(in srgb, ${zc} 16%, var(--bg-2))`
        }}>
          <MuscleZoneGlyph zoneId={cat.id} color={zc} size={58} />
        </Hex>
        <div>
          <div className="label">// CATEGORY</div>
          <div className="h-bold" style={{ fontSize: 22 }}>{cat.label.toUpperCase()}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {items.map((e) =>
        <button key={e.id} onClick={() => onPick(e.id)}
        style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
            <div className="card" style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
                    {e.name}
                    {e.pr && <span className="chip chip-lime" style={{ fontSize: 8, padding: '1px 6px' }}>PR</span>}
                  </div>
                  <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', marginTop: 2 }}>
                    {e.muscle.toUpperCase()}
                  </div>
                </div>
                <IconChevronRight size={16} style={{ color: 'var(--text-3)' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <PRStat label="MAX WEIGHT" value={`${e.maxWeight.value}${e.maxWeight.unit}`} sub={`× ${e.maxWeight.reps} reps`} delta={e.maxWeight.delta} accent={zc} />
                <PRStat label="MAX REPS" value={e.maxReps.value} sub={`@ ${e.maxReps.weight}kg`} delta={null} accent={zc} />
              </div>
              <div style={{ marginTop: 12 }}>
                <MiniLine data={e.history.map((h) => h.w)} color={zc} />
              </div>
            </div>
          </button>
        )}
      </div>
    </>);

}

function PRStat({ label, value, sub, delta, accent }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 4, color: accent, opacity: 0.8 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span className="h-bold" style={{ fontSize: 22, color: accent }}>{value}</span>
      </div>
      <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 2 }}>{sub}</div>
      {delta && <div className="mono" style={{ fontSize: 9, color: accent, letterSpacing: '0.08em', marginTop: 4 }}>▲ {delta}</div>}
    </div>);

}

function MiniLine({ data, color }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);const min = Math.min(...data);
  const range = max - min || 1;
  const W = 300,H = 36;
  const pts = data.map((v, i) => {
    const x = i / (data.length - 1) * W;
    const y = H - (v - min) / range * (H - 8) - 4;
    return [x, y];
  });
  const path = pts.map((p, i) => i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ display: 'block' }}>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
      {pts.map((p, i) => i === pts.length - 1 &&
      <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={color} />
      )}
    </svg>);

}

// ── MUSCLE MAP VIEW ───────────────────────────────────────────────
const RANGE_DAYS = { '7d': 7, '30d': 30, '90d': 90 };

function MuscleMapView({ range, userId }) {
  const [side, setSide] = React.useState('front');
  const [picked, setPicked] = React.useState(null);
  const [data, setData] = React.useState(null);
  const days = RANGE_DAYS[range] || 30;

  React.useEffect(() => {
    if (!userId) { setData({}); return; }
    setData(null);
    setPicked(null);
    loadExerciseMuscleMap().then(map => loadMuscleVolume(userId, days, map)).then(setData);
  }, [userId, days]);

  const labels = MUSCLE_LABELS;

  if (data === null) return (
    <div className="card" style={{ padding: 28, textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.12em' }}>LOADING…</div>
    </div>
  );

  if (Object.keys(data).length === 0) return (
    <div className="card" style={{ padding: 28, textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em', lineHeight: 1.7 }}>
        NO TRAINING DATA IN THE LAST {range.toUpperCase()}<br/>
        <span style={{ fontSize: 9 }}>Complete sessions to light up the heatmap</span>
      </div>
    </div>
  );

  // Compute intensity (0..1) per muscle from set count
  const maxSets = Math.max(1, ...Object.values(data).map((d) => d.sets));
  const intensity = (id) => Math.min(1, (data[id]?.sets || 0) / maxSets);

  const sorted = Object.entries(data).sort((a, b) => b[1].sets - a[1].sets);
  const bottom = sorted[sorted.length - 1];

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 4px 10px' }}>
        <div className="label">// HEATMAP · LAST {range.toUpperCase()}</div>
        <div className="seg" style={{ padding: 3 }}>
          <button className={side === 'front' ? 'active' : ''} onClick={() => setSide('front')} style={{ padding: '5px 10px', fontSize: 9 }}>FRONT</button>
          <button className={side === 'back' ? 'active' : ''} onClick={() => setSide('back')} style={{ padding: '5px 10px', fontSize: 9 }}>BACK</button>
        </div>
      </div>

      {/* Body diagram */}
      <div className="card" style={{
        padding: 16, marginBottom: 14, position: 'relative',
        background: 'radial-gradient(60% 80% at 50% 30%, rgba(0,245,255,0.06), transparent 70%), var(--bg-2)'
      }}>
        <BodyMap side={side} intensity={intensity} picked={picked} onPick={setPicked} data={data} labels={labels} heatColor="var(--accent)" />

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, justifyContent: 'space-between' }}>
          <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em' }}>LOW</span>
          <div style={{
            flex: 1, height: 6, borderRadius: 999,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.05), color-mix(in srgb, var(--accent) 30%, transparent), var(--accent))',
            margin: '0 10px',
            boxShadow: '0 0 calc(8px * var(--glow)) var(--accent-glow)'
          }} />
          <span className="mono" style={{ fontSize: 9, color: 'var(--accent)', letterSpacing: '0.1em' }}>HIGH</span>
        </div>
      </div>

      {/* Selected muscle detail */}
      {picked && data[picked] &&
      <div className="card" style={{
        padding: 14, marginBottom: 14,
        borderColor: MUSCLE_COLOR[picked] || 'var(--accent)',
        background: `color-mix(in srgb, ${MUSCLE_COLOR[picked] || 'var(--accent)'} 12%, transparent)`
      }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div className="label" style={{ color: MUSCLE_COLOR[picked] || 'var(--accent)' }}>// SELECTED</div>
              <div className="h-bold" style={{ fontSize: 18, marginTop: 4 }}>{labels[picked].toUpperCase()}</div>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 2, letterSpacing: '0.06em' }}>
                LAST WORKED · {data[picked].lastWorked.toUpperCase()}
              </div>
            </div>
            <button onClick={() => setPicked(null)} style={{
            all: 'unset', cursor: 'pointer', color: 'var(--text-3)', fontFamily: 'JetBrains Mono', fontSize: 12, padding: 4
          }}>✕</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 12 }}>
            <DetailStat label="SETS" value={data[picked].sets} color={MUSCLE_COLOR[picked]} />
            <DetailStat label="REPS" value={data[picked].reps} color={MUSCLE_COLOR[picked]} />
            <DetailStat label="VOLUME" value={`${data[picked].kg.toLocaleString()}kg`} color={MUSCLE_COLOR[picked]} />
          </div>
        </div>
      }

      {/* Top / bottom muscles */}
      <div className="label" style={{ margin: '4px 4px 8px' }}>// LEADERBOARD</div>
      <div style={{ display: 'grid', gap: 6, marginBottom: 14 }}>
        {sorted.slice(0, 6).map(([id, d], i) =>
        <button key={id} onClick={() => setPicked(id)} style={{ all: 'unset', cursor: 'pointer' }}>
            <div style={{
            display: 'grid', gridTemplateColumns: '20px 1fr auto auto', gap: 12, alignItems: 'center',
            padding: '10px 14px',
            background: 'var(--bg-2)', borderRadius: 8,
            border: '1px solid ' + (picked === id ? (MUSCLE_COLOR[id] || 'var(--accent)') : 'var(--line)')
          }}>
              <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{String(i + 1).padStart(2, '0')}</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{labels[id]}</div>
                <div style={{ marginTop: 4, height: 3, borderRadius: 2, overflow: 'hidden', background: 'rgba(128,128,128,0.12)' }}>
                  <div style={{
                  width: `${intensity(id) * 100}%`, height: '100%',
                  background: `color-mix(in srgb, ${MUSCLE_COLOR[id] || 'var(--accent)'} ${40 + intensity(id) * 60}%, transparent)`,
                  boxShadow: `0 0 calc(6px * var(--glow)) color-mix(in srgb, ${MUSCLE_COLOR[id] || 'var(--accent)'} ${intensity(id) * 60}%, transparent)`
                }} />
                </div>
              </div>
              <span className="mono" style={{ fontSize: 11, color: MUSCLE_COLOR[id] || 'var(--accent)', fontWeight: 600 }}>{d.sets}<span style={{ color: 'var(--text-3)', marginLeft: 2, fontSize: 9 }}>SETS</span></span>
              <IconChevronRight size={14} style={{ color: 'var(--text-3)' }} />
            </div>
          </button>
        )}
      </div>

      {/* Undertrained warning */}
      <div className="card" style={{ padding: 12, borderColor: 'rgba(255,181,71,0.3)', background: 'rgba(255,181,71,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--warn)', fontFamily: 'Orbitron', fontWeight: 800 }}>!</span>
          <span className="label" style={{ color: 'var(--warn)' }}>UNDERTRAINED</span>
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
          <strong style={{ color: 'var(--text)' }}>{labels[bottom[0]]}</strong> only {bottom[1].sets} sets in the last {range} — consider adding accessory work.
        </div>
      </div>
    </>);

}

function DetailStat({ label, value, color }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 4 }}>{label}</div>
      <div className="h-bold" style={{ fontSize: 18, color: color || 'var(--accent)' }}>{value}</div>
    </div>);

}

// ── BODY MAP SVG ─────────────────────────────────────────────────
// Stylized anterior/posterior figure. Each region is a path that's
// filled with accent color at intensity-based opacity.
export function BodyMap({ side, intensity, picked, onPick, data, labels, heatColor, slugMap, perSide, zoomable, neutralBase, tintFor }) {
  const body = MUSCLE_BODY[side];
  if (!body) return null;
  const vb = body.viewBox.split(' ').map(Number);
  const centerX = vb[0] + vb[2] / 2;

  // slug -> heat group reverse lookup for this side. `slugMap` lets callers
  // (e.g. the injury map) widen the set of selectable regions to joints.
  const slugToGroup = React.useMemo(() => {
    const m = {};
    const gs = slugMap || MUSCLE_BODY.groupSlugs[side] || {};
    Object.entries(gs).forEach(([group, slugs]) => slugs.forEach((s) => {m[s] = group;}));
    return m;
  }, [side, slugMap]);

  // Anatomical side of a path from its first move-to x. On the front view the
  // viewer's left is the subject's right (and vice-versa); flipped on the back.
  const anatOf = (d) => {
    const m = /m\s*(-?[\d.]+)/i.exec(d);
    const x = m ? parseFloat(m[1]) : centerX;
    if (side === 'front') return x < centerX ? 'right' : 'left';
    return x < centerX ? 'left' : 'right';
  };

  // Muscles render in their anatomical region colour (legs pink, back amber,
  // …); heatColor is a fallback for regions without a mapped colour.
  const colorFor = (group) => MUSCLE_COLOR[group] || heatColor || 'var(--accent)';
  const isPickedKey = (key) => picked instanceof Set ? picked.has(key) : picked === key;
  const neutralStroke = 'color-mix(in srgb, var(--text-3) 24%, transparent)';
  const neutralFill = 'color-mix(in srgb, var(--text-3) 14%, var(--bg-3))';
  const PICK = 'var(--accent)';

  // Resolve the colour to "light up" a region. `tintFor` (injury mode) overrides
  // the anatomical colour so a region glows in its injury-severity colour, and
  // returns null where there's nothing to show.
  const litColor = (group, anat) => tintFor ? tintFor(group, anat) : colorFor(group);

  // Paint a region from its signal strength `v` and selection state. In
  // neutralBase mode the body stays grey until a region is injured or tapped.
  const paint = (group, anat, v, isPicked) => {
    const lc = litColor(group, anat);
    const lit = v > 0 && !!lc;
    if (lit) {
      const alpha = 0.18 + v * 0.72;
      return { fill: `color-mix(in srgb, ${lc} ${Math.round(alpha * 100)}%, var(--bg-3))`, stroke: lc, sw: isPicked ? 2.6 : 1.6, glow: lc };
    }
    if (isPicked) {
      const c = lc || PICK;
      return { fill: `color-mix(in srgb, ${c} 26%, var(--bg-3))`, stroke: c, sw: 2.6, glow: c };
    }
    if (neutralBase) return { fill: neutralFill, stroke: neutralStroke, sw: 1, glow: null };
    const c = lc || 'var(--accent)';
    const alpha = 0.12 + v * 0.82;
    return { fill: `color-mix(in srgb, ${c} ${Math.round(alpha * 100)}%, var(--bg-3))`, stroke: `color-mix(in srgb, ${c} 45%, transparent)`, sw: 1, glow: null };
  };

  const svg = (
    <svg viewBox={body.viewBox} width="100%"
    style={{ display: 'block', height: 440, maxWidth: '100%', margin: '0 auto' }}>
      <defs>
        <radialGradient id="bm-glow" cx="50%" cy="40%" r="58%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Subtle backdrop glow */}
      <rect x={vb[0]} y={vb[1]} width={vb[2]} height={vb[3]} fill="url(#bm-glow)" />

      {/* Anatomical regions — neutral structure first, heat muscles on top */}
      {(MUSCLE_BODY.order[side] || Object.keys(body.parts)).map((slug) => {
        const paths = body.parts[slug];
        if (!paths) return null;
        const group = slugToGroup[slug];
        const isHeat = !!group && !!data[group];

        if (!isHeat) {
          return (
            <g key={slug}>
              {paths.map((d, i) => <path key={i} d={d} fill={neutralFill} stroke={neutralStroke} strokeWidth={1} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
            </g>
          );
        }

        // Per-side: each path is independently shaded + selectable by limb side,
        // except central regions (neck, abs…) which act as one section.
        if (perSide && !CENTRAL_GROUPS.has(group)) {
          return paths.map((d, i) => {
            const anat = anatOf(d);
            const v = intensity(group, anat);
            const isP = isPickedKey(`${group}|${anat}`);
            const p = paint(group, anat, v, isP);
            return (
              <path key={slug + i} d={d}
                onClick={() => onPick(group, anat)}
                fill={p.fill} stroke={p.stroke}
                strokeWidth={p.sw} strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                style={{ cursor: 'pointer', filter: p.glow ? `drop-shadow(0 0 7px ${p.glow})` : 'none', transition: 'all .15s ease' }} />
            );
          });
        }

        // Grouped (whole-muscle) behaviour — also used for central regions in
        // per-side mode (selected as a single "both" section).
        const central = perSide && CENTRAL_GROUPS.has(group);
        const anat = central ? 'both' : null;
        const isPicked = central ? isPickedKey(`${group}|both`) : isPickedKey(group);
        const v = central ? intensity(group, 'both') : intensity(group);
        const p = paint(group, anat, v, isPicked);
        return (
          <g key={slug}
          onClick={() => central ? onPick(group, 'both') : onPick(picked === group ? null : group)}
          style={{ cursor: 'pointer', filter: p.glow ? `drop-shadow(0 0 7px ${p.glow})` : 'none', transition: 'all .2s ease' }}>
            {paths.map((d, i) => <path key={i} d={d} fill={p.fill} stroke={p.stroke} strokeWidth={p.sw} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />)}
          </g>);
      })}
    </svg>
  );

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {zoomable ? <ZoomPan>{svg}</ZoomPan> : svg}

      {/* HUD label, top-left */}
      <div style={{
        position: 'absolute', top: 8, left: 12,
        fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.18em',
        color: 'var(--text-3)'
      }}>
        {side === 'front' ? 'ANTERIOR' : 'POSTERIOR'} VIEW
      </div>
      {/* HUD count, top-right */}
      <div style={{
        position: 'absolute', top: 8, right: 12,
        fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.18em',
        color: 'var(--accent)'
      }}>
        {Object.keys(data).length} GROUPS
      </div>
    </div>);

}

// Compact FRONT / BACK toggle with a sliding pill (gentle overshoot).
export function SideSlider({ side, onChange }) {
  const idx = side === 'front' ? 0 : 1;
  return (
    <div style={{
      position: 'relative', display: 'flex', width: 196, margin: '0 auto',
      background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 999, padding: 3,
    }}>
      <div style={{
        position: 'absolute', top: 3, bottom: 3, left: 3, width: 'calc(50% - 3px)',
        borderRadius: 999, background: 'var(--accent-soft)', border: '1px solid var(--accent)',
        transform: `translateX(${idx * 100}%)`,
        transition: 'transform .3s cubic-bezier(.34,1.56,.64,1)',
        boxShadow: '0 0 calc(8px * var(--glow)) var(--accent-glow)',
      }}/>
      {['front', 'back'].map(s => (
        <button key={s} onClick={() => onChange(s)} style={{
          all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '7px 0',
          position: 'relative', zIndex: 1,
          fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          color: side === s ? 'var(--accent)' : 'var(--text-3)', transition: 'color .2s ease',
        }}>{s.toUpperCase()}</button>
      ))}
    </div>
  );
}

// Decorative outline strokes — drawn under heat regions for definition
function FrontSilhouette() {
  return (
    <>
      <path d="M 100 12 Q 116 12 116 28 Q 116 42 108 46 L 108 52 Q 130 54 142 70 Q 152 90 150 122 Q 154 150 152 174 Q 144 174 138 172 Q 134 200 134 240 Q 134 280 122 314 L 106 314 Q 102 280 100 240 Q 98 280 94 314 L 78 314 Q 66 280 66 240 Q 66 200 62 172 Q 56 174 48 174 Q 46 150 50 122 Q 48 90 58 70 Q 70 54 92 52 L 92 46 Q 84 42 84 28 Q 84 12 100 12 Z" />
    </>);

}
function BackSilhouette() {return <FrontSilhouette />;}

// ── EXERCISE DRILL ────────────────────────────────────────────────
function ExerciseDrill({ ex, onBack }) {
  const [view, setView] = React.useState('weight');
  const cat = null;
  const zc = ZONE_COLOR_ALL[ex.category] || 'var(--accent)';

  return (
    <>
      <HexBackButton onClick={onBack} label="Back" size={34} style={{ marginBottom: 14 }} />

      <div className="card" style={{ padding: 16, marginBottom: 14, background: `linear-gradient(135deg, color-mix(in srgb, ${zc} 12%, transparent), transparent 60%), var(--bg-2)` }}>
        <div className="label" style={{ marginBottom: 4 }}>// {(cat?.label || ex.category || ex.muscle || '').toUpperCase()}{ex.muscle ? ` · ${ex.muscle.toUpperCase()}` : ''}</div>
        <div className="h-bold" style={{ fontSize: 22, marginBottom: 14 }}>{ex.name.toUpperCase()}</div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
          <button onClick={() => setView('weight')} style={{
            all: 'unset', cursor: 'pointer',
            padding: 12, borderRadius: 10,
            background: view === 'weight' ? `color-mix(in srgb, ${zc} 16%, transparent)` : 'var(--bg-3)',
            border: '1px solid ' + (view === 'weight' ? zc : 'var(--line)'),
            boxShadow: view === 'weight' ? `0 0 calc(8px * var(--glow)) color-mix(in srgb, ${zc} 45%, transparent)` : 'none'
          }}>
            <div className="label" style={{ color: zc, marginBottom: 4 }}>MAX WEIGHT</div>
            <div className="h-bold" style={{ fontSize: 22, color: zc }}>
              {ex.maxWeight.value}<span style={{ fontSize: 12, color: 'var(--text-2)', marginLeft: 4 }}>{ex.maxWeight.unit}</span>
            </div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>× {ex.maxWeight.reps} REPS</div>
          </button>
          <button onClick={() => setView('reps')} style={{
            all: 'unset', cursor: 'pointer',
            padding: 12, borderRadius: 10,
            background: view === 'reps' ? `color-mix(in srgb, ${zc} 16%, transparent)` : 'var(--bg-3)',
            border: '1px solid ' + (view === 'reps' ? zc : 'var(--line)'),
            boxShadow: view === 'reps' ? `0 0 calc(8px * var(--glow)) color-mix(in srgb, ${zc} 45%, transparent)` : 'none'
          }}>
            <div className="label" style={{ color: zc, marginBottom: 4 }}>MAX REPS</div>
            <div className="h-bold" style={{ fontSize: 22, color: zc }}>
              {ex.maxReps.value}
            </div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>@ {ex.maxReps.weight}KG</div>
          </button>
        </div>

        <div className="label" style={{ marginBottom: 8 }}>
          // {view === 'weight' ? 'WEIGHT (KG)' : 'REPS'} OVER TIME
        </div>
        <BigChart data={ex.history} view={view} zoneColor={zc} />
      </div>

      <div className="label" style={{ margin: '4px 4px 8px' }}>// SESSION HISTORY · ALL SETS</div>
      <div style={{ display: 'grid', gap: 8 }}>
        {[...ex.history].reverse().map((h, i) => {
          let workingN = 0;
          const sets = expandSets(h).map(s => ({ ...s, label: s.warmup ? 'W' : String(++workingN) }));
          const isLatest = i === 0;
          return (
            <div key={i} className="card" style={{
              padding: 12,
              borderColor: isLatest ? `color-mix(in srgb, ${zc} 45%, var(--line))` : 'var(--line)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text)', letterSpacing: '0.06em', fontWeight: 700 }}>
                  {h.d.toUpperCase()}
                  {isLatest && <span style={{ marginLeft: 8, color: zc, fontSize: 9, letterSpacing: '0.1em' }}>LATEST</span>}
                </span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
                  {sets.length} SETS
                </span>
              </div>
              <div style={{ display: 'grid', gap: 3 }}>
                {sets.map((s, si) =>
                <div key={si} style={{
                  display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 10, alignItems: 'center',
                  padding: '5px 8px', borderRadius: 6,
                  background: s.warmup ? 'transparent' : 'color-mix(in srgb, var(--text-3) 6%, transparent)'
                }}>
                    <span className="mono" style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textAlign: 'center',
                    color: s.warmup ? 'var(--text-3)' : zc
                  }}>{s.label}</span>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>
                      {s.w > 0 ? `${s.w}kg` : 'BW'}
                    </span>
                    <span className="mono" style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 600 }}>×{s.r}</span>
                  </div>
                )}
              </div>
            </div>);
        })}
      </div>
    </>);

}

// Returns the real logged sets for a session when present; otherwise expands
// a top-set {d,w,r} into a representative set list (demo data only).
function expandSets(h) {
  if (h.sets?.length) return h.sets.map(s => ({ w: s.w, r: s.r }));
  const r = h.r;
  const round = (x) => Math.round(x / 2.5) * 2.5;
  if (!h.w || h.w <= 0) {
    // Bodyweight — show working sets only
    return [
    { w: 0, r: r + 1 },
    { w: 0, r },
    { w: 0, r: Math.max(1, r - 1) }];

  }
  const sets = [];
  if (h.w >= 40) sets.push({ w: round(h.w * 0.6), r: r + 3, warmup: true });
  sets.push({ w: round(h.w * 0.85), r: r + 1, warmup: true });
  sets.push({ w: h.w, r });
  sets.push({ w: h.w, r: Math.max(1, r - 1) });
  sets.push({ w: round(h.w * 0.9), r: Math.max(1, r - 2) });
  return sets;
}

function BigChart({ data, view, zoneColor }) {
  const [active, setActive] = React.useState(null);
  const vals = data.map((d) => view === 'weight' ? d.w : d.r);
  if (vals.length < 2) return (
    <div style={{ padding: '18px 0', textAlign: 'center', opacity: 0.6 }}>
      <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em' }}>LOG MORE SESSIONS TO SEE YOUR TREND</div>
    </div>
  );
  const max = Math.max(...vals);const min = Math.min(...vals);
  const range = max - min || 1;
  const W = 340,H = 170;
  const padL = 28,padR = 8,padTop = 10,padBot = 22;
  const pts = vals.map((v, i) => {
    const x = padL + i / (vals.length - 1) * (W - padL - padR);
    const y = padTop + (1 - (v - min) / range) * (H - padTop - padBot);
    return [x, y];
  });
  const color = zoneColor || (view === 'weight' ? 'var(--accent)' : 'var(--accent-2)');
  const path = pts.map((p, i) => i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`).join(' ');
  const area = path + ` L ${pts[pts.length - 1][0]} ${H - padBot} L ${pts[0][0]} ${H - padBot} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1];
  const fillId = `bigfill-${view}-${String(color).replace(/[^a-z0-9]/gi, '')}`;
  const sel = active != null ? data[active] : null;
  return (
    <div style={{ position: 'relative' }}>
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={fillId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Y axis line */}
      <line x1={padL} x2={padL} y1={padTop} y2={H - padBot} stroke="var(--line-strong)" strokeWidth="0.8" />
      {/* X axis line */}
      <line x1={padL} x2={W - padR} y1={H - padBot} y2={H - padBot} stroke="var(--line-strong)" strokeWidth="0.8" />
      {/* Y gridlines + labels */}
      {yTicks.map((g) => {
        const y = padTop + g * (H - padTop - padBot);
        const v = max - g * range;
        return (
          <g key={g}>
            <line x1={padL} x2={W - padR} y1={y} y2={y} stroke="var(--line)" strokeDasharray="2 3" />
            <text x={padL - 4} y={y + 3} textAnchor="end" fontSize="8" fill="var(--text-3)" fontFamily="JetBrains Mono">
              {Math.round(v * 10) / 10}
            </text>
          </g>);

      })}
      <path d={area} fill={`url(#${fillId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
      style={{ filter: 'drop-shadow(0 0 calc(4px * var(--glow)) var(--accent-glow))' }} />
      {/* active vertical guide */}
      {active != null &&
      <line x1={pts[active][0]} x2={pts[active][0]} y1={padTop} y2={H - padBot} stroke={color} strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
      }
      {pts.map((p, i) =>
      <circle key={i} cx={p[0]} cy={p[1]} r={active === i ? 5 : i === pts.length - 1 ? 4 : 2.5} fill={color}
        stroke={active === i ? 'var(--bg-1)' : 'none'} strokeWidth={active === i ? 1.5 : 0} />
      )}
      {/* generous tap/hover targets */}
      {pts.map((p, i) =>
      <rect key={`h${i}`} x={p[0] - 14} y={0} width={28} height={H - padBot}
        fill="transparent" style={{ cursor: 'pointer' }}
        onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}
        onClick={() => setActive(active === i ? null : i)} />
      )}
      {/* X labels + ticks — in weeks */}
      {data.map((d, i) => {
        if (!(i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2))) return null;
        const wkLabel = i === data.length - 1 ? 'NOW' : `WK ${i + 1}`;
        return (
          <g key={i}>
            <line x1={pts[i][0]} x2={pts[i][0]} y1={H - padBot} y2={H - padBot + 3} stroke="var(--text-3)" strokeWidth="0.6" />
            <text x={pts[i][0]} y={H - 7} textAnchor="middle" fontSize="8" fill="var(--text-3)" fontFamily="JetBrains Mono">
              {wkLabel}
            </text>
          </g>);

      })}
      {/* Axis labels */}
      <text x={4} y={padTop + 4} fontSize="7" fill="var(--text-3)" fontFamily="JetBrains Mono" letterSpacing="0.1em">
        {view === 'weight' ? 'KG' : 'REPS'}
      </text>
      <text x={W - padR} y={H - 2} textAnchor="end" fontSize="7" fill="var(--text-3)" fontFamily="JetBrains Mono" letterSpacing="0.1em">
        WEEKS →
      </text>
    </svg>
    {sel &&
    <div style={{
      position: 'absolute', top: 4,
      left: `clamp(4%, ${pts[active][0] / W * 100}%, 72%)`,
      transform: 'translateX(-50%)',
      background: 'var(--bg-3)', border: `1px solid color-mix(in srgb, ${color} 50%, transparent)`,
      borderRadius: 8, padding: '6px 9px', pointerEvents: 'none',
      boxShadow: '0 6px 18px rgba(0,0,0,0.4)', whiteSpace: 'nowrap', zIndex: 2
    }}>
      <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: '0.1em' }}>
        {active === data.length - 1 ? 'NOW' : `WK ${active + 1}`}{sel.d ? ` · ${sel.d.toUpperCase()}` : ''}
      </div>
      <div className="h-bold" style={{ fontSize: 15, color, lineHeight: 1.1, marginTop: 2 }}>
        {view === 'weight' ? `${sel.w}kg` : `${sel.r} reps`}
        {view === 'weight' && sel.r ? <span className="mono" style={{ fontSize: 9, color: 'var(--text-2)', marginLeft: 4 }}>× {sel.r}</span> : null}
      </div>
    </div>
    }
    </div>);

}