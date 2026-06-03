import React from 'react'
import { supabase } from '../lib/supabase'
import { HEX_RATIO, HexShape, Hex } from '../components/hex'
import { IconBell, IconPlay, IconChart, IconCheck, IconClipboard, IconDoc, IconScale, IconCamera2, IconX2, IconPlus } from '../components/icons'

function useLiveClock() {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function greeting(hour) {
  if (hour < 12) return 'GOOD MORNING';
  if (hour < 18) return 'GOOD AFTERNOON';
  return 'GOOD EVENING';
}

function fmtClock(d) {
  const days = ['SUN','MON','TUE','WED','THU','FRI','SAT'];
  const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${days[d.getDay()]} · ${d.getDate()} ${months[d.getMonth()]} · ${hh}:${mm}`;
}

const DAY_LABELS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

function shapeWorkout(row) {
  const day = row.programme_days;
  if (!day) return null;
  const phase = day.programme_phases;
  const programme = phase?.programmes;
  const exerciseCount = (day.workout_sections || [])
    .reduce((n, s) => n + (s.section_exercises?.length || 0), 0);
  const dayLabel = DAY_LABELS[day.day_of_week] || 'Day';
  return {
    id: row.id,
    name: `${phase?.name || 'Workout'} · ${dayLabel}`,
    tag: programme?.tag || 'STRENGTH',
    duration: Math.max(30, exerciseCount * 3),
    exerciseCount,
    status: row.status,
  };
}

// Dashboard / Home screen
export function Dashboard({ go, user, userId }) {
  const name = (user && user.name) || 'Athlete';
  const firstName = name.trim().split(/\s+/)[0];
  const initials = name.trim().split(/\s+/).map(p => p[0]).slice(0, 2).join('').toUpperCase();
  const [tasks] = React.useState([]);
  const [formTask, setFormTask] = React.useState(null);
  const [todayWorkout, setTodayWorkout] = React.useState(null);
  const [workoutLoading, setWorkoutLoading] = React.useState(true);
  const now = useLiveClock();

  const today = new Date().toISOString().slice(0, 10);
  const done = todayWorkout?.status === 'completed';

  React.useEffect(() => {
    if (!userId) { setWorkoutLoading(false); return; }
    supabase
      .from('client_workouts')
      .select(`
        id, status,
        programme_days (
          id, day_of_week,
          programme_phases (
            id, name,
            programmes ( id, name, tag )
          ),
          workout_sections (
            id,
            section_exercises ( id )
          )
        )
      `)
      .eq('client_id', userId)
      .eq('scheduled_date', today)
      .neq('status', 'skipped')
      .order('created_at')
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        setTodayWorkout(data ? shapeWorkout(data) : null);
        setWorkoutLoading(false);
      });
  }, [userId, today]);

  const completeTask = id => setTasks(prev => prev.map(t => t.id === id ? { ...t, done: true } : t));
  return (
    <div className="scroller" style={{ padding: '0 16px 110px', paddingTop: 64 }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0 18px' }}>
        <div>
          <div className="label" style={{ marginBottom: 4 }}>// SYSTEM_STATUS
</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'JetBrains Mono, monospace' }}>{fmtClock(now)}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => go('notifications')} aria-label="Notifications" style={{ all: 'unset', cursor: 'pointer', position: 'relative', display: 'grid', placeItems: 'center', width: 38 * HEX_RATIO, height: 38 }} data-comment-anchor="3f330b377c-button-17-11">
            <HexShape size={38} fill="var(--bg-2)" stroke="var(--line-strong)" strokeWidth={9}
            style={{ position: 'absolute', inset: 0 }} />
            <IconBell size={15} style={{ position: 'relative', color: 'var(--text-2)' }} />
            <span style={{ position: 'absolute', top: 1, right: 3, zIndex: 2, width: 8, height: 8, borderRadius: '50%', background: 'var(--c-coral)', border: '1.5px solid var(--bg-1)' }} />
          </button>
          <img src="assets/logomark.svg" alt="HS" style={{ width: 38, height: 38, display: 'block', filter: 'drop-shadow(0 0 calc(9px * var(--glow)) var(--accent-glow))' }} />
        </div>
      </div>

      {/* Greeting */}
      <div style={{ marginBottom: 18 }}>
        <div className="h-bold" style={{ fontSize: 28, lineHeight: 1.1, color: "var(--heading-deep)" }}>
          {greeting(now.getHours())},<br /><span style={{ color: 'var(--accent)' }} className="text-glow">{firstName.toUpperCase()}.</span>
        </div>
        <div style={{ fontSize: 13, marginTop: 6, fontFamily: "\"JetBrains Mono\"", color: "var(--heading-deep)" }}>
           <strong style={{ fontFamily: "\"JetBrains Mono\"", color: "rgb(70, 187, 192)" }}></strong>
        </div>
      </div>

      {/* Today's workout hero */}
      <div className="card" style={{
        padding: 0, marginBottom: 14, overflow: 'hidden', position: 'relative',
        background: 'linear-gradient(180deg, rgba(0,245,255,0.06), rgba(176,114,255,0.04)) , var(--bg-2)',
        borderColor: 'color-mix(in srgb, var(--accent) 25%, var(--line))'
      }}>
        <div style={{
          height: 120, position: 'relative',
          background: `linear-gradient(180deg, transparent 30%, var(--bg-2)) , url('https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=800&q=70') center/cover`
        }}/>
        <div style={{ padding: 'var(--density-pad)' }}>
          <div className="label" style={{ marginBottom: 6 }}>// TODAY'S SESSION</div>
          {workoutLoading ? (
            <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.12em', padding: '8px 0' }}>LOADING…</div>
          ) : !todayWorkout ? (
            <>
              <div className="h-bold" style={{ fontSize: 22, lineHeight: 1.05, marginBottom: 12, color: 'var(--text-3)' }}>
                REST DAY
              </div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em' }}>
                No session scheduled today.
              </div>
            </>
          ) : (
            <>
              <div className="h-bold" style={{ fontSize: 22, lineHeight: 1.05, marginBottom: 12 }}>
                {todayWorkout.name.toUpperCase()}
              </div>
              <div style={{ display: 'flex', gap: 18, marginBottom: 14 }}>
                <Stat label="DURATION" value={`${todayWorkout.duration} MIN`}/>
                <Stat label="EXERCISES" value={todayWorkout.exerciseCount}/>
                <Stat label="STATUS" value={done ? 'DONE' : 'READY'} color={done ? 'var(--accent)' : 'var(--lime)'}/>
              </div>
              {done ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '13px', borderRadius: 12,
                    background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 45%, transparent)',
                    color: 'var(--accent)', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 13, letterSpacing: '0.08em',
                  }}>
                    <IconCheck size={14} sw={3}/> COMPLETED
                  </div>
                  <button onClick={() => go('sessionresults')} aria-label="View results"
                    style={{ all: 'unset', cursor: 'pointer', display: 'grid', placeItems: 'center', width: 48 * HEX_RATIO, height: 48 }}>
                    <Hex size={48} square style={{ background: 'var(--bg-3)', border: '1px solid var(--line-strong)', color: 'var(--text)' }}>
                      <IconChart size={16}/>
                    </Hex>
                  </button>
                </div>
              ) : (
                <button className="btn-primary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--heading-deep)' }}
                  onClick={() => go('workouts')}>
                  <IconPlay size={14}/> START SESSION
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tasks */}
      <TasksSection tasks={tasks} onOpenForm={(t) => setFormTask(t)}
        onAction={(t) => completeTask(t.id)} />

      {/* Programme roadmap */}
      <ProgrammeRoadmap userId={userId} />

      {formTask &&
      <TaskForm task={formTask}
        onClose={() => setFormTask(null)}
        onSubmit={() => { completeTask(formTask.id); setFormTask(null); }} />
      }
    </div>);

}

// ── TASKS ────────────────────────────────────────────────────────
function TasksSection({ tasks, onOpenForm, onAction }) {
  const TASK_ICON = {
    form: IconClipboard, doc: IconDoc,
    scale: IconScale, camera: IconCamera2
  };
  const open = tasks.filter((t) => !t.done);
  const doneCount = tasks.length - open.length;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 8px' }}>
        <div className="label">// TASKS</div>
        <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em' }}>
          <span style={{ color: open.length ? 'var(--c-amber)' : 'var(--accent)' }}>{open.length}</span> OPEN · {doneCount} DONE
        </div>
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {tasks.length === 0 && (
          <div className="mono" style={{
            fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em',
            padding: '14px 12px', textAlign: 'center',
            background: 'var(--bg-2)', borderRadius: 10,
            border: '1px solid var(--line)',
          }}>NO TASKS ASSIGNED</div>
        )}
        {tasks.map((t) => {
          const Icon = TASK_ICON[t.icon] || IconClipboard;
          const tint = t.done ? 'var(--text-3)' : t.kind === 'form' ? 'var(--accent)' : 'var(--c-amber)';
          return (
            <button key={t.id} onClick={() => t.kind === 'form' ? onOpenForm(t) : onAction(t)}
            disabled={t.done}
            style={{
              all: 'unset', cursor: t.done ? 'default' : 'pointer', display: 'block',
              opacity: t.done ? 0.62 : 1
            }}>
              <div className="card" style={{
                padding: 12, display: 'flex', alignItems: 'center', gap: 12,
                borderColor: t.done ? 'var(--line)' : `color-mix(in srgb, ${tint} 30%, var(--line))`
              }}>
                <Hex size={34} square style={{
                  background: `color-mix(in srgb, ${tint} 16%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${tint} 40%, transparent)`,
                  color: tint, flexShrink: 0
                }}>
                  <Icon size={16} />
                </Hex>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textDecoration: t.done ? 'line-through' : 'none' }}>
                    {t.title}
                  </div>
                  <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-3)', letterSpacing: '0.04em', marginTop: 3 }}>
                    {t.sub}
                  </div>
                </div>
                {t.done ?
                <Hex size={22} square style={{ background: 'var(--accent)', color: 'var(--on-accent)', flexShrink: 0 }}>
                  <IconCheck size={11} sw={3} />
                </Hex> :
                <span className="mono" style={{
                  flexShrink: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
                  color: tint, padding: '4px 9px', borderRadius: 999,
                  background: `color-mix(in srgb, ${tint} 12%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${tint} 35%, transparent)`
                }}>{t.kind === 'form' ? 'OPEN' : 'LOG'}</span>}
              </div>
            </button>);
        })}
      </div>
    </div>);

}

// In-app form (bottom sheet) for form-type tasks.
function TaskForm({ task, onClose, onSubmit }) {
  const f = task.form || { title: task.title.toUpperCase(), intro: '', fields: [] };
  const [values, setValues] = React.useState({});
  const set = (id, v) => setValues((prev) => ({ ...prev, [id]: v }));
  const required = f.fields.filter((x) => x.type !== 'textarea');
  const complete = task.done || required.every((x) => values[x.id] != null && values[x.id] !== '');

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 80,
      background: 'rgba(7,7,12,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-end'
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxHeight: '88%',
        background: 'var(--bg-1)',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        border: '1px solid var(--line-strong)', borderBottom: 0,
        display: 'flex', flexDirection: 'column'
      }}>
        <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, background: 'var(--line-strong)', borderRadius: 2, margin: '0 auto 14px' }} />
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div className="label">// {task.done ? 'SUBMITTED' : 'TASK'}</div>
              <div className="h-bold" style={{ fontSize: 19, marginTop: 4, lineHeight: 1.15 }}>{f.title}</div>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ all: 'unset', cursor: 'pointer', flexShrink: 0 }}>
              <Hex size={32} square style={{ background: 'var(--bg-2)', border: '1px solid var(--line-strong)', color: 'var(--text)' }}>
                <IconX2 size={14} />
              </Hex>
            </button>
          </div>
          {f.intro && <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.5, margin: '12px 0 2px' }}>{f.intro}</div>}
        </div>

        <div className="scroller" style={{ flex: 1, padding: '14px 16px 8px', minHeight: 0, display: 'grid', gap: 16 }}>
          {f.fields.length === 0 &&
          <div className="card" style={{ padding: 16, textAlign: 'center', color: 'var(--text-2)', fontSize: 12 }}>
            Nothing to fill out — you're all set.
          </div>}
          {f.fields.map((field) =>
          <FormField key={field.id} field={field} value={values[field.id]} onChange={(v) => set(field.id, v)} />
          )}
        </div>

        <div style={{ padding: '12px 16px 26px', flexShrink: 0, background: 'linear-gradient(180deg, transparent, var(--bg-1) 40%)' }}>
          {task.done ?
          <button onClick={onClose} className="btn-ghost" style={{ width: '100%' }}>CLOSE</button> :
          <button onClick={onSubmit} disabled={!complete} className="btn-primary"
            style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: complete ? 1 : 0.45, pointerEvents: complete ? 'auto' : 'none' }}>
            <IconCheck size={14} sw={3} /> SUBMIT TO COACH
          </button>}
        </div>
      </div>
    </div>);

}

function FormField({ field, value, onChange }) {
  const labelEl = <div className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-2)', fontWeight: 600, marginBottom: 8, textTransform: 'uppercase' }}>{field.label}</div>;
  if (field.type === 'number') {
    return (
      <div>{labelEl}
        <input value={value || ''} inputMode="decimal" placeholder={field.placeholder}
        onChange={(e) => onChange(e.target.value)}
        style={taskInputStyle()} />
      </div>);
  }
  if (field.type === 'textarea') {
    return (
      <div>{labelEl}
        <textarea value={value || ''} placeholder={field.placeholder} onChange={(e) => onChange(e.target.value)}
        style={{ ...taskInputStyle(), minHeight: 70, resize: 'vertical' }} />
      </div>);
  }
  if (field.type === 'scale') {
    const opts = Array.from({ length: field.max - field.min + 1 }, (_, i) => field.min + i);
    return (
      <div>{labelEl}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${opts.length}, 1fr)`, gap: 6 }}>
          {opts.map((n) => {
            const sel = value === n;
            return (
              <button key={n} onClick={() => onChange(n)} style={{
                all: 'unset', cursor: 'pointer', textAlign: 'center',
                padding: '11px 0', borderRadius: 9,
                background: sel ? 'var(--accent)' : 'var(--bg-2)',
                border: '1px solid ' + (sel ? 'var(--accent)' : 'var(--line-strong)'),
                color: sel ? 'var(--on-accent)' : 'var(--text-2)',
                fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700
              }}>{n}</button>);
          })}
        </div>
      </div>);
  }
  // choice
  return (
    <div>{labelEl}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {field.options.map((opt) => {
          const sel = value === opt;
          return (
            <button key={opt} onClick={() => onChange(opt)} style={{
              all: 'unset', cursor: 'pointer',
              padding: '9px 14px', borderRadius: 999,
              background: sel ? 'var(--accent-soft)' : 'var(--bg-2)',
              border: '1px solid ' + (sel ? 'var(--accent)' : 'var(--line-strong)'),
              color: sel ? 'var(--accent)' : 'var(--text-2)',
              fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 600
            }}>{opt}</button>);
        })}
      </div>
    </div>);

}

