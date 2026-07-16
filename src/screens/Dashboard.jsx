import React from 'react'
import { supabase } from '../lib/supabase'
import { HEX_RATIO, HexShape, Hex } from '../components/hex'
import { IconBell, IconPlay, IconChart, IconCheck, IconClipboard, IconScale, IconCamera2, IconDoc } from '../components/icons'
import { notify, trainerOf } from '../lib/notifications'
import { FormFill } from './FormFill'

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
    dayId: day.id,
    name: `${phase?.name || 'Workout'} · ${dayLabel}`,
    tag: programme?.tag || 'STRENGTH',
    duration: Math.max(30, exerciseCount * 3),
    exerciseCount,
    status: row.status,
  };
}

function shapeTask(t) {
  const today = new Date().toISOString().slice(0, 10);
  let sub;
  if (t.completed_at)   sub = `Completed ${new Date(t.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  else if (!t.due_date) sub = 'No due date';
  else if (t.due_date === today) sub = 'Due today';
  else if (t.due_date < today)   sub = `Overdue · was due ${new Date(t.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  else sub = `Due ${new Date(t.due_date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}`;
  return {
    id: t.id,
    title: t.title,
    kind: t.kind,
    icon: t.kind, // check | log | photo | form
    formId: t.form_id,
    sub,
    done: !!t.completed_at,
    overdue: !t.completed_at && t.due_date && t.due_date < today,
  };
}

// Dashboard / Home screen
export function Dashboard({ go, user, userId, impersonating, unread = 0 }) {
  const name = (user && user.name) || 'Athlete';
  const firstName = name.trim().split(/\s+/)[0];
  const initials = name.replace(/[^a-zA-Z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean).map(p => p[0]).slice(0, 2).join('').toUpperCase() || 'U';
  const [tasks, setTasks] = React.useState([]);
  const [todayWorkout, setTodayWorkout] = React.useState(null);
  const [workoutLoading, setWorkoutLoading] = React.useState(true);
  const [formTask, setFormTask] = React.useState(null);
  const [trainerId, setTrainerId] = React.useState(null);
  const now = useLiveClock();

  const today = new Date().toISOString().slice(0, 10);
  const done = todayWorkout?.status === 'completed';

  React.useEffect(() => { if (userId) trainerOf(userId).then(setTrainerId); }, [userId]);

  const loadTasks = React.useCallback(() => {
    if (!userId) return;
    supabase.from('client_tasks')
      .select('*')
      .eq('client_id', userId)
      .then(({ data }) => {
        const rows = data || [];
        rows.sort((a, b) => {
          if (!!a.completed_at !== !!b.completed_at) return a.completed_at ? 1 : -1;
          return (a.due_date || '9999') < (b.due_date || '9999') ? -1 : 1;
        });
        setTasks(rows.map(shapeTask));
      });
  }, [userId]);

  React.useEffect(() => { loadTasks(); }, [loadTasks]);

  const toggleTask = async (t) => {
    if (t.kind === 'form' && !t.done) { setFormTask(t); return; }
    await supabase.from('client_tasks')
      .update({ completed_at: t.done ? null : new Date().toISOString() })
      .eq('id', t.id);
    if (!t.done && trainerId) notify({ recipientId: trainerId, actorId: userId, kind: 'task', title: `${firstName} completed a task`, body: t.title, link: { screen: 'coach' } });
    loadTasks();
  };

  const onFormSubmitted = async (t) => {
    await supabase.from('client_tasks').update({ completed_at: new Date().toISOString() }).eq('id', t.id);
    if (trainerId) notify({ recipientId: trainerId, actorId: userId, kind: 'form', title: `${firstName} submitted a form`, body: t.title, link: { screen: 'coach' } });
    loadTasks();
  };

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

  return (
    <div className="scroller" style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '0 16px 28px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
            {unread > 0 && (
              <span className="mono" style={{
                position: 'absolute', top: -2, right: 0, zIndex: 2, minWidth: 14, height: 14, padding: '0 3px',
                borderRadius: 999, background: 'var(--c-coral)', color: '#eceff4', fontSize: 8, fontWeight: 800,
                display: 'grid', placeItems: 'center', border: '1.5px solid var(--bg-1)',
              }}>{unread > 9 ? '9+' : unread}</span>
            )}
          </button>
          <button onClick={() => { if (!impersonating) go('profile'); }} aria-label="Profile & settings"
            style={{ all: 'unset', cursor: impersonating ? 'default' : 'pointer' }}>
            <Hex size={38} style={{
              background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
              color: 'var(--on-accent)', fontFamily: 'Orbitron', fontSize: 13, fontWeight: 800,
              filter: 'drop-shadow(0 0 calc(9px * var(--glow)) var(--accent-glow))',
            }}>{initials}</Hex>
          </button>
        </div>
      </div>

      {/* Greeting */}
      <div>
        <div className="h-bold" style={{ fontSize: 28, lineHeight: 1.1, color: "var(--heading-deep)" }}>
          {greeting(now.getHours())},<br /><span style={{ color: 'var(--accent)' }} className="text-glow">{firstName.toUpperCase()}.</span>
        </div>
      </div>

      {/* Today's workout hero */}
      <div className="card" style={{
        padding: 0, overflow: 'hidden', position: 'relative',
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
                  <button onClick={() => go('sessionresults', { dayId: todayWorkout.dayId })} aria-label="View results"
                    style={{ all: 'unset', cursor: 'pointer', display: 'grid', placeItems: 'center', width: 48 * HEX_RATIO, height: 48 }}>
                    <Hex size={48} square style={{ background: 'var(--bg-3)', border: '1px solid var(--line-strong)', color: 'var(--text)' }}>
                      <IconChart size={16}/>
                    </Hex>
                  </button>
                </div>
              ) : (
                <button className="btn-primary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, color: 'var(--heading-deep)' }}
                  onClick={() => todayWorkout.dayId ? go('log', { dayId: todayWorkout.dayId }) : go('workouts')}>
                  <IconPlay size={14}/> START SESSION
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Tasks */}
      <TasksSection tasks={tasks} onToggle={toggleTask} go={go} />

      {/* Programme roadmap */}
      <ProgrammeRoadmap userId={userId} />

      {/* At-a-glance training strip (7/30-day) */}
      <TrainingStrip userId={userId} />

      {/* Goal set by the coach */}
      <GoalCard userId={userId} />

      {formTask && (
        <FormFill
          formId={formTask.formId} taskId={formTask.id} clientId={userId}
          onClose={() => setFormTask(null)}
          onSubmitted={() => onFormSubmitted(formTask)}
        />
      )}
    </div>);

}

// ── TRAINING STRIP (at-a-glance) ─────────────────────────────────
function TrainingStrip({ userId }) {
  const [s, setS] = React.useState(null);
  React.useEffect(() => {
    if (!userId) { setS({ w7: 0, w30: 0 }); return; }
    const d7  = new Date(Date.now() - 7 * 86400000).toISOString();
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString();
    supabase.from('workout_sessions')
      .select('completed_at')
      .eq('client_id', userId)
      .not('completed_at', 'is', null)
      .gte('completed_at', d30)
      .then(({ data }) => {
        const rows = data || [];
        setS({ w30: rows.length, w7: rows.filter(r => r.completed_at >= d7).length });
      });
  }, [userId]);

  const Cell = ({ label, value }) => (
    <div style={{ flex: 1, textAlign: 'center', padding: '12px 6px' }}>
      <div className="mono" style={{ fontSize: 8.5, letterSpacing: '0.12em', color: 'var(--text-3)', marginBottom: 6 }}>{label}</div>
      <div className="h-bold" style={{ fontSize: 22, color: 'var(--accent)', lineHeight: 1 }}>{s ? value : '—'}</div>
      <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: '0.1em', marginTop: 4 }}>SESSIONS</div>
    </div>
  );
  return (
    <div className="card" style={{ padding: 0, display: 'flex' }}>
      <Cell label="LAST 7 DAYS"  value={s?.w7} />
      <div style={{ width: 1, background: 'var(--line)' }}/>
      <Cell label="LAST 30 DAYS" value={s?.w30} />
    </div>
  );
}

// ── GOAL ─────────────────────────────────────────────────────────
function GoalCard({ userId }) {
  const [goal, setGoal] = React.useState(undefined);
  React.useEffect(() => {
    if (!userId) { setGoal(null); return; }
    supabase.from('client_goals')
      .select('title, description, target_date, status')
      .eq('client_id', userId).eq('status', 'active')
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setGoal(data || null));
  }, [userId]);

  if (goal === undefined || !goal) return null;

  let countdown = null;
  if (goal.target_date) {
    const days = Math.ceil((new Date(goal.target_date) - new Date()) / 86400000);
    countdown = days < 0 ? 'Target date passed' : days === 0 ? 'Target is today' : `${days} day${days === 1 ? '' : 's'} to go`;
  }

  return (
    <div className="card" style={{
      padding: 16,
      background: 'linear-gradient(135deg, rgba(243,158,31,0.08), rgba(243,158,31,0.02)), var(--bg-2)',
      borderColor: 'color-mix(in srgb, var(--c-amber) 28%, var(--line))',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="label" style={{ color: 'var(--c-amber)' }}>// YOUR GOAL</div>
          <div className="h-bold" style={{ fontSize: 18, marginTop: 4, color: 'var(--heading-deep)' }}>{goal.title}</div>
          {goal.description && (
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 6 }}>{goal.description}</div>
          )}
        </div>
        {countdown && (
          <div style={{ textAlign: 'center', flexShrink: 0 }}>
            <Hex size={54} style={{ background: 'color-mix(in srgb, var(--c-amber) 16%, var(--bg-3))', border: '1px solid color-mix(in srgb, var(--c-amber) 40%, transparent)', color: 'var(--c-amber)', fontFamily: 'Orbitron', fontWeight: 800, fontSize: 15 }}>
              {goal.target_date ? Math.max(0, Math.ceil((new Date(goal.target_date) - new Date()) / 86400000)) : '—'}
            </Hex>
            <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: '0.1em', marginTop: 5 }}>DAYS LEFT</div>
          </div>
        )}
      </div>
      {countdown && (
        <div className="mono" style={{ fontSize: 9, color: 'var(--c-amber)', letterSpacing: '0.08em', marginTop: 10 }}>
          ◷ {countdown.toUpperCase()}
          {goal.target_date && ` · ${new Date(goal.target_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`}
        </div>
      )}
    </div>
  );
}

