import React from 'react'
import { supabase } from '../lib/supabase'
import { loadMuscleVolume } from '../lib/muscleVolume'
import { loadExerciseMuscleMap } from '../lib/exercises'
import { Hex, HexBackButton } from '../components/hex'
import { BodyMap, Progress } from './Progress'
import { InjuryThread } from './InjuryThread'
import { MUSCLE_BODY, REGION_LABELS } from '../data/musclePaths'
import { injuryTitle } from '../lib/injuries'
import { notify } from '../lib/notifications'
import { loadForms } from '../lib/forms'
import { IconPlus, IconCheck, IconX2, IconChevronRight } from '../components/icons'

// ── Constants ────────────────────────────────────────────────────
const SEV_COLOR  = { mild: 'var(--c-amber)', moderate: 'var(--c-coral)', severe: '#d93434' };
const SEV_LABEL  = { mild: 'MILD', moderate: 'MODERATE', severe: 'SEVERE' };
const regionLabel = (g) => REGION_LABELS[g] || (g || '').replace(/([A-Z])/g, ' $1').trim();
const STATUS_OPTS = [
  { v: 'online',    label: 'ONLINE CLIENT' },
  { v: 'in_person', label: 'IN-PERSON' },
  { v: 'hybrid',    label: 'HYBRID' },
];
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const TASK_ICON = { check: '✓', log: '◎', photo: '▣' };