function taskInputStyle() {
  return {
    width: '100%', boxSizing: 'border-box',
    background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 10,
    padding: '11px 12px', color: 'var(--text)', outline: 'none',
    fontFamily: 'JetBrains Mono', fontSize: 13, lineHeight: 1.5
  };
}

async function loadRoadmap(userId) {
  const { data } = await supabase
    .from('client_workouts')
    .select(`
      status, scheduled_date,
      programme_days (
        programme_phases (
          id, phase_index, name, weeks, programme_id,
          programmes ( id, name )
        )
      )
    `)
    .eq('client_id', userId)
    .order('scheduled_date');
  if (!data?.length) return null;

  const progMap = {};
  data.forEach(w => {
    const ph = w.programme_days?.programme_phases;
    const prog = ph?.programmes;
    if (!prog || !ph) return;
    if (!progMap[prog.id]) progMap[prog.id] = { prog, phases: {}, lastDate: null };
    const pm = progMap[prog.id];
    if (!pm.phases[ph.id]) pm.phases[ph.id] = { id: ph.id, idx: ph.phase_index, name: ph.name, weeks: ph.weeks, total: 0, done: 0 };
    pm.phases[ph.id].total++;
    if (w.status === 'completed') pm.phases[ph.id].done++;
    if (!pm.lastDate || w.scheduled_date > pm.lastDate) pm.lastDate = w.scheduled_date;
  });

  const main = Object.values(progMap).sort((a, b) => (b.lastDate || '').localeCompare(a.lastDate || ''))[0];
  if (!main) return null;

  const phases = Object.values(main.phases).sort((a, b) => a.idx - b.idx);
  let seenCurrent = false;
  phases.forEach(p => {
    if (p.done === p.total && p.total > 0) { p.status = 'done'; return; }
    if (!seenCurrent) { p.status = 'current'; seenCurrent = true; }
    else p.status = 'upcoming';
  });

  const totalSessions = phases.reduce((n, p) => n + p.total, 0);
  const doneSessions  = phases.reduce((n, p) => n + p.done,  0);
  return {
    name: main.prog.name,
    phases,
    pct: totalSessions > 0 ? doneSessions / totalSessions : 0,
    doneSessions, totalSessions,
  };
}

