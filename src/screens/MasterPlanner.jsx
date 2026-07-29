import React from 'react'
import { supabase } from '../lib/supabase'
import { HexBackButton } from '../components/hex'
import { IconChevronRight, IconPlus, IconX2 } from '../components/icons'
import { ExercisePicker } from './ProgrammeBuilder'
import { BANDS, bandOf } from '../components/bands'
import { SkeletonCard } from '../components/Loading'
import { useDesktop } from '../lib/useDesktop'
import { copyDayToSlots } from '../lib/programmeCopy'
import { toast } from '../lib/toast'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SECTION_LABEL = { MAIN: 'Workout', PULSE_RAISER: 'Pulse Raiser', BANDED: 'Activation', COOLDOWN: 'Cooldown' };
const sectionTag = (kind) => kind === 'BANDED' ? 'FREESTYLE' : 'REGULAR';
const sectionColor = (kind) => kind === 'PULSE_RAISER' ? 'var(--c-coral)' : kind === 'BANDED' ? 'var(--c-amber)' : kind === 'COOLDOWN' ? 'var(--accent-2)' : 'var(--accent)';
const IMG_FALLBACK = 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=200&q=70';

const fmtSecs = (s) => {
  s = parseInt(s) || 0;
  if (!s) return '-';
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const parseClock = (v) => {
  if (v == null) return 0;
  v = String(v).trim();
  if (v.includes(':')) { const [m, s] = v.split(':'); return (parseInt(m) || 0) * 60 + (parseInt(s) || 0); }
  return parseInt(v) || 0;
};

const SELECT = 'id, phase_id, week_index, day_of_week, intro, workout_sections(id, title, kind, sort_order, section_exercises(id, name, img_url, timed, banded, unilateral, tempo, coach_notes, alternates, superset_group, sort_order, exercise_sets(id, set_index, kind, reps_text, reps, weight_kg, band, rest_secs, time_secs, intensity)))';

// Master Planner - every day of the programme pulled out at once, fully editable
// inline. Two layouts: same day across all weeks ("Week by Week"), or all seven
// days of one week ("Day by Day").
export function MasterPlanner({ programme, onClose, onPickDay }) {
  const phaseList = programme.phaseList || [];
  const phaseIds = phaseList.map(p => p.id).filter(Boolean);

  const [mode, setMode]   = React.useState('week');
  const [dow, setDow]     = React.useState(0);
  const [gweek, setGweek] = React.useState(0);
  const [days, setDays]   = React.useState(null);
  const [addingTo, setAddingTo] = React.useState(null); // { sectionId }
  const [optionsExId, setOptionsExId] = React.useState(null); // exercise options sheet
  const [copyFrom, setCopyFrom] = React.useState(null); // { day, title, sub }
  const [copying, setCopying]   = React.useState(false);

  const weeks = [];
  phaseList.forEach((ph, pi) => {
    for (let w = 0; w < (ph.weeks || 0); w++) weeks.push({ phaseIdx: pi, phaseId: ph.id, phaseName: ph.name, weekInPhase: w, label: `Week ${weeks.length + 1}` });
  });

  const reload = React.useCallback(() => {
    if (!phaseIds.length) { setDays({}); return; }
    supabase.from('programme_days').select(SELECT).in('phase_id', phaseIds)
      .then(({ data }) => {
        const map = {};
        (data || []).forEach(d => { map[`${d.phase_id}|${d.week_index}|${d.day_of_week}`] = d; });
        setDays(map);
      });
  }, [programme.id]);
  React.useEffect(() => { reload(); }, [reload]);

  const dayAt = (phaseId, weekInPhase, dowIdx) => days?.[`${phaseId}|${weekInPhase}|${dowIdx}`] || null;

  // ── Inline edits (persist immediately, update optimistically) ──
  const patchSet = (setId, patch, dbPatch) => {
    setDays(prev => mapSets(prev, setId, st => ({ ...st, ...patch })));
    supabase.from('exercise_sets').update(dbPatch ?? patch).eq('id', setId).then(() => {});
  };
  const addSet = async (ex) => {
    const last = ex.exercise_sets[ex.exercise_sets.length - 1];
    const row = {
      exercise_id: ex.id, set_index: ex.exercise_sets.length, kind: 'WORK',
      reps: last?.reps ?? 8, reps_text: last?.reps_text || '8',
      weight_kg: last?.weight_kg ?? 0, rest_secs: last?.rest_secs ?? 60, time_secs: last?.time_secs ?? 60,
    };
    await supabase.from('exercise_sets').insert(row);
    reload();
  };
  const delSet = async (setId) => { await supabase.from('exercise_sets').delete().eq('id', setId); reload(); };
  const delExercise = async (exId) => { await supabase.from('section_exercises').delete().eq('id', exId); reload(); };

  // Exercise-level edits (toggles, tempo, notes, alternates, swap). Applied
  // optimistically then persisted, matching how set edits behave here.
  const patchExercise = (exId, patch) => {
    setDays(prev => mapExercises(prev, exId, ex => ({ ...ex, ...patch })));
    supabase.from('section_exercises').update(patch).eq('id', exId).then(() => {});
  };
  // Reorder within a section: renumber sort_order and persist each row. The
  // planner has no save step, so the new order is written immediately.
  const moveExercise = (sectionId, from, to) => {
    const sec = findSection(days, sectionId);
    if (!sec) return;
    const items = [...(sec.section_exercises || [])].sort((a, b) => a.sort_order - b.sort_order);
    if (from === to || to < 0 || to >= items.length) return;
    const [moved] = items.splice(from, 1);
    items.splice(to, 0, moved);
    const ordered = items.map((ex, i) => ({ ...ex, sort_order: i }));
    setDays(prev => mapSection(prev, sectionId, s => ({ ...s, section_exercises: ordered })));
    ordered.forEach((ex, i) => {
      supabase.from('section_exercises').update({ sort_order: i }).eq('id', ex.id).then(() => {});
    });
  };

  const addExercise = async (sectionId, ex, count) => {
    const { data: row } = await supabase.from('section_exercises')
      .insert({ section_id: sectionId, name: ex.name, img_url: ex.img, timed: false, sort_order: count })
      .select('id').single();
    if (row) await supabase.from('exercise_sets').insert({ exercise_id: row.id, set_index: 0, kind: 'WORK', reps: 8, reps_text: '8', weight_kg: 0, rest_secs: 60, time_secs: 60 });
    reload();
  };

  // Resolve the open exercise from state each render, so the sheet reflects
  // edits as they're applied rather than showing a stale copy.
  const optionsEx = optionsExId ? findExercise(days, optionsExId) : null;

  const runCopy = async (targets) => {
    if (!copyFrom?.day?.id || !targets.length) return;
    setCopying(true);
    const { count, error } = await copyDayToSlots(copyFrom.day.id, targets);
    setCopying(false);
    if (error) { toast(`Copy failed${error.message ? ` - ${error.message}` : ''}`, { kind: 'error' }); return; }
    setCopyFrom(null);
    toast(`Copied into ${count} day${count === 1 ? '' : 's'}`);
    reload();
  };

  let columns = [];
  if (mode === 'week') {
    columns = weeks.map(w => ({ key: `${w.phaseId}|${w.weekInPhase}`, title: `${w.label} · ${w.phaseName}`, sub: DOW[dow],
      day: dayAt(w.phaseId, w.weekInPhase, dow), onOpen: () => onPickDay(w.phaseIdx, w.weekInPhase, dow) }));
  } else {
    const w = weeks[gweek];
    if (w) columns = DOW.map((d, i) => ({ key: `${w.phaseId}|${i}`, title: d, sub: `${w.label} · ${w.phaseName}`,
      day: dayAt(w.phaseId, w.weekInPhase, i), onOpen: () => onPickDay(w.phaseIdx, w.weekInPhase, i) }));
  }

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 130, background: 'var(--bg-0)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 'max(54px, calc(var(--safe-top) + 14px)) 14px 12px', background: 'var(--bg-1)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <HexBackButton onClick={onClose} size={36}/>
          <div style={{ flex: 1, minWidth: 120 }}>
            <div className="mono" style={{ fontSize: 8, color: 'var(--accent)', letterSpacing: '0.16em', fontWeight: 600 }}>// MASTER PLANNER</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{programme.name}</div>
          </div>
          <div style={{ display: 'flex', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 999, padding: 3 }}>
            {[['week', 'Week by Week'], ['day', 'Day by Day']].map(([m, l]) => (
              <button key={m} onClick={() => setMode(m)} className="mono" style={{
                all: 'unset', cursor: 'pointer', padding: '7px 12px', borderRadius: 999, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
                background: mode === m ? 'var(--accent)' : 'transparent', color: mode === m ? 'var(--on-accent)' : 'var(--text-3)',
              }}>{l.toUpperCase()}</button>
            ))}
          </div>
          {mode === 'week' ? (
            <select value={dow} onChange={e => setDow(+e.target.value)} style={selSt}>
              {DOW.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          ) : (
            <select value={gweek} onChange={e => setGweek(+e.target.value)} style={selSt}>
              {weeks.map((w, i) => <option key={i} value={i}>{w.label} · {w.phaseName}</option>)}
            </select>
          )}
        </div>
        <div className="mono" style={{ fontSize: 8.5, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 8 }}>
          EDIT WEIGHT / REPS / REST INLINE · TAP A MOVEMENT FOR ITS OPTIONS · TAP A COLUMN TITLE TO OPEN THE FULL DAY
        </div>
      </div>

      {!phaseIds.length ? (
        <Centered>SAVE THE PROGRAMME FIRST<br/><span style={{ fontSize: 9 }}>The master planner shows saved phases, weeks and days.</span></Centered>
      ) : days === null ? (
        <div style={{ padding: 14 }}><SkeletonCard rows={2} /></div>
      ) : columns.length === 0 ? (
        <Centered>NOTHING TO SHOW</Centered>
      ) : (
        <div className="scroller" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 14px 40px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 'min-content' }}>
            {columns.map(col => (
              <PlannerColumn key={col.key} col={col}
                onPatchSet={patchSet} onAddSet={addSet} onDelSet={delSet}
                onDelExercise={delExercise} onAddExercise={(sectionId, count) => setAddingTo({ sectionId, count })}
                onOpenOptions={(ex) => setOptionsExId(ex.id)} onMoveExercise={moveExercise}
                onCopyDay={(c) => setCopyFrom({ day: c.day, title: c.title, sub: c.sub })}/>
            ))}
          </div>
        </div>
      )}

      {addingTo && (
        <ExercisePicker
          onClose={() => setAddingTo(null)}
          onPick={(ex) => { addExercise(addingTo.sectionId, ex, addingTo.count); setAddingTo(null); }}
        />
      )}

      {optionsEx && (
        <ExerciseOptionsSheet
          ex={optionsEx}
          onClose={() => setOptionsExId(null)}
          onPatch={(patch) => patchExercise(optionsEx.id, patch)}
          onDelete={() => { delExercise(optionsEx.id); setOptionsExId(null); }}
        />
      )}

      {copyFrom && (
        <CopyDaySheet
          source={copyFrom}
          weeks={weeks}
          busy={copying}
          hasDay={(phaseId, week, d) => !!dayAt(phaseId, week, d)}
          onClose={() => setCopyFrom(null)}
          onCopy={runCopy}
        />
      )}
    </div>
  );
}

