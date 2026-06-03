import React from 'react'
import { supabase } from '../lib/supabase'
import { HexBackButton, HexShape } from '../components/hex'
import { IconChevronRight } from '../components/icons'

const IMG_FALLBACK = 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=200&q=70';
const TAGS = ['STRENGTH','ONBOARD','REHAB','ENDURANCE','HYBRID','SPORT'];
const TAG_COLORS = {
  STRENGTH: 'var(--accent)', ONBOARD: 'var(--c-amber)', REHAB: 'var(--c-coral)',
  ENDURANCE: 'var(--accent-2)', HYBRID: 'var(--c-blue)', SPORT: 'var(--c-pink)',
};

export function ProgrammeBuilder({ programme, onClose, openRoadmap = false, trainerId }) {
  const [prog, setProg]             = React.useState(programme);
  const [roadmapMode, setRoadmapMode] = React.useState(openRoadmap);
  const [phaseIdx, setPhaseIdx]     = React.useState(0);
  const [weekIdx, setWeekIdx]       = React.useState(0);
  const [dayIdx, setDayIdx]         = React.useState(0);
  const [dirty, setDirty]           = React.useState(false);
  const [saving, setSaving]         = React.useState(false);
  const [day, setDay]               = React.useState(null);
  const [dayLoading, setDayLoading] = React.useState(!openRoadmap);
  const [expandedExId, setExpandedExId]   = React.useState(null);
  const [expandedSetId, setExpandedSetId] = React.useState(null);
  const [saveError, setSaveError]         = React.useState(null);

  const phase = prog.phaseList[phaseIdx];
  const days  = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  // Load day from DB whenever phase/week/day or prog changes (but not in roadmap mode)
  React.useEffect(() => {
    if (roadmapMode) return;
    let cancelled = false;
    async function load() {
      setDayLoading(true);
      setExpandedExId(null);
      setExpandedSetId(null);

      if (!phase?.id) { if (!cancelled) { setDay(seedDay()); setDayLoading(false); } return; }

      const { data: dayRow } = await supabase
        .from('programme_days')
        .select('*')
        .eq('phase_id', phase.id)
        .eq('week_index', weekIdx)
        .eq('day_of_week', dayIdx)
        .maybeSingle();

      if (cancelled) return;
      if (!dayRow) { setDay(null); setDirty(false); setDayLoading(false); return; }

      const { data: sections } = await supabase
        .from('workout_sections')
        .select('*, section_exercises(*, exercise_sets(*))')
        .eq('day_id', dayRow.id)
        .order('sort_order');

      if (cancelled) return;
      setDay(sections ? { intro: dayRow.intro || '', notes: dayRow.notes || '', sections: dbToSections(sections) } : null);
      setDirty(false);
      setDayLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [phaseIdx, weekIdx, dayIdx, prog]);

  const move = (setter) => { setter(); setDirty(false); };

  // ── Save ─────────────────────────────────────────────────────
  const saveDay = async () => {
    if (!phase?.id || !day) return;
    setSaving(true);
    setSaveError(null);

    const { data: dayRow, error: dayErr } = await supabase
      .from('programme_days')
      .upsert(
        { phase_id: phase.id, week_index: weekIdx, day_of_week: dayIdx, intro: day.intro || '', notes: day.notes || '' },
        { onConflict: 'phase_id,week_index,day_of_week' }
      )
      .select('id').single();

    if (!dayRow) {
      setSaving(false);
      setSaveError(dayErr?.message || 'Save failed — have you run migration 3 (notes_tempo)?');
      return;
    }

    await supabase.from('workout_sections').delete().eq('day_id', dayRow.id);

    for (let sOrd = 0; sOrd < day.sections.length; sOrd++) {
      const s = day.sections[sOrd];
      const { data: sec } = await supabase
        .from('workout_sections')
        .insert({ day_id: dayRow.id, kind: s.kind, title: s.title, sort_order: sOrd })
        .select('id').single();
      if (!sec) continue;

      for (let eOrd = 0; eOrd < s.items.length; eOrd++) {
        const ex = s.items[eOrd];
        const { data: exRow } = await supabase
          .from('section_exercises')
          .insert({ section_id: sec.id, name: ex.name, img_url: ex.img, timed: ex.timed, tempo: ex.tempo || '', coach_notes: ex.coachNotes || '', sort_order: eOrd })
          .select('id').single();
        if (!exRow) continue;

        await supabase.from('exercise_sets').insert(
          ex.setsList.map((st, i) => ({
            exercise_id: exRow.id, set_index: i,
            kind: st.kind, reps: st.reps, weight_kg: st.weight,
            rest_secs: st.rest, time_secs: st.time, intensity: st.intensity,
          }))
        );
      }
    }

    await supabase.from('programmes').update({ updated_at: new Date().toISOString() }).eq('id', prog.id);
    setSaving(false);
    setDirty(false);
  };

  // ── Exercise edits ────────────────────────────────────────────
  const updateEx = (sIdx, eIdx, patch) => { setDay(d => mapDay(d, sIdx, eIdx, e => ({ ...e, ...patch }))); setDirty(true); };
  const dupEx = (sIdx, eIdx) => {
    setDay(d => ({ ...d, sections: d.sections.map((s, si) => si !== sIdx ? s : ({
      ...s, items: [...s.items.slice(0, eIdx+1), { ...s.items[eIdx], id: 'x'+Date.now(), setsList: s.items[eIdx].setsList.map(st => ({ ...st, id: randId() })) }, ...s.items.slice(eIdx+1)],
    })) }));
    setDirty(true);
  };
  const delEx = (sIdx, eIdx) => { setDay(d => ({ ...d, sections: d.sections.map((s, si) => si !== sIdx ? s : ({ ...s, items: s.items.filter((_, i) => i !== eIdx) })) })); setDirty(true); };
  const addEx = (sIdx) => {
    const id = 'x' + Date.now();
    setDay(d => ({ ...d, sections: d.sections.map((s, si) => si !== sIdx ? s : ({
      ...s, items: [...s.items, { id, name: 'New Exercise', img: IMG_FALLBACK, timed: false, tempo: '', coachNotes: '', setsList: [mkSet('WORK', { reps: 10, weight: 0, rest: 60, intensity: 6 })] }],
    })) }));
    setDirty(true);
    setExpandedExId(id);
  };

  // ── Set edits ─────────────────────────────────────────────────
  const updateSet = (sIdx, eIdx, setIdx, patch) => { setDay(d => mapDay(d, sIdx, eIdx, e => ({ ...e, setsList: e.setsList.map((st, i) => i !== setIdx ? st : ({ ...st, ...patch })) }))); setDirty(true); };
  const addSet = (sIdx, eIdx, kind = 'WORK') => {
    setDay(d => mapDay(d, sIdx, eIdx, e => {
      const last = e.setsList[e.setsList.length - 1];
      const base = last ? { reps: last.reps, weight: last.weight, rest: last.rest, time: last.time, intensity: last.intensity } : { reps: 8, weight: 0, rest: 60, time: 60, intensity: 6 };
      if (kind === 'WARMUP') { base.weight = Math.max(0, Math.round(base.weight*0.5/2.5)*2.5); base.intensity = 3; base.rest = 45; }
      return { ...e, setsList: [...e.setsList, mkSet(kind, base)] };
    }));
    setDirty(true);
  };
  const delSet = (sIdx, eIdx, i) => { setDay(d => mapDay(d, sIdx, eIdx, e => ({ ...e, setsList: e.setsList.length > 1 ? e.setsList.filter((_, j) => j !== i) : e.setsList }))); setDirty(true); };
  const dupSet = (sIdx, eIdx, i) => { setDay(d => mapDay(d, sIdx, eIdx, e => ({ ...e, setsList: [...e.setsList.slice(0,i+1), { ...e.setsList[i], id: randId() }, ...e.setsList.slice(i+1)] }))); setDirty(true); };
  const applyToAll = (sIdx, eIdx, i) => {
    setDay(d => mapDay(d, sIdx, eIdx, e => {
      const src = e.setsList[i];
      return { ...e, setsList: e.setsList.map((st, j) => j <= i ? st : ({ ...st, weight: src.weight, reps: src.reps, time: src.time, rest: src.rest, intensity: src.intensity })) };
    }));
    setDirty(true);
  };

  // ── Roadmap callbacks ─────────────────────────────────────────
  const handleRoadmapSave = (updatedProg) => {
    setProg(updatedProg);
    setPhaseIdx(0); setWeekIdx(0); setDayIdx(0);
    setRoadmapMode(false);
    setDayLoading(true);
  };
  const handleRoadmapBack = () => openRoadmap ? onClose() : setRoadmapMode(false);

  // ── Render: roadmap ───────────────────────────────────────────
  if (roadmapMode) {
    return <RoadmapPanel prog={prog} onSave={handleRoadmapSave} onBack={handleRoadmapBack} trainerId={trainerId}/>;
  }

  const saveLabel = saving ? 'SAVING…' : dirty ? 'SAVE' : 'SAVED';

  // ── Render: day builder ───────────────────────────────────────
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'var(--bg-0)', display: 'flex', flexDirection: 'column' }}>

      {/* Top bar */}
      <div style={{ padding: '54px 14px 10px', background: 'linear-gradient(180deg, var(--bg-1) 70%, transparent)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <HexBackButton onClick={onClose} size={36}/>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
            <div className="mono" style={{ fontSize: 8, color: 'var(--accent)', letterSpacing: '0.16em', fontWeight: 600 }}>// PROGRAMME BUILDER</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prog.name}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setRoadmapMode(true)} style={{
              all: 'unset', cursor: 'pointer',
              padding: '8px 10px', borderRadius: 8,
              background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
              color: 'var(--text-3)', fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
            }}>ROADMAP</button>
            <button onClick={saveDay} disabled={saving || !dirty} style={{
              all: 'unset', cursor: dirty && !saving ? 'pointer' : 'default',
              padding: '8px 12px', borderRadius: 8,
              background: dirty ? 'linear-gradient(135deg, var(--accent), var(--accent-2))' : 'var(--bg-2)',
              border: '1px solid ' + (dirty ? 'transparent' : 'var(--line-strong)'),
              color: dirty ? 'var(--on-accent)' : 'var(--text-3)',
              fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              boxShadow: dirty ? '0 0 calc(10px * var(--glow)) var(--accent-glow)' : 'none',
              opacity: saving ? 0.7 : 1,
            }}>{saveLabel}</button>
          </div>
        </div>
      </div>

      {/* Phase / Week / Day pickers */}
      <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid var(--line)', background: 'var(--bg-1)' }}>
        <div className="label" style={{ marginBottom: 6 }}>// PHASE</div>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', marginBottom: 10 }}>
          {prog.phaseList.map((ph, i) => (
            <button key={i} onClick={() => move(() => setPhaseIdx(i))} style={{
              all: 'unset', cursor: 'pointer', whiteSpace: 'nowrap',
              padding: '6px 10px', borderRadius: 6,
              border: '1px solid ' + (phaseIdx === i ? 'var(--accent)' : 'var(--line-strong)'),
              background: phaseIdx === i ? 'var(--accent-soft)' : 'transparent',
              color: phaseIdx === i ? 'var(--accent)' : 'var(--text-2)',
              fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.08em', fontWeight: 600,
            }}>P{i+1} · {ph.name.toUpperCase()}</button>
          ))}
        </div>

        {phase && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="label">// WEEK · {phase.weeks} TOTAL</div>
              <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.08em' }}>FOCUS: {phase.focus?.toUpperCase()}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(phase.weeks, 8)}, 1fr)`, gap: 4, marginBottom: 10 }}>
              {Array.from({ length: phase.weeks }, (_, i) => (
                <button key={i} onClick={() => move(() => setWeekIdx(i))} style={{
                  all: 'unset', cursor: 'pointer', textAlign: 'center', padding: '7px 0', borderRadius: 6,
                  border: '1px solid ' + (weekIdx === i ? 'var(--accent)' : 'var(--line)'),
                  background: weekIdx === i ? 'var(--accent-soft)' : 'var(--bg-2)',
                  color: weekIdx === i ? 'var(--accent)' : 'var(--text-2)',
                  fontFamily: 'JetBrains Mono', fontSize: 11, letterSpacing: '0.05em', fontWeight: 600,
                }}>W{i+1}</button>
              ))}
            </div>
          </>
        )}

        <div className="label" style={{ marginBottom: 6 }}>// DAY</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {days.map((d, i) => (
            <button key={i} onClick={() => move(() => setDayIdx(i))} style={{
              all: 'unset', cursor: 'pointer', textAlign: 'center', padding: '6px 0', borderRadius: 6,
              border: '1px solid ' + (dayIdx === i ? 'var(--accent)' : 'var(--line)'),
              background: dayIdx === i ? 'var(--accent-soft)' : 'var(--bg-2)',
              color: dayIdx === i ? 'var(--accent)' : 'var(--text-2)',
              fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.1em', fontWeight: 600,
            }}>{d.toUpperCase()}</button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="scroller" style={{ flex: 1, padding: '14px 14px 28px', minHeight: 0 }}>
        {saveError && (
          <div className="mono" style={{
            marginBottom: 12, padding: '10px 12px', borderRadius: 8, fontSize: 10, lineHeight: 1.5,
            background: 'color-mix(in srgb, var(--c-coral) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--c-coral) 35%, transparent)',
            color: 'var(--c-coral)', letterSpacing: '0.04em',
          }}>
            ✕ {saveError}
          </div>
        )}
        {dayLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'JetBrains Mono', fontSize: 11, letterSpacing: '0.12em' }}>LOADING…</div>
        ) : !day ? (
          <RestDay onAdd={() => { setDay(seedDay()); setDirty(true); }}/>
        ) : (
          <>
            {/* Workout intro */}
            <div style={{ marginBottom: 16 }}>
              <div className="label" style={{ marginBottom: 8 }}>// WORKOUT INTRO</div>
              <textarea
                value={day.intro || ''}
                onChange={e => { setDay(d => ({ ...d, intro: e.target.value })); setDirty(true); }}
                placeholder="Overview, goals, or context for this session — shown to the client at the top of the workout."
                rows={3}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 10,
                  color: 'var(--text)', fontFamily: 'JetBrains Mono', fontSize: 12, lineHeight: 1.6,
                  padding: '12px 14px', outline: 'none', resize: 'vertical',
                }}
              />
            </div>

            {day.sections.map((s, sIdx) => (
              <Section key={s.kind + sIdx} s={s} sIdx={sIdx}
                expandedExId={expandedExId} expandedSetId={expandedSetId}
                onExpandEx={(id) => { setExpandedExId(expandedExId === id ? null : id); setExpandedSetId(null); }}
                onExpandSet={(id) => setExpandedSetId(expandedSetId === id ? null : id)}
                onUpdateEx={(eIdx, patch) => updateEx(sIdx, eIdx, patch)}
                onDupEx={(eIdx) => dupEx(sIdx, eIdx)}
                onDelEx={(eIdx) => delEx(sIdx, eIdx)}
                onAddEx={() => addEx(sIdx)}
                onUpdateSet={(eIdx, setIdx, patch) => updateSet(sIdx, eIdx, setIdx, patch)}
                onAddSet={(eIdx, kind) => addSet(sIdx, eIdx, kind)}
                onDelSet={(eIdx, i) => delSet(sIdx, eIdx, i)}
                onDupSet={(eIdx, i) => dupSet(sIdx, eIdx, i)}
                onApplyToAll={(eIdx, i) => applyToAll(sIdx, eIdx, i)}
              />
            ))}

            {/* Session notes */}
            <div style={{ marginTop: 16 }}>
              <div className="label" style={{ marginBottom: 8 }}>// SESSION NOTES</div>
              <textarea
                value={day.notes || ''}
                onChange={e => { setDay(d => ({ ...d, notes: e.target.value })); setDirty(true); }}
                placeholder="Post-session notes, load context, progressions to consider next time…"
                rows={4}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 10,
                  color: 'var(--text)', fontFamily: 'JetBrains Mono', fontSize: 12, lineHeight: 1.6,
                  padding: '12px 14px', outline: 'none', resize: 'vertical',
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── ROADMAP PANEL ────────────────────────────────────────────────
function RoadmapPanel({ prog, onSave, onBack, trainerId }) {
  const [name, setName]         = React.useState(prog.name);
  const [tag, setTag]           = React.useState(prog.tag || 'STRENGTH');
  const [phases, setPhases]     = React.useState(
    prog.phaseList?.length > 0
      ? prog.phaseList.map(ph => ({ ...ph }))
      : [{ id: null, name: 'Phase 1', focus: 'Foundation', weeks: 4 }]
  );
  const [deletedIds, setDeletedIds] = React.useState([]);
  const [saving, setSaving]     = React.useState(false);
  const [saveError, setSaveError] = React.useState(null);

  const updPhase = (i, patch) => setPhases(ps => ps.map((p, j) => j === i ? { ...p, ...patch } : p));
  const addPhase = () => setPhases(ps => [...ps, { id: null, name: `Phase ${ps.length + 1}`, focus: 'Build', weeks: 4 }]);
  const remPhase = (i) => {
    const ph = phases[i];
    if (ph.id) setDeletedIds(ids => [...ids, ph.id]);
    setPhases(ps => ps.filter((_, j) => j !== i));
  };

  const saveRoadmap = async () => {
    if (!name.trim() || phases.length === 0) return;
    setSaving(true);
    setSaveError(null);

    let progId = prog.id;

    if (!progId) {
      const { data: newProg, error: err } = await supabase
        .from('programmes')
        .insert({ trainer_id: trainerId, name: name.trim(), tag })
        .select('id').single();
      if (!newProg) {
        setSaving(false);
        setSaveError(err?.message || 'Could not create programme — are you logged in as a trainer?');
        return;
      }
      progId = newProg.id;
    } else {
      await supabase.from('programmes').update({ name: name.trim(), tag }).eq('id', progId);
    }

    for (const id of deletedIds) await supabase.from('programme_phases').delete().eq('id', id);

    const newPhaseList = [];
    for (let i = 0; i < phases.length; i++) {
      const ph = phases[i];
      if (ph.id) {
        await supabase.from('programme_phases').update({ name: ph.name, focus: ph.focus, weeks: ph.weeks, phase_index: i }).eq('id', ph.id);
        newPhaseList.push({ id: ph.id, name: ph.name, focus: ph.focus, weeks: ph.weeks });
      } else {
        const { data } = await supabase.from('programme_phases')
          .insert({ programme_id: progId, phase_index: i, name: ph.name, focus: ph.focus, weeks: ph.weeks })
          .select('id').single();
        newPhaseList.push({ id: data?.id || null, name: ph.name, focus: ph.focus, weeks: ph.weeks });
      }
    }

    setSaving(false);
    const totalWeeks = newPhaseList.reduce((s, p) => s + p.weeks, 0);
    onSave({ ...prog, id: progId, name: name.trim(), tag, phaseList: newPhaseList, weeks: totalWeeks, phases: newPhaseList.length });
  };

  const totalWeeks = phases.reduce((s, p) => s + (p.weeks || 0), 0);
  const tagColor = TAG_COLORS[tag] || 'var(--accent)';

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'var(--bg-0)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '54px 14px 10px', background: 'linear-gradient(180deg, var(--bg-1) 70%, transparent)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <HexBackButton onClick={onBack} size={36}/>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
            <div className="mono" style={{ fontSize: 8, color: 'var(--accent)', letterSpacing: '0.16em', fontWeight: 600 }}>// PROGRAMME ROADMAP</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: 'var(--text-2)' }}>
              {totalWeeks} WEEKS · {phases.length} PHASE{phases.length !== 1 ? 'S' : ''}
            </div>
          </div>
          <button onClick={saveRoadmap} disabled={saving || !name.trim() || phases.length === 0} style={{
            all: 'unset', cursor: 'pointer',
            padding: '8px 12px', borderRadius: 8,
            background: 'linear-gradient(135deg, var(--accent), var(--accent-2))',
            color: 'var(--on-accent)',
            fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            boxShadow: '0 0 calc(10px * var(--glow)) var(--accent-glow)',
            opacity: saving ? 0.7 : 1,
          }}>{saving ? 'SAVING…' : 'SAVE'}</button>
        </div>
      </div>

      <div className="scroller" style={{ flex: 1, padding: '16px 14px 36px', minHeight: 0 }}>
        {saveError && (
          <div className="mono" style={{
            marginBottom: 14, padding: '10px 12px', borderRadius: 8, fontSize: 10, lineHeight: 1.5,
            background: 'color-mix(in srgb, var(--c-coral) 12%, transparent)',
            border: '1px solid color-mix(in srgb, var(--c-coral) 35%, transparent)',
            color: 'var(--c-coral)', letterSpacing: '0.04em',
          }}>✕ {saveError}</div>
        )}
        {/* Name */}
        <div style={{ marginBottom: 18 }}>
          <div className="label" style={{ marginBottom: 7 }}>// PROGRAMME NAME</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Strength Foundation 12"
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 10, padding: '12px 14px', color: 'var(--text)', fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 600, outline: 'none' }}/>
        </div>

        {/* Tag */}
        <div style={{ marginBottom: 18 }}>
          <div className="label" style={{ marginBottom: 7 }}>// TYPE</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {TAGS.map(t => {
              const tc = TAG_COLORS[t] || 'var(--accent)';
              return (
                <button key={t} onClick={() => setTag(t)} style={{
                  all: 'unset', cursor: 'pointer',
                  padding: '6px 12px', borderRadius: 999,
                  border: '1px solid ' + (tag === t ? tc : 'var(--line-strong)'),
                  background: tag === t ? `color-mix(in srgb, ${tc} 15%, transparent)` : 'transparent',
                  color: tag === t ? tc : 'var(--text-3)',
                  fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.1em', fontWeight: 600,
                }}>{t}</button>
              );
            })}
          </div>
        </div>

        {/* Phases */}
        <div className="label" style={{ marginBottom: 8 }}>// PHASES</div>
        <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
          {phases.map((ph, i) => (
            <div key={i} className="card" style={{ padding: 12, borderLeft: '2px solid var(--accent)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <span style={{
                  width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', flexShrink: 0,
                  background: 'var(--accent-soft)', border: '1px solid var(--accent)',
                  color: 'var(--accent)', fontFamily: 'Orbitron', fontWeight: 800, fontSize: 11,
                }}>P{i+1}</span>
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <input value={ph.name} onChange={e => updPhase(i, { name: e.target.value })} placeholder="Name" style={phaseInputSt}/>
                  <input value={ph.focus} onChange={e => updPhase(i, { focus: e.target.value })} placeholder="Focus" style={phaseInputSt}/>
                </div>
                {phases.length > 1 && (
                  <button onClick={() => remPhase(i)} style={{
                    all: 'unset', cursor: 'pointer', width: 24, height: 24, borderRadius: 6, flexShrink: 0,
                    display: 'grid', placeItems: 'center',
                    background: 'color-mix(in srgb, var(--c-coral) 12%, transparent)',
                    border: '1px solid color-mix(in srgb, var(--c-coral) 35%, transparent)',
                    color: 'var(--c-coral)', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 12,
                  }}>✕</button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em', flexShrink: 0 }}>WEEKS</div>
                <div style={{ display: 'grid', gridTemplateColumns: '22px 52px 22px', gap: 4, alignItems: 'center' }}>
                  <StepBtn onClick={() => updPhase(i, { weeks: Math.max(1, ph.weeks - 1) })}>−</StepBtn>
                  <InlineNum value={ph.weeks} min={1} max={52} onChange={v => updPhase(i, { weeks: v })}/>
                  <StepBtn onClick={() => updPhase(i, { weeks: Math.min(52, ph.weeks + 1) })}>+</StepBtn>
                </div>
                <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
                  {ph.weeks === 1 ? '1 WEEK' : `${ph.weeks} WEEKS`}
                </div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={addPhase} style={{
          all: 'unset', cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center',
          padding: '10px 0', border: '1px dashed var(--line-strong)', borderRadius: 10,
          color: 'var(--accent)', fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.14em', fontWeight: 600,
          marginBottom: 18,
        }}>+ ADD PHASE</button>

        {/* Summary card */}
        <div className="card" style={{ padding: 14, marginBottom: 18, borderLeft: `2px solid ${tagColor}` }}>
          <div className="mono" style={{ fontSize: 9, color: tagColor, letterSpacing: '0.12em', fontWeight: 600, marginBottom: 10 }}>// SUMMARY</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <SummaryKpi label="WEEKS" value={totalWeeks} color={tagColor}/>
            <SummaryKpi label="PHASES" value={phases.length} color="var(--text-2)"/>
            <SummaryKpi label="TYPE" value={tag.slice(0,4)} color={tagColor}/>
          </div>
        </div>

        <button onClick={saveRoadmap} disabled={saving || !name.trim() || phases.length === 0}
          className="btn-primary" style={{ width: '100%', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'SAVING…' : 'START BUILDING →'}
        </button>
      </div>
    </div>
  );
}

function SummaryKpi({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 6px', background: 'var(--bg-3)', borderRadius: 8, border: '1px solid var(--line)' }}>
      <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: '0.1em', marginBottom: 4 }}>{label}</div>
      <div className="h-bold" style={{ fontSize: 20, color, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

// ── REST DAY ──────────────────────────────────────────────────────
function RestDay({ onAdd }) {
  return (
    <div className="card" style={{ padding: 24, textAlign: 'center' }}>
      <div className="h-bold" style={{ fontSize: 18, color: 'var(--text-2)', marginBottom: 6 }}>REST DAY</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>No session scheduled. Click below to add a workout.</div>
      <button onClick={onAdd} className="btn-ghost" style={{ color: 'var(--accent)', borderColor: 'var(--accent)' }}>+ ADD WORKOUT</button>
    </div>
  );
}

// ── SECTION ───────────────────────────────────────────────────────
function Section({ s, sIdx, expandedExId, expandedSetId, onExpandEx, onExpandSet, onUpdateEx, onDupEx, onDelEx, onAddEx, onUpdateSet, onAddSet, onDelSet, onDupSet, onApplyToAll }) {
  const color = sectionColor(s.kind);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, display: 'grid', placeItems: 'center', color, background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`, fontFamily: 'Orbitron', fontWeight: 800, fontSize: 10 }}>{sIdx+1}</span>
          <div className="label" style={{ color, letterSpacing: '0.14em' }}>// {s.title.toUpperCase()}</div>
        </div>
        <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em' }}>{s.items.length} EX</span>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {s.items.map((e, eIdx) => (
          <ExerciseEditor key={e.id} e={e} color={color}
            expanded={expandedExId === e.id} expandedSetId={expandedSetId}
            onExpand={() => onExpandEx(e.id)}
            onExpandSet={onExpandSet}
            onUpdateEx={(patch) => onUpdateEx(eIdx, patch)}
            onDupEx={() => onDupEx(eIdx)}
            onDelEx={() => onDelEx(eIdx)}
            onUpdateSet={(setIdx, patch) => onUpdateSet(eIdx, setIdx, patch)}
            onAddSet={(kind) => onAddSet(eIdx, kind)}
            onDelSet={(i) => onDelSet(eIdx, i)}
            onDupSet={(i) => onDupSet(eIdx, i)}
            onApplyToAll={(i) => onApplyToAll(eIdx, i)}
          />
        ))}
      </div>
      <button onClick={onAddEx} style={{
        all: 'unset', cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center',
        marginTop: 6, padding: '8px 0', border: '1px dashed var(--line-strong)', borderRadius: 8,
        color, fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.14em', fontWeight: 600,
      }}>+ ADD EXERCISE</button>
    </div>
  );
}

// ── EXERCISE EDITOR ───────────────────────────────────────────────
function ExerciseEditor({ e, color, expanded, expandedSetId, onExpand, onExpandSet, onUpdateEx, onDupEx, onDelEx, onUpdateSet, onAddSet, onDelSet, onDupSet, onApplyToAll }) {
  const workSets = e.setsList.filter(s => s.kind !== 'WARMUP');
  const summary  = workSets.length === 0 ? `${e.setsList.length} warm-up` : `${e.setsList.length} sets · ${summarize(e)}`;

  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid '+(expanded?color:'var(--line)'), borderLeft: `2px solid ${color}`, borderRadius: 10, overflow: 'hidden', boxShadow: expanded ? `0 0 calc(8px * var(--glow)) color-mix(in srgb, ${color} 30%, transparent)` : 'none' }}>
      <button onClick={onExpand} style={{ all: 'unset', cursor: 'pointer', width: '100%', display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 10, alignItems: 'center', padding: 10 }}>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: `url('${e.img}') center/cover, var(--bg-3)`, border: '1px solid var(--line)' }}/>
        <div style={{ minWidth: 0 }}>
          <input value={e.name} onClick={ev => ev.stopPropagation()} onChange={ev => onUpdateEx({ name: ev.target.value })}
            style={{ width: '100%', background: 'transparent', border: 0, outline: 'none', color: 'var(--text)', fontSize: 13, fontWeight: 600, fontFamily: 'inherit', padding: 0 }}/>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 2 }}>{summary}</div>
        </div>
        <div style={{ color: 'var(--text-3)', transform: expanded ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform .2s' }}>
          <IconChevronRight size={14}/>
        </div>
      </button>

      {expanded && (
        <div style={{ padding: '0 10px 12px', borderTop: '1px solid var(--line)' }}>
          {/* Timed mode */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 4px', borderBottom: '1px dashed var(--line)' }}>
            <div>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 600 }}>TIMED MODE</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{e.timed ? 'Sets track duration' : 'Sets track reps'}</div>
            </div>
            <Toggle on={e.timed} onChange={v => onUpdateEx({ timed: v })}/>
          </div>

          {/* Tempo */}
          <div style={{ padding: '10px 4px', borderBottom: '1px dashed var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 600 }}>TEMPO</div>
              <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)', letterSpacing: '0.08em' }}>DOWN · PAUSE · UP · PAUSE</div>
            </div>
            <TempoInput value={e.tempo || ''} onChange={v => onUpdateEx({ tempo: v })}/>
          </div>

          {/* Coach notes */}
          <div style={{ padding: '10px 4px', borderBottom: '1px dashed var(--line)' }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 600, marginBottom: 8 }}>COACH NOTES</div>
            <textarea
              value={e.coachNotes || ''}
              onChange={ev => onUpdateEx({ coachNotes: ev.target.value })}
              placeholder="Technique cues, regressions/progressions, client-specific reminders…"
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--bg-1)', border: '1px solid var(--line-strong)', borderRadius: 8,
                color: 'var(--text)', fontFamily: 'JetBrains Mono', fontSize: 11, lineHeight: 1.6,
                padding: '10px 12px', outline: 'none', resize: 'vertical',
              }}
            />
          </div>

          {/* Per-set table */}
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 1fr 30px 18px', gap: 6, padding: '0 2px 6px' }} className="mono">
              <span style={thSt}>SET</span>
              <span style={thSt}>{e.timed ? 'TIME' : 'KG'}</span>
              <span style={thSt}>{e.timed ? 'KG' : 'REPS'}</span>
              <span style={thSt}>REST</span>
              <span style={thSt}>INT</span>
              <span/>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              {e.setsList.map((st, i) => (
                <SetRow key={st.id} st={st} setIdx={i} total={e.setsList.length} timed={e.timed} color={color}
                  expanded={expandedSetId === st.id}
                  onExpand={() => onExpandSet(st.id)}
                  onUpdate={patch => onUpdateSet(i, patch)}
                  onDelete={() => onDelSet(i)}
                  onDuplicate={() => onDupSet(i)}
                  onApplyToAll={() => onApplyToAll(i)}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button onClick={() => onAddSet('WARMUP')} style={addSetBtn('var(--c-amber)')}>+ WARM-UP</button>
              <button onClick={() => onAddSet('WORK')}   style={addSetBtn(color)}>+ WORK SET</button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            <button onClick={onDupEx} className="btn-ghost" style={{ flex: 1, padding: '8px 10px', fontSize: 10 }}>⎘ DUPLICATE EX</button>
            <button onClick={onDelEx} className="btn-ghost" style={{ flex: 1, padding: '8px 10px', fontSize: 10, color: 'var(--c-coral)', borderColor: 'color-mix(in srgb, var(--c-coral) 40%, var(--line-strong))' }}>✕ DELETE EX</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SET ROW ───────────────────────────────────────────────────────
function SetRow({ st, setIdx, total, timed, color, expanded, onExpand, onUpdate, onDelete, onDuplicate, onApplyToAll }) {
  const isWarmup = st.kind === 'WARMUP';
  const accent   = isWarmup ? 'var(--c-amber)' : color;
  return (
    <div style={{ background: expanded ? 'var(--bg-3)' : 'var(--bg-1)', border: '1px solid '+(expanded?accent:'var(--line)'), borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={onExpand} style={{ all: 'unset', cursor: 'pointer', width: '100%', display: 'grid', gridTemplateColumns: '28px 1fr 1fr 1fr 30px 18px', gap: 6, alignItems: 'center', padding: '8px 6px', boxSizing: 'border-box' }}>
        <span style={{ width: 22, height: 22, borderRadius: 5, background: isWarmup?'rgba(243,158,31,0.15)':'rgba(255,255,255,0.04)', color: isWarmup?'var(--c-amber)':'var(--text-2)', border: isWarmup?'1px solid color-mix(in srgb, var(--c-amber) 50%, transparent)':'1px solid var(--line)', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 10, display: 'grid', placeItems: 'center' }}>
          {isWarmup ? 'W' : String(setIdx+1).padStart(2,'0')}
        </span>
        {timed ? <CellVal value={fmtSecs(st.time)}/> : <CellVal value={st.weight ? `${st.weight}` : 'BW'} unit={st.weight ? 'kg' : null}/>}
        {timed ? <CellVal value={st.weight ? `${st.weight}` : '—'} unit={st.weight ? 'kg' : null}/> : <CellVal value={`× ${st.reps||0}`}/>}
        <CellVal value={fmtSecs(st.rest)}/>
        <span style={{ width: 24, height: 22, borderRadius: 5, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${intensityColor(st.intensity)} 18%, transparent)`, color: intensityColor(st.intensity), fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 11, border: `1px solid color-mix(in srgb, ${intensityColor(st.intensity)} 40%, transparent)` }}>{st.intensity}</span>
        <div style={{ color: 'var(--text-3)', transform: expanded?'rotate(90deg)':'rotate(0)', transition: 'transform .2s', display: 'grid', placeItems: 'center' }}><IconChevronRight size={12}/></div>
      </button>

      {expanded && (
        <div style={{ padding: '4px 8px 10px', borderTop: '1px dashed var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 2px', marginBottom: 6 }}>
            <div>
              <div className="mono" style={{ fontSize: 9, color: 'var(--c-amber)', letterSpacing: '0.1em', fontWeight: 700 }}>WARM-UP SET</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{isWarmup ? 'Excluded from working-set count' : 'Counts toward working sets'}</div>
            </div>
            <Toggle on={isWarmup} onChange={v => onUpdate({ kind: v ? 'WARMUP' : 'WORK' })}/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {timed
              ? <TimeStepper label="TIME" value={st.time||60} onChange={v => onUpdate({ time: v })} accent={accent}/>
              : <Stepper label="REPS" value={st.reps||0} min={0} max={50} step={1} onChange={v => onUpdate({ reps: v })} accent={accent}/>
            }
            <Stepper label="WEIGHT" unit="kg" value={st.weight||0} min={0} max={400} step={2.5} onChange={v => onUpdate({ weight: v })} accent={accent}/>
          </div>
          <div style={{ marginTop: 6 }}>
            <TimeStepper label="REST" value={st.rest||0} onChange={v => onUpdate({ rest: v })} accent={accent} stepSec={15}/>
          </div>
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
              <span className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-2)', fontWeight: 600 }}>INTENSITY · {st.intensity}/10</span>
              <span className="mono" style={{ fontSize: 9, color: intensityColor(st.intensity), letterSpacing: '0.08em', fontWeight: 700 }}>{intensityLabel(st.intensity)}</span>
            </div>
            <IntensityPicker value={st.intensity} onChange={v => onUpdate({ intensity: v })}/>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, marginTop: 12 }}>
            <button onClick={onApplyToAll} disabled={setIdx===total-1} style={miniBtn({ disabled: setIdx===total-1 })}>↓ APPLY BELOW</button>
            <button onClick={onDuplicate} style={miniBtn()}>⎘ DUPLICATE</button>
            <button onClick={onDelete} disabled={total<=1} style={miniBtn({ danger: true, disabled: total<=1 })}>✕ DELETE</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── TEMPO INPUT ───────────────────────────────────────────────────
function TempoInput({ value, onChange }) {
  const parts  = (value || '').split('-');
  const vals   = [parts[0]||'', parts[1]||'', parts[2]||'', parts[3]||''];
  const labels = ['DOWN','HOLD↓','UP','HOLD↑'];
  const update = (i, v) => {
    const next = [...vals]; next[i] = v.slice(-1);
    onChange(next.every(x => x === '') ? '' : next.join('-'));
  };
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
      {vals.map((v, i) => (
        <div key={i} style={{ textAlign: 'center' }}>
          <div className="mono" style={{ fontSize: 7, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 4 }}>{labels[i]}</div>
          <input value={v} onChange={e => update(i, e.target.value)} maxLength={1} placeholder="—"
            style={{
              width: '100%', boxSizing: 'border-box', textAlign: 'center',
              background: v ? 'var(--bg-1)' : 'transparent',
              border: '1px solid ' + (v ? 'var(--accent)' : 'var(--line-strong)'),
              borderRadius: 7, color: v ? 'var(--accent)' : 'var(--text-3)',
              fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 700,
              padding: '6px 0', outline: 'none',
            }}/>
        </div>
      ))}
    </div>
  );
}

// ── REUSABLE CONTROLS ─────────────────────────────────────────────
function Stepper({ label, value, unit, min=0, max=999, step=1, onChange, accent='var(--accent)' }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft]     = React.useState('');

  const dec = () => onChange(Math.max(min, +(value-step).toFixed(2)));
  const inc = () => onChange(Math.min(max, +(value+step).toFixed(2)));
  const startEdit = () => { setDraft(String(value)); setEditing(true); };
  const commit = () => {
    const n = parseFloat(draft);
    if (!isNaN(n)) onChange(+Math.min(max, Math.max(min, Math.round(n/step)*step)).toFixed(2));
    setEditing(false);
  };

  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 8px' }}>
      <div className="mono" style={{ fontSize: 8, color: accent, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 22px', gap: 4, alignItems: 'center' }}>
        <StepBtn onClick={dec}>−</StepBtn>
        {editing ? (
          <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
            onBlur={commit} onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') setEditing(false); }}
            style={{ width:'100%', textAlign:'center', background:'var(--bg-1)', border:'1px solid var(--accent)', borderRadius:4, color:'var(--text)', fontFamily:'JetBrains Mono', fontSize:15, fontWeight:700, padding:'2px 0', outline:'none' }}/>
        ) : (
          <div onClick={startEdit} style={{ textAlign:'center', cursor:'text', display:'flex', alignItems:'baseline', justifyContent:'center', gap:2 }}>
            <span className="h-bold" style={{ fontSize:16, color:'var(--text)', lineHeight:1 }}>{value}</span>
            {unit && <span className="mono" style={{ fontSize:8, color:'var(--text-3)', letterSpacing:'0.08em' }}>{unit}</span>}
          </div>
        )}
        <StepBtn onClick={inc}>+</StepBtn>
      </div>
    </div>
  );
}

function TimeStepper({ label, value, onChange, accent='var(--accent)', stepSec=5 }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft]     = React.useState('');

  const dec = () => onChange(Math.max(0, value-stepSec));
  const inc = () => onChange(Math.min(3600, value+stepSec));
  const startEdit = () => { setDraft(String(value)); setEditing(true); };
  const commit = () => {
    const n = parseInt(draft, 10);
    if (!isNaN(n)) onChange(Math.min(3600, Math.max(0, n)));
    setEditing(false);
  };

  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 8px' }}>
      <div className="mono" style={{ fontSize: 8, color: accent, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 3 }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '22px 1fr 22px', gap: 4, alignItems: 'center' }}>
        <StepBtn onClick={dec}>−</StepBtn>
        {editing ? (
          <div>
            <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
              onBlur={commit} onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') setEditing(false); }}
              style={{ width:'100%', textAlign:'center', background:'var(--bg-1)', border:'1px solid var(--accent)', borderRadius:4, color:'var(--text)', fontFamily:'JetBrains Mono', fontSize:15, fontWeight:700, padding:'2px 0', outline:'none' }}/>
            <div className="mono" style={{ fontSize:7, color:'var(--text-3)', textAlign:'center', marginTop:2 }}>seconds</div>
          </div>
        ) : (
          <div onClick={startEdit} style={{ textAlign:'center', cursor:'text' }}>
            <span className="h-bold" style={{ fontSize:16, color:value>0?'var(--text)':'var(--text-3)', lineHeight:1 }}>{fmtSecs(value)}</span>
          </div>
        )}
        <StepBtn onClick={inc}>+</StepBtn>
      </div>
    </div>
  );
}