function ProgrammeRoadmap({ userId }) {
  const [roadmap, setRoadmap] = React.useState(undefined);
  React.useEffect(() => {
    if (!userId) { setRoadmap(null); return; }
    loadRoadmap(userId).then(setRoadmap);
  }, [userId]);

  if (roadmap === undefined) return null;
  if (!roadmap) return null;

  const { name, phases, pct, doneSessions, totalSessions } = roadmap;
  const overallPct = pct;

  return (
    <div className="card" style={{
      padding: 16,
      background: 'linear-gradient(135deg, rgba(70,187,192,0.06), rgba(24,156,170,0.02)), var(--bg-2)',
      borderColor: 'color-mix(in srgb, var(--accent) 22%, var(--line))'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <div className="label">// PROGRAMME ROADMAP</div>
          <div className="h-bold" style={{ fontSize: 18, marginTop: 4, color: "var(--heading-deep)" }}>{name.toUpperCase()}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="mono" style={{ fontSize: 11, color: 'var(--accent)', letterSpacing: '0.08em', fontWeight: 600 }}>
            {doneSessions} / {totalSessions} SESSIONS
          </div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em', marginTop: 2 }}>
            {Math.round(overallPct * 100)}% COMPLETE
          </div>
        </div>
      </div>

      {/* Phase track */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        {/* Background rail */}
        <div style={{ position: 'absolute', left: 8, right: 8, top: 11,
          height: 2, background: 'var(--line-strong)', borderRadius: 1
        }} />
        {/* Filled progress */}
        <div style={{
          position: 'absolute', left: 8, top: 11,
          width: `calc((100% - 16px) * ${overallPct})`,
          height: 2, background: 'linear-gradient(90deg, var(--accent), var(--accent-2))',
          borderRadius: 1, boxShadow: '0 0 calc(6px * var(--glow)) var(--accent-glow)'
        }} />

        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(phases.length, 2)}, 1fr)`, gap: 4, position: 'relative' }}>
          {phases.map((p, i) => {
            const isCurrent = p.status === 'current';
            const isDone = p.status === 'done';
            return (
              <div key={p.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                {/* Hex node */}
                <div style={{ position: 'relative', width: 28, height: 28, display: 'grid', placeItems: 'center' }}>
                  {isCurrent ?
                  <>
                    {/* in-progress glow */}
                    <span style={{
                      position: 'absolute', width: 30, height: 30, borderRadius: '50%',
                      background: 'var(--accent)', filter: 'blur(9px)', opacity: 0.6,
                      animation: 'phasePulse 1.8s ease-in-out infinite'
                    }} />
                    <Hex size={26} square style={{
                      background: 'var(--accent)',
                      position: 'relative',
                      boxShadow: '0 0 calc(10px * var(--glow)) var(--accent-glow)'
                    }} />
                  </> :

                  <Hex size={26} square style={{
                    background: isDone ? 'var(--accent)' : 'var(--bg-3)',
                    border: isDone ? '0' : '1.5px solid var(--line-strong)',
                    color: 'var(--on-accent)'
                  }}>
                      {isDone &&
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="var(--on-accent)" strokeWidth="2.5">
                          <path d="M2 6l3 3 5-6" />
                        </svg>
                    }
                    </Hex>
                  }
                </div>
                {/* Phase label */}
                <div style={{ marginTop: 8, textAlign: 'center' }}>
                  <div className="mono" style={{
                    fontSize: 8, letterSpacing: '0.14em',
                    color: isCurrent || isDone ? 'var(--accent)' : 'var(--text-3)',
                    fontWeight: 600
                  }}>P{p.idx + 1}</div>
                  <div style={{
                    fontSize: 10.5, marginTop: 2, lineHeight: 1.1,
                    color: isCurrent ? 'var(--text)' : isDone ? 'var(--text-2)' : 'var(--text-3)',
                    fontWeight: isCurrent ? 600 : 400, fontFamily: "\"JetBrains Mono\""
                  }}>{p.name}</div>
                </div>
              </div>);

          })}
        </div>
      </div>
    </div>);

}

function XPGauge({ level, xp, nextLevel, weeklyXP }) {
  const pct = Math.min(1, xp / nextLevel);
  const R = 54,C = 2 * Math.PI * R;
  const remaining = nextLevel - xp;
  return (
    <div className="card" style={{
      padding: 14, display: 'flex', alignItems: 'center', gap: 14,
      background: 'linear-gradient(135deg, rgba(70,187,192,0.08), rgba(24,156,170,0.04)), var(--bg-2)',
      borderColor: 'color-mix(in srgb, var(--accent) 25%, var(--line))'
    }}>
      <div style={{ position: 'relative', width: 124, height: 124, flexShrink: 0 }}>
        <svg width="124" height="124" viewBox="0 0 124 124" style={{ transform: 'rotate(-90deg)' }}>
          <circle cx="62" cy="62" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
          <circle cx="62" cy="62" r={R} fill="none" stroke="url(#xp-grad)" strokeWidth="8"
          strokeDasharray={`${C * pct} ${C}`} strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 calc(6px * var(--glow)) var(--accent-glow))', transition: 'stroke-dasharray .6s ease' }} />
          <defs>
            <linearGradient id="xp-grad" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#46BBC0" />
              <stop offset="100%" stopColor="#189CAA" />
            </linearGradient>
          </defs>
        </svg>
        <div style={{
          position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center'
        }}>
          <div>
            <div className="label" style={{ fontSize: 8, color: 'var(--accent)' }}>LVL</div>
            <div className="h-bold" style={{ fontSize: 28, color: 'var(--accent)', lineHeight: 1 }}>{level}</div>
            <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)', marginTop: 2, letterSpacing: '0.08em' }}>{Math.round(pct * 100)}%</div>
          </div>
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="label">// EXPERIENCE</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
          <span className="h-bold" style={{ fontSize: 22 }}>{xp.toLocaleString()}</span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em' }}>/ {nextLevel.toLocaleString()} XP</span>
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text-2)', marginTop: 4, letterSpacing: '0.06em' }}>
          <span style={{ color: 'var(--lime)' }}>+{weeklyXP}</span> THIS WEEK
        </div>
        <div style={{ marginTop: 10, padding: '6px 8px', borderRadius: 6, background: 'rgba(70,187,192,0.08)', border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)' }}>
          <div className="mono" style={{ fontSize: 9, color: 'var(--accent)', letterSpacing: '0.08em' }}>
            ◢ {remaining.toLocaleString()} XP TO LVL {level + 1}
          </div>
        </div>
      </div>
    </div>);

}

function Stat({ label, value, color }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="h-bold" style={{ ...{ fontSize: 18, marginTop: 2, color: color || 'var(--text)' }, color: "rgb(70, 187, 192)" }}>{value}</div>
    </div>);

}

function MicroStat({ icon, label, value, unit, color }) {
  return (
    <div className="card" style={{ padding: 12 }} data-comment-anchor="0aeba55e97-div-247-5">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: color, marginBottom: 6 }}>
        {icon}
        <span className="label" style={{ color: color }}>{label}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
        <span className="h-bold" style={{ fontSize: 22, color: color }}>{value}</span>
        <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em' }}>{unit}</span>
      </div>
    </div>);

}