// ── COPY A WORKOUT INTO OTHER SLOTS ───────────────────────────────
// A grid of every week × weekday in the programme. Tap the slots to copy into,
// or use the row/column shortcuts for the two common cases: the same weekday
// every week, or a whole week at once.
function CopyDaySheet({ source, weeks, busy, hasDay, onClose, onCopy }) {
  const srcKey = `${source.day.phase_id}|${source.day.week_index}|${source.day.day_of_week}`;
  const [picked, setPicked] = React.useState(() => new Set());

  const keyOf = (w, d) => `${w.phaseId}|${w.weekInPhase}|${d}`;
  const toggle = (k) => setPicked(prev => {
    const next = new Set(prev);
    next.has(k) ? next.delete(k) : next.add(k);
    return next;
  });
  const addAll = (keys) => setPicked(prev => {
    const next = new Set(prev);
    // Tapping a shortcut that's already fully selected clears it instead.
    const all = keys.every(k => next.has(k));
    keys.forEach(k => all ? next.delete(k) : next.add(k));
    return next;
  });

  const selectable = (w, d) => keyOf(w, d) !== srcKey;
  const weekKeys = (w) => DOW.map((_, d) => keyOf(w, d)).filter(k => k !== srcKey);
  const dowKeys  = (d) => weeks.map(w => keyOf(w, d)).filter(k => k !== srcKey);

  const targets = [...picked].map(k => {
    const [phaseId, week, dow] = k.split('|');
    return { phaseId, week: +week, dow: +dow };
  });
  const overwriting = [...picked].filter(k => {
    const [phaseId, week, dow] = k.split('|');
    return hasDay(phaseId, +week, +dow);
  }).length;

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 260, background: 'rgba(6,10,12,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxHeight: '90%', background: 'var(--bg-1)',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        border: '1px solid var(--line-strong)', borderBottom: 0,
        display: 'flex', flexDirection: 'column', animation: 'sheetUp .24s cubic-bezier(.22,.61,.36,1)',
      }}>
        <div style={{ padding: '12px 16px 10px', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, background: 'var(--line-strong)', borderRadius: 2, margin: '0 auto 12px' }}/>
          <div className="label">// COPY WORKOUT</div>
          <div className="h-bold" style={{ fontSize: 15, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{source.title}</div>
          <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 4, lineHeight: 1.6 }}>
            Pick the days to copy into. Anything already in a target day is replaced.
          </div>
        </div>

        <div className="scroller" style={{ flex: 1, minHeight: 0, padding: '4px 16px 16px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `minmax(96px, 1.4fr) repeat(7, 1fr)`, gap: 4, minWidth: 'min-content' }}>
            <div/>
            {DOW.map((d, i) => (
              <button key={d} onClick={() => addAll(dowKeys(i))} className="mono" title={`Every ${d}`} style={{
                all: 'unset', cursor: 'pointer', textAlign: 'center', padding: '5px 0', borderRadius: 6,
                fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-3)',
              }}>{d.toUpperCase()}</button>
            ))}
            {weeks.map(w => (
              <React.Fragment key={`${w.phaseId}|${w.weekInPhase}`}>
                <button onClick={() => addAll(weekKeys(w))} className="mono" title={`All of ${w.label}`} style={{
                  all: 'unset', cursor: 'pointer', padding: '0 6px 0 0', fontSize: 8.5, fontWeight: 700,
                  letterSpacing: '0.04em', color: 'var(--text-3)', display: 'flex', alignItems: 'center',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{w.label.toUpperCase()}</button>
                {DOW.map((_, d) => {
                  const k = keyOf(w, d);
                  const isSrc = !selectable(w, d);
                  const on = picked.has(k);
                  const filled = hasDay(w.phaseId, w.weekInPhase, d);
                  return (
                    <button key={d} disabled={isSrc} onClick={() => toggle(k)} aria-label={`${w.label} ${DOW[d]}`} style={{
                      all: 'unset', cursor: isSrc ? 'default' : 'pointer', height: 26, borderRadius: 6,
                      display: 'grid', placeItems: 'center',
                      background: isSrc ? 'var(--bg-3)' : on ? 'var(--accent)' : 'var(--bg-2)',
                      border: `1px solid ${isSrc ? 'var(--line-strong)' : on ? 'var(--accent)' : 'var(--line)'}`,
                      opacity: isSrc ? 0.55 : 1,
                    }}>
                      <span className="mono" style={{
                        fontSize: 7.5, fontWeight: 800, letterSpacing: '0.06em',
                        color: isSrc ? 'var(--text-3)' : on ? 'var(--on-accent)' : filled ? 'var(--c-amber)' : 'var(--text-3)',
                      }}>{isSrc ? 'SRC' : on ? '✓' : filled ? '•' : ''}</span>
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>

          <div className="mono" style={{ fontSize: 8.5, color: 'var(--text-3)', lineHeight: 1.8, marginTop: 12 }}>
            SRC = the workout you're copying · <span style={{ color: 'var(--c-amber)' }}>•</span> = that day already has a workout<br/>
            Tap a weekday header to select it across every week, or a week label for the whole week.
          </div>
        </div>

        <div style={{ padding: '12px 16px calc(env(safe-area-inset-bottom, 0px) + 14px)', borderTop: '1px solid var(--line)', flexShrink: 0, display: 'grid', gap: 8 }}>
          {overwriting > 0 && (
            <div className="mono" style={{ fontSize: 9, color: 'var(--c-amber)', letterSpacing: '0.04em', textAlign: 'center' }}>
              {overwriting} of these already {overwriting === 1 ? 'has a workout' : 'have workouts'} - {overwriting === 1 ? 'it' : 'they'} will be replaced
            </div>
          )}
          <button onClick={() => onCopy(targets)} disabled={!targets.length || busy} className="btn-primary" style={{
            width: '100%', opacity: targets.length && !busy ? 1 : 0.4,
            pointerEvents: targets.length && !busy ? 'auto' : 'none',
          }}>
            {busy ? 'COPYING…' : `COPY INTO ${targets.length} DAY${targets.length === 1 ? '' : 'S'} →`}
          </button>
          <button onClick={onClose} className="btn-ghost" style={{ width: '100%' }}>CANCEL</button>
        </div>
      </div>
    </div>
  );
}

function PlannerColumn({ col, onPatchSet, onAddSet, onDelSet, onDelExercise, onAddExercise, onOpenOptions, onMoveExercise, onCopyDay }) {
  const day = col.day;
  const sections = day ? [...(day.workout_sections || [])].sort((a, b) => a.sort_order - b.sort_order) : [];
  return (
    <div style={{ width: 320, flexShrink: 0 }}>
      <div style={{ padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <button onClick={col.onOpen} style={{ all: 'unset', cursor: 'pointer', flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.title}</div>
          <div className="mono" style={{ fontSize: 8.5, color: 'var(--text-3)', letterSpacing: '0.08em', marginTop: 2 }}>{col.sub.toUpperCase()}</div>
        </button>
        {/* Only offer a copy where there's something to copy. */}
        {day && sections.length > 0 && (
          <button onClick={() => onCopyDay(col)} title="Copy this workout to other days" className="mono" style={{
            all: 'unset', cursor: 'pointer', flexShrink: 0, padding: '5px 8px', borderRadius: 7,
            fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--accent)',
            background: 'var(--accent-soft)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)',
          }}>COPY</button>
        )}
        <button onClick={col.onOpen} aria-label="Open full day" style={{ all: 'unset', cursor: 'pointer', flexShrink: 0, display: 'grid', placeItems: 'center', color: 'var(--text-3)' }}>
          <IconChevronRight size={14}/>
        </button>
      </div>

      {!day || sections.length === 0 ? (
        <button onClick={col.onOpen} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%' }}>
          <div style={{ padding: '22px 12px', textAlign: 'center', borderRadius: 10, border: '1px dashed var(--line-strong)', background: 'var(--bg-1)' }}>
            <div className="mono" style={{ fontSize: 9.5, color: 'var(--text-3)', letterSpacing: '0.1em' }}>REST DAY</div>
            <div className="mono" style={{ fontSize: 8.5, color: 'var(--accent)', letterSpacing: '0.08em', marginTop: 6 }}>+ ADD WORKOUT</div>
          </div>
        </button>
      ) : (
        <div style={{ display: 'grid', gap: 8 }}>
          {sections.map(s => (
            <PlannerSection key={s.id} s={s}
              onPatchSet={onPatchSet} onAddSet={onAddSet} onDelSet={onDelSet}
              onDelExercise={onDelExercise} onAddExercise={onAddExercise} onOpenOptions={onOpenOptions}
              onMoveExercise={onMoveExercise}/>
          ))}
        </div>
      )}
    </div>
  );
}

function PlannerSection({ s, onPatchSet, onAddSet, onDelSet, onDelExercise, onAddExercise, onOpenOptions, onMoveExercise }) {
  const col = sectionColor(s.kind);
  const exercises = [...(s.section_exercises || [])].sort((a, b) => a.sort_order - b.sort_order);

  // Drag to reorder - laptop only, same as the main builder. Listeners live on
  // the window because reordering moves the handle's node, which can drop a
  // pointer capture mid-drag.
  const isDesktop = useDesktop();
  const [dragId, setDragId] = React.useState(null);
  const rowRefs = React.useRef({});

  React.useEffect(() => {
    if (dragId == null) return;
    const move = (ev) => {
      const idx = exercises.findIndex(it => it.id === dragId);
      if (idx < 0) return;
      const y = ev.clientY;
      const prev = idx > 0 ? rowRefs.current[exercises[idx - 1].id] : null;
      if (prev) {
        const r = prev.getBoundingClientRect();
        if (y < r.top + r.height / 2) { onMoveExercise(s.id, idx, idx - 1); return; }
      }
      const next = idx < exercises.length - 1 ? rowRefs.current[exercises[idx + 1].id] : null;
      if (next) {
        const r = next.getBoundingClientRect();
        if (y > r.top + r.height / 2) { onMoveExercise(s.id, idx, idx + 1); return; }
      }
    };
    const end = () => setDragId(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
  }, [dragId, exercises, onMoveExercise, s.id]);

  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderLeft: `2px solid ${col}`, borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: 11, fontWeight: 700 }}>{s.title || SECTION_LABEL[s.kind] || 'Block'}</span>
        <span className="mono" style={{ fontSize: 7.5, color: 'var(--text-3)', letterSpacing: '0.1em', fontWeight: 700 }}>{sectionTag(s.kind)}</span>
      </div>
      <div style={{ padding: 8, display: 'grid', gap: 8 }}>
        {exercises.map((ex, i) => (
          <PlannerExercise key={ex.id} ex={ex} idx={i}
            onPatchSet={onPatchSet} onAddSet={onAddSet} onDelSet={onDelSet} onDelExercise={onDelExercise}
            onOpenOptions={onOpenOptions}
            rowRef={(el) => { if (el) rowRefs.current[ex.id] = el; else delete rowRefs.current[ex.id]; }}
            dragging={dragId === ex.id}
            dragHandle={isDesktop && exercises.length > 1
              ? { onPointerDown: (ev) => { ev.preventDefault(); ev.stopPropagation(); setDragId(ex.id); } }
              : null}/>
        ))}
        <button onClick={() => onAddExercise(s.id, exercises.length)} style={{
          all: 'unset', cursor: 'pointer', textAlign: 'center', padding: '7px 0', borderRadius: 7,
          border: '1px dashed var(--line-strong)', color: 'var(--accent)',
          fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
        }}>+ ADD EXERCISE</button>
      </div>
    </div>
  );
}

function PlannerExercise({ ex, idx, onPatchSet, onAddSet, onDelSet, onDelExercise, onOpenOptions, rowRef, dragging, dragHandle }) {
  const sets = [...(ex.exercise_sets || [])].sort((a, b) => a.set_index - b.set_index);
  const alts = Array.isArray(ex.alternates) ? ex.alternates : [];
  return (
    <div ref={rowRef} style={{
      background: 'var(--bg-1)', border: `1px solid ${dragging ? 'var(--accent)' : 'var(--line)'}`,
      borderRadius: 8, padding: '7px 8px',
      boxShadow: dragging ? '0 8px 20px rgba(0,0,0,0.45)' : 'none',
      position: dragging ? 'relative' : 'static', zIndex: dragging ? 5 : 'auto',
      transition: 'box-shadow .12s ease, border-color .12s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: sets.length ? 6 : 0 }}>
        {dragHandle && (
          <span {...dragHandle} aria-label={`Reorder ${ex.name}`} title="Drag to reorder"
            style={{ flexShrink: 0, display: 'grid', placeItems: 'center', cursor: 'grab', touchAction: 'none',
              color: dragging ? 'var(--accent)' : 'var(--text-3)', padding: '0 1px' }}>
            <svg width="8" height="13" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
              <circle cx="2.5" cy="3" r="1.4"/><circle cx="7.5" cy="3" r="1.4"/>
              <circle cx="2.5" cy="8" r="1.4"/><circle cx="7.5" cy="8" r="1.4"/>
              <circle cx="2.5" cy="13" r="1.4"/><circle cx="7.5" cy="13" r="1.4"/>
            </svg>
          </span>
        )}
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, flexShrink: 0 }}>{idx + 1}.</span>
        {/* Tap the movement to open its full options (same set as the builder). */}
        <button onClick={() => onOpenOptions(ex)} className="phase-btn" title="Exercise options"
          style={{ all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0 }}>
          <div style={{ width: 22, height: 22, borderRadius: 5, flexShrink: 0, background: `center/cover url('${ex.img_url || IMG_FALLBACK}'), var(--bg-3)` }}/>
          <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.name}</span>
        </button>
        {ex.tempo && <span className="mono" style={{ fontSize: 7, fontWeight: 800, color: 'var(--text-3)', letterSpacing: '0.06em', flexShrink: 0 }}>{ex.tempo}</span>}
        {ex.superset_group != null && <span className="mono" style={{ fontSize: 7, fontWeight: 800, color: 'var(--accent-2)', flexShrink: 0 }}>SS</span>}
        {ex.unilateral && <span className="mono" style={{ fontSize: 7, fontWeight: 800, color: 'var(--c-amber)', flexShrink: 0 }}>ES</span>}
        {ex.timed && <span className="mono" style={{ fontSize: 7, fontWeight: 800, color: 'var(--c-blue)', flexShrink: 0 }}>T</span>}
        <button onClick={() => onOpenOptions(ex)} aria-label={`Options for ${ex.name}`}
          style={{ all: 'unset', cursor: 'pointer', color: 'var(--accent)', flexShrink: 0, fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 800, padding: '0 2px' }}>⋯</button>
        <button onClick={() => onDelExercise(ex.id)} aria-label="Remove exercise" style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0 }}><IconX2 size={11}/></button>
      </div>

      {alts.length > 0 && (
        <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: '0.04em', margin: '0 0 6px 26px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          ALT: {alts.map(a => a.name).join(', ')}
        </div>
      )}

      {sets.length > 0 && (
        <div style={{ marginLeft: 26 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 1fr 1fr 16px', gap: 3, fontSize: 7.5, marginBottom: 2 }} className="mono">
            <span style={{ color: 'var(--text-3)' }}>SET</span>
            <span style={{ color: 'var(--text-3)' }}>{ex.timed ? 'TIME' : ex.banded ? 'BAND' : 'KG'}</span>
            <span style={{ color: 'var(--text-3)' }}>{ex.timed ? '' : 'REPS'}</span>
            <span style={{ color: 'var(--text-3)' }}>REST</span>
            <span/>
          </div>
          {sets.map((st, i) => (
            <div key={st.id} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 1fr 1fr 16px', gap: 3, alignItems: 'center', padding: '2px 0', borderTop: '1px solid var(--line)' }}>
              {/* Tap the set number to flip warm-up <-> working set. */}
              <button onClick={() => onPatchSet(st.id, { kind: st.kind === 'WARMUP' ? 'WORK' : 'WARMUP' })}
                title="Tap to toggle warm-up / working set"
                style={{ all: 'unset', cursor: 'pointer', fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700,
                  color: st.kind === 'WARMUP' ? 'var(--c-amber)' : 'var(--text-2)' }}>
                {st.kind === 'WARMUP' ? 'W' : i + 1}
              </button>
              {ex.timed ? (
                <>
                  <Cell value={st.time_secs} format={fmtSecs} onCommit={v => onPatchSet(st.id, { time_secs: parseClock(v) })}/>
                  <span/>
                </>
              ) : ex.banded ? (
                <>
                  <BandCycle band={st.band} onChange={b => onPatchSet(st.id, { band: b })}/>
                  <Cell value={st.reps_text || st.reps || ''} onCommit={v => onPatchSet(st.id, { reps_text: v, reps: parseInt(v) || 0 })}/>
                </>
              ) : (
                <>
                  <Cell value={st.weight_kg} format={v => (v > 0 ? v : 'BW')} onCommit={v => onPatchSet(st.id, { weight_kg: parseFloat(v) || 0 })}/>
                  <Cell value={st.reps_text || st.reps || ''} onCommit={v => onPatchSet(st.id, { reps_text: v, reps: parseInt(v) || 0 })}/>
                </>
              )}
              <Cell value={st.rest_secs} format={fmtSecs} onCommit={v => onPatchSet(st.id, { rest_secs: parseClock(v) })}/>
              <button onClick={() => onDelSet(st.id)} aria-label="Remove set" style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)', textAlign: 'center', fontSize: 11 }}>×</button>
            </div>
          ))}
          <button onClick={() => onAddSet(ex)} style={{
            all: 'unset', cursor: 'pointer', display: 'block', marginTop: 4, color: 'var(--accent)',
            fontFamily: 'JetBrains Mono', fontSize: 8, fontWeight: 700, letterSpacing: '0.08em',
          }}>+ ADD SET</button>
        </div>
      )}
    </div>
  );
}

// ── EXERCISE OPTIONS ─────────────────────────────────────────────
// Everything the main builder offers for a movement, editable in place so the
// planner doesn't have to hand off to the full day view: swap it out, the
// timed/banded/each-side toggles, tempo, coach notes and alternates.
function ExerciseOptionsSheet({ ex, onClose, onPatch, onDelete }) {
  const [switching, setSwitching] = React.useState(false);
  const [addingAlt, setAddingAlt] = React.useState(false);
  const [confirmDel, setConfirmDel] = React.useState(false);
  const alts = Array.isArray(ex.alternates) ? ex.alternates : [];

  const setAlts = (next) => onPatch({ alternates: next });

  if (switching) {
    return (
      <ExercisePicker title="SWITCH EXERCISE" onClose={() => setSwitching(false)}
        onPick={(p) => {
          onPatch({ name: p.name, img_url: p.img, banded: !!p.banded, unilateral: !!p.unilateral });
          setSwitching(false);
        }}/>
    );
  }
  if (addingAlt) {
    return (
      <ExercisePicker title="ADD ALTERNATIVE" onClose={() => setAddingAlt(false)}
        onPick={(p) => { setAlts([...alts, { name: p.name, img: p.img }]); setAddingAlt(false); }}/>
    );
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(7,7,12,0.7)',
      backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'flex-end', animation: 'fadeIn .15s ease',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxHeight: '88%', background: 'var(--bg-1)',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        border: '1px solid var(--line-strong)', borderBottom: 0,
        display: 'flex', flexDirection: 'column', animation: 'sheetUp .24s cubic-bezier(.22,.61,.36,1)',
      }}>
        <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, background: 'var(--line-strong)', borderRadius: 2, margin: '0 auto 12px' }}/>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: `center/cover url('${ex.img_url || IMG_FALLBACK}'), var(--bg-3)` }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="label">// EXERCISE OPTIONS</div>
              <div className="h-bold" style={{ fontSize: 15, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.name}</div>
            </div>
          </div>
        </div>

        <div className="scroller" style={{ flex: 1, minHeight: 0, padding: '4px 16px 24px', display: 'grid', gap: 14, alignContent: 'start' }}>
          <button onClick={() => setSwitching(true)} className="btn-ghost"
            style={{ width: '100%', boxSizing: 'border-box', color: 'var(--accent)', borderColor: 'color-mix(in srgb, var(--accent) 45%, var(--line-strong))' }}>
            SWAP EXERCISE
          </button>

          <div style={{ display: 'grid', gap: 8 }}>
            <OptToggle label="TIMED" sub="Sets are held for a duration, not reps"
              on={!!ex.timed} onChange={v => onPatch({ timed: v })}/>
            <OptToggle label="BANDED" sub="Track a resistance band instead of a weight"
              on={!!ex.banded} onChange={v => onPatch({ banded: v })}/>
            <OptToggle label="EACH SIDE" sub={ex.unilateral ? 'Reps shown per side' : 'Both sides together'}
              on={!!ex.unilateral} onChange={v => onPatch({ unilateral: v })}/>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 6 }}>TEMPO</div>
            <input defaultValue={ex.tempo || ''} onBlur={e => onPatch({ tempo: e.target.value })}
              placeholder="e.g. 3-1-1-0" style={fieldSt}/>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 6 }}>COACH NOTES</div>
            <textarea defaultValue={ex.coach_notes || ''} onBlur={e => onPatch({ coach_notes: e.target.value })} rows={3}
              placeholder="Technique cues, regressions/progressions, reminders…"
              style={{ ...fieldSt, resize: 'vertical', lineHeight: 1.5 }}/>
          </div>

          <div>
            <div className="label" style={{ marginBottom: 6 }}>ALTERNATIVES</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {alts.map((a, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, background: `center/cover url('${a.img || IMG_FALLBACK}'), var(--bg-3)` }}/>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                  <button onClick={() => setAlts(alts.filter((_, x) => x !== i))} aria-label={`Remove ${a.name}`}
                    style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)', flexShrink: 0 }}><IconX2 size={12}/></button>
                </div>
              ))}
              <button onClick={() => setAddingAlt(true)} style={{
                all: 'unset', cursor: 'pointer', textAlign: 'center', padding: '9px 0', borderRadius: 8,
                border: '1px dashed color-mix(in srgb, var(--accent) 45%, transparent)', color: 'var(--accent)',
                fontFamily: 'JetBrains Mono', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em',
              }}>+ ADD ALTERNATIVE</button>
            </div>
          </div>

          <button onClick={() => { if (!confirmDel) { setConfirmDel(true); return; } onDelete(); }} style={{
            all: 'unset', cursor: 'pointer', textAlign: 'center', padding: '12px', borderRadius: 10,
            border: `1px solid color-mix(in srgb, var(--c-coral) ${confirmDel ? 60 : 35}%, var(--line))`,
            color: confirmDel ? 'var(--c-coral)' : 'var(--text-3)',
            fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
          }}>{confirmDel ? 'CONFIRM REMOVE - TAP AGAIN' : 'REMOVE EXERCISE'}</button>

          <button onClick={onClose} className="btn-primary" style={{ width: '100%', boxSizing: 'border-box' }}>DONE</button>
        </div>
      </div>
    </div>
  );
}

