import React from 'react'
import { supabase } from '../lib/supabase'
import { loadMuscleVolume } from '../lib/muscleVolume'
import { Hex, HexBackButton } from '../components/hex'
import { BodyMap } from './Progress'
import { MUSCLE_BODY } from '../data/musclePaths'
import { IconPlus, IconCheck, IconX2 } from '../components/icons'

// ── Constants ────────────────────────────────────────────────────
const SEV_COLOR  = { mild: 'var(--c-amber)', moderate: 'var(--c-coral)', severe: '#d93434' };
const SEV_LABEL  = { mild: 'MILD', moderate: 'MODERATE', severe: 'SEVERE' };
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
        <button onClick={() => { onClose(); go('clientview', { clientId: c.id, clientName: c.name }); }}
          className="mono" style={{
            all: 'unset', cursor: 'pointer', fontSize: 9, letterSpacing: '0.12em',
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
        {tab === 'overview' && <OverviewTab  c={c} />}
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

// ── OVERVIEW ─────────────────────────────────────────────────────
function OverviewTab({ c }) {
  const [sessions, setSessions] = React.useState(null);
  React.useEffect(() => {
    supabase.from('workout_sessions')
      .select('id, started_at, finished_at')
      .eq('client_id', c.id)
      .order('started_at', { ascending: false })
      .limit(6)
      .then(({ data }) => setSessions(data || []));
  }, [c.id]);

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        <KpiCard label="STREAK"     value={c.streak || 0}        unit="d"        color="var(--c-amber)" />
        <KpiCard label="THIS WEEK"  value={c.sessionsThisWeek||0} unit="sessions" color="var(--accent)" />
        <KpiCard label="LAST SEEN"  value={c.lastSeen || '—'}    color="var(--text-2)" />
      </div>

      <div className="label">// RECENT SESSIONS</div>
      {sessions === null && <Mono>LOADING…</Mono>}
      {sessions?.length === 0 && <EmptyState>No sessions logged yet</EmptyState>}
      {sessions?.map(s => {
        const dur = s.finished_at ? Math.round((new Date(s.finished_at) - new Date(s.started_at)) / 60000) : null;
        return (
          <div key={s.id} className="card" style={{ padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 600 }}>
              {new Date(s.started_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>
              {dur ? `${dur} MIN` : 'IN PROGRESS'} <span style={{ color: 'var(--accent)', marginLeft: 6 }}>✓</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── TRAINING ─────────────────────────────────────────────────────
function TrainingTab({ c, trainerId, programmes, onChanged }) {
  const [month, setMonth] = React.useState(() => new Date());
  const [workouts, setWorkouts] = React.useState([]);
  const [showAssign, setShowAssign] = React.useState(false);

  const loadWorkouts = React.useCallback(() => {
    const y = month.getFullYear(), m = month.getMonth();
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
    const start = fmt(new Date(y, m, 1));
    const end   = fmt(new Date(y, m + 1, 1));
    supabase.from('client_workouts')
      .select('id, scheduled_date, status, programme_days(programme_phases(name, programmes(name)))')
      .eq('client_id', c.id).gte('scheduled_date', start).lt('scheduled_date', end)
      .then(({ data }) => setWorkouts(data || []));
  }, [c.id, month]);

  React.useEffect(() => { loadWorkouts(); }, [loadWorkouts]);

  if (showAssign) return (
    <AssignWorkout
      clientId={c.id} clientName={c.name} trainerId={trainerId} programmes={programmes}
      onClose={() => setShowAssign(false)}
      onAssigned={() => { setShowAssign(false); loadWorkouts(); onChanged?.(); }}
    />
  );

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <button onClick={() => setShowAssign(true)} className="btn-primary"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--heading-deep)' }}>
        <IconPlus size={14}/> ASSIGN WORKOUT
      </button>
      <CalendarView month={month} workouts={workouts} onPrev={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))} onNext={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))} />
    </div>
  );
}

function CalendarView({ month, workouts, onPrev, onNext }) {
  const y = month.getFullYear(), m = month.getMonth();
  const firstDow = (new Date(y, m, 1).getDay() + 6) % 7; // Mon=0
  const days     = new Date(y, m + 1, 0).getDate();
  const today    = new Date().toISOString().slice(0, 10);
  const wMap     = {};
  workouts.forEach(w => { wMap[w.scheduled_date] = wMap[w.scheduled_date] || []; wMap[w.scheduled_date].push(w); });

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={onPrev} style={navBtnSt}>‹</button>
        <span className="h-bold" style={{ fontSize: 13 }}>{MONTHS[m]} {y}</span>
        <button onClick={onNext} style={navBtnSt}>›</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 3 }}>
        {['M','T','W','T','F','S','S'].map((d, i) => <div key={i} className="mono" style={{ textAlign: 'center', fontSize: 8, color: 'var(--text-3)' }}>{d}</div>)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
        {Array.from({ length: firstDow }, (_, i) => <div key={`e${i}`}/>)}
        {Array.from({ length: days }, (_, i) => {
          const d = i + 1;
          const ds = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const ws = wMap[ds] || [];
          const done = ws.some(w => w.status === 'completed');
          const sched = ws.some(w => w.status === 'scheduled');
          const isToday = ds === today;
          return (
            <div key={d} style={{
              textAlign: 'center', padding: '5px 0', borderRadius: 6, fontSize: 11,
              fontFamily: 'JetBrains Mono', fontWeight: ws.length ? 700 : 400,
              color: ws.length ? 'var(--text)' : 'var(--text-3)',
              background: isToday ? 'var(--accent-soft)' : 'transparent',
              border: `1px solid ${isToday ? 'var(--accent)' : 'transparent'}`,
            }}>
              {d}
              {(done || sched) && <div style={{ width: 4, height: 4, borderRadius: '50%', margin: '2px auto 0', background: done ? 'var(--accent)' : 'var(--c-amber)' }}/>}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
        <Dot color="var(--accent)"/>  <Mono>Completed</Mono>
        <Dot color="var(--c-amber)"/> <Mono>Scheduled</Mono>
      </div>
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
  const [editPanel, setEditPanel] = React.useState(null); // { group, existing? }

  const reload = () =>
    supabase.from('client_injuries').select('*').eq('client_id', c.id)
      .then(({ data }) => setInjuries(data || []));

  React.useEffect(() => { reload(); }, [c.id]);

  React.useEffect(() => {
    if (mode === 'worked' && volume === null) {
      loadMuscleVolume(c.id, 30).then(setVolume);
    }
  }, [mode, volume, c.id]);

  // Injury mode: ALL muscle groups are interactive (so trainer can click any)
  const allGroupsData = React.useMemo(() => {
    const gs = MUSCLE_BODY.groupSlugs?.[side] || {};
    const d = {};
    Object.keys(gs).forEach(g => { d[g] = {}; });
    return d;
  }, [side]);

  const injuryIntensity = React.useCallback((group) => {
    const inGroup = injuries.filter(inj => inj.muscle_group === group);
    if (!inGroup.length) return 0;
    const sevVal = { mild: 0.35, moderate: 0.65, severe: 1.0 };
    return Math.max(...inGroup.map(inj => sevVal[inj.severity] || 0.5));
  }, [injuries]);

  const workedData = volume || {};
  const maxSets = Math.max(1, ...Object.values(workedData).map(d => d.sets));
  const workedIntensity = React.useCallback(
    (group) => Math.min(1, (workedData[group]?.sets || 0) / maxSets),
    [workedData, maxSets]
  );

  const isInjuryMode = mode === 'injuries';
  const pickedInjuries = picked ? injuries.filter(inj => inj.muscle_group === picked) : [];
  const pickedVolume = picked ? workedData[picked] : null;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {/* Mode / side toggles */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['front','back'].map(s => (
            <ToggleBtn key={s} active={side === s} onClick={() => { setSide(s); setPicked(null); }}>{s.toUpperCase()}</ToggleBtn>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <ToggleBtn active={isInjuryMode}  onClick={() => { setMode('injuries'); setPicked(null); }}>INJURIES</ToggleBtn>
          <ToggleBtn active={!isInjuryMode} onClick={() => { setMode('worked');   setPicked(null); setEditPanel(null); }}>TRAINED</ToggleBtn>
        </div>
      </div>

      {/* Body map */}
      <BodyMap
        side={side}
        data={isInjuryMode ? allGroupsData : workedData}
        intensity={isInjuryMode ? injuryIntensity : workedIntensity}
        picked={picked}
        onPick={group => { setPicked(group === picked ? null : group); setEditPanel(null); }}
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
          <div className="h-bold" style={{ fontSize: 14, marginBottom: 10 }}>{picked.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <KpiCard label="SETS"   value={pickedVolume.sets}   color="var(--accent)" />
            <KpiCard label="REPS"   value={pickedVolume.reps}   color="var(--accent)" />
            <KpiCard label="VOLUME" value={`${pickedVolume.kg.toLocaleString()}`} unit="kg" color="var(--accent)" />
          </div>
          <Mono style={{ marginTop: 8 }}>LAST WORKED · {pickedVolume.lastWorked.toUpperCase()}</Mono>
        </div>
      )}

      {/* Selected muscle panel */}
      {isInjuryMode && picked && (
        <div className="card" style={{
          padding: 14,
          borderColor: 'color-mix(in srgb, var(--c-coral) 40%, var(--line))',
          background: 'color-mix(in srgb, var(--c-coral) 6%, var(--bg-2))',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div className="h-bold" style={{ fontSize: 14, textTransform: 'capitalize' }}>{picked.replace(/([A-Z])/g, ' $1').trim().toUpperCase()}</div>
            <button onClick={() => setEditPanel({ group: picked })} style={{
              all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
              fontSize: 9, color: 'var(--c-coral)', fontFamily: 'JetBrains Mono', fontWeight: 700,
              border: '1px solid color-mix(in srgb, var(--c-coral) 50%, transparent)', borderRadius: 6, padding: '4px 8px',
            }}><IconPlus size={10}/> ADD NOTE</button>
          </div>
          {pickedInjuries.length === 0 && <Mono style={{ color: 'var(--text-3)' }}>No injuries recorded — tap ADD NOTE to log one.</Mono>}
          {pickedInjuries.map(inj => (
            <div key={inj.id} style={{
              padding: '8px 10px', borderRadius: 8, marginBottom: 6,
              background: `color-mix(in srgb, ${SEV_COLOR[inj.severity]} 10%, var(--bg-3))`,
              border: `1px solid color-mix(in srgb, ${SEV_COLOR[inj.severity]} 35%, transparent)`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span className="mono" style={{ fontSize: 9, color: SEV_COLOR[inj.severity], fontWeight: 700, letterSpacing: '0.08em' }}>{SEV_LABEL[inj.severity]}</span>
                  <div style={{ fontSize: 12, marginTop: 3, color: 'var(--text)' }}>{inj.note}</div>
                  <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', marginTop: 3 }}>{new Date(inj.created_at).toLocaleDateString('en-GB')}</div>
                </div>
                <button onClick={async () => { await supabase.from('client_injuries').delete().eq('id', inj.id); reload(); }}
                  style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }}>
                  <IconX2 size={12}/>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add injury panel */}
      {editPanel && (
        <InjuryForm
          group={editPanel.group} side={side} clientId={c.id} trainerId={trainerId}
          onSave={async (note, severity) => {
            await supabase.from('client_injuries').insert({
              client_id: c.id, trainer_id: trainerId,
              muscle_group: editPanel.group, body_side: side, note, severity,
            });
            setEditPanel(null); reload();
          }}
          onClose={() => setEditPanel(null)}
        />
      )}
    </div>
  );
}

function InjuryForm({ group, side, onSave, onClose }) {
  const [note, setNote]         = React.useState('');
  const [severity, setSeverity] = React.useState('moderate');
  const [saving, setSaving]     = React.useState(false);
  return (
    <div className="card" style={{ padding: 14, border: '1px solid var(--c-coral)', display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="label">// ADD INJURY NOTE — {group?.toUpperCase()}</div>
        <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)' }}><IconX2 size={14}/></button>
      </div>
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
      <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Describe the injury or limitation…"
        rows={3} style={{ ...fieldSt, resize: 'vertical' }}/>
      <button onClick={async () => { if (!note.trim() || saving) return; setSaving(true); await onSave(note.trim(), severity); }} disabled={!note.trim() || saving}
        className="btn-primary" style={{ opacity: note.trim() ? 1 : 0.4 }}>
        {saving ? 'SAVING…' : 'SAVE NOTE'}
      </button>
    </div>
  );
}

// ── DATA ─────────────────────────────────────────────────────────
function DataTab({ c, trainerId }) {
  const [metrics, setMetrics] = React.useState(null);
  const [adding, setAdding]   = React.useState(false);
  const [weightKg, setWeightKg]     = React.useState('');
  const [bodyFat, setBodyFat]       = React.useState('');
  const [metNotes, setMetNotes]     = React.useState('');
  const [metDate, setMetDate]       = React.useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving]         = React.useState(false);

  const reload = () =>
    supabase.from('body_metrics').select('*').eq('client_id', c.id)
      .order('recorded_at', { ascending: false }).limit(20)
      .then(({ data }) => setMetrics(data || []));

  React.useEffect(() => { reload(); }, [c.id]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    await supabase.from('body_metrics').insert({
      client_id: c.id, trainer_id: trainerId,
      recorded_at: metDate,
      weight_kg:    weightKg ? parseFloat(weightKg) : null,
      body_fat_pct: bodyFat  ? parseFloat(bodyFat)  : null,
      notes: metNotes.trim() || null,
    });
    setSaving(false); setAdding(false);
    setWeightKg(''); setBodyFat(''); setMetNotes('');
    reload();
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div className="label">// BODY METRICS</div>
        <button onClick={() => setAdding(a => !a)} style={{
          all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
          fontSize: 9, color: 'var(--accent)', fontFamily: 'JetBrains Mono', fontWeight: 700,
          border: '1px solid color-mix(in srgb, var(--accent) 50%, transparent)', borderRadius: 6, padding: '4px 8px',
        }}><IconPlus size={10}/> ADD</button>
      </div>

      {adding && (
        <div className="card" style={{ padding: 14, display: 'grid', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <FieldLabel label="WEIGHT (KG)"><input value={weightKg} onChange={e => setWeightKg(e.target.value)} inputMode="decimal" placeholder="75.5" style={fieldSt}/></FieldLabel>
            <FieldLabel label="BODY FAT %"><input value={bodyFat}  onChange={e => setBodyFat(e.target.value)}  inputMode="decimal" placeholder="18.5" style={fieldSt}/></FieldLabel>
          </div>
          <FieldLabel label="DATE"><input type="date" value={metDate} onChange={e => setMetDate(e.target.value)} style={fieldSt}/></FieldLabel>
          <FieldLabel label="NOTES (OPTIONAL)"><textarea value={metNotes} onChange={e => setMetNotes(e.target.value)} rows={2} placeholder="Any notes…" style={{ ...fieldSt, resize: 'vertical' }}/></FieldLabel>
          <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'SAVING…' : 'SAVE METRICS'}</button>
        </div>
      )}

      {metrics === null && <Mono>LOADING…</Mono>}
      {metrics?.length === 0 && !adding && <EmptyState>No body metrics recorded yet</EmptyState>}
      {metrics?.map(m => (
        <div key={m.id} className="card" style={{ padding: '10px 12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: m.notes ? 6 : 0 }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{new Date(m.recorded_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
            <div style={{ display: 'flex', gap: 12 }}>
              {m.weight_kg    && <span style={{ fontSize: 13, fontWeight: 700 }}>{m.weight_kg} <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>KG</span></span>}
              {m.body_fat_pct && <span style={{ fontSize: 13, fontWeight: 700 }}>{m.body_fat_pct}<span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>% BF</span></span>}
            </div>
          </div>
          {m.notes && <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{m.notes}</div>}
        </div>
      ))}

      {/* Progress photos placeholder */}
      <div className="label" style={{ marginTop: 8 }}>// PROGRESS PHOTOS</div>
      <div className="card" style={{ padding: 16, textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em' }}>PHOTO UPLOADS COMING SOON</div>
      </div>
    </div>
  );
}

// ── TASKS ─────────────────────────────────────────────────────────
function TasksTab({ c, trainerId }) {
  const [tasks, setTasks]   = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [title, setTitle]   = React.useState('');
  const [kind, setKind]     = React.useState('check');
  const [due, setDue]       = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const reload = () =>
    supabase.from('client_tasks').select('*').eq('client_id', c.id)
      .order('due_date', { ascending: true })
      .then(({ data }) => setTasks(data || []));

  React.useEffect(() => { reload(); }, [c.id]);

  const save = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    await supabase.from('client_tasks').insert({
      client_id: c.id, trainer_id: trainerId,
      title: title.trim(), kind, due_date: due || null,
    });
    setSaving(false); setAdding(false); setTitle(''); setDue(''); reload();
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
                {['check','log','photo'].map(k => (
                  <button key={k} onClick={() => setKind(k)} style={{
                    all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center',
                    padding: '7px 0', borderRadius: 7, fontSize: 9, fontFamily: 'JetBrains Mono', fontWeight: 700,
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
          <button onClick={save} disabled={!title.trim() || saving} className="btn-primary" style={{ opacity: title.trim() ? 1 : 0.4 }}>
            {saving ? 'SAVING…' : 'ADD TASK'}
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
  all: 'unset', cursor: 'pointer', padding: '4px 10px', borderRadius: 7,
  fontSize: 16, color: 'var(--text-2)', background: 'var(--bg-3)',
  border: '1px solid var(--line)',
};
