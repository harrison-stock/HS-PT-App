import React from 'react'
import { supabase } from '../lib/supabase'
import { loadMuscleVolume } from '../lib/muscleVolume'
import { loadExerciseMuscleMap } from '../lib/exercises'
import { Hex, HexBackButton } from '../components/hex'
import { BodyMap, Progress, SideSlider } from './Progress'
import { InjuryThread } from './InjuryThread'
import { MUSCLE_BODY, REGION_LABELS } from '../data/musclePaths'
import { injuryTitle } from '../lib/injuries'
import { notify } from '../lib/notifications'
import { loadForms } from '../lib/forms'
import { IconPlus, IconCheck, IconX2, IconChevronRight } from '../components/icons'
import { ProgrammeReport } from './ProgrammeReport'
import { ProgrammeBuilder } from './ProgrammeBuilder'
import { ImportHistory } from './ImportHistory'
import { toast } from '../lib/toast'

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
const TASK_ICON  = { check: '✓', log: '◎', photo: '▣', form: '✎' };
const TASK_COLOR = { check: 'var(--accent)', log: 'var(--c-amber)', photo: 'var(--c-blue)', form: 'var(--c-pink)' };

// ── Main component ───────────────────────────────────────────────
export function ClientDetail({ c, trainerId, programmes, onClose, onChanged, go }) {
  const [tab, setTab] = React.useState('overview');
  const TABS = [
    { id: 'overview',  label: 'OVERVIEW'  },
    { id: 'training',  label: 'TRAINING'  },
    { id: 'body',      label: 'BODY'      },
    { id: 'data',      label: 'DATA'      },
    { id: 'report',    label: 'REPORT'    },
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
      <div className="scroller dt-content" style={{ flex: 1, minHeight: 0, padding: '14px 14px 40px' }}>
        {tab === 'overview' && <OverviewTab  c={c} go={go} onClose={onClose} onTab={setTab} />}
        {tab === 'training' && <TrainingTab  c={c} trainerId={trainerId} programmes={programmes} onChanged={onChanged} />}
        {tab === 'body'     && <BodyTab      c={c} trainerId={trainerId} />}
        {tab === 'data'     && <DataTab      c={c} trainerId={trainerId} />}
        {tab === 'tasks'    && <TasksTab     c={c} trainerId={trainerId} />}
        {tab === 'goals'    && <GoalsTab     c={c} trainerId={trainerId} />}
        {tab === 'report'   && <ProgrammeReport clientId={c.id} clientName={c.name} embedded onClose={() => setTab('overview')} />}
        {tab === 'settings' && <SettingsTab  c={c} trainerId={trainerId} onSaved={onChanged} onArchived={() => { onChanged?.(); onClose(); }} />}
      </div>
    </div>
  );
}

// ── OVERVIEW — Everfit-style client home the coach jots notes on ──
const relDays = (iso) => {
  const n = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (n <= 0) return 'today';
  if (n === 1) return 'yesterday';
  if (n < 7) return `${n} days ago`;
  if (n < 14) return '1 week ago';
  return `${Math.floor(n / 7)} weeks ago`;
};