function OptToggle({ label, sub, on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{
      all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
      padding: '10px 12px', borderRadius: 10, boxSizing: 'border-box',
      background: on ? 'var(--accent-soft)' : 'var(--bg-2)',
      border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="mono" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em', color: on ? 'var(--accent)' : 'var(--text-2)' }}>{label}</div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>
      </div>
      <span style={{
        flexShrink: 0, width: 36, height: 20, borderRadius: 999, position: 'relative',
        background: on ? 'var(--accent)' : 'var(--bg-3)', border: '1px solid var(--line-strong)',
        transition: 'background .18s ease',
      }}>
        <span style={{
          position: 'absolute', top: 2, left: on ? 17 : 2, width: 14, height: 14, borderRadius: '50%',
          background: on ? 'var(--on-accent)' : 'var(--text-3)', transition: 'left .18s ease',
        }}/>
      </span>
    </button>
  );
}

// Find a section by id anywhere in the day map.
function findSection(map, sectionId) {
  for (const k in (map || {})) {
    const hit = (map[k].workout_sections || []).find(s => s.id === sectionId);
    if (hit) return hit;
  }
  return null;
}

// Replace a section (by id) anywhere in the day map.
function mapSection(map, sectionId, fn) {
  const next = { ...map };
  for (const k in next) {
    const d = next[k];
    let changed = false;
    const ws = (d.workout_sections || []).map(s => s.id === sectionId ? (changed = true, fn(s)) : s);
    if (changed) { next[k] = { ...d, workout_sections: ws }; break; }
  }
  return next;
}

// Find an exercise by id anywhere in the day map.
function findExercise(map, exId) {
  for (const k in (map || {})) {
    for (const s of (map[k].workout_sections || [])) {
      const hit = (s.section_exercises || []).find(ex => ex.id === exId);
      if (hit) return hit;
    }
  }
  return null;
}

const fieldSt = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 8,
  padding: '10px 11px', color: 'var(--text)', outline: 'none',
  fontFamily: 'JetBrains Mono', fontSize: 12, lineHeight: 1.4,
};

