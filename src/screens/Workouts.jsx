import React from 'react'
import { supabase } from '../lib/supabase'
import { HEX_RATIO, Hex, HexBackButton } from '../components/hex'
import { IconBand, IconCalendar, IconCheck, IconChevronLeft, IconChevronRight, IconClock, IconDumbbell, IconFlame, IconLeaf, IconTarget } from '../components/icons'
import { bandOf } from '../components/bands'
import { SectionGlyph } from '../lib/svgIcon'
import { SkeletonCard, EmptyState } from '../components/Loading'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekMonday(date) {
  const d = new Date(date);
  const dow = d.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtDate(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function deriveTarget(sets, unilateral) {
  if (!sets || sets.length === 0) return '—';
  const sorted = [...sets].sort((a, b) => a.set_index - b.set_index);
  const reps = sorted[0]?.reps;
  return `${sorted.length} × ${reps || '—'}${unilateral ? ' ea' : ''}`;
}

function deriveLoad(sets, banded) {
  if (!sets || sets.length === 0) return '—';
  const sorted = [...sets].sort((a, b) => a.set_index - b.set_index);
  if (banded) { const b = bandOf(sorted[0]?.band); return b ? `${b.short} BAND` : 'BAND'; }
  const kg = sorted[0]?.weight_kg;
  if (!kg || parseFloat(kg) === 0) return '—';
  return `${parseFloat(kg)}kg`;
}

function shapeWorkout(row) {
  const day = row.programme_days;
  if (!day) return null;
  const phase = day.programme_phases;
  const programme = phase?.programmes;

  const sections = (day.workout_sections || [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(s => {
      // Estimate per section from logged rest + any clocked (timed) work.
      let secRest = 0, secWork = 0;
      (s.section_exercises || []).forEach(ex => (ex.exercise_sets || []).forEach(st => {
        secRest += parseInt(st.rest_secs) || 0;
        if (ex.timed) secWork += parseInt(st.time_secs) || 0;
      }));
      const fromClock = secRest + secWork;
      const minutes = fromClock > 0
        ? Math.max(1, Math.round(fromClock / 60))
        : Math.max(5, (s.section_exercises?.length || 0) * 3);
      return {
        kind: s.kind,
        title: s.title,
        icon: s.icon || '',
        minutes, _secs: fromClock,
        intro: '',
        items: (s.section_exercises || [])
          .sort((a, b) => a.sort_order - b.sort_order)
          .map(ex => ({
            name: ex.name,
            img: ex.img_url || null,
            tempo: ex.tempo || '',
            ss: ex.superset_group ?? null,
            target: deriveTarget(ex.exercise_sets, ex.unilateral),
            load: deriveLoad(ex.exercise_sets, ex.banded),
          })),
      };
    });

  const exerciseCount = sections.reduce((n, s) => n + s.items.length, 0);
  // Total ≈ all rest timers + clocked work + a 5-min transition buffer.
  const clockedSecs = sections.reduce((n, s) => n + s._secs, 0);
  const duration = clockedSecs > 0
    ? Math.round(clockedSecs / 60) + 5
    : (sections.reduce((n, s) => n + s.minutes, 0) || 45);
  const dayLabel = DAY_LABELS[day.day_of_week] || `Day ${day.day_of_week + 1}`;

  return {
    id: row.id,
    dayId: day.id,
    date: row.scheduled_date,
    status: row.status,
    name: day.title ? day.title : `${phase?.name || 'Workout'} · ${dayLabel}`,
    tag: programme?.tag || 'STRENGTH',
    phase: programme?.name || '',
    duration,
    exercises: exerciseCount,
    coachNotes: day.notes || '',
    img: day.image_url || null,
    sections,
  };
}

// Superset labels (A1/A2…) per section, mirroring the builder.
function ssLabels(items) {
  const seen = {}; let li = 0; const cnt = {};
  return (items || []).map(it => {
    if (it.ss == null) return null;
    if (!(it.ss in seen)) seen[it.ss] = String.fromCharCode(65 + li++);
    cnt[it.ss] = (cnt[it.ss] || 0) + 1;
    return `${seen[it.ss]}${cnt[it.ss]}`;
  });
}

export function Workouts({ go, openPreview, userId }) {
  const [workouts, setWorkouts] = React.useState([]);
  const [loading, setLoading]   = React.useState(true);
  const [weekOffset, setWeekOffset] = React.useState(0);
  const [previewId, setPreviewId]   = React.useState(null);
  const [reschedulingId, setReschedulingId] = React.useState(null);
  const [showYear, setShowYear]     = React.useState(false);

  const today = fmtDate(new Date());
  const anchor = React.useMemo(() => getWeekMonday(new Date()), []);

  React.useEffect(() => {
    if (!userId) return;
    setLoading(true);
    const query = (dayFields, sectionFields) => supabase
      .from('client_workouts')
      .select(`
        id, scheduled_date, status,
        programme_days (
          ${dayFields},
          programme_phases (
            id, name, phase_index,
            programmes ( id, name, tag )
          ),
          workout_sections (
            ${sectionFields},
            section_exercises (
              id, name, img_url, tempo, timed, banded, unilateral, superset_group, sort_order,
              exercise_sets ( set_index, reps, weight_kg, band, rest_secs, time_secs )
            )
          )
        )
      `)
      .eq('client_id', userId)
      .order('scheduled_date');

    (async () => {
      let { data, error } = await query('id, day_of_week, notes, image_url, title', 'id, kind, title, sort_order, icon');
      // Fallback if migration 041 (cover photo) isn't applied yet.
      if (error) ({ data, error } = await query('id, day_of_week, notes', 'id, kind, title, sort_order, icon'));
      // Fallback if migration 037 (per-section icon) isn't applied yet.
      if (error) ({ data } = await query('id, day_of_week, notes', 'id, kind, title, sort_order'));
      if (data) setWorkouts(data.map(shapeWorkout).filter(Boolean));
      setLoading(false);
    })();
  }, [userId]);

  const weekStart = React.useMemo(() => {
    const d = new Date(anchor);
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [anchor, weekOffset]);

  const weekDates = React.useMemo(() =>
    Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    }), [weekStart]);

  const workoutsByDate = React.useMemo(() => {
    const m = {};
    workouts.forEach(w => { (m[w.date] = m[w.date] || []).push(w); });
    return m;
  }, [workouts]);

  const reschedule = async (id, newDate) => {
    setWorkouts(prev => prev.map(w => w.id === id ? { ...w, date: newDate } : w));
    setReschedulingId(null);
    await supabase.from('client_workouts').update({ scheduled_date: newDate }).eq('id', id);
  };

  React.useEffect(() => {
    if (openPreview) setPreviewId(openPreview);
  }, [openPreview]);

  const previewWorkout = workouts.find(w => w.id === previewId);
  const weekLabel = `${weekDates[0].toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })} – ${weekDates[6].toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}`;
  const tagDot = t => t === 'CARDIO' ? 'var(--c-coral)' : t === 'RECOVERY' ? 'var(--c-amber)' : 'var(--accent)';
  const dayName = dt => dt.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase();

  return (
    <div className="scroller" style={{ padding: '0 16px 28px', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 18px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
        <div>
          <div className="label">// PROGRAMME</div>
          <div className="h-bold" style={{ fontSize: 24, marginTop: 4 }}>SCHEDULE</div>
        </div>
        <button onClick={() => setShowYear(true)} className="mono" style={{
          all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 12px', borderRadius: 10, background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
          color: 'var(--text-2)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
        }}>
          <IconCalendar size={13}/> YEAR
        </button>
      </div>

      {/* Week nav */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={() => setWeekOffset(o => o - 1)} aria-label="Previous week" style={{ all: 'unset', cursor: 'pointer', display: 'grid', placeItems: 'center', width: 34 * HEX_RATIO, height: 34 }}>
          <Hex size={34} square style={{ background: 'var(--bg-2)', border: '1px solid var(--line-strong)', color: 'var(--text)' }}>
            <IconChevronLeft size={14}/>
          </Hex>
        </button>
        <div style={{ textAlign: 'center' }}>
          <div className="h-bold" style={{ fontSize: 13 }}>{weekLabel.toUpperCase()}</div>
          <button onClick={() => setWeekOffset(0)} className="mono" style={{
            background: 'none', border: 0,
            color: weekOffset === 0 ? 'var(--accent)' : 'var(--text-3)',
            fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', marginTop: 2,
          }}>{weekOffset === 0 ? '● THIS WEEK' : 'GO TO TODAY'}</button>
        </div>
        <button onClick={() => setWeekOffset(o => o + 1)} aria-label="Next week" style={{ all: 'unset', cursor: 'pointer', display: 'grid', placeItems: 'center', width: 34 * HEX_RATIO, height: 34 }}>
          <Hex size={34} square style={{ background: 'var(--bg-2)', border: '1px solid var(--line-strong)', color: 'var(--text)' }}>
            <IconChevronRight size={14}/>
          </Hex>
        </button>
      </div>

      {/* Reschedule banner */}
      {reschedulingId && (
        <div className="card" style={{
          marginBottom: 12, padding: 12, display: 'flex', alignItems: 'center', gap: 10,
          borderColor: 'color-mix(in srgb, var(--accent) 50%, transparent)',
          background: 'var(--accent-soft)',
        }}>
          <IconCalendar size={16} style={{ color: 'var(--accent)' }}/>
          <div style={{ flex: 1, fontSize: 12 }}>
            <div className="label" style={{ color: 'var(--accent)' }}>// MOVE SESSION</div>
            <div style={{ marginTop: 2 }}>Tap a day below to reschedule</div>
          </div>
          <button className="btn-ghost" onClick={() => setReschedulingId(null)}>CANCEL</button>
        </div>
      )}

      {/* Loading state */}
      {loading && <SkeletonCard rows={4} />}

      {/* Week rows */}
      {!loading && (
        <div className="stagger-in" style={{ display: 'grid', gap: 8 }}>
          {weekDates.map(dt => {
            const dateStr = fmtDate(dt);
            const dayWorkouts = workoutsByDate[dateStr] || [];
            const isToday = dateStr === today;
            const isPast  = dateStr < today;
            const isResched = reschedulingId !== null;

            return (
              <div key={dateStr}
                onClick={() => isResched && reschedule(reschedulingId, dateStr)}
                style={{
                  display: 'grid', gridTemplateColumns: '48px 1fr', gap: 12,
                  padding: '12px 14px',
                  background: isToday ? 'linear-gradient(90deg, var(--accent-soft), transparent 40%), var(--bg-2)' : 'var(--bg-2)',
                  border: '1px solid ' + (isResched ? 'var(--accent)' : isToday ? 'color-mix(in srgb, var(--accent) 40%, var(--line))' : 'var(--line)'),
                  borderRadius: 12,
                  opacity: isPast && !isToday ? 0.55 : 1,
                  cursor: isResched ? 'pointer' : 'default',
                }}>
                <div style={{ textAlign: 'center', borderRight: '1px solid var(--line)', paddingRight: 10 }}>
                  <div className="mono" style={{ fontSize: 9, letterSpacing: '0.14em', color: isToday ? 'var(--accent)' : 'var(--text-3)' }}>
                    {dayName(dt)}
                  </div>
                  <div className="h-bold" style={{ fontSize: 22, marginTop: 2, lineHeight: 1, whiteSpace: 'nowrap', color: isToday ? 'var(--accent)' : 'var(--text)' }}>
                    {dt.getDate()}
                  </div>
                  {isToday && <div className="mono" style={{ fontSize: 8, color: 'var(--accent)', letterSpacing: '0.14em', marginTop: 2 }}>TODAY</div>}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                  {dayWorkouts.length === 0 && (
                    <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', padding: '6px 0' }}>
                      REST DAY
                    </div>
                  )}
                  {dayWorkouts.map(w => {
                    const done = w.status === 'completed';
                    return (
                      <button key={w.id}
                        onClick={e => { if (!isResched) { e.stopPropagation(); done ? go('sessionresults', { dayId: w.dayId }) : setPreviewId(w.id); } }}
                        style={{
                          all: 'unset', cursor: isResched ? 'inherit' : 'pointer',
                          display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10,
                          alignItems: 'center', padding: '8px 10px',
                          background: done ? `color-mix(in srgb, ${tagDot(w.tag)} 15%, var(--bg-3))` : 'var(--bg-3)',
                          border: '1px solid ' + (done ? `color-mix(in srgb, ${tagDot(w.tag)} 45%, transparent)` : 'var(--line)'),
                          borderRadius: 10,
                        }}>
                        {done ? (
                          <Hex size={18} square style={{ background: tagDot(w.tag), flexShrink: 0, color: 'var(--on-accent)', boxShadow: `0 0 calc(6px * var(--glow)) ${tagDot(w.tag)}` }}>
                            <IconCheck size={10} sw={3}/>
                          </Hex>
                        ) : (
                          <Hex size={11} square style={{ flexShrink: 0, background: tagDot(w.tag), boxShadow: `0 0 calc(6px * var(--glow)) ${tagDot(w.tag)}` }}/>
                        )}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace" }}>
                            {w.name}
                          </div>
                          <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em', marginTop: 2 }}>
                            {w.tag} · {w.duration}M · {w.exercises} EX
                            {done && <span style={{ color: tagDot(w.tag), marginLeft: 8 }}>· ✓ DONE</span>}
                          </div>
                        </div>
                        <IconChevronRight size={14} style={{ color: 'var(--text-3)' }}/>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && workouts.length === 0 && (
        <EmptyState icon="Rocket" title="No workouts assigned yet"
          sub="Your coach is building your plan — sessions will land here the moment they’re assigned."
          style={{ marginTop: 12 }} />
      )}

      {previewWorkout && (
        <WorkoutPreview
          w={previewWorkout}
          onClose={() => setPreviewId(null)}
          onStart={() => { setPreviewId(null); go('log', { dayId: previewWorkout?.dayId }); }}
          onReschedule={() => { setReschedulingId(previewWorkout.id); setPreviewId(null); }}
        />
      )}

      {showYear && <YearView workouts={workouts} onClose={() => setShowYear(false)} />}
    </div>
  );
}

// ── YEAR HEATMAP ─────────────────────────────────────────────────
// Green = trained, red = missed (past, not completed), grey = rest day.
const HEAT = {
  green:  { bg: '#46bbc0', fg: '#fff' },
  red:    { bg: '#E0574F', fg: '#fff' },
  future: { bg: 'var(--accent-soft)', fg: 'var(--accent)' },
  rest:   { bg: 'var(--bg-3)', fg: 'var(--text-3)' },
};
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function YearView({ workouts, onClose }) {
  const [year, setYear] = React.useState(new Date().getFullYear());
  const today = fmtDate(new Date());

  // date -> best status for the day
  const map = React.useMemo(() => {
    const rank = { green: 3, red: 2, future: 1 };
    const m = {};
    workouts.forEach(w => {
      const d = w.date;
      const s = w.status === 'completed' ? 'green' : (d < today ? 'red' : 'future');
      if (!m[d] || rank[s] > rank[m[d]]) m[d] = s;
    });
    return m;
  }, [workouts, today]);

  let green = 0, red = 0;
  Object.entries(map).forEach(([d, s]) => {
    if (d.slice(0, 4) === String(year)) { if (s === 'green') green++; else if (s === 'red') red++; }
  });
  const tracked = green + red;
  const pctGreen = tracked ? Math.round((green / tracked) * 100) : 0;

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(7,7,12,0.6)', backdropFilter: 'blur(6px)', animation: 'fadeIn .2s ease' }}>
      <div onClick={e => e.stopPropagation()} style={{ position: 'absolute', inset: 0, background: 'var(--bg-1)', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div style={{ padding: 'max(54px, calc(env(safe-area-inset-top, 0px) + 14px)) 16px 12px', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <HexBackButton onClick={onClose} size={34} />
          <div style={{ flex: 1 }}>
            <div className="label">// TRAINING YEAR</div>
            <div className="h-bold" style={{ fontSize: 18, marginTop: 2 }}>CALENDAR</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => setYear(y => y - 1)} style={yrBtn}><IconChevronLeft size={14}/></button>
            <span className="h-bold" style={{ fontSize: 16, minWidth: 54, textAlign: 'center' }}>{year}</span>
            <button onClick={() => setYear(y => y + 1)} disabled={year >= new Date().getFullYear()} style={{ ...yrBtn, opacity: year >= new Date().getFullYear() ? 0.4 : 1 }}><IconChevronRight size={14}/></button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--line)' }}>
          <div style={{ flex: 1, textAlign: 'center', padding: '12px 0' }}>
            <div className="h-bold" style={{ fontSize: 22, color: '#189caa' }}>{tracked}</div>
            <div className="mono" style={{ fontSize: 8.5, color: 'var(--text-3)', letterSpacing: '0.1em', marginTop: 3 }}>DAYS TRACKED</div>
          </div>
          <div style={{ width: 1, background: 'var(--line)' }}/>
          <div style={{ flex: 1, textAlign: 'center', padding: '12px 0' }}>
            <div className="h-bold" style={{ fontSize: 22, color: '#46bbc0' }}>{pctGreen}<span style={{ fontSize: 11 }}>%</span></div>
            <div className="mono" style={{ fontSize: 8.5, color: 'var(--text-3)', letterSpacing: '0.1em', marginTop: 3 }}>DAYS COMPLETED</div>
          </div>
        </div>

        {/* Months */}
        <div className="scroller" style={{ flex: 1, minHeight: 0, padding: '14px 16px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
            {MONTHS.map((mn, mi) => <MonthGrid key={mi} year={year} month={mi} map={map} today={today} />)}
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 22, flexWrap: 'wrap' }}>
            <Legend color={HEAT.green.bg} label="TRAINED" />
            <Legend color={HEAT.red.bg} label="MISSED" />
            <Legend color="var(--bg-3)" label="REST" />
          </div>
        </div>
      </div>
    </div>
  );
}

function MonthGrid({ year, month, map, today }) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Mon-based leading blanks
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  return (
    <div>
      <div className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-2)', marginBottom: 6 }}>{MONTHS[month].toUpperCase()}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={'h'+i} className="mono" style={{ fontSize: 6.5, color: 'var(--text-3)', textAlign: 'center', marginBottom: 1 }}>{d}</div>
        ))}
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const ds = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const status = map[ds] || 'rest';
          const h = HEAT[status];
          const isToday = ds === today;
          return (
            <div key={i} style={{
              aspectRatio: '1', borderRadius: 4, background: h.bg, color: h.fg,
              display: 'grid', placeItems: 'center', fontFamily: 'JetBrains Mono', fontSize: 7.5, fontWeight: 600,
              border: isToday ? '1.5px solid var(--accent)' : '1px solid transparent',
            }}>{d}</div>
          );
        })}
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, background: color, border: '1px solid var(--line)' }}/>
      <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.08em' }}>{label}</span>
    </div>
  );
}

const yrBtn = {
  all: 'unset', cursor: 'pointer', width: 30, height: 30, borderRadius: 8,
  background: 'var(--bg-2)', border: '1px solid var(--line-strong)', color: 'var(--text)',
  display: 'grid', placeItems: 'center',
};

// ── PREVIEW ──────────────────────────────────────────────────────
export function WorkoutPreview({ w, onClose, onStart, onReschedule }) {
  const [openSection, setOpenSection]   = React.useState(null);
  const [expandedSection, setExpandedSection] = React.useState(null);

  const sections = w.sections || [
    { kind: 'MAIN', title: 'Workout', minutes: w.duration, items: w.preview || [], intro: '' },
  ];

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 50,
      background: 'rgba(7,7,12,0.55)',
      backdropFilter: 'blur(6px)',
      animation: 'fadeIn .2s ease',
    }}>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes slideRight { from { transform: translateX(100%) } to { transform: translateX(0) } }
      `}</style>
      <div onClick={e => e.stopPropagation()} style={{
        position: 'absolute', inset: 0,
        background: 'var(--bg-1)',
        display: 'flex', flexDirection: 'column',
        animation: 'slideUp .25s ease',
      }}>
        {openSection ? (
          <SectionDetail s={openSection} onBack={() => setOpenSection(null)}/>
        ) : (
          <PreviewBody
            w={w}
            sections={sections}
            expanded={expandedSection}
            onToggle={idx => setExpandedSection(expandedSection === idx ? null : idx)}
            onOpenSection={s => setOpenSection(s)}
            onClose={onClose}
            onStart={onStart}
            onReschedule={onReschedule}
          />
        )}
      </div>
    </div>
  );
}

function PreviewBody({ w, sections, expanded, onToggle, onOpenSection, onClose, onStart, onReschedule }) {
  return (
    <>
      <div style={{
        height: w.img ? 168 : 118, position: 'relative', flexShrink: 0,
        background: w.img
          ? `linear-gradient(180deg, rgba(7,7,12,0.35) 0%, transparent 30%, rgba(17,22,26,0.95) 100%), url('${w.img}') center/cover, var(--bg-3)`
          : `linear-gradient(180deg, color-mix(in srgb, var(--accent) 12%, var(--bg-2)) 0%, var(--bg-1) 100%)`,
      }}>
        <HexBackButton onClick={onClose} variant="overlay" size={38}
          style={{ position: 'absolute', top: 14, left: 14, zIndex: 2 }}/>
        <div style={{ position: 'absolute', left: 18, right: 18, bottom: 16 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {w.phase && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 999,
                background: 'var(--accent-2)', color: 'var(--on-accent)',
                fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
              }}>
                <IconTarget size={11}/>
                {w.phase.toUpperCase()}
              </span>
            )}
          </div>
          <div className="h-bold" style={{ fontSize: 26, lineHeight: 1.1, color: '#eceff4', textShadow: '0 2px 16px rgba(0,0,0,0.85)' }}>
            {w.name.toUpperCase()}
          </div>
        </div>
      </div>

      <div className="scroller" style={{ flex: 1, padding: '16px 18px 0', minHeight: 0 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 6 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconClock size={12} style={{ color: 'var(--accent)' }}/>
            ~{w.duration} mins
          </span>
          <span style={{ width: 3, height: 3, background: 'var(--text-3)', borderRadius: '50%' }}/>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', letterSpacing: '0.06em' }}>
            {sections.length} sections
          </span>
          <span style={{ width: 3, height: 3, background: 'var(--text-3)', borderRadius: '50%' }}/>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', letterSpacing: '0.06em' }}>
            {sections.reduce((n, s) => n + s.items.length, 0)} exercises
          </span>
        </div>
        <div style={{ marginBottom: 14 }} />

        {w.coachNotes && (
          <div style={{
            padding: '10px 12px', borderRadius: 8, marginBottom: 14,
            background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)',
          }}>
            <div className="label" style={{ color: 'var(--accent)', marginBottom: 4 }}>// COACH NOTES</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55, fontFamily: 'JetBrains Mono' }}>
              {w.coachNotes}
            </div>
          </div>
        )}

        <div style={{ display: 'grid', gap: 10, marginBottom: 100 }}>
          {sections.map((s, si) => (
            <SectionAccordion
              key={si} s={s} index={si}
              expanded={expanded === si}
              onToggle={() => onToggle(si)}
              onOpen={() => onOpenSection(s)}
            />
          ))}
        </div>
      </div>

      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        padding: '14px 18px 28px',
        background: 'linear-gradient(180deg, transparent, var(--bg-1) 30%)',
        display: 'flex', gap: 10,
      }}>
        <button style={{ all: 'unset', cursor: 'pointer', flex: '0 0 auto', display: 'grid', placeItems: 'center' }} onClick={onReschedule} aria-label="Reschedule">
          <Hex size={48} square style={{ background: 'var(--bg-2)', border: '1px solid var(--line-strong)', color: 'var(--text)' }}>
            <IconCalendar size={16}/>
          </Hex>
        </button>
        {w.status === 'completed' ? (
          <button className="btn-ghost" style={{ flex: 1, borderColor: 'var(--lime)', color: 'var(--lime)' }} onClick={onClose}>
            VIEW LOG
          </button>
        ) : (
          <button className="btn-primary" style={{ flex: 1, padding: '14px' }} onClick={onStart}>
            START WORKOUT
          </button>
        )}
      </div>
    </>
  );
}

function SectionAccordion({ s, index, expanded, onToggle, onOpen }) {
  const color = sectionColor(s.kind);
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', borderTop: '1px solid var(--line)' }}>
      <button onClick={onToggle} style={{
        all: 'unset', cursor: 'pointer', width: '100%',
        padding: '12px 2px',
        display: 'grid', gridTemplateColumns: '34px 1fr auto', gap: 12, alignItems: 'center',
      }}>
        <span style={{ display: 'grid', placeItems: 'center', width: 30, height: 28, color }}>
          <SectionGlyph icon={s.icon} kind={s.kind} size={22} color={color} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="h-bold" style={{ fontSize: 15, lineHeight: 1.2, color: color }}>{s.title}</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', marginTop: 3 }}>
            {s.items.length} EXERCISES · {s.minutes} MIN
          </div>
        </div>
        <div style={{ color: 'var(--text-3)', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .2s' }}>
          <IconChevronRight size={16}/>
        </div>
      </button>

      <div style={{ padding: '0 2px 10px' }}>
        <div style={{ display: 'grid', gap: 2 }}>
          {ssLabels(s.items).map((lbl, i) => {
            const e = s.items[i];
            return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center',
              padding: '7px 0',
              borderTop: i === 0 ? '1px solid var(--line)' : '1px solid color-mix(in srgb, var(--line) 55%, transparent)',
            }}>
              {lbl
                ? <span className="mono" style={{ fontSize: 8, fontWeight: 800, color: 'var(--accent-2)', background: 'color-mix(in srgb, var(--accent-2) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-2) 40%, transparent)', borderRadius: 4, padding: '1px 4px', flexShrink: 0 }}>{lbl}</span>
                : <span style={{ width: 5, height: 5, borderRadius: 1.5, background: color, flexShrink: 0 }}/>}
              <span style={{ fontSize: 12.5, color: 'var(--text)', fontWeight: 500, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono', monospace" }}>
                {e.name}
              </span>
              <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.04em', flexShrink: 0 }}>
                {e.target}
              </span>
            </div>
            );
          })}
        </div>
      </div>

      {expanded && (
        <div style={{ padding: '0 2px 14px', borderTop: '1px solid var(--line)', animation: 'slideUp .2s ease' }}>
          {s.intro && (
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.55, padding: '12px 0', whiteSpace: 'pre-line', fontFamily: "'JetBrains Mono', monospace" }}>
              {s.intro}
            </div>
          )}
          <button onClick={e => { e.stopPropagation(); onOpen(); }} style={{
            all: 'unset', cursor: 'pointer', width: '100%',
            marginTop: 10, padding: '10px',
            textAlign: 'center',
            background: 'var(--bg-3)', border: '1px solid var(--line-strong)', borderRadius: 8,
            fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 600,
            letterSpacing: '0.14em', color: 'var(--accent)', boxSizing: 'border-box',
          }}>
            VIEW SECTION DETAIL →
          </button>
        </div>
      )}
    </div>
  );
}

function ExerciseRow({ e, large, color, ssLabel }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12,
      alignItems: 'center', padding: large ? '10px 0' : '8px 0',
      borderBottom: large ? '1px solid var(--line)' : 'none',
    }}>
      <div style={{
        width: large ? 56 : 44, height: large ? 56 : 44, borderRadius: 10, flexShrink: 0,
        background: `url('${e.img || 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200&q=70'}') center/cover, var(--bg-3)`,
        border: '1px solid var(--line-strong)', position: 'relative',
      }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 10,
          background: 'linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.35))',
          display: 'grid', placeItems: 'center',
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white" opacity="0.95"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {ssLabel && <span className="mono" style={{ fontSize: 8.5, fontWeight: 800, color: 'var(--accent-2)', background: 'color-mix(in srgb, var(--accent-2) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-2) 40%, transparent)', borderRadius: 5, padding: '1px 5px', flexShrink: 0 }}>SS {ssLabel}</span>}
          <div style={{ fontSize: large ? 15 : 13.5, fontWeight: 600, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.04em', marginTop: 3 }}>
          {e.load && e.load !== '—' ? `${e.load} · ` : ''}{e.target}
        </div>
      </div>
      <IconChevronRight size={14} style={{ color: 'var(--text-3)' }}/>
    </div>
  );
}

function SectionDetail({ s, onBack }) {
  const color = sectionColor(s.kind);
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'var(--bg-1)', display: 'flex', flexDirection: 'column',
      animation: 'slideRight .25s ease',
    }}>
      <div style={{
        padding: 'max(54px, calc(env(safe-area-inset-top, 0px) + 14px)) 18px 12px',
        display: 'grid', gridTemplateColumns: '40px 1fr 40px', alignItems: 'center', gap: 8,
        borderBottom: '1px solid var(--line)',
      }}>
        <HexBackButton onClick={onBack} size={36}/>
        <div style={{ textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 9, letterSpacing: '0.16em', color, fontWeight: 600 }}>SECTION</div>
          <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2 }}>{s.title}</div>
        </div>
        <div/>
      </div>

      <div className="scroller" style={{ flex: 1, padding: '20px 18px 28px' }}>
        <div className="h-bold" style={{ fontSize: 22, lineHeight: 1.1, marginBottom: 8 }}>{s.title.toUpperCase()}</div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <IconClock size={12} style={{ color }}/>
            {s.minutes} mins
          </span>
          <span style={{ width: 3, height: 3, background: 'var(--text-3)', borderRadius: '50%' }}/>
          <span className="mono" style={{ fontSize: 11, color: 'var(--text-2)', letterSpacing: '0.06em' }}>
            {s.items.length} exercises
          </span>
        </div>
        {s.intro && (
          <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 22, whiteSpace: 'pre-line' }}>
            {s.intro}
          </div>
        )}
        <div className="label" style={{ margin: '4px 0 10px' }}>// EXERCISES</div>
        <div>
          {ssLabels(s.items).map((lbl, i) => <ExerciseRow key={i} e={s.items[i]} ssLabel={lbl} color={color} large/>)}
        </div>
      </div>
    </div>
  );
}

function sectionColor(kind) {
  return kind === 'PULSE_RAISER' ? 'var(--c-coral)'
    : kind === 'BANDED'   ? 'var(--c-amber)'
    : kind === 'COOLDOWN' ? 'var(--c-blue)'
    : 'var(--accent)';
}

function sectionIcon(kind) {
  return kind === 'PULSE_RAISER' ? s => <IconFlame size={s}/>
    : kind === 'BANDED'   ? s => <IconBand size={s}/>
    : kind === 'COOLDOWN' ? s => <IconLeaf size={s}/>
    : s => <IconDumbbell size={s}/>;
}