function OverviewTab({ c, go, onClose, onTab }) {
  const [d, setD] = React.useState(null);
  const todayD = React.useMemo(() => { const x = new Date(); x.setHours(0, 0, 0, 0); return x; }, []);
  const today = ymd(todayD);
  const table = c.managed ? 'managed_clients' : 'profiles';
  const ago   = (n) => { const x = new Date(todayD); x.setDate(x.getDate() - n); return ymd(x); };
  const ahead = (n) => { const x = new Date(todayD); x.setDate(x.getDate() + n); return ymd(x); };

  React.useEffect(() => {
    let alive = true;
    (async () => {
      const [sessions, injuries, metrics, wins, goal, notes, photos] = await Promise.all([
        supabase.from('workout_sessions').select('id, started_at, completed_at')
          .eq('client_id', c.id).order('started_at', { ascending: false }).limit(8),
        supabase.from('client_injuries').select('id, muscle_group, laterality, severity').eq('client_id', c.id).is('resolved_at', null),
        supabase.from('body_metrics').select('weight_kg, body_fat_pct, recorded_at').eq('client_id', c.id)
          .gte('recorded_at', ago(120)).order('recorded_at', { ascending: true }),
        supabase.from('client_workouts')
          .select('scheduled_date, status, programme_days(programme_phases(name, programmes(name)))')
          .eq('client_id', c.id).gte('scheduled_date', ago(30)).lte('scheduled_date', ahead(7))
          .order('scheduled_date', { ascending: true }),
        supabase.from('client_goals').select('title, description, target_date').eq('client_id', c.id)
          .eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle(),
        // managed_clients has no notes columns — skip to avoid a 400.
        c.managed
          ? Promise.resolve({ data: null })
          : supabase.from(table).select('coach_notes, medical_notes').eq('id', c.id).maybeSingle(),
        supabase.from('progress_photos').select('taken_on', { count: 'exact' }).eq('client_id', c.id)
          .order('taken_on', { ascending: false }).limit(1),
      ]);
      if (!alive) return;
      setD({
        sessions: sessions.data || [],
        injuries: injuries.data || [],
        metrics: (metrics.data || []).filter(m => m.weight_kg != null || m.body_fat_pct != null),
        wins: wins.data || [],
        goal: goal.data || null,
        coachNotes: notes.data?.coach_notes || '',
        medicalNotes: notes.data?.medical_notes || '',
        photoCount: photos.count || 0,
        lastPhoto: photos.data?.[0]?.taken_on || null,
      });
    })();
    return () => { alive = false; };
  }, [c.id]);

  const saveNote = (field) => async (value) => {
    if (c.managed) return; // managed_clients has no notes columns
    await supabase.from(table).update({ [field]: value }).eq('id', c.id);
  };

  // ── Derived training stats ──
  const wins = d?.wins || [];
  const window7  = wins.filter(w => w.scheduled_date >= ago(6)  && w.scheduled_date <= today);
  const window30 = wins.filter(w => w.scheduled_date >= ago(29) && w.scheduled_date <= today);
  const nextWeek = wins.filter(w => w.scheduled_date >  today   && w.scheduled_date <= ahead(7));
  const tracked = (arr) => arr.filter(w => w.status === 'completed').length;
  const completed = wins.filter(w => w.status === 'completed' && w.scheduled_date <= today);
  const lastWin = completed.length ? completed[completed.length - 1] : null;
  const lastPhase = lastWin?.programme_days?.programme_phases;
  const lastLabel = lastPhase ? [lastPhase.programmes?.name, lastPhase.name].filter(Boolean).join(' · ') : null;
  const currentProg = (wins.find(w => w.scheduled_date >= today) || lastWin)?.programme_days?.programme_phases?.programmes?.name;

  // ── Goal ──
  const goal = d?.goal;
  const daysToGoal = goal?.target_date ? Math.round((new Date(goal.target_date) - todayD) / 86400000) : null;

  // ── Metrics ──
  const weights = (d?.metrics || []).map(m => m.weight_kg).filter(v => v != null).map(Number);
  const bodyfats = (d?.metrics || []).map(m => m.body_fat_pct).filter(v => v != null).map(Number);
  const latestW = weights.length ? weights[weights.length - 1] : null;
  const wDelta  = weights.length >= 2 ? +(weights[weights.length - 1] - weights[0]).toFixed(1) : null;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Assume control — full width */}
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

      <div className="ov-2col">
        <div className="ov-col">
      {/* Training */}
      <button onClick={() => onTab('training')} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
        <div className="card" style={{ padding: 14 }}>
          <div className="label" style={{ marginBottom: 12 }}>// TRAINING</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
            <TrainStat top="LAST 7 DAYS" big={d ? `${tracked(window7)}/${window7.length}` : '—'} sub="TRACKED" />
            <TrainStat top="LAST 30 DAYS" big={d ? `${tracked(window30)}/${window30.length}` : '—'} sub="TRACKED" divider />
            <TrainStat top="NEXT WEEK" big={d ? `${nextWeek.length}` : '—'} sub="ASSIGNED" divider />
          </div>
          {d && lastWin && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <Mono>LAST WORKOUT</Mono>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {lastLabel || 'Workout'}
                </div>
              </div>
              <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>{relDays(lastWin.scheduled_date)}</span>
            </div>
          )}
        </div>
      </button>

      {/* Body metrics overview */}
      <button onClick={() => onTab('data')} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div className="label">// BODY METRICS</div>
            <Mono>LAST 4 MONTHS</Mono>
          </div>
          {!d ? <Mono>LOADING…</Mono> : (
            <div style={{ display: 'grid', gap: 14 }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <div>
                    <Mono style={{ marginBottom: 2 }}>WEIGHT</Mono>
                    <div className="h-bold" style={{ fontSize: 22 }}>
                      {latestW != null ? <>{latestW}<span style={{ fontSize: 11, color: 'var(--text-3)' }}> kg</span></> : '—'}
                    </div>
                  </div>
                  {wDelta != null && wDelta !== 0 && (
                    <span className="mono" style={{ fontSize: 10, color: wDelta < 0 ? 'var(--accent)' : 'var(--c-amber)' }}>
                      {wDelta > 0 ? '▲' : '▼'} {Math.abs(wDelta)}kg
                    </span>
                  )}
                </div>
                {weights.length >= 2
                  ? <div style={{ marginTop: 6 }}><Sparkline values={weights} color="var(--accent)" /></div>
                  : <Mono style={{ marginTop: 6 }}>Not enough weigh-ins to chart yet</Mono>}
              </div>
              <div style={{ paddingTop: 10, borderTop: '1px solid var(--line)' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <Mono>BODY FAT</Mono>
                  <div className="h-bold" style={{ fontSize: 16 }}>
                    {bodyfats.length ? <>{bodyfats[bodyfats.length - 1]}<span style={{ fontSize: 10, color: 'var(--text-3)' }}>%</span></> : <span style={{ color: 'var(--text-3)', fontSize: 11 }}>No data</span>}
                  </div>
                </div>
                {bodyfats.length >= 2 && <div style={{ marginTop: 6 }}><Sparkline values={bodyfats} color="var(--c-amber)" height={32} /></div>}
              </div>
            </div>
          )}
        </div>
      </button>

      {/* Goal & countdown */}
      <button onClick={() => onTab('goals')} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
        <div className="card" style={{ padding: 14 }}>
          <div className="label" style={{ marginBottom: 8 }}>// GOAL &amp; COUNTDOWN</div>
          {!d ? <Mono>LOADING…</Mono> : goal ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="h-bold" style={{ fontSize: 15, lineHeight: 1.25 }}>{goal.title}</div>
                {goal.description && (
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {goal.description}
                  </div>
                )}
              </div>
              {daysToGoal != null && (
                <div style={{ textAlign: 'center', flexShrink: 0 }}>
                  <div className="h-bold" style={{ fontSize: 26, lineHeight: 1, color: daysToGoal < 0 ? 'var(--c-coral)' : 'var(--accent)' }}>{Math.abs(daysToGoal)}</div>
                  <Mono style={{ marginTop: 3 }}>{daysToGoal < 0 ? 'DAYS OVER' : 'DAYS LEFT'}</Mono>
                </div>
              )}
            </div>
          ) : <Mono>No goal set — tap to add one</Mono>}
        </div>
      </button>
        </div>

        <div className="ov-col">
      {/* Coach notes — the jot-down area */}
      <NoteCard
        label="// NOTES"
        placeholder="Jot down anything about this client — preferences, cues, conversations, reminders…"
        loading={!d}
        initial={d?.coachNotes || ''}
        onSave={saveNote('coach_notes')}
      />

      {/* Limitations / injuries */}
      <NoteCard
        label="// LIMITATIONS / INJURIES"
        placeholder={`Add any medical note or injury about ${c.name.split(' ')[0]}…`}
        accent="var(--c-coral)"
        loading={!d}
        initial={d?.medicalNotes || ''}
        onSave={saveNote('medical_notes')}
      >
        {d && d.injuries.length > 0 && (
          <button onClick={(e) => { e.stopPropagation(); onTab('body'); }} style={{ all: 'unset', cursor: 'pointer', display: 'block', marginTop: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {d.injuries.slice(0, 8).map(inj => (
                <span key={inj.id} className="mono" style={{
                  fontSize: 9, fontWeight: 700, padding: '4px 8px', borderRadius: 999,
                  color: SEV_COLOR[inj.severity],
                  background: `color-mix(in srgb, ${SEV_COLOR[inj.severity]} 12%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${SEV_COLOR[inj.severity]} 35%, transparent)`,
                }}>{injuryTitle(inj)}</span>
              ))}
            </div>
          </button>
        )}
      </NoteCard>

      {/* Progress photo */}
      <button onClick={() => onTab('data')} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
        <div className="card" style={{ padding: 14 }}>
          <div className="label" style={{ marginBottom: 8 }}>// PROGRESS PHOTOS</div>
          {!d ? <Mono>LOADING…</Mono> : d.photoCount > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="h-bold" style={{ fontSize: 18 }}>{d.photoCount}<span style={{ fontSize: 11, color: 'var(--text-3)' }}> photo{d.photoCount === 1 ? '' : 's'}</span></div>
              {d.lastPhoto && <Mono>LATEST · {new Date(d.lastPhoto).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</Mono>}
            </div>
          ) : <Mono>{c.name.split(' ')[0]} hasn’t uploaded any photos.</Mono>}
        </div>
      </button>

      {/* Profile */}
      <div className="card" style={{ padding: 14 }}>
        <div className="label" style={{ marginBottom: 10 }}>// PROFILE</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {c.email && <ProfileRow k="EMAIL" v={c.email} />}
          {c.timezone && <ProfileRow k="TIMEZONE" v={c.timezone} />}
          <ProfileRow k="PROGRAMME" v={currentProg || 'None assigned'} accent={!!currentProg} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
          <KpiCard label="STREAK"   value={c.streak || 0} unit="d" color="var(--c-amber)" />
          <KpiCard label="CREDITS"  value={c.credits ?? 0}         color="var(--accent-2)" />
          <KpiCard label="INJURIES" value={d ? d.injuries.length : '—'} color={d && d.injuries.length ? 'var(--c-coral)' : 'var(--text-2)'} />
        </div>
      </div>
        </div>
      </div>

      {/* Updates — full-width feed below both columns */}
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="label">// UPDATES</div>
        {!d && <Mono>LOADING…</Mono>}
        {d && d.sessions.length === 0 && <EmptyState>No sessions logged yet</EmptyState>}
        {d?.sessions.map(s => {
          const dur = s.completed_at ? Math.round((new Date(s.completed_at) - new Date(s.started_at)) / 60000) : null;
          return (
            <div key={s.id} className="card" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name.split(' ')[0]} logged a workout for {new Date(s.started_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>
                {relDays(s.started_at)}{dur != null && <> · {dur}M</>}{s.completed_at && <span style={{ color: 'var(--accent)', marginLeft: 6 }}>✓</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrainStat({ top, big, sub, divider }) {
  return (
    <div style={{ textAlign: 'center', padding: '0 4px', borderLeft: divider ? '1px solid var(--line)' : 'none' }}>
      <Mono style={{ fontSize: 8 }}>{top}</Mono>
      <div className="h-bold" style={{ fontSize: 22, margin: '4px 0 2px', color: 'var(--accent)', lineHeight: 1 }}>{big}</div>
      <Mono style={{ fontSize: 8, color: 'var(--accent-2)' }}>{sub}</Mono>
    </div>
  );
}

function ProfileRow({ k, v, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
      <Mono style={{ flexShrink: 0 }}>{k}</Mono>
      <span style={{ fontSize: 12, color: accent ? 'var(--accent)' : 'var(--text-2)', fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right' }}>{v}</span>
    </div>
  );
}

// Tiny inline area sparkline for the metrics overview.
function Sparkline({ values, color = 'var(--accent)', height = 44 }) {
  const vals = (values || []).filter(v => v != null && !isNaN(v));
  if (vals.length < 2) return null;
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const w = 100, pad = 4;
  const pts = vals.map((v, i) => [
    (i / (vals.length - 1)) * w,
    height - pad - ((v - min) / range) * (height - pad * 2),
  ]);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L ${w} ${height} L 0 ${height} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" width="100%" height={height} style={{ display: 'block' }}>
      <path d={area} fill={`color-mix(in srgb, ${color} 14%, transparent)`} stroke="none" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// Editable, auto-saving note card (saves on blur). Optional children render
// below the textarea (e.g. injury chips).
function NoteCard({ label, placeholder, initial, onSave, loading, accent, children }) {
  const [val, setVal]     = React.useState(initial || '');
  const [dirty, setDirty] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const col = accent || 'var(--accent)';

  React.useEffect(() => { setVal(initial || ''); setDirty(false); }, [initial]);

  const commit = async () => {
    if (!dirty) return;
    await onSave(val);
    setDirty(false); setSaved(true); setTimeout(() => setSaved(false), 1800);
  };

  return (
    <div className="card" style={{ padding: 14, borderColor: accent ? `color-mix(in srgb, ${accent} 30%, var(--line))` : 'var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div className="label" style={{ color: accent || undefined }}>{label}</div>
        {saved ? <Mono style={{ color: col }}>✓ SAVED</Mono> : dirty ? <Mono style={{ color: 'var(--c-amber)' }}>UNSAVED</Mono> : null}
      </div>
      {loading ? <Mono>LOADING…</Mono> : (
        <textarea
          value={val}
          onChange={e => { setVal(e.target.value); setDirty(true); }}
          onBlur={commit}
          placeholder={placeholder}
          rows={3}
          style={{ ...fieldSt, resize: 'vertical', minHeight: 64 }}
        />
      )}
      {children}
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
  const [weeks, setWeeks]   = React.useState(4);
  const [anchor, setAnchor] = React.useState(() => mondayOf(new Date()));
  const [workouts, setWorkouts] = React.useState([]);
  const [showAssign, setShowAssign] = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);
  const [editing, setEditing] = React.useState(null);

  const loadWorkouts = React.useCallback(() => {
    const start = new Date(anchor);
    const end = new Date(anchor); end.setDate(end.getDate() + weeks * 7);
    supabase.from('client_workouts')
      .select('id, scheduled_date, status, programme_days(id, day_of_week, week_index, programme_phases(id, name, phase_index, programme_id, programmes(id, name)), workout_sections(title, kind, sort_order, section_exercises(id)))')
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

  if (editing) return (
    <EditWorkout
      w={editing} clientId={c.id} programmes={programmes} trainerId={trainerId}
      onClose={() => setEditing(null)}
      onSaved={() => { setEditing(null); loadWorkouts(); onChanged?.(); }}
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
        <button onClick={() => setShowImport(true)} style={navBtnSt}>IMPORT</button>
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
            <CalendarWeek key={wk} start={(() => { const d = new Date(anchor); d.setDate(d.getDate() + wk * 7); return d; })()} wMap={wMap} onSelect={setEditing} />
          ))}
        </div>
      </div>

      {showImport && (
        <ImportHistory clientId={c.id} clientName={c.name} trainerId={trainerId}
          onClose={() => setShowImport(false)}
          onImported={() => { loadWorkouts(); onChanged?.(); }} />
      )}
    </div>
  );
}

function CalendarWeek({ start, wMap, onSelect }) {
  const today = ymd(new Date());
  const DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  // Label any new month that begins in this week (the 1st, or the week's first
  // day if the month rolled over mid-week before it) so the boundary is obvious.
  const monthMarks = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(d.getDate() + i);
    if (i === 0 || d.getDate() === 1) monthMarks.push({ col: i, label: MONTHS[d.getMonth()], year: d.getFullYear() });
  }
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {/* Month band — shows which month(s) this week falls in */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {Array.from({ length: 7 }, (_, i) => {
          const mark = monthMarks.find(m => m.col === i);
          const isNewMonth = i !== 0 && mark; // the actual 1st-of-month boundary
          return (
            <div key={i} className="mono" style={{
              fontSize: 8, letterSpacing: '0.12em', fontWeight: 700,
              color: mark ? (isNewMonth ? 'var(--accent)' : 'var(--text-2)') : 'transparent',
              paddingLeft: 2, paddingBottom: 1,
              borderLeft: isNewMonth ? '2px solid var(--accent)' : '2px solid transparent',
            }}>
              {mark ? mark.label : '·'}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {Array.from({ length: 7 }, (_, i) => {
          const d = new Date(start); d.setDate(d.getDate() + i);
          const ds = ymd(d);
          const isToday = ds === today;
          const firstOfMonth = d.getDate() === 1;
          const ws = wMap[ds] || [];
          return (
            <div key={i} style={{
              minHeight: 150, borderRadius: 10, padding: 8,
              background: isToday ? 'var(--accent-soft)' : 'var(--bg-2)',
              border: `1px solid ${isToday ? 'var(--accent)' : 'var(--line)'}`,
              borderLeft: firstOfMonth ? '3px solid var(--accent)' : `1px solid ${isToday ? 'var(--accent)' : 'var(--line)'}`,
            }}>
              <div className="mono" style={{ fontSize: 8.5, letterSpacing: '0.1em', color: isToday ? 'var(--accent)' : 'var(--text-3)', marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>{DOW[i]}</span>
                <span style={{ fontWeight: 700, color: firstOfMonth ? 'var(--accent)' : isToday ? 'var(--accent)' : 'var(--text-2)' }}>
                  {firstOfMonth ? `${MONTHS[d.getMonth()]} ${d.getDate()}` : d.getDate()}
                </span>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {ws.map(w => <WorkoutCell key={w.id} w={w} onClick={() => onSelect(w)} />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WorkoutCell({ w, onClick }) {
  const day = w.programme_days;
  const phase = day?.programme_phases;
  const done = w.status === 'completed';
  const sections = [...(day?.workout_sections || [])].sort((a, b) => a.sort_order - b.sort_order);
  const totalEx = sections.reduce((n, s) => n + (s.section_exercises?.length || 0), 0);
  const shown = sections.slice(0, 2);
  const shownEx = shown.reduce((n, s) => n + (s.section_exercises?.length || 0), 0);
  const more = totalEx - shownEx;

  return (
    <div onClick={onClick} style={{
      borderRadius: 8, padding: 8, background: 'var(--bg-1)', cursor: onClick ? 'pointer' : 'default',
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

// Coach-side edit of a single scheduled workout — open it in the full
// programme builder, reschedule it, or remove it, straight from the calendar.
function EditWorkout({ w, clientId, programmes, trainerId, onClose, onSaved }) {
  const day = w.programme_days;
  const phase = day?.programme_phases;
  const done = w.status === 'completed';
  const [date, setDate]           = React.useState(w.scheduled_date);
  const [saving, setSaving]       = React.useState(false);
  const [removeConfirm, setRemoveConfirm] = React.useState(false);
  const [builderOpen, setBuilderOpen] = React.useState(false);
  const [logOpen, setLogOpen]     = React.useState(false);
  const sections = [...(day?.workout_sections || [])].sort((a, b) => a.sort_order - b.sort_order);

  // The full shaped programme (with phaseList) this workout came from.
  const prog = (programmes || []).find(p => p.id === phase?.programme_id);
  const phaseIdx = Math.max(0, (prog?.phaseList || []).findIndex(ph => ph.id === phase?.id));

  if (builderOpen && prog) return (
    <ProgrammeBuilder
      programme={prog} trainerId={trainerId}
      startAt={{ phaseIdx, weekIdx: day?.week_index ?? 0, dayIdx: day?.day_of_week ?? 0 }}
      onClose={() => onSaved()}
    />
  );

  if (logOpen) return (
    <LoggedSetsEditor clientId={clientId} dayId={day?.id} phaseName={phase?.name}
      onClose={() => setLogOpen(false)} onSaved={() => { setLogOpen(false); onSaved(); }} />
  );

  const save = async () => {
    if (!date || date === w.scheduled_date || saving) return;
    setSaving(true);
    await supabase.from('client_workouts').update({ scheduled_date: date }).eq('id', w.id);
    setSaving(false);
    onSaved();
  };

  const remove = async () => {
    if (!removeConfirm) { setRemoveConfirm(true); return; }
    setSaving(true);
    await supabase.from('client_workouts').delete().eq('id', w.id);
    setSaving(false);
    onSaved();
  };

  return (
    <div className="card" style={{ padding: 14, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="label">// EDIT WORKOUT</div>
        <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)' }}><IconX2 size={14}/></button>
      </div>

      <div style={{ borderRadius: 8, padding: 10, background: 'var(--bg-2)', border: '1px solid var(--line)' }}>
        <div className="mono" style={{ fontSize: 9, color: done ? 'var(--accent)' : 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 4 }}>
          {(phase?.name || 'WORKOUT').toUpperCase()}{done ? ' · ✓ COMPLETED' : ''}
        </div>
        {sections.length === 0 && <Mono>No exercises</Mono>}
        {sections.map((s, i) => (
          <div key={i} style={{ fontSize: 11, marginTop: 2 }}>
            {s.title || SECTION_LABEL[s.kind] || 'Block'} · {(s.section_exercises?.length || 0)} ex
          </div>
        ))}
      </div>

      {done && (
        <div>
          <button onClick={() => setLogOpen(true)} className="btn-primary"
            style={{ width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <IconCheck size={13} sw={3}/> EDIT LOGGED RESULTS →
          </button>
          <Mono style={{ marginTop: 6 }}>Amend the sets this client actually logged — fix typos in weights or reps.</Mono>
        </div>
      )}

      <div>
        <button onClick={() => setBuilderOpen(true)} disabled={!prog} className="btn-primary"
          style={{ width: '100%', boxSizing: 'border-box', opacity: prog ? 1 : 0.4, pointerEvents: prog ? 'auto' : 'none' }}>
          ✎ EDIT IN PROGRAMME BUILDER →
        </button>
        <Mono style={{ marginTop: 6 }}>
          {prog
            ? 'Edits the programme template — all clients assigned this workout see the changes.'
            : 'Programme not found — it may have been deleted.'}
        </Mono>
      </div>

      <FieldLabel label="SCHEDULED DATE">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={fieldSt}/>
      </FieldLabel>

      <button onClick={save} disabled={saving || date === w.scheduled_date} className="mono" style={{
        all: 'unset', cursor: date !== w.scheduled_date ? 'pointer' : 'default', textAlign: 'center', padding: 10, borderRadius: 8,
        background: 'transparent',
        border: `1px solid color-mix(in srgb, var(--accent) ${date !== w.scheduled_date ? 60 : 30}%, var(--line))`,
        color: date !== w.scheduled_date ? 'var(--accent)' : 'var(--text-3)',
        fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
        opacity: date !== w.scheduled_date ? 1 : 0.5,
      }}>
        {saving ? 'SAVING…' : 'SAVE NEW DATE'}
      </button>

      <button onClick={remove} disabled={saving} className="mono" style={{
        all: 'unset', cursor: 'pointer', textAlign: 'center', padding: 10, borderRadius: 8,
        background: 'transparent',
        border: `1px solid color-mix(in srgb, var(--c-coral) ${removeConfirm ? 60 : 35}%, var(--line))`,
        color: removeConfirm ? 'var(--c-coral)' : 'var(--text-3)',
        fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
      }}>
        {removeConfirm ? 'CONFIRM REMOVE — TAP AGAIN' : 'REMOVE FROM CALENDAR'}
      </button>
    </div>
  );
}

// Amend a completed session's logged sets (data-quality fixes). Loads the most
// recent completed session for this day + client and writes edits back.
function LoggedSetsEditor({ clientId, dayId, phaseName, onClose, onSaved }) {
  const [state, setState] = React.useState(null); // null=loading | 'none' | { sessionId, exercises }
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty]   = React.useState(false);

  React.useEffect(() => {
    if (!clientId || !dayId) { setState('none'); return; }
    supabase.from('workout_sessions')
      .select('id, completed_at, logged_sets(id, exercise_id, exercise_name, set_index, actual_reps, actual_weight_kg, actual_band, actual_time_secs, intensity, section_exercises(name))')
      .eq('client_id', clientId).eq('day_id', dayId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => {
        if (!data || !(data.logged_sets || []).length) { setState('none'); return; }
        const map = new Map();
        [...data.logged_sets].sort((a, b) => a.set_index - b.set_index).forEach(ls => {
          const key = ls.exercise_id || `n:${ls.exercise_name}`;
          const name = ls.section_exercises?.name || ls.exercise_name || 'Exercise';
          if (!map.has(key)) map.set(key, { key, name, sets: [] });
          map.get(key).sets.push({
            id: ls.id,
            reps: ls.actual_reps ?? '', kg: ls.actual_weight_kg ?? '', band: ls.actual_band || '',
            timeSecs: ls.actual_time_secs ?? null, intensity: ls.intensity ?? '',
            timed: !!ls.actual_time_secs, banded: !!ls.actual_band, _deleted: false,
          });
        });
        setState({ sessionId: data.id, exercises: [...map.values()] });
      });
  }, [clientId, dayId]);

  const upd = (exi, si, patch) => {
    setState(st => ({ ...st, exercises: st.exercises.map((ex, i) => i !== exi ? ex : ({ ...ex, sets: ex.sets.map((s, j) => j === si ? { ...s, ...patch } : s) })) }));
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const rows = state.exercises.flatMap(ex => ex.sets);
    for (const s of rows) {
      if (s._deleted) { await supabase.from('logged_sets').delete().eq('id', s.id); continue; }
      await supabase.from('logged_sets').update({
        actual_reps: s.timed ? null : (s.reps === '' ? null : parseInt(s.reps) || 0),
        actual_weight_kg: (s.kg === '' || s.banded) ? null : (parseFloat(s.kg) || null),
        actual_band: s.band || null,
        actual_time_secs: s.timed ? (s.timeSecs || null) : null,
        intensity: s.intensity === '' ? null : parseInt(s.intensity),
      }).eq('id', s.id);
    }
    setSaving(false);
    toast('Results updated');
    onSaved();
  };

  const cell = { ...fieldSt, padding: '7px 8px', fontSize: 12, textAlign: 'center' };

  return (
    <div className="card" style={{ padding: 14, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="label">// EDIT LOGGED RESULTS{phaseName ? ` — ${phaseName.toUpperCase()}` : ''}</div>
        <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)' }}><IconX2 size={14}/></button>
      </div>

      {state === null && <Mono>LOADING LOGGED SETS…</Mono>}
      {state === 'none' && (
        <div className="card" style={{ padding: 18, textAlign: 'center', background: 'var(--bg-2)' }}>
          <Mono style={{ lineHeight: 1.7 }}>NO LOGGED SETS FOUND<br/><span style={{ fontSize: 9 }}>This session was completed without logged sets, or hasn't been logged yet.</span></Mono>
        </div>
      )}

      {state && state !== 'none' && (
        <>
          {state.exercises.map((ex, exi) => (
            <div key={ex.key} style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{ex.name}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 1fr 44px 26px', gap: 6, alignItems: 'center' }}>
                <Mono style={{ fontSize: 8 }}>SET</Mono>
                <Mono style={{ fontSize: 8 }}>{ex.sets[0]?.timed ? 'TIME(S)' : ex.sets[0]?.banded ? 'BAND' : 'KG'}</Mono>
                <Mono style={{ fontSize: 8 }}>{ex.sets[0]?.timed ? 'KG' : 'REPS'}</Mono>
                <Mono style={{ fontSize: 8 }}>RPE</Mono>
                <span/>
              </div>
              {ex.sets.map((s, si) => s._deleted ? (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.5 }}>
                  <Mono style={{ flex: 1 }}>SET {si + 1} — removed</Mono>
                  <button onClick={() => upd(exi, si, { _deleted: false })} className="mono" style={{ all: 'unset', cursor: 'pointer', fontSize: 9, color: 'var(--accent)' }}>UNDO</button>
                </div>
              ) : (
                <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 1fr 44px 26px', gap: 6, alignItems: 'center' }}>
                  <Mono style={{ textAlign: 'center' }}>{si + 1}</Mono>
                  {s.timed
                    ? <input type="number" value={s.timeSecs ?? ''} onChange={e => upd(exi, si, { timeSecs: e.target.value === '' ? null : parseInt(e.target.value) || 0 })} style={cell}/>
                    : s.banded
                      ? <input value={s.band} onChange={e => upd(exi, si, { band: e.target.value })} style={cell}/>
                      : <input type="number" inputMode="decimal" value={s.kg} onChange={e => upd(exi, si, { kg: e.target.value })} style={cell}/>}
                  <input type="number" inputMode="numeric" value={s.timed ? (s.kg ?? '') : s.reps} onChange={e => upd(exi, si, s.timed ? { kg: e.target.value } : { reps: e.target.value })} style={cell}/>
                  <input type="number" inputMode="numeric" value={s.intensity} onChange={e => upd(exi, si, { intensity: e.target.value })} style={cell}/>
                  <button onClick={() => upd(exi, si, { _deleted: true })} aria-label="Remove set" style={{ all: 'unset', cursor: 'pointer', color: 'var(--c-coral)', display: 'grid', placeItems: 'center' }}><IconX2 size={12}/></button>
                </div>
              ))}
            </div>
          ))}

          <button onClick={save} disabled={saving || !dirty} className="btn-primary" style={{ opacity: dirty ? 1 : 0.4, pointerEvents: dirty ? 'auto' : 'none' }}>
            {saving ? 'SAVING…' : 'SAVE CHANGES →'}
          </button>
        </>
      )}
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
  const injuryHits = React.useCallback((group, anat) =>
    activeInjuries.filter(inj => inj.muscle_group === group && (inj.laterality === anat || inj.laterality === 'both' || anat === 'both')),
  [activeInjuries]);
  const injuryIntensity = React.useCallback((group, anat) => {
    const hits = injuryHits(group, anat);
    if (!hits.length) return 0;
    return Math.max(...hits.map(inj => sevVal[inj.severity] || 0.5));
  }, [injuryHits]);
  // Injured regions glow in their severity colour; the rest stay grey.
  const injuryTint = React.useCallback((group, anat) => {
    const hits = injuryHits(group, anat);
    if (!hits.length) return null;
    const worst = hits.reduce((a, b) => (sevVal[b.severity] || 0) > (sevVal[a.severity] || 0) ? b : a);
    return SEV_COLOR[worst.severity];
  }, [injuryHits]);

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
    <div style={{ display: 'grid', gap: 10, maxWidth: 600, margin: '0 auto' }}>
      <div className="body-col">
      {/* Mode toggle — large */}
      <div style={{ display: 'flex', gap: 8 }}>
        <BigToggle active={isInjuryMode}  onClick={() => { setMode('injuries'); setPicked(null); }}>INJURIES</BigToggle>
        <BigToggle active={!isInjuryMode} onClick={() => { setMode('worked');   setPicked(null); setEditPanel(null); }}>TRAINED</BigToggle>
      </div>
      {/* Front / back — compact sliding toggle */}
      <SideSlider side={side} onChange={(s) => { setSide(s); setPicked(null); }} />

      {/* Body map */}
      <BodyMap
        side={side}
        data={isInjuryMode ? allGroupsData : workedData}
        intensity={isInjuryMode ? injuryIntensity : workedIntensity}
        picked={picked}
        slugMap={isInjuryMode ? injurySlugMap : undefined}
        perSide={isInjuryMode}
        neutralBase={isInjuryMode}
        tintFor={isInjuryMode ? injuryTint : undefined}
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
      </div>

      <div className="body-col">
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
  // The coach sees exactly what the client sees in their Metrics tab. Cap the
  // width on desktop so the charts stay readable rather than stretching edge-to-edge.
  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <Progress userId={c.id} go={() => {}} embedded />
    </div>
  );
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
  const [templates, setTemplates] = React.useState([]);

  const reload = () =>
    supabase.from('client_tasks').select('*').eq('client_id', c.id)
      .order('due_date', { ascending: true })
      .then(({ data }) => setTasks(data || []));

  React.useEffect(() => {
    reload();
    loadForms().then(setForms);
    supabase.from('task_templates').select('*').eq('trainer_id', trainerId)
      .order('sort_order').order('created_at').then(({ data }) => setTemplates(data || []));
  }, [c.id]);

  // Assign a saved template in one tap.
  const applyTemplate = async (t) => {
    await supabase.from('client_tasks').insert({
      client_id: c.id, trainer_id: trainerId,
      title: t.title, kind: t.kind, due_date: t.due_date || null, form_id: t.kind === 'form' ? t.form_id : null,
    });
    notify({ recipientId: c.id, actorId: trainerId, kind: t.kind === 'form' ? 'form' : 'task',
      title: t.kind === 'form' ? 'New form to complete' : 'New task assigned', body: t.title, link: { screen: 'dashboard' } });
    reload();
  };

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

      {templates.length > 0 && (
        <div>
          <div className="label" style={{ marginBottom: 6 }}>// FROM TEMPLATE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {templates.map(t => {
              const col = TASK_COLOR[t.kind] || 'var(--accent)';
              return (
                <button key={t.id} onClick={() => applyTemplate(t)} className="mono" style={{
                  all: 'unset', cursor: 'pointer', fontSize: 9.5, fontWeight: 700, padding: '6px 10px', borderRadius: 999,
                  background: `color-mix(in srgb, ${col} 14%, transparent)`, color: col,
                  border: `1px solid color-mix(in srgb, ${col} 40%, transparent)`,
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                }}><IconPlus size={10}/> {t.title}</button>
              );
            })}
          </div>
        </div>
      )}

      {adding && (
        <div className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
          <FieldLabel label="TASK TITLE">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Log today's weight" style={fieldSt}/>
          </FieldLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <FieldLabel label="TYPE">
              <div style={{ display: 'flex', gap: 4 }}>
                {['check','log','photo','form'].map(k => {
                  const col = TASK_COLOR[k] || 'var(--accent)';
                  return (
                    <button key={k} onClick={() => setKind(k)} style={{
                      all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
                      padding: '7px 0', borderRadius: 7, fontSize: 8.5, fontFamily: 'JetBrains Mono', fontWeight: 700,
                      background: kind === k ? `color-mix(in srgb, ${col} 16%, transparent)` : 'var(--bg-3)',
                      border: `1px solid ${kind === k ? col : 'var(--line)'}`,
                      color: kind === k ? col : 'var(--text-3)',
                    }}>{k.toUpperCase()}</button>
                  );
                })}
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
  const col = TASK_COLOR[t.kind] || 'var(--accent)';
  return (
    <div className="card" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, opacity: faded ? 0.55 : 1, borderLeft: `2px solid ${col}` }}>
      <button onClick={() => onToggle(t)} style={{
        all: 'unset', cursor: 'pointer', width: 22, height: 22, borderRadius: 6, flexShrink: 0,
        background: t.completed_at ? col : `color-mix(in srgb, ${col} 12%, var(--bg-3))`,
        border: `1px solid ${t.completed_at ? col : `color-mix(in srgb, ${col} 45%, var(--line-strong))`}`,
        display: 'grid', placeItems: 'center', color: 'var(--on-accent)',
      }}>
        {t.completed_at && <IconCheck size={11} sw={2.5}/>}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textDecoration: t.completed_at ? 'line-through' : 'none', color: 'var(--text)' }}>{t.title}</div>
        <div className="mono" style={{ fontSize: 9, color: col, marginTop: 2, fontWeight: 700 }}>
          {TASK_ICON[t.kind]} {t.kind.toUpperCase()}<span style={{ color: 'var(--text-3)', fontWeight: 400 }}>{t.due_date ? ` · DUE ${new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}</span>
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
    toast(goal ? 'Goal updated' : 'Goal set');
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
const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function AssignWorkout({ clientId, clientName, trainerId, programmes, onClose, onAssigned }) {
  const [mode, setMode]         = React.useState('all'); // 'all' = whole programme, 'day' = single day
  const [progId, setProgId]     = React.useState(null);
  const [phaseIdx, setPhaseIdx] = React.useState(0);
  const [week, setWeek]         = React.useState(1);
  const [days, setDays]         = React.useState([]);
  const [loading, setLoading]   = React.useState(false);
  const [dayId, setDayId]       = React.useState(null);
  const [date, setDate]         = React.useState(() => new Date().toISOString().slice(0, 10));
  const [phaseSel, setPhaseSel] = React.useState({}); // phaseId → included in bulk assign
  const [allDays, setAllDays]   = React.useState([]); // [{ dayId, dayOffset }] for bulk assign
  const [loadingAll, setLoadingAll] = React.useState(false);
  const [saving, setSaving]     = React.useState(false);
  const [saved, setSaved]       = React.useState(false);
  const [savedCount, setSavedCount] = React.useState(0);

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

  // Default every phase to included whenever the programme changes.
  React.useEffect(() => {
    if (!prog) { setPhaseSel({}); return; }
    setPhaseSel(Object.fromEntries(prog.phaseList.map(ph => [ph.id, true])));
  }, [prog?.id]);

  // Fetch every programme_days row across the selected phases and work out,
  // for each, how many days after the start-of-week-1 it should land on.
  React.useEffect(() => {
    if (mode !== 'all' || !prog) { setAllDays([]); return; }
    const selected = prog.phaseList.filter(ph => phaseSel[ph.id]);
    if (!selected.length) { setAllDays([]); return; }
    setLoadingAll(true);
    supabase.from('programme_days').select('id, phase_id, week_index, day_of_week')
      .in('phase_id', selected.map(ph => ph.id))
      .then(({ data }) => {
        const byPhase = {};
        (data || []).forEach(d => (byPhase[d.phase_id] = byPhase[d.phase_id] || []).push(d));
        let offset = 0;
        const rows = [];
        prog.phaseList.forEach(ph => {
          if (!phaseSel[ph.id]) return;
          (byPhase[ph.id] || []).forEach(d => rows.push({ dayId: d.id, dayOffset: (offset + d.week_index) * 7 + d.day_of_week }));
          offset += ph.weeks || 0;
        });
        rows.sort((a, b) => a.dayOffset - b.dayOffset);
        setAllDays(rows);
        setLoadingAll(false);
      });
  }, [mode, prog?.id, phaseSel]);

  const assign = async () => {
    if (!dayId || !date || saving) return;
    setSaving(true);
    await supabase.from('client_workouts').insert({ client_id: clientId, trainer_id: trainerId, day_id: dayId, scheduled_date: date });
    setSaving(false); setSavedCount(1); setSaved(true);
    setTimeout(() => onAssigned(), 1400);
  };

  const assignAll = async () => {
    if (!allDays.length || !date || saving) return;
    setSaving(true);
    const monday = mondayOf(new Date(`${date}T00:00:00`));
    const rows = allDays.map(r => {
      const d = new Date(monday); d.setDate(d.getDate() + r.dayOffset);
      return { client_id: clientId, trainer_id: trainerId, day_id: r.dayId, scheduled_date: ymd(d) };
    });
    await supabase.from('client_workouts').insert(rows);
    setSaving(false); setSavedCount(rows.length); setSaved(true);
    setTimeout(() => onAssigned(), 1400);
  };

  if (saved) return (
    <div style={{ padding: 32, textAlign: 'center', color: 'var(--accent)', fontFamily: 'JetBrains Mono', fontWeight: 700, letterSpacing: '0.14em', fontSize: 16 }}>
      ✓ {savedCount} WORKOUT{savedCount === 1 ? '' : 'S'} ASSIGNED
    </div>
  );

  return (
    <div className="card" style={{ padding: 14, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="label">// ASSIGN WORKOUT — {clientName.toUpperCase()}</div>
        <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)' }}><IconX2 size={14}/></button>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <ToggleBtn active={mode === 'all'} onClick={() => { setMode('all'); setDayId(null); }}>WHOLE PROGRAMME</ToggleBtn>
        <ToggleBtn active={mode === 'day'} onClick={() => setMode('day')}>SINGLE DAY</ToggleBtn>
      </div>

      {/* Programme select */}
      <FieldLabel label="PROGRAMME">
        <select value={progId || ''} onChange={e => { setProgId(e.target.value || null); setPhaseIdx(0); setWeek(1); setDayId(null); }} style={{ ...fieldSt, appearance: 'auto' }}>
          <option value="">— Select programme —</option>
          {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </FieldLabel>

      {prog && mode === 'all' && (
        <>
          <FieldLabel label="PHASES TO ASSIGN">
            <div style={{ display: 'grid', gap: 6 }}>
              {prog.phaseList.map(ph => (
                <button key={ph.id} onClick={() => setPhaseSel(s => ({ ...s, [ph.id]: !s[ph.id] }))} style={{
                  all: 'unset', cursor: 'pointer', padding: '8px 10px', borderRadius: 8,
                  background: phaseSel[ph.id] ? 'var(--accent-soft)' : 'var(--bg-3)',
                  border: `1px solid ${phaseSel[ph.id] ? 'var(--accent)' : 'var(--line)'}`,
                  display: 'flex', gap: 8, alignItems: 'center',
                }}>
                  <span style={{ flex: 1, fontSize: 11 }}>{ph.name} <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>· {ph.weeks || 0}WK</span></span>
                  {phaseSel[ph.id] && <IconCheck size={12} style={{ color: 'var(--accent)', flexShrink: 0 }}/>}
                </button>
              ))}
            </div>
          </FieldLabel>

          <FieldLabel label="START DATE (WEEK 1, DAY 1)">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={fieldSt}/>
            <Mono style={{ marginTop: 6 }}>Aligned to the Monday of the selected week</Mono>
          </FieldLabel>

          {loadingAll && <Mono>CALCULATING SCHEDULE…</Mono>}

          <button onClick={assignAll} disabled={!allDays.length || !date || saving} className="btn-primary"
            style={{ opacity: allDays.length && date ? 1 : 0.4, pointerEvents: allDays.length && date ? 'auto' : 'none' }}>
            {saving ? 'ASSIGNING…' : allDays.length ? `ASSIGN ${allDays.length} WORKOUT${allDays.length === 1 ? '' : 'S'} →` : 'SELECT AT LEAST ONE PHASE'}
          </button>
        </>
      )}

      {prog && mode === 'day' && (
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
        </>
      )}
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