// Compact band cell - tap the swatch to cycle through band levels.
function BandCycle({ band, onChange }) {
  const b = bandOf(band);
  const next = () => {
    const idx = BANDS.findIndex(x => x.key === band);
    onChange(BANDS[(idx + 1) % BANDS.length].key);
  };
  return (
    <button onClick={next} title="Tap to change band" style={{
      all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3, minWidth: 0,
    }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, flexShrink: 0, background: b ? b.color : 'var(--bg-3)', border: '1px solid rgba(255,255,255,0.35)' }}/>
      <span className="mono" style={{ fontSize: 8, fontWeight: 700, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b ? b.short : 'BAND'}</span>
    </button>
  );
}

// Inline-editable cell: shows formatted value, becomes an input on focus.
function Cell({ value, format, onCommit }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const display = format ? format(value) : (value === '' || value == null ? '-' : value);
  if (editing) {
    return (
      <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
        onBlur={() => { setEditing(false); onCommit(draft); }}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-3)', border: '1px solid var(--accent)', borderRadius: 4,
          color: 'var(--text)', fontFamily: 'JetBrains Mono', fontSize: 9, padding: '2px 4px', outline: 'none' }}/>
    );
  }
  return (
    <button onClick={() => { setDraft(value == null ? '' : String(value)); setEditing(true); }} style={{
      all: 'unset', cursor: 'text', fontFamily: 'JetBrains Mono', fontSize: 9, color: 'var(--text)',
      padding: '2px 4px', borderRadius: 4, border: '1px solid transparent',
    }}>{display}</button>
  );
}