function InlineNum({ value, min=1, max=52, onChange }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft]     = React.useState('');
  const commit = () => {
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n >= min && n <= max) onChange(n);
    setEditing(false);
  };
  if (editing) return (
    <input autoFocus value={draft} onChange={e => setDraft(e.target.value)}
      onBlur={commit} onKeyDown={e => { if (e.key==='Enter') commit(); if (e.key==='Escape') setEditing(false); }}
      style={{ width:'100%', textAlign:'center', background:'var(--bg-1)', border:'1px solid var(--accent)', borderRadius:4, color:'var(--text)', fontFamily:'JetBrains Mono', fontSize:16, fontWeight:700, padding:'2px 0', outline:'none', boxSizing:'border-box' }}/>
  );
  return (
    <div onClick={() => { setDraft(String(value)); setEditing(true); }} style={{ textAlign:'center', cursor:'text' }}>
      <span className="h-bold" style={{ fontSize:16, color:'var(--text)', lineHeight:1 }}>{value}</span>
    </div>
  );
}

function StepBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ all:'unset', cursor:'pointer', width:22, height:22, borderRadius:5, background:'var(--bg-1)', border:'1px solid var(--line-strong)', color:'var(--text)', fontFamily:'JetBrains Mono', fontSize:13, fontWeight:700, display:'grid', placeItems:'center', textAlign:'center' }}>{children}</button>
  );
}