// ── Main component ───────────────────────────────────────────────
export function ClientDetail({ c, trainerId, programmes, onClose, onChanged, go }) {
  const [tab, setTab] = React.useState('overview');
  const TABS = [
    { id: 'overview',  label: 'OVERVIEW'  },
    { id: 'training',  label: 'TRAINING'  },
    { id: 'body',      label: 'BODY'      },
    { id: 'data',      label: 'DATA'      },
    { id: 'tasks',     label: 'TASKS'     },
    { id: 'goals',     label: 'GOALS'     },
    { id: 'settings',  label: 'SETTINGS'  },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'var(--bg-0)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px 10px', borderBottom: '1px solid var(--line)',
        background: 'var(--bg-1)', flexShrink: 0,
      }}>
        <HexBackButton onClick={onClose} size={34} />
        <Hex size={42} style={{ background: c.accent, color: 'var(--on-accent)', fontFamily: 'Orbitron', fontSize: 13, fontWeight: 800 }}>
          {c.initials}
        </Hex>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="h-bold" style={{ fontSize: 16 }}>{c.name.toUpperCase()}</div>
          <div className="mono" style={{ fontSize: 9, color: c.managed ? 'var(--c-amber)' : 'var(--text-3)', letterSpacing: '0.1em', marginTop: 2 }}>
            {c.managed ? '◉ AWAITING SIGN-UP' : c.phaseLabel.toUpperCase()}
          </div>
        </div>
        <button onClick={() => { onClose(); go('clientview', { clientId: c.id, clientName: c.name, screen: 'workouts' }); }}
          className="mono" style={{
            all: 'unset', cursor: 'pointer', fontSize: 9, letterSpacing: '0.12em', flexShrink: 0,
            color: 'var(--accent)', fontWeight: 700, padding: '5px 10px',
            border: '1px solid color-mix(in srgb, var(--accent) 60%, transparent)', borderRadius: 6,
          }}>LOG SESSION</button>
      </div>

      {/* ── Tab bar ── */}
      <div style={{
        display: 'flex', overflowX: 'auto', flexShrink: 0,
        borderBottom: '1px solid var(--line)', background: 'var(--bg-1)',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="mono" style={{
            all: 'unset', cursor: 'pointer', padding: '10px 12px', whiteSpace: 'nowrap',
            fontSize: 9, letterSpacing: '0.1em', fontWeight: 700,
            color: tab === t.id ? 'var(--accent)' : 'var(--text-3)',
            borderBottom: `2px solid ${tab === t.id ? 'var(--accent)' : 'transparent'}`,
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="scroller" style={{ flex: 1, minHeight: 0, padding: '14px 14px 40px' }}>
        {tab === 'overview' && <OverviewTab  c={c} go={go} onClose={onClose} onTab={setTab} />}
        {tab === 'training' && <TrainingTab  c={c} trainerId={trainerId} programmes={programmes} onChanged={onChanged} />}
        {tab === 'body'     && <BodyTab      c={c} trainerId={trainerId} />}
        {tab === 'data'     && <DataTab      c={c} trainerId={trainerId} />}
        {tab === 'tasks'    && <TasksTab     c={c} trainerId={trainerId} />}
        {tab === 'goals'    && <GoalsTab     c={c} trainerId={trainerId} />}
        {tab === 'settings' && <SettingsTab  c={c} trainerId={trainerId} onSaved={onChanged} onArchived={() => { onChanged?.(); onClose(); }} />}
      </div>
    </div>
  );
}

// ── OVERVIEW — at-a-glance client dashboard ──────────────────────
function OverviewTab({ c, go, onClose, onTab }) {
  const [d, setD] = React.useState(null);
  const today = new Date().toISOString().slice(0, 10);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const [sessions, injuries, tasks, metric, next] = await Promise.all([
        supabase.from('workout_sessions').select('id, started_at, completed_at')
          .eq('client_id', c.id).order('started_at', { ascending: false }).limit(5),
        supabase.from('client_injuries').select('id, muscle_group, laterality, severity').eq('client_id', c.id).is('resolved_at', null),
        supabase.from('client_tasks').select('id').eq('client_id', c.id).is('completed_at', null),
        supabase.from('body_metrics').select('weight_kg, recorded_at').eq('client_id', c.id)
          .not('weight_kg', 'is', null).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('client_workouts')
          .select('scheduled_date, programme_days(programme_phases(name, programmes(name)))')
          .eq('client_id', c.id).gte('scheduled_date', today).eq('status', 'scheduled')
          .order('scheduled_date').limit(1).maybeSingle(),
      ]);
      if (!alive) return;
      setD({
        sessions: sessions.data || [],
        injuries: injuries.data || [],
        openTasks: (tasks.data || []).length,
        metric: metric.data || null,
        next: next.data || null,
      });
    })();
    return () => { alive = false; };
  }, [c.id]);

  const next = d?.next;
  const phase = next?.programme_days?.programme_phases;
  const progLabel = phase ? [phase.programmes?.name, phase.name].filter(Boolean).join(' · ') : null;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Assume control */}
      {!c.managed ? (
        <button onClick={() => { onClose(); go('clientview', { clientId: c.id, clientName: c.name, screen: 'dashboard' }); }}
          className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--heading-deep)' }}>
          ◉ ASSUME CONTROL — OPEN CLIENT APP
        </button>
      ) : (
        <div className="card" style={{ padding: 12, textAlign: 'center' }}>
          <Mono>◉ AWAITING SIGN-UP — assume control unlocks once the client joins</Mono>
        </div>
      )}

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        <KpiCard label="STREAK"   value={c.streak || 0}          unit="d"   color="var(--c-amber)" />
        <KpiCard label="THIS WK"  value={c.sessionsThisWeek || 0}            color="var(--accent)" />
        <KpiCard label="CREDITS"  value={c.credits ?? 0}                     color="var(--accent-2)" />
        <KpiCard label="INJURIES" value={d ? d.injuries.length : '—'}        color={d && d.injuries.length ? 'var(--c-coral)' : 'var(--text-2)'} />
      </div>

      {/* Next session + programme */}
      <div className="card" style={{ padding: 14 }}>
        <div className="label" style={{ marginBottom: 6 }}>// NEXT SESSION</div>
        {!d ? <Mono>LOADING…</Mono> : next ? (
          <>
            <div className="h-bold" style={{ fontSize: 15 }}>
              {next.scheduled_date === today ? 'TODAY' : new Date(next.scheduled_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}
            </div>
            {progLabel && <Mono style={{ marginTop: 4 }}>{progLabel.toUpperCase()}</Mono>}
          </>
        ) : <Mono>No upcoming sessions scheduled</Mono>}
      </div>

      {/* Quick stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button onClick={() => onTab('data')} style={{ all: 'unset', cursor: 'pointer' }}>
          <div className="card" style={{ padding: 12, height: '100%', boxSizing: 'border-box' }}>
            <div className="label" style={{ marginBottom: 6 }}>LATEST WEIGH-IN</div>
            {d?.metric ? (
              <>
                <div className="h-bold" style={{ fontSize: 18 }}>{d.metric.weight_kg}<span style={{ fontSize: 10, color: 'var(--text-3)' }}>kg</span></div>
                <Mono style={{ marginTop: 2 }}>{new Date(d.metric.recorded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Mono>
              </>
            ) : <Mono>No data</Mono>}
          </div>
        </button>
        <button onClick={() => onTab('tasks')} style={{ all: 'unset', cursor: 'pointer' }}>
          <div className="card" style={{ padding: 12, height: '100%', boxSizing: 'border-box' }}>
            <div className="label" style={{ marginBottom: 6 }}>OPEN TASKS</div>
            <div className="h-bold" style={{ fontSize: 18, color: d?.openTasks ? 'var(--c-amber)' : 'var(--text)' }}>{d ? d.openTasks : '—'}</div>
            <Mono style={{ marginTop: 2 }}>tap to manage</Mono>
          </div>
        </button>
      </div>

      {/* Active injuries */}
      {d && d.injuries.length > 0 && (
        <button onClick={() => onTab('body')} style={{ all: 'unset', cursor: 'pointer' }}>
          <div className="card" style={{ padding: 12, borderColor: 'color-mix(in srgb, var(--c-coral) 35%, var(--line))' }}>
            <div className="label" style={{ marginBottom: 8, color: 'var(--c-coral)' }}>// ACTIVE INJURIES · {d.injuries.length}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {d.injuries.slice(0, 6).map(inj => (
                <span key={inj.id} className="mono" style={{
                  fontSize: 9, fontWeight: 700, padding: '4px 8px', borderRadius: 999,
                  color: SEV_COLOR[inj.severity],
                  background: `color-mix(in srgb, ${SEV_COLOR[inj.severity]} 12%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${SEV_COLOR[inj.severity]} 35%, transparent)`,
                }}>{injuryTitle(inj)}</span>
              ))}
            </div>
          </div>
        </button>
      )}

      {/* Recent sessions */}
      <div className="label">// RECENT SESSIONS</div>
      {!d && <Mono>LOADING…</Mono>}
      {d && d.sessions.length === 0 && <EmptyState>No sessions logged yet</EmptyState>}
      {d?.sessions.map(s => {
        const dur = s.completed_at ? Math.round((new Date(s.completed_at) - new Date(s.started_at)) / 60000) : null;
        return (
          <div key={s.id} className="card" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {new Date(s.started_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>
              {dur != null ? `${dur} MIN` : 'IN PROGRESS'}{s.completed_at && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>✓</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── TRAINING — Everfit-style week calendar ───────────────────────
const SECTION_LABEL = { MAIN: 'WORKOUT', PULSE_RAISER: 'PULSE RAISER', BANDED: 'ACTIVATION', COOLDOWN: 'COOLDOWN' };

function mondayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function TrainingTab({ c, trainerId, programmes, onChanged }) {
  const [weeks, setWeeks]   = React.useState(2);
  const [anchor, setAnchor] = React.useState(() => mondayOf(new Date()));
  const [workouts, setWorkouts] = React.useState([]);
  const [showAssign, setShowAssign] = React.useState(false);

  const loadWorkouts = React.useCallback(() => {
    const start = new Date(anchor);
    const end = new Date(anchor); end.setDate(end.getDate() + weeks * 7);
    supabase.from('client_workouts')
      .select('id, scheduled_date, status, programme_days(day_of_week, programme_phases(name, phase_index, programmes(name)), workout_sections(title, kind, sort_order, section_exercises(id)))')
      .eq('client_id', c.id).gte('scheduled_date', ymd(start)).lt('scheduled_date', ymd(end))
      .then(({ data }) => setWorkouts(data || []));
  }, [c.id, anchor, weeks]);

  React.useEffect(() => { loadWorkouts(); }, [loadWorkouts]);

  if (showAssign) return (
    <AssignWorkout
      clientId={c.id} clientName={c.name} trainerId={trainerId} programmes={programmes}
      onClose={() => setShowAssign(false)}
      onAssigned={() => { setShowAssign(false); loadWorkouts(); onChanged?.(); }}
    />
  );

  const wMap = {};
  workouts.forEach(w => { (wMap[w.scheduled_date] = wMap[w.scheduled_date] || []).push(w); });

  const shift = (n) => setAnchor(a => { const x = new Date(a); x.setDate(x.getDate() + n * 7); return x; });
  const rangeEnd = new Date(anchor); rangeEnd.setDate(rangeEnd.getDate() + weeks * 7 - 1);
  const fmtShort = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={() => setShowAssign(true)} className="btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, padding: '9px 12px', color: 'var(--heading-deep)' }}>
          <IconPlus size={13}/> ASSIGN
        </button>
        <button onClick={() => setAnchor(mondayOf(new Date()))} style={navBtnSt}>TODAY</button>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => shift(-1)} style={navBtnSt}>‹</button>
          <button onClick={() => shift(1)} style={navBtnSt}>›</button>
        </div>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', flex: 1, minWidth: 80 }}>
          {fmtShort(anchor)} – {fmtShort(rangeEnd)}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {[1, 2, 4].map(n => (
            <button key={n} onClick={() => setWeeks(n)} className="mono" style={{
              all: 'unset', cursor: 'pointer', padding: '6px 10px', borderRadius: 7, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em',
              background: weeks === n ? 'var(--accent)' : 'var(--bg-3)', color: weeks === n ? 'var(--on-accent)' : 'var(--text-3)',
              border: `1px solid ${weeks === n ? 'var(--accent)' : 'var(--line)'}`,
            }}>{n} WK</button>
          ))}
        </div>
      </div>

      {/* Week grids (horizontally scrollable) */}
      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <div style={{ minWidth: 760, display: 'grid', gap: 10 }}>
          {Array.from({ length: weeks }, (_, wk) => (
            <CalendarWeek key={wk} start={(() => { const d = new Date(anchor); d.setDate(d.getDate() + wk * 7); return d; })()} wMap={wMap} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CalendarWeek({ start, wMap }) {
  const today = ymd(new Date());
  const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
      {Array.from({ length: 7 }, (_, i) => {
        const d = new Date(start); d.setDate(d.getDate() + i);
        const ds = ymd(d);
        const isToday = ds === today;
        const ws = wMap[ds] || [];
        return (
          <div key={i} style={{
            minHeight: 150, borderRadius: 10, padding: 8,
            background: isToday ? 'var(--accent-soft)' : 'var(--bg-2)',
            border: `1px solid ${isToday ? 'var(--accent)' : 'var(--line)'}`,
          }}>
            <div className="mono" style={{ fontSize: 8.5, letterSpacing: '0.1em', color: isToday ? 'var(--accent)' : 'var(--text-3)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
              <span>{DOW[i]}</span><span style={{ fontWeight: 700, color: isToday ? 'var(--accent)' : 'var(--text-2)' }}>{d.getDate()}</span>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {ws.map(w => <WorkoutCell key={w.id} w={w} />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WorkoutCell({ w }) {
  const day = w.programme_days;
  const phase = day?.programme_phases;
  const done = w.status === 'completed';
  const sections = [...(day?.workout_sections || [])].sort((a, b) => a.sort_order - b.sort_order);
  const totalEx = sections.reduce((n, s) => n + (s.section_exercises?.length || 0), 0);
  const shown = sections.slice(0, 2);
  const shownEx = shown.reduce((n, s) => n + (s.section_exercises?.length || 0), 0);
  const more = totalEx - shownEx;

  return (
    <div style={{
      borderRadius: 8, padding: 8, background: 'var(--bg-1)',
      border: `1px solid ${done ? 'color-mix(in srgb, var(--accent) 45%, var(--line))' : 'var(--line-strong)'}`,
      borderLeft: `2px solid ${done ? 'var(--accent)' : 'var(--c-amber)'}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: done ? 'var(--accent)' : 'var(--c-amber)', flexShrink: 0 }}/>
        <span className="mono" style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(phase?.name || 'WORKOUT').toUpperCase()}
        </span>
        {done && <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontSize: 9 }}>✓</span>}
      </div>
      {shown.map((s, i) => (
        <div key={i} style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 6, padding: '5px 6px', marginBottom: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.title || SECTION_LABEL[s.kind] || 'Block'}</div>
          <div className="mono" style={{ fontSize: 7.5, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 2 }}>
            {(SECTION_LABEL[s.kind] || s.kind || '').toString()} · {(s.section_exercises?.length || 0)} EX
          </div>
        </div>
      ))}
      {more > 0 && <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: '0.04em' }}>+{more} more exercise{more === 1 ? '' : 's'}</div>}
      {totalEx === 0 && <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)' }}>No exercises</div>}
    </div>
  );
}

// ── BODY ─────────────────────────────────────────────────────────
function BodyTab({ c, trainerId }) {
  const [mode, setMode]           = React.useState('injuries');
  const [side, setSide]           = React.useState('front');
  const [injuries, setInjuries]   = React.useState([]);
  const [volume, setVolume]       = React.useState(null);   // last-30d muscle volume
  const [picked, setPicked]       = React.useState(null);
  const [editPanel, setEditPanel] = React.useState(null); // { group } when reporting
  const [openId, setOpenId]       = React.useState(null); // open injury thread

  const reload = () =>
    supabase.from('client_injuries').select('*').eq('client_id', c.id)
      .then(({ data }) => setInjuries(data || []));

  React.useEffect(() => { reload(); }, [c.id]);

  React.useEffect(() => {
    if (mode === 'worked' && volume === null) {
      loadExerciseMuscleMap().then(map => loadMuscleVolume(c.id, 30, map)).then(setVolume);
    }
  }, [mode, volume, c.id]);

  // Injury mode: every muscle AND joint is interactive (trainer can click any)
  const injurySlugMap = MUSCLE_BODY.injurySlugs?.[side] || {};
  const allGroupsData = React.useMemo(() => {
    const d = {};
    Object.keys(injurySlugMap).forEach(g => { d[g] = {}; });
    return d;
  }, [side]);

  // Only unresolved injuries drive the heatmap and the per-muscle list.
  const activeInjuries = React.useMemo(() => injuries.filter(inj => !inj.resolved_at), [injuries]);
  const resolvedInjuries = React.useMemo(() => injuries.filter(inj => inj.resolved_at), [injuries]);
  const openInjury = openId ? injuries.find(inj => inj.id === openId) : null;

  const sevVal = { mild: 0.35, moderate: 0.65, severe: 1.0 };
  // Per-side injury intensity: a side lights only if matched (or bilateral).
  const injuryIntensity = React.useCallback((group, anat) => {
    const hits = activeInjuries.filter(inj => inj.muscle_group === group && (inj.laterality === anat || inj.laterality === 'both'));
    if (!hits.length) return 0;
    return Math.max(...hits.map(inj => sevVal[inj.severity] || 0.5));
  }, [activeInjuries]);

  const workedData = volume || {};
  const maxSets = Math.max(1, ...Object.values(workedData).map(d => d.sets));
  const workedIntensity = React.useCallback(
    (group) => Math.min(1, (workedData[group]?.sets || 0) / maxSets),
    [workedData, maxSets]
  );

  const isInjuryMode = mode === 'injuries';
  const [pickedGroup, pickedSide] = picked && isInjuryMode ? picked.split('|') : [picked, null];
  const pickedInjuries = pickedGroup
    ? activeInjuries.filter(inj => inj.muscle_group === pickedGroup && (inj.laterality === pickedSide || inj.laterality === 'both'))
    : [];
  const pickedVolume = picked ? workedData[picked] : null;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* Mode toggle — large */}
      <div style={{ display: 'flex', gap: 8 }}>
        <BigToggle active={isInjuryMode}  onClick={() => { setMode('injuries'); setPicked(null); }}>INJURIES</BigToggle>
        <BigToggle active={!isInjuryMode} onClick={() => { setMode('worked');   setPicked(null); setEditPanel(null); }}>TRAINED</BigToggle>
      </div>
      {/* Front / back — large */}
      <div style={{ display: 'flex', gap: 8 }}>
        {['front','back'].map(s => (
          <button key={s} onClick={() => { setSide(s); setPicked(null); }} style={{
            flex: 1, padding: '11px', borderRadius: 10, cursor: 'pointer',
            background: side === s ? 'var(--bg-3)' : 'var(--bg-2)',
            border: '1px solid ' + (side === s ? 'var(--accent)' : 'var(--line)'),
            color: side === s ? 'var(--accent)' : 'var(--text-3)',
            fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
          }}>{s.toUpperCase()}</button>
        ))}
      </div>

      {/* Body map */}
      <BodyMap
        side={side}
        data={isInjuryMode ? allGroupsData : workedData}
        intensity={isInjuryMode ? injuryIntensity : workedIntensity}
        picked={picked}
        slugMap={isInjuryMode ? injurySlugMap : undefined}
        perSide={isInjuryMode}
        zoomable
        labels={REGION_LABELS}
        onPick={isInjuryMode
          ? (group, anat) => { const key = `${group}|${anat}`; setPicked(picked === key ? null : key); setEditPanel(null); setOpenId(null); }
          : (group) => { setPicked(group === picked ? null : group); setEditPanel(null); setOpenId(null); }}
        heatColor={isInjuryMode ? 'var(--c-coral)' : 'var(--accent)'}
      />

      {/* Legend */}
      {isInjuryMode ? (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {Object.entries(SEV_COLOR).map(([sev, col]) => (
            <div key={sev} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Dot color={col}/>
              <Mono>{SEV_LABEL[sev]}</Mono>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Mono>LOW</Mono>
          <div style={{
            flex: 1, height: 6, borderRadius: 999,
            background: 'linear-gradient(90deg, rgba(255,255,255,0.05), color-mix(in srgb, var(--accent) 30%, transparent), var(--accent))',
          }}/>
          <Mono style={{ color: 'var(--accent)' }}>HIGH · LAST 30D</Mono>
        </div>
      )}

      {!isInjuryMode && volume === null && <Mono>LOADING TRAINING VOLUME…</Mono>}
      {!isInjuryMode && volume !== null && Object.keys(workedData).length === 0 && (
        <EmptyState>No completed sessions in the last 30 days</EmptyState>
      )}

      {/* Selected muscle — trained volume panel */}
      {!isInjuryMode && picked && pickedVolume && (
        <div className="card" style={{ padding: 14, borderColor: 'color-mix(in srgb, var(--accent) 40%, var(--line))' }}>
          <div className="h-bold" style={{ fontSize: 14, marginBottom: 10 }}>{regionLabel(picked).toUpperCase()}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <KpiCard label="SETS"   value={pickedVolume.sets}   color="var(--accent)" />
            <KpiCard label="REPS"   value={pickedVolume.reps}   color="var(--accent)" />
            <KpiCard label="VOLUME" value={`${pickedVolume.kg.toLocaleString()}`} unit="kg" color="var(--accent)" />
          </div>
          <Mono style={{ marginTop: 8 }}>LAST WORKED · {pickedVolume.lastWorked.toUpperCase()}</Mono>
        </div>
      )}

      {/* Open injury thread (add notes / resolve) */}
      {isInjuryMode && openInjury && (
        <InjuryThread injury={openInjury} authorId={trainerId}
          onBack={() => setOpenId(null)} onChanged={reload} />
      )}

      {/* Selected region panel */}
      {isInjuryMode && !openInjury && pickedGroup && (
        <div className="card" style={{
          padding: 14,
          borderColor: 'color-mix(in srgb, var(--c-coral) 40%, var(--line))',
          background: 'color-mix(in srgb, var(--c-coral) 6%, var(--bg-2))',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div className="h-bold" style={{ fontSize: 14 }}>
              {injuryTitle({ muscle_group: pickedGroup, laterality: pickedSide }).toUpperCase()}
            </div>
            {!editPanel && (
              <button onClick={() => setEditPanel({ group: pickedGroup, side: pickedSide })} style={{
                all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 9, color: 'var(--c-coral)', fontFamily: 'JetBrains Mono', fontWeight: 700,
                border: '1px solid color-mix(in srgb, var(--c-coral) 50%, transparent)', borderRadius: 6, padding: '4px 8px',
              }}><IconPlus size={10}/> REPORT INJURY</button>
            )}
          </div>

          {editPanel && (
            <InjuryForm
              group={editPanel.group} side={side} defaultSide={editPanel.side}
              onSave={async (note, severity, laterality) => {
                await supabase.from('client_injuries').insert({
                  client_id: c.id, trainer_id: trainerId,
                  muscle_group: editPanel.group, body_side: side, note, severity, laterality,
                });
                setEditPanel(null); reload();
              }}
              onClose={() => setEditPanel(null)}
            />
          )}

          {!editPanel && pickedInjuries.length === 0 && <Mono style={{ color: 'var(--text-3)' }}>No active injuries here — tap REPORT INJURY to log one.</Mono>}
          {!editPanel && pickedInjuries.map(inj => <InjuryRow key={inj.id} inj={inj} onOpen={() => setOpenId(inj.id)} />)}
        </div>
      )}

      {/* Active + past lists */}
      {isInjuryMode && !openInjury && (
        <>
          {activeInjuries.length > 0 && (
            <>
              <div className="label" style={{ marginTop: 4 }}>// ACTIVE · {activeInjuries.length}</div>
              {activeInjuries.map(inj => <InjuryRow key={inj.id} inj={inj} onOpen={() => setOpenId(inj.id)} />)}
            </>
          )}
          {resolvedInjuries.length > 0 && (
            <>
              <div className="label" style={{ marginTop: 4, opacity: 0.6 }}>// PAST · {resolvedInjuries.length}</div>
              {resolvedInjuries.map(inj => <InjuryRow key={inj.id} inj={inj} onOpen={() => setOpenId(inj.id)} resolved />)}
            </>
          )}
        </>
      )}
    </div>
  );
}

// Tappable injury summary row → opens the thread.
function InjuryRow({ inj, onOpen, resolved }) {
  const col = resolved ? 'var(--text-3)' : SEV_COLOR[inj.severity];
  return (
    <button onClick={onOpen} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center',
        padding: '10px 12px', background: 'var(--bg-2)', borderRadius: 8,
        border: `1px solid color-mix(in srgb, ${col} 30%, var(--line))`, opacity: resolved ? 0.7 : 1,
      }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }}/>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{injuryTitle(inj)}</div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {SEV_LABEL[inj.severity]}{inj.note ? ` · ${inj.note}` : ''}
          </div>
        </div>
        {resolved
          ? <span className="mono" style={{ fontSize: 9, color: 'var(--accent)', letterSpacing: '0.06em', flexShrink: 0 }}>
              ✓ {new Date(inj.resolved_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          : <IconChevronRight size={14} style={{ color: 'var(--text-3)' }}/>}
      </div>
    </button>
  );
}

function InjuryForm({ group, side, onSave, onClose, defaultSide }) {
  const [note, setNote]         = React.useState('');
  const [severity, setSeverity] = React.useState('moderate');
  const [laterality, setLaterality] = React.useState(defaultSide || 'both');
  const [saving, setSaving]     = React.useState(false);
  return (
    <div className="card" style={{ padding: 14, border: '1px solid var(--c-coral)', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="label">// REPORT INJURY — {regionLabel(group).toUpperCase()}</div>
        <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)' }}><IconX2 size={14}/></button>
      </div>
      <div>
        <div className="label" style={{ marginBottom: 6 }}>SIDE</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {[['left','LEFT'],['both','BOTH'],['right','RIGHT']].map(([v, l]) => (
            <button key={v} onClick={() => setLaterality(v)} style={{
              all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '8px 0', borderRadius: 8, fontSize: 9,
              fontFamily: 'JetBrains Mono', fontWeight: 700, letterSpacing: '0.08em',
              background: laterality === v ? 'var(--accent-soft)' : 'var(--bg-3)',
              border: `1px solid ${laterality === v ? 'var(--accent)' : 'var(--line)'}`,
              color: laterality === v ? 'var(--accent)' : 'var(--text-3)',
            }}>{l}</button>
          ))}
        </div>
      </div>
      <div>
        <div className="label" style={{ marginBottom: 6 }}>SEVERITY</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['mild','moderate','severe'].map(s => (
            <button key={s} onClick={() => setSeverity(s)} style={{
              all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
              padding: '8px 0', borderRadius: 8, fontSize: 9,
              fontFamily: 'JetBrains Mono', fontWeight: 700, letterSpacing: '0.08em',
              background: severity === s ? `color-mix(in srgb, ${SEV_COLOR[s]} 18%, var(--bg-3))` : 'var(--bg-3)',
              border: `1px solid ${severity === s ? SEV_COLOR[s] : 'var(--line)'}`,
              color: severity === s ? SEV_COLOR[s] : 'var(--text-3)',
            }}>{SEV_LABEL[s]}</button>
          ))}
        </div>
      </div>
      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Describe the injury or limitation…"
        rows={3} style={{ ...fieldSt, resize: 'vertical' }}/>
      <button onClick={async () => { if (!note.trim() || saving) return; setSaving(true); await onSave(note.trim(), severity, laterality); }} disabled={!note.trim() || saving}
        className="btn-primary" style={{ opacity: note.trim() ? 1 : 0.4 }}>
        {saving ? 'SAVING…' : 'SAVE INJURY'}
      </button>
    </div>
  );
}

// ── DATA ─────────────────────────────────────────────────────────
function DataTab({ c }) {
  // The coach sees exactly what the client sees in their Metrics tab.
  return <Progress userId={c.id} go={() => {}} embedded />;
}

// ── TASKS ─────────────────────────────────────────────────────────
function TasksTab({ c, trainerId }) {
  const [tasks, setTasks]   = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [forms, setForms]   = React.useState([]);
  const [formId, setFormId] = React.useState('');
  const [title, setTitle]   = React.useState('');
  const [kind, setKind]     = React.useState('check');
  const [due, setDue]       = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const reload = () =>
    supabase.from('client_tasks').select('*').eq('client_id', c.id)
      .order('due_date', { ascending: true })
      .then(({ data }) => setTasks(data || []));

  React.useEffect(() => { reload(); loadForms().then(setForms); }, [c.id]);

  const selForm = forms.find(f => f.id === formId);
  const effTitle = (title.trim() || (kind === 'form' && selForm ? selForm.title : '')).trim();
  const canSave = !!effTitle && !saving && (kind !== 'form' || !!formId);

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    await supabase.from('client_tasks').insert({
      client_id: c.id, trainer_id: trainerId,
      title: effTitle, kind, due_date: due || null,
      form_id: kind === 'form' ? formId : null,
    });
    notify({ recipientId: c.id, actorId: trainerId, kind: kind === 'form' ? 'form' : 'task',
      title: kind === 'form' ? 'New form to complete' : 'New task assigned', body: effTitle, link: { screen: 'dashboard' } });
    setSaving(false); setAdding(false); setTitle(''); setDue(''); setFormId(''); setKind('check'); reload();
  };

  const toggle = async (task) => {
    const val = task.completed_at ? null : new Date().toISOString();
    await supabase.from('client_tasks').update({ completed_at: val }).eq('id', task.id);
    reload();
  };

  const del = async (id) => {
    await supabase.from('client_tasks').delete().eq('id', id);
    reload();
  };

  const open = (tasks || []).filter(t => !t.completed_at);
  const done = (tasks || []).filter(t => !!t.completed_at);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="label">// TASKS</div>
        <button onClick={() => setAdding(a => !a)} style={{
          all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 9, color: 'var(--accent)', fontFamily: 'JetBrains Mono', fontWeight: 700,
          border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)', borderRadius: 6, padding: '4px 8px',
        }}><IconPlus size={10}/> NEW TASK</button>
      </div>

      {adding && (
        <div className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
          <FieldLabel label="TASK TITLE">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Log today's weight" style={fieldSt}/>
          </FieldLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <FieldLabel label="TYPE">
              <div style={{ display: 'flex', gap: 4 }}>
                {['check','log','photo','form'].map(k => (
                  <button key={k} onClick={() => setKind(k)} style={{
                    all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
                    padding: '7px 0', borderRadius: 7, fontSize: 8.5, fontFamily: 'JetBrains Mono', fontWeight: 700,
                    background: kind === k ? 'var(--accent-soft)' : 'var(--bg-3)',
                    border: `1px solid ${kind === k ? 'var(--accent)' : 'var(--line)'}`,
                    color: kind === k ? 'var(--accent)' : 'var(--text-3)',
                  }}>{k.toUpperCase()}</button>
                ))}
              </div>
            </FieldLabel>
            <FieldLabel label="DUE DATE (OPT)">
              <input type="date" value={due} onChange={e => setDue(e.target.value)} style={fieldSt}/>
            </FieldLabel>
          </div>
          {kind === 'form' && (
            <FieldLabel label="FORM">
              <select value={formId} onChange={e => setFormId(e.target.value)} style={{ ...fieldSt, appearance: 'auto' }}>
                <option value="">— Select a form —</option>
                {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
              </select>
            </FieldLabel>
          )}
          <button onClick={save} disabled={!canSave} className="btn-primary" style={{ opacity: canSave ? 1 : 0.4 }}>
            {saving ? 'SAVING…' : kind === 'form' ? 'ASSIGN FORM' : 'ADD TASK'}
          </button>
        </div>
      )}

      {tasks === null && <Mono>LOADING…</Mono>}
      {tasks !== null && open.length === 0 && done.length === 0 && <EmptyState>No tasks yet — add one above</EmptyState>}

      {open.map(t => <TaskRow key={t.id} t={t} onToggle={toggle} onDelete={del}/>)}

      {done.length > 0 && (
        <>
          <div className="label" style={{ marginTop: 4, opacity: 0.5 }}>// COMPLETED</div>
          {done.map(t => <TaskRow key={t.id} t={t} onToggle={toggle} onDelete={del} faded/>)}
        </>
      )}
    </div>
  );
}

function TaskRow({ t, onToggle, onDelete, faded }) {
  return (
    <div className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, opacity: faded ? 0.55 : 1 }}>
      <button onClick={() => onToggle(t)} style={{
        all: 'unset', cursor: 'pointer', width: 22, height: 22, borderRadius: 6, flexShrink: 0,
        background: t.completed_at ? 'var(--accent)' : 'var(--bg-3)',
        border: `1px solid ${t.completed_at ? 'var(--accent)' : 'var(--line-strong)'}`,
        display: 'grid', placeItems: 'center', color: 'var(--on-accent)',
      }}>
        {t.completed_at && <IconCheck size={11} sw={2.5}/>}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textDecoration: t.completed_at ? 'line-through' : 'none', color: 'var(--text)' }}>{t.title}</div>
        <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>
          {TASK_ICON[t.kind]} {t.kind.toUpperCase()}{t.due_date ? ` · DUE ${new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
        </div>
      </div>
      <button onClick={() => onDelete(t.id)} style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
        <IconX2 size={12}/>
      </button>
    </div>
  );
}

// ── GOALS ─────────────────────────────────────────────────────────
function GoalsTab({ c, trainerId }) {
  const [goal, setGoal]     = React.useState(null);
  const [title, setTitle]   = React.useState('');
  const [desc, setDesc]     = React.useState('');
  const [target, setTarget] = React.useState('');
  const [status, setStatus] = React.useState('active');
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty]   = React.useState(false);

  React.useEffect(() => {
    supabase.from('client_goals').select('*').eq('client_id', c.id)
      .eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setGoal(data); setTitle(data.title); setDesc(data.description);
          setTarget(data.target_date || ''); setStatus(data.status);
        }
      });
  }, [c.id]);

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    const payload = { client_id: c.id, trainer_id: trainerId, title: title.trim(), description: desc.trim(), target_date: target || null, status };
    if (goal) {
      await supabase.from('client_goals').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', goal.id);
    } else {
      const { data } = await supabase.from('client_goals').insert(payload).select().single();
      setGoal(data);
    }
    setSaving(false); setDirty(false);
  };

  const onChange = (fn) => { fn(); setDirty(true); };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div className="label">// GOAL / OBJECTIVE</div>
      <div className="card" style={{ padding: 14, display: 'grid', gap: 12 }}>
        <FieldLabel label="GOAL TITLE">
          <input value={title} onChange={e => onChange(() => setTitle(e.target.value))} placeholder="e.g. Run a 5k in under 25 minutes" style={fieldSt}/>
        </FieldLabel>
        <FieldLabel label="DESCRIPTION / CONTEXT">
          <textarea value={desc} onChange={e => onChange(() => setDesc(e.target.value))} rows={4}
            placeholder="Describe the outcome, how it will be measured, and why it matters…"
            style={{ ...fieldSt, resize: 'vertical' }}/>
        </FieldLabel>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <FieldLabel label="TARGET DATE">
            <input type="date" value={target} onChange={e => onChange(() => setTarget(e.target.value))} style={fieldSt}/>
          </FieldLabel>
          <FieldLabel label="STATUS">
            <select value={status} onChange={e => onChange(() => setStatus(e.target.value))} style={{ ...fieldSt, appearance: 'auto' }}>
              <option value="active">Active</option>
              <option value="achieved">Achieved</option>
              <option value="paused">Paused</option>
            </select>
          </FieldLabel>
        </div>
        <button onClick={save} disabled={!dirty || !title.trim() || saving} className="btn-primary"
          style={{ opacity: dirty && title.trim() ? 1 : 0.4 }}>
          {saving ? 'SAVING…' : goal ? 'UPDATE GOAL' : 'SET GOAL'}
        </button>
      </div>
    </div>
  );
}

// ── SETTINGS ──────────────────────────────────────────────────────
function SettingsTab({ c, trainerId, onSaved, onArchived }) {
  const isManaged = !!c.managed;
  const [credits, setCredits]       = React.useState(c.credits ?? 0);
  const [cStatus, setCStatus]       = React.useState(c.client_status ?? 'online');
  const [subDue, setSubDue]         = React.useState(c.subscription_due ?? '');
  const [tz, setTz]                 = React.useState(c.timezone ?? 'Europe/London');
  const [resetEmail, setResetEmail] = React.useState(c.email ?? '');
  const [saving, setSaving]         = React.useState(false);
  const [saved, setSaved]           = React.useState(false);
  const [resetSent, setResetSent]   = React.useState(false);
  const [archiveConfirm, setArchiveConfirm] = React.useState(false);

  const saveSettings = async () => {
    if (saving) return;
    setSaving(true);
    const updates = { credits, client_status: cStatus, subscription_due: subDue || null, timezone: tz };
    if (isManaged) {
      await supabase.from('managed_clients').update({ credits, client_status: cStatus }).eq('id', c.id);
    } else {
      await supabase.from('profiles').update(updates).eq('id', c.id);
    }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
    onSaved?.();
  };

  const sendReset = async () => {
    if (!resetEmail.trim()) return;
    await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: window.location.origin,
    });
    setResetSent(true); setTimeout(() => setResetSent(false), 4000);
  };

  const archiveClient = async () => {
    if (!archiveConfirm) { setArchiveConfirm(true); return; }
    if (isManaged) {
      await supabase.from('managed_clients').delete().eq('id', c.id);
    } else {
      await supabase.from('profiles').update({ archived: true }).eq('id', c.id);
    }
    onArchived?.();
  };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Credits */}
      <div className="card" style={{ padding: 14 }}>
        <div className="label" style={{ marginBottom: 10 }}>// IN-PERSON CREDITS</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
          <CreditBtn onClick={() => setCredits(n => Math.max(0, n - 1))}>−</CreditBtn>
          <div style={{ textAlign: 'center' }}>
            <div className="h-bold" style={{ fontSize: 40, color: 'var(--accent)', lineHeight: 1 }}>{credits}</div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em', marginTop: 4 }}>SESSIONS REMAINING</div>
          </div>
          <CreditBtn onClick={() => setCredits(n => n + 1)}>+</CreditBtn>
        </div>
      </div>

      {/* Client status */}
      <div className="card" style={{ padding: 14 }}>
        <div className="label" style={{ marginBottom: 10 }}>// CLIENT STATUS</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          {STATUS_OPTS.map(opt => (
            <button key={opt.v} onClick={() => setCStatus(opt.v)} style={{
              all: 'unset', cursor: 'pointer', textAlign: 'center',
              padding: '10px 6px', borderRadius: 8, fontSize: 9,
              fontFamily: 'JetBrains Mono', fontWeight: 700, letterSpacing: '0.06em',
              background: cStatus === opt.v ? 'var(--accent-soft)' : 'var(--bg-3)',
              border: `1px solid ${cStatus === opt.v ? 'var(--accent)' : 'var(--line)'}`,
              color: cStatus === opt.v ? 'var(--accent)' : 'var(--text-3)',
            }}>{opt.label}</button>
          ))}
        </div>
      </div>

      {/* Subscription + timezone */}
      {!isManaged && (
        <div className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
          <FieldLabel label="SUBSCRIPTION RENEWAL DATE">
            <input type="date" value={subDue} onChange={e => setSubDue(e.target.value)} style={fieldSt}/>
          </FieldLabel>
          <FieldLabel label="TIMEZONE">
            <input value={tz} onChange={e => setTz(e.target.value)} placeholder="Europe/London" style={fieldSt}/>
          </FieldLabel>
        </div>
      )}

      <button onClick={saveSettings} disabled={saving} className="btn-primary"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {saved ? <><IconCheck size={14}/> SAVED</> : saving ? 'SAVING…' : 'SAVE SETTINGS'}
      </button>

      {/* Password reset */}
      {!isManaged && (
        <div className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
          <div className="label">// PASSWORD RESET</div>
          <FieldLabel label="CLIENT EMAIL">
            <input value={resetEmail} onChange={e => setResetEmail(e.target.value)} type="email" placeholder="client@email.com" style={fieldSt}/>
          </FieldLabel>
          <button onClick={sendReset} disabled={!resetEmail.trim()} style={{
            all: 'unset', cursor: resetEmail.trim() ? 'pointer' : 'default', padding: '11px', borderRadius: 10,
            background: 'var(--bg-3)', border: '1px solid var(--line-strong)',
            color: resetSent ? 'var(--accent)' : 'var(--text)',
            fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textAlign: 'center',
            opacity: resetEmail.trim() ? 1 : 0.45,
          }}>
            {resetSent ? '✓ RESET EMAIL SENT' : 'SEND PASSWORD RESET'}
          </button>
        </div>
      )}

      {/* Archive */}
      <button onClick={archiveClient} style={{
        all: 'unset', cursor: 'pointer', padding: '13px', borderRadius: 10, textAlign: 'center',
        background: 'transparent',
        border: `1px solid color-mix(in srgb, var(--c-coral) ${archiveConfirm ? 60 : 35}%, var(--line))`,
        color: archiveConfirm ? 'var(--c-coral)' : 'var(--text-3)',
        fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, letterSpacing: '0.08em',
      }}>
        {archiveConfirm ? 'CONFIRM ARCHIVE — TAP AGAIN' : 'ARCHIVE CLIENT'}
      </button>
    </div>
  );
}

// ── ASSIGN WORKOUT (duplicate from Coach.jsx for self-contained use) ───────
function AssignWorkout({ clientId, clientName, trainerId, programmes, onClose, onAssigned }) {
  const [progId, setProgId]     = React.useState(null);
  const [phaseIdx, setPhaseIdx] = React.useState(0);
  const [week, setWeek]         = React.useState(1);
  const [days, setDays]         = React.useState([]);
  const [loading, setLoading]   = React.useState(false);
  const [dayId, setDayId]       = React.useState(null);
  const [date, setDate]         = React.useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving]     = React.useState(false);
  const [saved, setSaved]       = React.useState(false);

  const prog  = programmes.find(p => p.id === progId);
  const phase = prog?.phaseList?.[phaseIdx];

  React.useEffect(() => {
    if (!phase?.id || !week) { setDays([]); return; }
    setLoading(true);
    supabase.from('programme_days').select('id, day_of_week, notes, workout_sections(id, kind, title, section_exercises(id))')
      .eq('phase_id', phase.id).eq('week_index', week - 1)
      .order('day_of_week')
      .then(({ data }) => { setDays(data || []); setLoading(false); });
  }, [phase?.id, week]);

  const assign = async () => {
    if (!dayId || !date || saving) return;
    setSaving(true);
    await supabase.from('client_workouts').insert({ client_id: clientId, trainer_id: trainerId, day_id: dayId, scheduled_date: date });
    setSaving(false); setSaved(true);
    setTimeout(() => onAssigned(), 1400);
  };

  if (saved) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--accent)', fontFamily: 'JetBrains Mono', fontWeight: 700, letterSpacing: '0.14em', fontSize: 16 }}>✓ WORKOUT ASSIGNED</div>
  );

  const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  return (
    <div className="card" style={{ padding: 14, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="label">// ASSIGN WORKOUT — {clientName.toUpperCase()}</div>
        <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)' }}><IconX2 size={14}/></button>
      </div>

      {/* Programme select */}
      <FieldLabel label="PROGRAMME">
        <select value={progId || ''} onChange={e => { setProgId(e.target.value || null); setPhaseIdx(0); setWeek(1); setDayId(null); }} style={{ ...fieldSt, appearance: 'auto' }}>
          <option value="">— Select programme —</option>
          {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </FieldLabel>

      {prog && (
        <>
          <FieldLabel label="PHASE">
            <select value={phaseIdx} onChange={e => { setPhaseIdx(+e.target.value); setWeek(1); setDayId(null); }} style={{ ...fieldSt, appearance: 'auto' }}>
              {prog.phaseList.map((ph, i) => <option key={i} value={i}>{ph.name}</option>)}
            </select>
          </FieldLabel>
          {phase && (
            <FieldLabel label="WEEK">
              <select value={week} onChange={e => { setWeek(+e.target.value); setDayId(null); }} style={{ ...fieldSt, appearance: 'auto' }}>
                {Array.from({ length: phase.weeks || 4 }, (_, i) => <option key={i+1} value={i+1}>Week {i+1}</option>)}
              </select>
            </FieldLabel>
          )}
        </>
      )}

      {loading && <Mono>LOADING DAYS…</Mono>}
      {days.length > 0 && (
        <FieldLabel label="DAY">
          <div style={{ display: 'grid', gap: 6 }}>
            {days.map(d => (
              <button key={d.id} onClick={() => setDayId(d.id === dayId ? null : d.id)} style={{
                all: 'unset', cursor: 'pointer', padding: '8px 10px', borderRadius: 8,
                background: dayId === d.id ? 'var(--accent-soft)' : 'var(--bg-3)',
                border: `1px solid ${dayId === d.id ? 'var(--accent)' : 'var(--line)'}`,
                display: 'flex', gap: 8, alignItems: 'center',
              }}>
                <span className="mono" style={{ fontSize: 10, color: dayId === d.id ? 'var(--accent)' : 'var(--text-3)', fontWeight: 700 }}>{DAY_LABELS[d.day_of_week]}</span>
                <span style={{ flex: 1, fontSize: 11 }}>{(d.workout_sections || []).map(s => s.title).join(' · ')}</span>
                {dayId === d.id && <IconCheck size={12} style={{ color: 'var(--accent)', flexShrink: 0 }}/>}
              </button>
            ))}
          </div>
        </FieldLabel>
      )}

      {dayId && (
        <FieldLabel label="SCHEDULED DATE">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={fieldSt}/>
        </FieldLabel>
      )}

      <button onClick={assign} disabled={!dayId || !date || saving} className="btn-primary"
        style={{ opacity: dayId && date ? 1 : 0.4, pointerEvents: dayId && date ? 'auto' : 'none' }}>
        {saving ? 'ASSIGNING…' : 'ASSIGN WORKOUT →'}
      </button>
    </div>
  );
}

// ── Shared helpers ────────────────────────────────────────────────
function KpiCard({ label, value, unit, color }) {
  return (
    <div className="card" style={{ padding: '10px 8px', textAlign: 'center' }}>
      <div className="label" style={{ fontSize: 7, marginBottom: 4 }}>{label}</div>
      <div className="h-bold" style={{ fontSize: 20, color: color || 'var(--text)', lineHeight: 1 }}>{value}</div>
      {unit && <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)', marginTop: 2 }}>{unit}</div>}
    </div>
  );
}

function CreditBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      all: 'unset', cursor: 'pointer', width: 44, height: 44, borderRadius: 12,
      background: 'var(--bg-3)', border: '1px solid var(--line-strong)',
      display: 'grid', placeItems: 'center',
      fontSize: 22, color: 'var(--accent)', fontWeight: 700,
    }}>{children}</button>
  );
}

function ToggleBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} className="mono" style={{
      all: 'unset', cursor: 'pointer', padding: '6px 10px', borderRadius: 7, fontSize: 9, fontWeight: 700,
      background: active ? 'var(--accent-soft)' : 'var(--bg-2)',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
      color: active ? 'var(--accent)' : 'var(--text-3)',
      letterSpacing: '0.08em',
    }}>{children}</button>
  );
}

function BigToggle({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '12px', borderRadius: 10,
      background: active ? 'var(--accent-soft)' : 'var(--bg-2)',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
      color: active ? 'var(--accent)' : 'var(--text-2)',
      fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
      boxShadow: active ? '0 0 calc(8px * var(--glow)) var(--accent-glow)' : 'none',
    }}>{children}</button>
  );
}

function FieldLabel({ label, children }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function EmptyState({ children }) {
  return (
    <div className="card" style={{ padding: 20, textAlign: 'center' }}>
      <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em' }}>{children}</div>
    </div>
  );
}

function Mono({ children, style }) {
  return <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', ...style }}>{children}</div>;
}

function Dot({ color }) {
  return <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }}/>;
}

const fieldSt = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--bg-3)', border: '1px solid var(--line-strong)', borderRadius: 8,
  padding: '10px 11px', color: 'var(--text)', outline: 'none',
  fontFamily: 'JetBrains Mono', fontSize: 12, lineHeight: 1.4,
};

const navBtnSt = {
  all: 'unset', cursor: 'pointer', padding: '6px 9px', borderRadius: 7,
  fontSize: 11, fontWeight: 700, letterSpacing: '0.06em',
  color: 'var(--text-2)', background: 'var(--bg-3)',
  border: '1px solid var(--line)',
};