function Centered({ children }) {
  return <div style={{ padding: 40, textAlign: 'center' }}><div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.1em', lineHeight: 1.7 }}>{children}</div></div>;
}

// Replace an exercise (by id) anywhere in the day map.
function mapExercises(map, exId, fn) {
  const next = { ...map };
  for (const k in next) {
    const d = next[k];
    let changed = false;
    const ws = (d.workout_sections || []).map(s => ({
      ...s,
      section_exercises: (s.section_exercises || []).map(ex => ex.id === exId ? (changed = true, fn(ex)) : ex),
    }));
    if (changed) next[k] = { ...d, workout_sections: ws };
  }
  return next;
}

// Replace a set (by id) anywhere in the day map.
function mapSets(map, setId, fn) {
  const next = { ...map };
  for (const k in next) {
    const d = next[k];
    let changed = false;
    const ws = (d.workout_sections || []).map(s => ({
      ...s,
      section_exercises: (s.section_exercises || []).map(ex => ({
        ...ex,
        exercise_sets: (ex.exercise_sets || []).map(st => st.id === setId ? (changed = true, fn(st)) : st),
      })),
    }));
    if (changed) next[k] = { ...d, workout_sections: ws };
  }
  return next;
}

const selSt = {
  appearance: 'auto', background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 8,
  padding: '8px 10px', color: 'var(--text)', outline: 'none', fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 600,
};