function Toggle({ on, onChange }) {
  return (
    <button onClick={() => onChange(!on)} style={{ all:'unset', cursor:'pointer', width:40, height:22, borderRadius:999, background:on?'var(--accent)':'var(--bg-3)', border:'1px solid '+(on?'var(--accent)':'var(--line-strong)'), position:'relative', boxShadow:on?'0 0 calc(6px * var(--glow)) var(--accent-glow)':'none', transition:'background .2s, border-color .2s' }}>
      <span style={{ position:'absolute', top:2, left:on?20:2, width:16, height:16, borderRadius:'50%', background:on?'var(--on-accent)':'var(--text-3)', transition:'left .2s' }}/>
    </button>
  );
}

function IntensityPicker({ value, onChange }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(10, 1fr)', gap:3 }}>
      {Array.from({ length: 10 }, (_, i) => {
        const n = i+1, filled = n <= value, fc = intensityColor(n);
        return (
          <button key={n} onClick={() => onChange(n)} style={{ all:'unset', cursor:'pointer', display:'grid', placeItems:'center', position:'relative', padding:0 }}>
            <HexShape size={26} fill={filled?fc:'transparent'} stroke={filled?fc:'var(--line-strong)'} strokeWidth={filled?0:8} style={{ filter:filled?`drop-shadow(0 0 calc(4px * var(--glow)) ${fc})`:'none', transition:'fill .15s' }}/>
            <span style={{ position:'absolute', fontFamily:'JetBrains Mono', fontSize:9, fontWeight:700, color:filled?(n>=7?'#ffffff':'var(--on-accent)'):'var(--text-3)' }}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

function CellVal({ value, unit }) {
  return (
    <span style={{ fontFamily:'JetBrains Mono', fontSize:12, fontWeight:600, color:'var(--text)', textAlign:'center', display:'flex', alignItems:'baseline', justifyContent:'center', gap:2, letterSpacing:'0.02em' }}>
      {value}
      {unit && <span style={{ fontSize:8, color:'var(--text-3)', letterSpacing:'0.08em' }}>{unit}</span>}
    </span>
  );
}

// ── STYLES ────────────────────────────────────────────────────────
const thSt = { fontSize:8, color:'var(--text-3)', letterSpacing:'0.12em', fontFamily:'JetBrains Mono', fontWeight:700, textAlign:'center' };
const phaseInputSt = { width:'100%', boxSizing:'border-box', background:'var(--bg-3)', border:'1px solid var(--line)', borderRadius:7, padding:'7px 10px', color:'var(--text)', fontFamily:'JetBrains Mono', fontSize:11, fontWeight:600, outline:'none' };
function addSetBtn(c) { return { all:'unset', cursor:'pointer', flex:1, textAlign:'center', padding:'7px 0', borderRadius:7, background:`color-mix(in srgb, ${c} 10%, transparent)`, border:`1px dashed color-mix(in srgb, ${c} 45%, transparent)`, color:c, fontFamily:'JetBrains Mono', fontSize:9, letterSpacing:'0.14em', fontWeight:700 }; }
function miniBtn({ danger=false, disabled=false }={}) { return { all:'unset', cursor:disabled?'not-allowed':'pointer', textAlign:'center', padding:'7px 4px', borderRadius:6, background:'var(--bg-2)', border:`1px solid ${danger?'color-mix(in srgb, var(--c-coral) 40%, var(--line-strong))':'var(--line-strong)'}`, color:danger?'var(--c-coral)':'var(--text-2)', fontFamily:'JetBrains Mono', fontSize:8, letterSpacing:'0.1em', fontWeight:700, opacity:disabled?0.4:1 }; }

// ── HELPERS ───────────────────────────────────────────────────────
function mapDay(day, sIdx, eIdx, mapEx) {
  return { ...day, sections: day.sections.map((s, si) => si!==sIdx ? s : ({ ...s, items: s.items.map((e, ei) => ei!==eIdx ? e : mapEx(e)) })) };
}

function dbToSections(sections) {
  return sections.map(s => ({
    kind: s.kind, title: s.title,
    items: [...(s.section_exercises||[])].sort((a,b) => a.sort_order-b.sort_order).map(ex => ({
      id: ex.id, name: ex.name, img: ex.img_url||IMG_FALLBACK, timed: ex.timed, tempo: ex.tempo||'', coachNotes: ex.coach_notes||'',
      setsList: [...(ex.exercise_sets||[])].sort((a,b) => a.set_index-b.set_index).map(st => ({
        id: 's'+st.id.slice(-8), kind: st.kind, reps: st.reps??8,
        weight: Number(st.weight_kg)||0, rest: st.rest_secs??60,
        time: st.time_secs??60, intensity: st.intensity??6,
      })),
    })),
  }));
}

function mkSet(kind, p) { return { id: randId(), kind, reps:p.reps??8, weight:p.weight??0, rest:p.rest??60, time:p.time??60, intensity:p.intensity??6 }; }
function randId() { return 's'+Math.random().toString(36).slice(2); }

function summarize(e) {
  const work = e.setsList.filter(s => s.kind!=='WARMUP');
  if (work.length===0) return '—';
  const reps = uniqueRange(work.map(s => s.reps));
  const w    = uniqueRange(work.map(s => s.weight));
  if (e.timed) { const t = uniqueRange(work.map(s => s.time), fmtSecs); return `${t}${w!=='0'?' · '+w+'kg':''}`; }
  return `${w==='0'?'BW':w+'kg'} × ${reps}`;
}

function uniqueRange(arr, fmt=String) {
  const nums = arr.filter(v => typeof v==='number' && !isNaN(v));
  if (nums.length===0) return '—';
  const mn=Math.min(...nums), mx=Math.max(...nums);
  return mn===mx ? fmt(mn) : `${fmt(mn)}–${fmt(mx)}`;
}

function fmtSecs(s) {
  if (s==null) return '—';
  if (s<60) return `${s}s`;
  const m=Math.floor(s/60), r=s%60;
  return r===0 ? `${m}m` : `${m}m${String(r).padStart(2,'0')}`;
}

function intensityColor(n) { return n<=3?'var(--accent)':n<=5?'var(--accent-2)':n<=7?'var(--c-amber)':'var(--c-coral)'; }
function intensityLabel(n) { return n<=2?'WARM-UP':n<=4?'EASY':n<=6?'MODERATE':n<=8?'HARD':'MAX EFFORT'; }
function sectionColor(kind) { return kind==='PULSE_RAISER'?'var(--c-coral)':kind==='BANDED'?'var(--c-amber)':kind==='COOLDOWN'?'var(--accent-2)':'var(--accent)'; }

function seedDay() {
  return {
    notes: '',
    sections: [
      { kind:'PULSE_RAISER', title:'Pulse Raiser', items:[
        { id:'p1', name:'Exercise Bike', timed:true, tempo:'', coachNotes:'', img:'https://images.unsplash.com/photo-1591741535018-d042766c62eb?w=200&q=70', setsList:[mkSet('WORK',{time:300,weight:0,rest:0,intensity:4})] },
      ]},
      { kind:'BANDED', title:'Banded Activation', items:[
        { id:'b1', name:'Banded Hip Opener', timed:false, tempo:'', coachNotes:'', img:'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=200&q=70', setsList:[mkSet('WORK',{reps:8,rest:30,intensity:3}),mkSet('WORK',{reps:8,rest:30,intensity:3})] },
      ]},
      { kind:'MAIN', title:'Workout', items:[
        { id:'m1', name:'Back Squat', timed:false, tempo:'3-1-1-0', coachNotes:'', img:'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200&q=70',
          setsList:[mkSet('WARMUP',{reps:10,weight:40,rest:60,intensity:3}),mkSet('WARMUP',{reps:8,weight:70,rest:60,intensity:5}),mkSet('WORK',{reps:8,weight:100,rest:120,intensity:8}),mkSet('WORK',{reps:8,weight:100,rest:120,intensity:8}),mkSet('WORK',{reps:8,weight:100,rest:120,intensity:9}),mkSet('WORK',{reps:6,weight:105,rest:150,intensity:9})] },
        { id:'m2', name:'Romanian Deadlift', timed:false, tempo:'3-0-1-0', coachNotes:'', img:'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200&q=70',
          setsList:[mkSet('WORK',{reps:10,weight:80,rest:90,intensity:7}),mkSet('WORK',{reps:10,weight:80,rest:90,intensity:7}),mkSet('WORK',{reps:10,weight:80,rest:90,intensity:7})] },
        { id:'m3', name:'Walking Lunges', timed:false, tempo:'', coachNotes:'', img:'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=200&q=70',
          setsList:[mkSet('WORK',{reps:12,weight:20,rest:60,intensity:6}),mkSet('WORK',{reps:12,weight:20,rest:60,intensity:6}),mkSet('WORK',{reps:12,weight:20,rest:60,intensity:6})] },
      ]},
      { kind:'COOLDOWN', title:'Cooldown', items:[
        { id:'c1', name:'Couch Stretch', timed:true, tempo:'', coachNotes:'', img:'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=200&q=70', setsList:[mkSet('WORK',{time:60,rest:0,intensity:2}),mkSet('WORK',{time:60,rest:0,intensity:2})] },
      ]},
    ],
  };
}
