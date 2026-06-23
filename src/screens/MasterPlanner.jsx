import React from 'react'
import { supabase } from '../lib/supabase'
import { HexBackButton } from '../components/hex'
import { IconChevronRight, IconPlus, IconX2 } from '../components/icons'
import { ExercisePicker } from './ProgrammeBuilder'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SECTION_LABEL = { MAIN: 'Workout', PULSE_RAISER: 'Pulse Raiser', BANDED: 'Activation', COOLDOWN: 'Cooldown' };
const sectionTag = (kind) => kind === 'BANDED' ? 'FREESTYLE' : 'REGULAR';
const sectionColor = (kind) => kind === 'PULSE_RAISER' ? 'var(--c-coral)' : kind === 'BANDED' ? 'var(--c-amber)' : kind === 'COOLDOWN' ? 'var(--accent-2)' : 'var(--accent)';
const IMG_FALLBACK = 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=200&q=70';

const fmtSecs = (s) => {
  s = parseInt(s) || 0;
  if (!s) return '—';
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const parseClock = (v) => {
  if (v == null) return 0;
  v = String(v).trim();
  if (v.includes(':')) { const [m, s] = v.split(':'); return (parseInt(m) || 0) * 60 + (parseInt(s) || 0); }
  return parseInt(v) || 0;
};

const SELECT = 'id, phase_id, week_index, day_of_week, intro, workout_sections(id, title, kind, sort_order, section_exercises(id, name, img_url, timed, alternates, superset_group, sort_order, exercise_sets(id, set_index, kind, reps_text, reps, weight_kg, rest_secs, time_secs)))';

// Master Planner — every day of the programme pulled out at once, fully editable
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
  const addExercise = async (sectionId, ex, count) => {
    const { data: row } = await supabase.from('section_exercises')
      .insert({ section_id: sectionId, name: ex.name, img_url: ex.img, timed: false, sort_order: count })
      .select('id').single();
    if (row) await supabase.from('exercise_sets').insert({ exercise_id: row.id, set_index: 0, kind: 'WORK', reps: 8, reps_text: '8', weight_kg: 0, rest_secs: 60, time_secs: 60 });
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
      <div style={{ padding: '54px 14px 12px', background: 'var(--bg-1)', borderBottom: '1px solid var(--line)', flexShrink: 0 }}>
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
          EDIT WEIGHT / REPS / REST INLINE · TAP A COLUMN TITLE TO OPEN THE FULL DAY
        </div>
      </div>

      {!phaseIds.length ? (
        <Centered>SAVE THE PROGRAMME FIRST<br/><span style={{ fontSize: 9 }}>The master planner shows saved phases, weeks and days.</span></Centered>
      ) : days === null ? (
        <Centered>LOADING…</Centered>
      ) : columns.length === 0 ? (
        <Centered>NOTHING TO SHOW</Centered>
      ) : (
        <div className="scroller" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '14px 14px 40px' }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 'min-content' }}>
            {columns.map(col => (
              <PlannerColumn key={col.key} col={col}
                onPatchSet={patchSet} onAddSet={addSet} onDelSet={delSet}
                onDelExercise={delExercise} onAddExercise={(sectionId, count) => setAddingTo({ sectionId, count })}/>
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
    </div>
  );
}

function PlannerColumn({ col, onPatchSet, onAddSet, onDelSet, onDelExercise, onAddExercise }) {
  const day = col.day;
  const sections = day ? [...(day.workout_sections || [])].sort((a, b) => a.sort_order - b.sort_order) : [];
  return (
    <div style={{ width: 320, flexShrink: 0 }}>
      <button onClick={col.onOpen} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', marginBottom: 8 }}>
        <div style={{ padding: '8px 10px', background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.title}</div>
            <div className="mono" style={{ fontSize: 8.5, color: 'var(--text-3)', letterSpacing: '0.08em', marginTop: 2 }}>{col.sub.toUpperCase()}</div>
          </div>
          <IconChevronRight size={14} style={{ color: 'var(--text-3)', flexShrink: 0 }}/>
        </div>
      </button>

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
              onDelExercise={onDelExercise} onAddExercise={onAddExercise}/>
          ))}
        </div>
      )}
    </div>
  );
}

function PlannerSection({ s, onPatchSet, onAddSet, onDelSet, onDelExercise, onAddExercise }) {
  const col = sectionColor(s.kind);
  const exercises = [...(s.section_exercises || [])].sort((a, b) => a.sort_order - b.sort_order);
  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', borderLeft: `2px solid ${col}`, borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: 11, fontWeight: 700 }}>{s.title || SECTION_LABEL[s.kind] || 'Block'}</span>
        <span className="mono" style={{ fontSize: 7.5, color: 'var(--text-3)', letterSpacing: '0.1em', fontWeight: 700 }}>{sectionTag(s.kind)}</span>
      </div>
      <div style={{ padding: 8, display: 'grid', gap: 8 }}>
        {exercises.map((ex, i) => (
          <PlannerExercise key={ex.id} ex={ex} idx={i}
            onPatchSet={onPatchSet} onAddSet={onAddSet} onDelSet={onDelSet} onDelExercise={onDelExercise}/>
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

function PlannerExercise({ ex, idx, onPatchSet, onAddSet, onDelSet, onDelExercise }) {
  const sets = [...(ex.exercise_sets || [])].sort((a, b) => a.set_index - b.set_index);
  const alts = Array.isArray(ex.alternates) ? ex.alternates : [];
  return (
    <div style={{ background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: sets.length ? 6 : 0 }}>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', fontWeight: 700, flexShrink: 0 }}>{idx + 1}.</span>
        <div style={{ width: 22, height: 22, borderRadius: 5, flexShrink: 0, background: `center/cover url('${ex.img_url || IMG_FALLBACK}'), var(--bg-3)` }}/>
        <span style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ex.name}</span>
        {ex.superset_group != null && <span className="mono" style={{ fontSize: 7, fontWeight: 800, color: 'var(--accent-2)', flexShrink: 0 }}>SS</span>}
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
            <span style={{ color: 'var(--text-3)' }}>{ex.timed ? 'TIME' : 'KG'}</span>
            <span style={{ color: 'var(--text-3)' }}>{ex.timed ? '' : 'REPS'}</span>
            <span style={{ color: 'var(--text-3)' }}>REST</span>
            <span/>
          </div>
          {sets.map((st, i) => (
            <div key={st.id} style={{ display: 'grid', gridTemplateColumns: '22px 1fr 1fr 1fr 16px', gap: 3, alignItems: 'center', padding: '2px 0', borderTop: '1px solid var(--line)' }}>
              <span className="mono" style={{ fontSize: 9, color: st.kind === 'WARMUP' ? 'var(--c-amber)' : 'var(--text-2)', fontWeight: 700 }}>{st.kind === 'WARMUP' ? 'W' : i + 1}</span>
              {ex.timed ? (
                <>
                  <Cell value={st.time_secs} format={fmtSecs} onCommit={v => onPatchSet(st.id, { time_secs: parseClock(v) })}/>
                  <span/>
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

// Inline-editable cell: shows formatted value, becomes an input on focus.
function Cell({ value, format, onCommit }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const display = format ? format(value) : (value === '' || value == null ? '—' : value);
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