// ── TASKS ────────────────────────────────────────────────────────
// Tasks assigned by the trainer (client_tasks). Tap to tick off.
function TasksSection({ tasks, onToggle }) {
  const TASK_ICON = {
    check: IconClipboard,
    log:   IconScale,
    photo: IconCamera2,
    form:  IconDoc,
  };
  const TASK_KIND_COLOR = { check: 'var(--accent)', log: 'var(--c-amber)', photo: 'var(--c-blue)', form: 'var(--c-pink)' };
  const open = tasks.filter((t) => !t.done);
  const doneCount = tasks.length - open.length;
  return (
    <div>
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
          const tint = t.done ? 'var(--text-3)' : t.overdue ? 'var(--c-coral)' : 'var(--c-amber)';
          const kindCol = t.done ? 'var(--text-3)' : (TASK_KIND_COLOR[t.kind] || 'var(--accent)');
          return (
            <button key={t.id} onClick={() => onToggle(t)}
            style={{
              all: 'unset', cursor: 'pointer', display: 'block',
              opacity: t.done ? 0.62 : 1
            }}>
              <div className="card" style={{
                padding: 12, display: 'flex', alignItems: 'center', gap: 12,
                borderColor: t.done ? 'var(--line)' : `color-mix(in srgb, ${tint} 30%, var(--line))`
              }}>
                <Hex size={34} square style={{
                  background: `color-mix(in srgb, ${kindCol} 16%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${kindCol} 40%, transparent)`,
                  color: kindCol, flexShrink: 0
                }}>
                  <Icon size={16} />
                </Hex>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textDecoration: t.done ? 'line-through' : 'none' }}>
                    {t.title}
                  </div>
                  <div className="mono" style={{ fontSize: 9.5, color: t.overdue ? 'var(--c-coral)' : 'var(--text-3)', letterSpacing: '0.04em', marginTop: 3 }}>
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
                }}>{t.kind === 'form' ? 'OPEN' : 'MARK DONE'}</span>}
              </div>
            </button>);
        })}
      </div>
    </div>);

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

  // Pull the full phase list for the programme so upcoming phases show too —
  // the roadmap reflects the assigned programme's structure, not just the
  // days that happen to have workouts.
  const { data: allPhases } = await supabase
    .from('programme_phases')
    .select('id, phase_index, name, weeks')
    .eq('programme_id', main.prog.id)
    .order('phase_index');

  const phases = (allPhases && allPhases.length
    ? allPhases.map(p => ({
        id: p.id, idx: p.phase_index, name: p.name, weeks: p.weeks,
        total: main.phases[p.id]?.total || 0, done: main.phases[p.id]?.done || 0,
      }))
    : Object.values(main.phases).sort((a, b) => a.idx - b.idx));

  let seenCurrent = false;
  phases.forEach(p => {
    if (p.total > 0 && p.done === p.total) { p.status = 'done'; return; }
    if (!seenCurrent) { p.status = 'current'; seenCurrent = true; }
    else p.status = 'upcoming';
  });

  const totalSessions = phases.reduce((n, p) => n + p.total, 0);
  const doneSessions  = phases.reduce((n, p) => n + p.done,  0);

  // Line fill aligned to the phase nodes: every finished phase reaches its node,
  // and the current phase fills toward the next node by how much of it is done
  // (sessions complete ≈ weeks elapsed, so a 4-week phase advances ~25%/week).
  const n = phases.length;
  const curIdx = phases.findIndex(p => p.status === 'current');
  let lineFraction;
  if (curIdx === -1) {
    lineFraction = phases.some(p => p.status === 'done') ? 1 : 0; // all done, or nothing started
  } else {
    const cur = phases[curIdx];
    const frac = cur.total > 0 ? cur.done / cur.total : 0;
    lineFraction = n > 1 ? (curIdx + frac) / (n - 1) : frac;
  }
  lineFraction = Math.max(0, Math.min(1, lineFraction));

  return {
    name: main.prog.name,
    phases,
    pct: totalSessions > 0 ? doneSessions / totalSessions : 0,
    lineFraction,
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

  const { name, phases, pct, lineFraction, doneSessions, totalSessions } = roadmap;
  const overallPct = lineFraction ?? pct;

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

