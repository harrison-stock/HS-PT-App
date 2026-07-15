import React from 'react'
import { supabase } from '../lib/supabase'
import { HexBackButton, HexShape } from '../components/hex'
import { IconChevronRight, IconX2 } from '../components/icons'
import { loadExercises, videoThumb } from '../lib/exercises'
import { MasterPlanner } from './MasterPlanner'
import { BandPicker, BandChip, bandOf } from '../components/bands'
import { exerciseMatches } from '../lib/exerciseSearch'
import { ICON_LIBRARY, SectionGlyph, sanitizeSvg } from '../lib/svgIcon'

const IMG_FALLBACK = 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=200&q=70';
const TAGS = ['STRENGTH','ONBOARD','REHAB','ENDURANCE','HYBRID','SPORT'];
const TAG_COLORS = {
  STRENGTH: 'var(--accent)', ONBOARD: 'var(--c-amber)', REHAB: 'var(--c-coral)',
  ENDURANCE: 'var(--accent-2)', HYBRID: 'var(--c-blue)', SPORT: 'var(--c-pink)',
};

// `startAt` ({ phaseIdx, weekIdx, dayIdx }) deep-links straight to one day —
// used by the coach's client calendar to jump to the exact assigned workout.
export function ProgrammeBuilder({ programme, onClose, openRoadmap = false, trainerId, startAt }) {
  const isAdhoc = !!programme.is_adhoc;
  const [prog, setProg]             = React.useState(programme);
  const [roadmapMode, setRoadmapMode] = React.useState(openRoadmap && !isAdhoc);
  const [adhocName, setAdhocName]   = React.useState(programme.name);
  const [adhocTag, setAdhocTag]     = React.useState(programme.tag || 'STRENGTH');
  const [phaseIdx, setPhaseIdx]     = React.useState(() => clampIdx(startAt?.phaseIdx, programme.phaseList?.length));
  const [weekIdx, setWeekIdx]       = React.useState(() => clampIdx(startAt?.weekIdx, programme.phaseList?.[clampIdx(startAt?.phaseIdx, programme.phaseList?.length)]?.weeks));
  const [dayIdx, setDayIdx]         = React.useState(() => clampIdx(startAt?.dayIdx, 7));
  const [dirty, setDirty]           = React.useState(false);
  const [saving, setSaving]         = React.useState(false);
  const [day, setDay]               = React.useState(null);
  const [dayLoading, setDayLoading] = React.useState(!openRoadmap);
  const [expandedExId, setExpandedExId]   = React.useState(null);
  const [expandedSetId, setExpandedSetId] = React.useState(null);
  const [saveError, setSaveError]         = React.useState(null);
  const [switchingEx, setSwitchingEx]     = React.useState(null); // { sIdx, eIdx }
  const [addingSection, setAddingSection] = React.useState(null); // sIdx when picking from catalogue
  const [altFor, setAltFor]               = React.useState(null); // { sIdx, eIdx } when adding an alternate
  const [showMaster, setShowMaster]       = React.useState(false);
  const [showCopy, setShowCopy]           = React.useState(false);

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

  // Autosave the current day before navigating away (no silent data loss).
  const flush = async () => { if (dirty && day) return await saveDay(); return true; };
  const move = async (setter) => { const ok = await flush(); if (ok === false) return; setter(); };

  // ── Save ─────────────────────────────────────────────────────
  // Writes a day-content object to a specific (phase, week, day) slot.
  const writeDayContent = async (phid, week, dow, content) => {
    const { data: dayRow, error: dayErr } = await supabase
      .from('programme_days')
      .upsert(
        { phase_id: phid, week_index: week, day_of_week: dow, intro: content.intro || '', notes: content.notes || '' },
        { onConflict: 'phase_id,week_index,day_of_week' }
      )
      .select('id').single();
    if (!dayRow) throw new Error(dayErr?.message || 'Save failed — have you run migration 3 (notes_tempo)?');

    await supabase.from('workout_sections').delete().eq('day_id', dayRow.id);

    for (let sOrd = 0; sOrd < content.sections.length; sOrd++) {
      const s = content.sections[sOrd];
      let { data: sec } = await supabase
        .from('workout_sections')
        .insert({ day_id: dayRow.id, kind: s.kind, title: s.title, intro: s.intro || '', icon: s.icon || '', sort_order: sOrd })
        .select('id').single();
      // Fallback if migrations 036 (slide text) / 037 (icon) aren't applied yet.
      if (!sec) {
        ({ data: sec } = await supabase
          .from('workout_sections')
          .insert({ day_id: dayRow.id, kind: s.kind, title: s.title, sort_order: sOrd })
          .select('id').single());
      }
      if (!sec) continue;

      for (let eOrd = 0; eOrd < s.items.length; eOrd++) {
        const ex = s.items[eOrd];
        const { data: exRow } = await supabase
          .from('section_exercises')
          .insert({ section_id: sec.id, name: ex.name, img_url: ex.img, timed: ex.timed, banded: ex.banded || false, unilateral: ex.unilateral || false, tempo: ex.tempo || '', coach_notes: ex.coachNotes || '', superset_group: ex.ssGroup ?? null, alternates: ex.alternates || [], sort_order: eOrd })
          .select('id').single();
        if (!exRow) continue;

        await supabase.from('exercise_sets').insert(
          ex.setsList.map((st, i) => ({
            exercise_id: exRow.id, set_index: i,
            kind: st.kind,
            reps: parseInt(st.repsText) || 0,
            reps_text: st.repsText || '',
            weight_kg: st.weight,
            band: st.band ?? null,
            rest_secs: st.rest, time_secs: st.time, intensity: st.intensity,
          }))
        );
      }
    }
  };
  const writeDay = (phid) => writeDayContent(phid, weekIdx, dayIdx, day);

  const saveDay = async () => {
    if (!day) return true;
    setSaving(true);
    setSaveError(null);
    try {
      let pid = prog.id;
      let phid = phase?.id;

      // Ad-hoc workouts have no roadmap, so persist the programme + its single
      // phase on first save before writing the day.
      if (isAdhoc) {
        if (!pid) {
          const { data: np, error } = await supabase.from('programmes')
            .insert({ trainer_id: trainerId, name: adhocName.trim() || 'Workout', tag: adhocTag, is_adhoc: true })
            .select('id').single();
          if (!np) throw new Error(error?.message || 'Could not create workout');
          pid = np.id;
        } else {
          await supabase.from('programmes').update({ name: adhocName.trim() || 'Workout', tag: adhocTag }).eq('id', pid);
        }
        if (!phid) {
          const { data: nph } = await supabase.from('programme_phases')
            .insert({ programme_id: pid, phase_index: 0, name: 'Workout', focus: 'Ad-hoc', weeks: 1 })
            .select('id').single();
          phid = nph?.id;
        }
        setProg(p => ({ ...p, id: pid, name: adhocName.trim() || 'Workout', tag: adhocTag,
          phaseList: [{ ...(p.phaseList[0] || {}), id: phid, name: 'Workout', focus: 'Ad-hoc', weeks: 1 }] }));
      }

      if (!phid) { setSaving(false); setSaveError('No phase to save into — open the roadmap first.'); return false; }

      await writeDay(phid);
      await supabase.from('programmes').update({ updated_at: new Date().toISOString() }).eq('id', pid);
      setSaving(false);
      setDirty(false);
      return true;
    } catch (e) {
      setSaving(false);
      setSaveError(e.message || 'Save failed');
      return false;
    }
  };

  // Cmd/Ctrl+S saves the day instead of opening the browser's save dialog.
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (dirty && !saving) saveDay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Copy the current day into other (week × weekday) slots, with optional
  // week-on-week progression baked into each target.
  const copyDayTo = async (targets, progression) => {
    if (!day || !phase?.id) return { error: 'Open the roadmap and save this day first.' };
    const ok = await saveDay();
    if (!ok) return { error: 'Could not save the current day.' };
    try {
      for (const t of targets) {
        const content = progressDay(day, t.week - weekIdx, progression);
        await writeDayContent(phase.id, t.week, t.dow, content);
      }
      await supabase.from('programmes').update({ updated_at: new Date().toISOString() }).eq('id', prog.id);
      return { count: targets.length };
    } catch (e) {
      return { error: e.message || 'Copy failed' };
    }
  };

  // ── Section edits ─────────────────────────────────────────────
  const updateSection = (sIdx, patch) => { setDay(d => ({ ...d, sections: d.sections.map((s, si) => si !== sIdx ? s : ({ ...s, ...patch })) })); setDirty(true); };

  // ── Exercise edits ────────────────────────────────────────────
  const updateEx = (sIdx, eIdx, patch) => { setDay(d => mapDay(d, sIdx, eIdx, e => ({ ...e, ...patch }))); setDirty(true); };
  const dupEx = (sIdx, eIdx) => {
    setDay(d => ({ ...d, sections: d.sections.map((s, si) => si !== sIdx ? s : ({
      ...s, items: [...s.items.slice(0, eIdx+1), { ...s.items[eIdx], id: 'x'+Date.now(), setsList: s.items[eIdx].setsList.map(st => ({ ...st, id: randId() })) }, ...s.items.slice(eIdx+1)],
    })) }));
    setDirty(true);
  };
  const delEx = (sIdx, eIdx) => { setDay(d => ({ ...d, sections: d.sections.map((s, si) => si !== sIdx ? s : ({ ...s, items: s.items.filter((_, i) => i !== eIdx) })) })); setDirty(true); };
  const addEx = (sIdx, ex = {}) => {
    const id = 'x' + Date.now();
    setDay(d => ({ ...d, sections: d.sections.map((s, si) => si !== sIdx ? s : ({
      ...s, items: [...s.items, { id, name: ex.name || 'New Exercise', img: ex.img || IMG_FALLBACK, timed: false, banded: !!ex.banded, unilateral: !!ex.unilateral, tempo: '', coachNotes: '', setsList: [mkSet('WORK', { reps: 10, weight: 0, rest: 60, intensity: 6, band: ex.banded ? 'medium' : null })] }],
    })) }));
    setDirty(true);
    setExpandedExId(id);
  };

  // ── Alternates — swap options the client can pick during a workout ──
  const addAlternate = (sIdx, eIdx, ex) => { setDay(d => mapDay(d, sIdx, eIdx, e => ({ ...e, alternates: [...(e.alternates || []), { name: ex.name, img: ex.img }] }))); setDirty(true); };
  const delAlternate = (sIdx, eIdx, idx) => { setDay(d => mapDay(d, sIdx, eIdx, e => ({ ...e, alternates: (e.alternates || []).filter((_, i) => i !== idx) }))); setDirty(true); };

  // ── Supersets — group an exercise with the one above it ────────
  const linkSuperset = (sIdx, eIdx) => {
    if (eIdx <= 0) return;
    setDay(d => ({ ...d, sections: d.sections.map((s, si) => {
      if (si !== sIdx) return s;
      const items = [...s.items];
      const prev = items[eIdx - 1];
      let g = prev.ssGroup;
      if (g == null) { g = items.reduce((m, it) => Math.max(m, it.ssGroup || 0), 0) + 1; items[eIdx - 1] = { ...prev, ssGroup: g }; }
      items[eIdx] = { ...items[eIdx], ssGroup: g };
      return { ...s, items };
    }) }));
    setDirty(true);
  };
  const unlinkSuperset = (sIdx, eIdx) => {
    setDay(d => ({ ...d, sections: d.sections.map((s, si) => {
      if (si !== sIdx) return s;
      let items = s.items.map((it, i) => i === eIdx ? { ...it, ssGroup: null } : it);
      const counts = {};
      items.forEach(it => { if (it.ssGroup != null) counts[it.ssGroup] = (counts[it.ssGroup] || 0) + 1; });
      items = items.map(it => (it.ssGroup != null && counts[it.ssGroup] < 2) ? { ...it, ssGroup: null } : it);
      return { ...s, items };
    }) }));
    setDirty(true);
  };

  // ── Set edits ─────────────────────────────────────────────────
  const updateSet = (sIdx, eIdx, setIdx, patch) => { setDay(d => mapDay(d, sIdx, eIdx, e => ({ ...e, setsList: e.setsList.map((st, i) => i !== setIdx ? st : ({ ...st, ...patch })) }))); setDirty(true); };
  const addSet = (sIdx, eIdx, kind = 'WORK') => {
    setDay(d => mapDay(d, sIdx, eIdx, e => {
      const last = e.setsList[e.setsList.length - 1];
      const base = last ? { repsText: last.repsText, weight: last.weight, rest: last.rest, time: last.time, intensity: last.intensity } : { repsText: '8', weight: 0, rest: 60, time: 60, intensity: 6 };
      if (kind === 'WARMUP')  { base.weight = Math.max(0, Math.round(base.weight*0.5/2.5)*2.5); base.intensity = 3; base.rest = 45; }
      if (kind === 'DROPSET') { base.weight = Math.max(0, Math.round(base.weight*0.7/2.5)*2.5); base.intensity = 8; }
      if (kind === 'FAILURE') { base.repsText = 'AMRAP'; base.intensity = 10; }
      if (kind === 'PARTIAL') { const n = parseInt(base.repsText); base.repsText = isNaN(n) ? base.repsText : String(Math.max(1, Math.round(n/2))); }
      return { ...e, setsList: [...e.setsList, mkSet(kind, base)] };
    }));
    setDirty(true);
  };
  const delSet = (sIdx, eIdx, i) => { setDay(d => mapDay(d, sIdx, eIdx, e => ({ ...e, setsList: e.setsList.length > 1 ? e.setsList.filter((_, j) => j !== i) : e.setsList }))); setDirty(true); };
  const dupSet = (sIdx, eIdx, i) => { setDay(d => mapDay(d, sIdx, eIdx, e => ({ ...e, setsList: [...e.setsList.slice(0,i+1), { ...e.setsList[i], id: randId() }, ...e.setsList.slice(i+1)] }))); setDirty(true); };
  const applyToAll = (sIdx, eIdx, i) => {
    setDay(d => mapDay(d, sIdx, eIdx, e => {
      const src = e.setsList[i];
      return { ...e, setsList: e.setsList.map((st, j) => j <= i ? st : ({ ...st, weight: src.weight, repsText: src.repsText, time: src.time, rest: src.rest, intensity: src.intensity })) };
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
      <div className="pb-topbar" style={{ background: 'linear-gradient(180deg, var(--bg-1) 70%, transparent)', borderBottom: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <HexBackButton onClick={async () => { await flush(); onClose(); }} size={36}/>
          <div style={{ flex: 1, minWidth: 0, textAlign: 'center' }}>
            <div className="mono" style={{ fontSize: 8, color: 'var(--accent)', letterSpacing: '0.16em', fontWeight: 600 }}>// {isAdhoc ? 'WORKOUT BUILDER' : 'PROGRAMME BUILDER'}</div>
            {isAdhoc ? (
              <input value={adhocName} onChange={e => { setAdhocName(e.target.value); setDirty(true); }}
                placeholder="Workout name"
                style={{ width: '100%', boxSizing: 'border-box', textAlign: 'center', marginTop: 2,
                  background: 'transparent', border: 'none', borderBottom: '1px solid var(--line)',
                  color: 'var(--text)', fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 600, outline: 'none', padding: '1px 0' }}/>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prog.name}</div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {!isAdhoc && day && (
              <button onClick={() => setShowCopy(true)} style={{
                all: 'unset', cursor: 'pointer',
                padding: '8px 10px', borderRadius: 8,
                background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
                color: 'var(--accent)', fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              }}>COPY</button>
            )}
            {!isAdhoc && (
              <button onClick={async () => { await flush(); setShowMaster(true); }} style={{
                all: 'unset', cursor: 'pointer',
                padding: '8px 10px', borderRadius: 8,
                background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
                color: 'var(--text-3)', fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              }}>MASTER</button>
            )}
            {!isAdhoc && (
              <button onClick={async () => { await flush(); setRoadmapMode(true); }} style={{
                all: 'unset', cursor: 'pointer',
                padding: '8px 10px', borderRadius: 8,
                background: 'var(--bg-2)', border: '1px solid var(--line-strong)',
                color: 'var(--text-3)', fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              }}>ROADMAP</button>
            )}
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

      {/* Ad-hoc: just a tag picker (no phases/weeks/days) */}
      {isAdhoc ? (
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--line)', background: 'var(--bg-1)' }}>
          <div className="label" style={{ marginBottom: 6 }}>// TYPE</div>
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
            {TAGS.map(t => (
              <button key={t} onClick={() => { setAdhocTag(t); setDirty(true); }} style={{
                all: 'unset', cursor: 'pointer', whiteSpace: 'nowrap', padding: '6px 11px', borderRadius: 999,
                border: '1px solid ' + (adhocTag === t ? (TAG_COLORS[t] || 'var(--accent)') : 'var(--line-strong)'),
                background: adhocTag === t ? `color-mix(in srgb, ${TAG_COLORS[t] || 'var(--accent)'} 16%, transparent)` : 'transparent',
                color: adhocTag === t ? (TAG_COLORS[t] || 'var(--accent)') : 'var(--text-3)',
                fontFamily: 'JetBrains Mono', fontSize: 9, letterSpacing: '0.08em', fontWeight: 700,
              }}>{t}</button>
            ))}
          </div>
        </div>
      ) : (
      /* Phase / Week / Day pickers — stacked on phones, one row on desktop */
      <div className="pb-pickers" style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg-1)' }}>
        <div className="pb-picker-grid">
          <div>
            <div className="label" style={{ marginBottom: 6 }}>// PHASE</div>
            <div style={{ display: 'flex', gap: 4, overflowX: 'auto', scrollbarWidth: 'none', flexWrap: 'wrap' }}>
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
          </div>

          {phase && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div className="label">// WEEK · {phase.weeks} TOTAL</div>
                <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.08em' }}>FOCUS: {phase.focus?.toUpperCase()}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(phase.weeks, 8)}, 1fr)`, gap: 4 }}>
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
            </div>
          )}

          <div>
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
        </div>
      </div>
      )}

      {/* Body */}
      <div className="scroller pb-body" style={{ flex: 1, padding: '16px 16px 32px', minHeight: 0, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
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

            <div className="pb-sections">
            {day.sections.map((s, sIdx) => (
              <Section key={s.kind + sIdx} s={s} sIdx={sIdx}
                onIntro={(v) => updateSection(sIdx, { intro: v })}
                onIcon={(v) => updateSection(sIdx, { icon: v })}
                expandedExId={expandedExId} expandedSetId={expandedSetId}
                onExpandEx={(id) => { setExpandedExId(expandedExId === id ? null : id); setExpandedSetId(null); }}
                onExpandSet={(id) => setExpandedSetId(expandedSetId === id ? null : id)}
                onUpdateEx={(eIdx, patch) => updateEx(sIdx, eIdx, patch)}
                onDupEx={(eIdx) => dupEx(sIdx, eIdx)}
                onDelEx={(eIdx) => delEx(sIdx, eIdx)}
                onAddEx={() => setAddingSection(sIdx)}
                onSwitchEx={(eIdx) => setSwitchingEx({ sIdx, eIdx })}
                onSuperset={(eIdx) => linkSuperset(sIdx, eIdx)}
                onUnsuperset={(eIdx) => unlinkSuperset(sIdx, eIdx)}
                onAddAlt={(eIdx) => setAltFor({ sIdx, eIdx })}
                onDelAlt={(eIdx, idx) => delAlternate(sIdx, eIdx, idx)}
                onUpdateSet={(eIdx, setIdx, patch) => updateSet(sIdx, eIdx, setIdx, patch)}
                onAddSet={(eIdx, kind) => addSet(sIdx, eIdx, kind)}
                onDelSet={(eIdx, i) => delSet(sIdx, eIdx, i)}
                onDupSet={(eIdx, i) => dupSet(sIdx, eIdx, i)}
                onApplyToAll={(eIdx, i) => applyToAll(sIdx, eIdx, i)}
              />
            ))}
            </div>

            {switchingEx !== null && (
              <ExercisePicker
                onClose={() => setSwitchingEx(null)}
                onPick={(ex) => {
                  updateEx(switchingEx.sIdx, switchingEx.eIdx, { name: ex.name, img: ex.img, banded: !!ex.banded, unilateral: !!ex.unilateral });
                  setSwitchingEx(null);
                }}
              />
            )}
            {addingSection !== null && (
              <ExercisePicker
                onClose={() => setAddingSection(null)}
                onPick={(ex) => { addEx(addingSection, ex); setAddingSection(null); }}
              />
            )}
            {altFor !== null && (
              <ExercisePicker
                onClose={() => setAltFor(null)}
                onPick={({ name, img }) => { addAlternate(altFor.sIdx, altFor.eIdx, { name, img }); setAltFor(null); }}
              />
            )}

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

      {showMaster && (
        <MasterPlanner
          programme={prog}
          onClose={() => setShowMaster(false)}
          onPickDay={(pi, wi, di) => {
            move(() => { setPhaseIdx(pi); setWeekIdx(wi); setDayIdx(di); });
            setShowMaster(false);
            setRoadmapMode(false);
          }}
        />
      )}

      {showCopy && phase && (
        <CopySheet
          weeks={phase.weeks || 1} curWeek={weekIdx} curDow={dayIdx}
          onClose={() => setShowCopy(false)}
          onCopy={copyDayTo}
        />
      )}
    </div>
  );
}

// ── COPY DAY SHEET ───────────────────────────────────────────────
const COPY_DOW = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
function CopySheet({ weeks, curWeek, curDow, onClose, onCopy }) {
  // Default: replicate this day to the same weekday across every other week.
  const [selWeeks, setSelWeeks] = React.useState(() => Array.from({ length: weeks }, (_, i) => i).filter(i => i !== curWeek));
  const [selDows, setSelDows]   = React.useState([curDow]);
  const [wMode, setWMode]       = React.useState('none'); // none | kg | pct
  const [wStep, setWStep]       = React.useState(2.5);
  const [repStep, setRepStep]   = React.useState(0);
  const [busy, setBusy]         = React.useState(false);
  const [done, setDone]         = React.useState(0);

  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter(x => x !== v) : [...arr, v].sort((a, b) => a - b));

  // Build targets = selected weeks × selected days, minus the source slot.
  const targets = [];
  selWeeks.forEach(w => selDows.forEach(d => { if (!(w === curWeek && d === curDow)) targets.push({ week: w, dow: d }); }));

  const run = async () => {
    if (!targets.length || busy) return;
    setBusy(true);
    const progression = wMode === 'none' && !repStep ? null
      : { weightMode: wMode === 'pct' ? 'pct' : 'kg', weightStep: wMode === 'none' ? 0 : wStep, repsStep: repStep };
    const res = await onCopy(targets, progression);
    setBusy(false);
    if (res?.error) alert(res.error);
    else { setDone(res.count || targets.length); setTimeout(onClose, 1200); }
  };

  const cell = (active) => ({
    all: 'unset', cursor: 'pointer', textAlign: 'center', padding: '8px 0', borderRadius: 7,
    fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
    background: active ? 'var(--accent-soft)' : 'var(--bg-3)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
    color: active ? 'var(--accent)' : 'var(--text-3)',
  });

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="sheet-panel" style={{ background: 'var(--bg-1)', borderTopLeftRadius: 20, borderTopRightRadius: 20, border: '1px solid var(--line-strong)', borderBottom: 0, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 18px 8px' }}>
          <div style={{ width: 36, height: 4, background: 'var(--line-strong)', borderRadius: 2, margin: '0 auto 12px' }}/>
          <div className="label">// COPY THIS DAY</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
            Copy this session into other weeks and weekdays. Optionally progress the load each week.
          </div>
        </div>

        {done > 0 ? (
          <div style={{ padding: '30px 18px 40px', textAlign: 'center' }}>
            <div style={{ fontSize: 30, color: 'var(--accent)', marginBottom: 8 }}>✓</div>
            <div className="h-bold" style={{ fontSize: 16 }}>COPIED TO {done} DAY{done === 1 ? '' : 'S'}</div>
          </div>
        ) : (
          <>
            <div className="scroller" style={{ padding: '6px 18px 14px', overflowY: 'auto', display: 'grid', gap: 16 }}>
              <div>
                <div className="label" style={{ marginBottom: 8 }}>WEEKS</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                  {Array.from({ length: weeks }, (_, i) => (
                    <button key={i} onClick={() => toggle(selWeeks, setSelWeeks, i)} style={cell(selWeeks.includes(i))}>
                      W{i + 1}{i === curWeek ? '*' : ''}
                    </button>
                  ))}
                </div>
                <div className="mono" style={{ fontSize: 8, color: 'var(--text-3)', marginTop: 5 }}>* current week — source slot is never overwritten</div>
              </div>

              <div>
                <div className="label" style={{ marginBottom: 8 }}>WEEKDAYS</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                  {COPY_DOW.map((d, i) => (
                    <button key={i} onClick={() => toggle(selDows, setSelDows, i)} style={{ ...cell(selDows.includes(i)), fontSize: 8.5 }}>{d}</button>
                  ))}
                </div>
              </div>

              <div>
                <div className="label" style={{ marginBottom: 8 }}>WEEKLY PROGRESSION <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(across weeks)</span></div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {[['none', 'NONE'], ['kg', '+ KG'], ['pct', '+ %']].map(([v, l]) => (
                    <button key={v} onClick={() => setWMode(v)} style={{ ...cell(wMode === v), flex: 1 }}>{l}</button>
                  ))}
                </div>
                {wMode !== 'none' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                    <CopyStepBtn onClick={() => setWStep(s => Math.max(0.5, +(s - (wMode === 'pct' ? 1 : 0.5)).toFixed(2)))}>−</CopyStepBtn>
                    <div className="h-bold" style={{ fontSize: 18, minWidth: 70, textAlign: 'center', color: 'var(--accent)' }}>{wStep}{wMode === 'pct' ? '%' : 'kg'}<span className="mono" style={{ fontSize: 8, color: 'var(--text-3)', display: 'block', fontWeight: 400 }}>PER WEEK</span></div>
                    <CopyStepBtn onClick={() => setWStep(s => +(s + (wMode === 'pct' ? 1 : 0.5)).toFixed(2))}>+</CopyStepBtn>
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--text-2)', minWidth: 50 }}>REPS</span>
                  <CopyStepBtn onClick={() => setRepStep(s => s - 1)}>−</CopyStepBtn>
                  <div className="h-bold" style={{ fontSize: 16, minWidth: 54, textAlign: 'center' }}>{repStep > 0 ? `+${repStep}` : repStep}</div>
                  <CopyStepBtn onClick={() => setRepStep(s => s + 1)}>+</CopyStepBtn>
                  <span className="mono" style={{ fontSize: 8, color: 'var(--text-3)' }}>PER WEEK</span>
                </div>
              </div>
            </div>

            <div style={{ padding: '12px 18px 28px', borderTop: '1px solid var(--line)' }}>
              <button onClick={run} disabled={!targets.length || busy} className="btn-primary"
                style={{ width: '100%', opacity: targets.length && !busy ? 1 : 0.4, pointerEvents: targets.length && !busy ? 'auto' : 'none' }}>
                {busy ? 'COPYING…' : `COPY → ${targets.length} DAY${targets.length === 1 ? '' : 'S'}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CopyStepBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      all: 'unset', cursor: 'pointer', width: 36, height: 36, borderRadius: 9,
      background: 'var(--bg-3)', border: '1px solid var(--line-strong)', color: 'var(--accent)',
      display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 700,
    }}>{children}</button>
  );
}

// Apply week-on-week progression to a cloned day. weekOffset = target − source.
function progressDay(day, weekOffset, p) {
  if (!p || weekOffset === 0 || (!p.weightStep && !p.repsStep)) return day;
  const adj = (st, ex) => {
    let weight = st.weight, repsText = st.repsText;
    if (!ex.banded && !ex.timed && p.weightStep && st.kind !== 'WARMUP') {
      weight = p.weightMode === 'pct'
        ? Math.max(0, Math.round((st.weight * (1 + (p.weightStep / 100) * weekOffset)) * 2) / 2)
        : Math.max(0, +(st.weight + p.weightStep * weekOffset).toFixed(2));
    }
    if (p.repsStep && st.kind !== 'WARMUP') {
      const n = parseInt(st.repsText);
      if (!isNaN(n)) repsText = String(Math.max(1, n + p.repsStep * weekOffset));
    }
    return { ...st, weight, repsText };
  };
  return { ...day, sections: day.sections.map(s => ({ ...s, items: s.items.map(ex => ({ ...ex, setsList: ex.setsList.map(st => adj(st, ex)) })) })) };
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
        .insert({ trainer_id: trainerId, name: name.trim(), tag, is_adhoc: !!prog.is_adhoc })
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
      <div className="pb-topbar" style={{ background: 'linear-gradient(180deg, var(--bg-1) 70%, transparent)', borderBottom: '1px solid var(--line)' }}>
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

      <div className="scroller" style={{ flex: 1, padding: '18px 16px 40px', minHeight: 0, width: '100%', maxWidth: 720, margin: '0 auto', boxSizing: 'border-box' }}>
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
function Section({ s, sIdx, onIntro, onIcon, expandedExId, expandedSetId, onExpandEx, onExpandSet, onUpdateEx, onDupEx, onDelEx, onAddEx, onSwitchEx, onSuperset, onUnsuperset, onAddAlt, onDelAlt, onUpdateSet, onAddSet, onDelSet, onDupSet, onApplyToAll }) {
  const color = sectionColor(s.kind);
  const [slideOpen, setSlideOpen] = React.useState(false);
  const [iconOpen, setIconOpen] = React.useState(false);
  const showSlide = slideOpen || !!s.intro;
  // Superset labels: A1/A2, B1/B2… per consecutive grouped run.
  const seen = {}; let li = 0; const cnt = {};
  const ssLabels = s.items.map(it => {
    if (it.ssGroup == null) return null;
    if (!(it.ssGroup in seen)) seen[it.ssGroup] = String.fromCharCode(65 + li++);
    cnt[it.ssGroup] = (cnt[it.ssGroup] || 0) + 1;
    return `${seen[it.ssGroup]}${cnt[it.ssGroup]}`;
  });
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          {onIcon ? (
            <button onClick={() => setIconOpen(true)} title="Change section icon" style={{
              all: 'unset', cursor: 'pointer', position: 'relative',
              width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center',
              background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
            }}>
              <SectionGlyph icon={s.icon} kind={s.kind} size={15} color={color} glow />
              <span style={{ position: 'absolute', right: -3, bottom: -3, width: 8, height: 8, borderRadius: '50%', background: color, border: '1.5px solid var(--bg-0)' }}/>
            </button>
          ) : (
            <span style={{ width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center', color, background: `color-mix(in srgb, ${color} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`, fontFamily: 'Orbitron', fontWeight: 800, fontSize: 11 }}>{sIdx+1}</span>
          )}
          <div className="label" style={{ color, letterSpacing: '0.14em', fontSize: 11 }}>// {s.title.toUpperCase()}</div>
        </div>
        {iconOpen && onIcon && (
          <IconPickerSheet current={s.icon} kind={s.kind} color={color}
            onPick={(v) => { onIcon(v); setIconOpen(false); }}
            onClose={() => setIconOpen(false)} />
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {onIntro && (
            <button onClick={() => setSlideOpen(o => !o)} className="mono" style={{
              all: 'unset', cursor: 'pointer', padding: '3px 8px', borderRadius: 6, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.08em',
              color: showSlide ? color : 'var(--text-3)',
              border: `1px solid ${showSlide ? `color-mix(in srgb, ${color} 45%, transparent)` : 'var(--line)'}`,
              background: showSlide ? `color-mix(in srgb, ${color} 10%, transparent)` : 'transparent',
            }}>✎ SLIDE TEXT</button>
          )}
          <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.1em' }}>{s.items.length} EX</span>
        </div>
      </div>
      {onIntro && showSlide && (
        <textarea
          value={s.intro || ''}
          onChange={e => onIntro(e.target.value)}
          placeholder={`Shown to the client on the "next up: ${s.title}" slide between blocks — cues, focus, or encouragement…`}
          rows={2}
          style={{
            width: '100%', boxSizing: 'border-box', marginBottom: 10,
            background: 'var(--bg-2)', border: `1px solid color-mix(in srgb, ${color} 30%, var(--line-strong))`, borderRadius: 8,
            color: 'var(--text)', fontFamily: 'JetBrains Mono', fontSize: 11, lineHeight: 1.6,
            padding: '9px 11px', outline: 'none', resize: 'vertical',
          }}
        />
      )}
      <div style={{ display: 'grid', gap: 9 }}>
        {s.items.map((e, eIdx) => (
          <ExerciseEditor key={e.id} e={e} color={color}
            expanded={expandedExId === e.id} expandedSetId={expandedSetId}
            ssLabel={ssLabels[eIdx]} canSuperset={eIdx > 0} grouped={e.ssGroup != null}
            onSuperset={() => onSuperset(eIdx)} onUnsuperset={() => onUnsuperset(eIdx)}
            onAddAlt={() => onAddAlt(eIdx)} onDelAlt={(idx) => onDelAlt(eIdx, idx)}
            onExpand={() => onExpandEx(e.id)}
            onExpandSet={onExpandSet}
            onUpdateEx={(patch) => onUpdateEx(eIdx, patch)}
            onDupEx={() => onDupEx(eIdx)}
            onDelEx={() => onDelEx(eIdx)}
            onSwitchEx={() => onSwitchEx(eIdx)}
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

// ── SECTION ICON PICKER ───────────────────────────────────────────
// Pick a curated glyph or paste a custom SVG for this section. Custom SVG is
// sanitised (geometry only) and recoloured to the zone colour on save.
function ToggleBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} className="mono" style={{
      all: 'unset', cursor: 'pointer', flex: 1, textAlign: 'center', padding: '8px 10px', borderRadius: 8,
      fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em',
      background: active ? 'var(--accent-soft)' : 'var(--bg-2)',
      border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
      color: active ? 'var(--accent)' : 'var(--text-3)',
    }}>{children}</button>
  );
}

function IconPickerSheet({ current, kind, color, onPick, onClose }) {
  const [mode, setMode] = React.useState((current || '').trim().startsWith('<svg') ? 'custom' : 'library');
  const [raw, setRaw]   = React.useState((current || '').trim().startsWith('<svg') ? current : '');
  const fileRef = React.useRef(null);
  const safe = React.useMemo(() => sanitizeSvg(raw), [raw]);

  const loadFile = (e) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    const r = new FileReader();
    r.onload = () => setRaw(String(r.result || ''));
    r.readAsText(f);
  };

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 220, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div onClick={e => e.stopPropagation()} className="sheet-panel" style={{ background: 'var(--bg-1)', borderTopLeftRadius: 20, borderTopRightRadius: 20, border: '1px solid var(--line-strong)', borderBottom: 0, maxHeight: '86vh', display: 'flex', flexDirection: 'column', animation: 'sheetUp .28s cubic-bezier(.22,.61,.36,1)' }}>
        <div style={{ padding: '12px 18px 8px' }}>
          <div style={{ width: 36, height: 4, background: 'var(--line-strong)', borderRadius: 2, margin: '0 auto 12px' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="label" style={{ color }}>// SECTION ICON</div>
            <button onClick={onClose} style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)' }}><IconX2 size={14}/></button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
            <ToggleBtn active={mode === 'library'} onClick={() => setMode('library')}>LIBRARY</ToggleBtn>
            <ToggleBtn active={mode === 'custom'} onClick={() => setMode('custom')}>CUSTOM SVG</ToggleBtn>
          </div>
        </div>

        <div className="scroller" style={{ padding: '8px 18px 20px', overflowY: 'auto' }}>
          {mode === 'library' ? (
            <>
              <button onClick={() => onPick('')} style={{
                all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box',
                padding: '10px 12px', borderRadius: 10, marginBottom: 10,
                background: !current ? `color-mix(in srgb, ${color} 12%, transparent)` : 'var(--bg-2)',
                border: `1px solid ${!current ? color : 'var(--line)'}`,
              }}>
                <SectionGlyph icon="" kind={kind} size={18} color={color} glow />
                <span className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em' }}>DEFAULT ({kind.replace('_', ' ')})</span>
              </button>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
                {ICON_LIBRARY.map(it => {
                  const val = `lib:${it.key}`;
                  const sel = current === val;
                  return (
                    <button key={it.key} onClick={() => onPick(val)} title={it.label} style={{
                      all: 'unset', cursor: 'pointer', aspectRatio: '1', display: 'grid', placeItems: 'center', borderRadius: 10,
                      background: sel ? `color-mix(in srgb, ${color} 16%, transparent)` : 'var(--bg-2)',
                      border: `1px solid ${sel ? color : 'var(--line)'}`,
                      color: sel ? color : 'var(--text-2)',
                      boxShadow: sel ? `0 0 calc(8px * var(--glow)) color-mix(in srgb, ${color} 40%, transparent)` : 'none',
                    }}>
                      <SectionGlyph icon={val} kind={kind} size={20} color={sel ? color : 'var(--text-2)'} glow={sel} />
                    </button>
                  );
                })}
              </div>
            </>
          ) : (
            <>
              <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 10 }}>
                Paste SVG markup (or load a .svg file). Scripts and links are stripped; the icon adopts this section's colour and glow.
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <div style={{ width: 56, height: 56, borderRadius: 12, display: 'grid', placeItems: 'center', background: 'var(--bg-2)', border: `1px solid color-mix(in srgb, ${color} 40%, var(--line))` }}>
                  {safe ? <SectionGlyph icon={raw} kind={kind} size={30} color={color} glow /> : <span className="mono" style={{ fontSize: 8, color: 'var(--text-3)' }}>PREVIEW</span>}
                </div>
                <button onClick={() => fileRef.current?.click()} className="btn-ghost" style={{ fontSize: 10, padding: '8px 12px' }}>LOAD .SVG FILE</button>
                <input ref={fileRef} type="file" accept=".svg,image/svg+xml" onChange={loadFile} style={{ display: 'none' }} />
              </div>
              <textarea value={raw} onChange={e => setRaw(e.target.value)} rows={6} spellCheck={false}
                placeholder={'<svg viewBox="0 0 24 24">\n  <path d="…" />\n</svg>'}
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 8, color: 'var(--text)', fontFamily: 'JetBrains Mono', fontSize: 11, lineHeight: 1.5, padding: '10px 12px', outline: 'none', resize: 'vertical' }} />
              {raw.trim() && !safe && (
                <div className="mono" style={{ fontSize: 9.5, color: 'var(--c-coral)', marginTop: 6 }}>Not a valid SVG — check the markup.</div>
              )}
              <button onClick={() => safe && onPick(raw)} disabled={!safe} className="btn-primary"
                style={{ width: '100%', marginTop: 12, opacity: safe ? 1 : 0.4, pointerEvents: safe ? 'auto' : 'none' }}>
                USE THIS ICON →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── EXERCISE EDITOR ───────────────────────────────────────────────
function ExerciseEditor({ e, color, expanded, expandedSetId, ssLabel, canSuperset, grouped, onSuperset, onUnsuperset, onAddAlt, onDelAlt, onExpand, onExpandSet, onUpdateEx, onDupEx, onDelEx, onSwitchEx, onUpdateSet, onAddSet, onDelSet, onDupSet, onApplyToAll }) {
  const workSets = e.setsList.filter(s => s.kind !== 'WARMUP');
  const summary  = workSets.length === 0 ? `${e.setsList.length} warm-up` : `${e.setsList.length} sets · ${summarize(e)}`;

  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid '+(expanded?color:'var(--line)'), borderLeft: grouped ? '2px solid var(--accent-2)' : `2px solid ${color}`, borderRadius: 10, overflow: 'hidden', boxShadow: expanded ? `0 0 calc(8px * var(--glow)) color-mix(in srgb, ${color} 30%, transparent)` : 'none' }}>
      <button onClick={onExpand} style={{ all: 'unset', cursor: 'pointer', width: '100%', display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: 12, alignItems: 'center', padding: 12 }}>
        <div style={{ width: 46, height: 46, borderRadius: 9, background: `url('${e.img}') center/cover, var(--bg-3)`, border: '1px solid var(--line)' }}/>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {ssLabel && <span className="mono" style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--accent-2)', background: 'color-mix(in srgb, var(--accent-2) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-2) 40%, transparent)', borderRadius: 5, padding: '2px 5px', flexShrink: 0 }}>SS {ssLabel}</span>}
            <input value={e.name} onClick={ev => ev.stopPropagation()} onChange={ev => onUpdateEx({ name: ev.target.value })}
              style={{ width: '100%', background: 'transparent', border: 0, outline: 'none', color: 'var(--text)', fontSize: 15, fontWeight: 600, fontFamily: 'inherit', padding: 0 }}/>
          </div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 3 }}>{summary}</div>
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

          {/* Banded mode — track a band colour instead of weight */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 4px', borderBottom: '1px dashed var(--line)' }}>
            <div>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 600 }}>BANDED</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{e.banded ? 'Sets track band colour' : 'Sets track weight'}</div>
            </div>
            <Toggle on={e.banded} onChange={v => onUpdateEx({ banded: v })}/>
          </div>

          {/* Unilateral — done one side at a time */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 4px', borderBottom: '1px dashed var(--line)' }}>
            <div>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 600 }}>EACH SIDE</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{e.unilateral ? 'Reps shown per side' : 'Both sides together'}</div>
            </div>
            <Toggle on={e.unilateral} onChange={v => onUpdateEx({ unilateral: v })}/>
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
              <span style={thSt}>{e.timed ? 'TIME' : e.banded ? 'BAND' : 'KG'}</span>
              <span style={thSt}>{e.timed ? 'KG' : 'REPS'}</span>
              <span style={thSt}>REST</span>
              <span style={thSt}>INT</span>
              <span/>
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              {e.setsList.map((st, i) => (
                <SetRow key={st.id} st={st} setIdx={i} total={e.setsList.length} timed={e.timed} banded={e.banded} color={color}
                  expanded={expandedSetId === st.id}
                  onExpand={() => onExpandSet(st.id)}
                  onUpdate={patch => onUpdateSet(i, patch)}
                  onDelete={() => onDelSet(i)}
                  onDuplicate={() => onDupSet(i)}
                  onApplyToAll={() => onApplyToAll(i)}
                />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 8, overflowX: 'auto', scrollbarWidth: 'none' }}>
              <button onClick={() => onAddSet('WORK')}    style={addSetBtn(color)}>+ SET</button>
              <button onClick={() => onAddSet('WARMUP')}  style={addSetBtn('var(--c-amber)')}>+ WARM-UP</button>
              <button onClick={() => onAddSet('DROPSET')} style={addSetBtn('var(--c-blue)')}>+ DROP</button>
              <button onClick={() => onAddSet('FAILURE')} style={addSetBtn('var(--c-coral)')}>+ FAILURE</button>
              <button onClick={() => onAddSet('PARTIAL')} style={addSetBtn('var(--c-pink)')}>+ PARTIAL</button>
            </div>
          </div>

          {/* Alternates — swap options the client can switch to */}
          <div style={{ padding: '10px 4px', borderBottom: '1px dashed var(--line)' }}>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', fontWeight: 600, marginBottom: 8 }}>ALTERNATES <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>· client can swap to these</span></div>
            <div style={{ display: 'grid', gap: 6 }}>
              {(e.alternates || []).map((alt, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', background: 'var(--bg-1)', border: '1px solid var(--line)', borderRadius: 8 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 6, background: `url('${alt.img || IMG_FALLBACK}') center/cover, var(--bg-3)`, border: '1px solid var(--line)', flexShrink: 0 }}/>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alt.name}</span>
                  <button onClick={() => onDelAlt(idx)} aria-label="Remove alternate" style={{ all: 'unset', cursor: 'pointer', color: 'var(--text-3)', padding: 2 }}><IconX2 size={12}/></button>
                </div>
              ))}
            </div>
            <button onClick={onAddAlt} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center', marginTop: 8, padding: '8px 0', border: '1px dashed var(--line-strong)', borderRadius: 8, color: 'var(--accent)', fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.12em', fontWeight: 700 }}>+ ADD ALTERNATE</button>
          </div>

          <div style={{ marginTop: 14, marginBottom: 8, display: 'flex', gap: 6 }}>
            <button onClick={onSwitchEx} className="btn-ghost" style={{ flex: 1, padding: '8px 10px', fontSize: 10 }}>
              ⇄ SWITCH
            </button>
            {grouped ? (
              <button onClick={onUnsuperset} className="btn-ghost" style={{ flex: 1, padding: '8px 10px', fontSize: 10, color: 'var(--accent-2)', borderColor: 'color-mix(in srgb, var(--accent-2) 45%, var(--line-strong))' }}>⛓ UNSUPERSET</button>
            ) : canSuperset ? (
              <button onClick={onSuperset} className="btn-ghost" style={{ flex: 1, padding: '8px 10px', fontSize: 10 }}>⛓ SUPERSET ↑</button>
            ) : null}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={onDupEx} className="btn-ghost" style={{ flex: 1, padding: '8px 10px', fontSize: 10 }}>⎘ DUPLICATE</button>
            <button onClick={onDelEx} className="btn-ghost" style={{ flex: 1, padding: '8px 10px', fontSize: 10, color: 'var(--c-coral)', borderColor: 'color-mix(in srgb, var(--c-coral) 40%, var(--line-strong))' }}>✕ DELETE</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SET ROW ───────────────────────────────────────────────────────
const SK_META = { WARMUP: { l:'W', c:'var(--c-amber)' }, DROPSET: { l:'D', c:'var(--c-blue)' }, FAILURE: { l:'F', c:'var(--c-coral)' }, PARTIAL: { l:'P', c:'var(--c-pink)' } };

function SetRow({ st, setIdx, total, timed, banded, color, expanded, onExpand, onUpdate, onDelete, onDuplicate, onApplyToAll }) {
  const sk     = SK_META[st.kind];
  const accent = sk ? sk.c : color;
  const bandCol = bandOf(st.band);
  return (
    <div style={{ background: expanded ? 'var(--bg-3)' : 'var(--bg-1)', border: '1px solid '+(expanded?accent:'var(--line)'), borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={onExpand} style={{ all: 'unset', cursor: 'pointer', width: '100%', display: 'grid', gridTemplateColumns: '26px 1fr 1fr 1fr 28px 16px', gap: 4, alignItems: 'center', padding: '6px 4px', boxSizing: 'border-box' }}>
        <span style={{ width: 20, height: 20, borderRadius: 4, background: sk?`color-mix(in srgb, ${sk.c} 15%, transparent)`:'rgba(255,255,255,0.04)', color: sk?sk.c:'var(--text-2)', border: sk?`1px solid color-mix(in srgb, ${sk.c} 50%, transparent)`:'1px solid var(--line)', fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 9, display: 'grid', placeItems: 'center' }}>
          {sk ? sk.l : String(setIdx+1).padStart(2,'0')}
        </span>
        {timed ? <CellVal value={fmtSecs(st.time)}/>
          : banded ? (bandCol
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: bandCol.color, border: '1px solid rgba(255,255,255,0.35)', flexShrink: 0 }}/><span className="mono" style={{ fontSize: 9, color: 'var(--text-2)', fontWeight: 700 }}>{bandCol.short}</span></span>
              : <CellVal value="—"/>)
          : <CellVal value={st.weight ? `${st.weight}` : 'BW'} unit={st.weight ? 'kg' : null}/>}
        {timed ? <CellVal value={st.weight ? `${st.weight}` : '—'} unit={st.weight ? 'kg' : null}/> : <CellVal value={`× ${st.repsText||0}`}/>}
        <CellVal value={fmtSecs(st.rest)}/>
        <span style={{ width: 22, height: 20, borderRadius: 4, display: 'grid', placeItems: 'center', background: `color-mix(in srgb, ${intensityColor(st.intensity)} 18%, transparent)`, color: intensityColor(st.intensity), fontFamily: 'JetBrains Mono', fontWeight: 700, fontSize: 10, border: `1px solid color-mix(in srgb, ${intensityColor(st.intensity)} 40%, transparent)` }}>{st.intensity}</span>
        <div style={{ color: 'var(--text-3)', transform: expanded?'rotate(90deg)':'rotate(0)', transition: 'transform .2s', display: 'grid', placeItems: 'center' }}><IconChevronRight size={11}/></div>
      </button>

      {expanded && (
        <div style={{ padding: '4px 8px 10px', borderTop: '1px dashed var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 2px', marginBottom: 6 }}>
            <div>
              <div className="mono" style={{ fontSize: 9, color: 'var(--c-amber)', letterSpacing: '0.1em', fontWeight: 700 }}>WARM-UP SET</div>
              <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{st.kind === 'WARMUP' ? 'Excluded from working-set count' : 'Counts toward working sets'}</div>
            </div>
            <Toggle on={st.kind === 'WARMUP'} onChange={v => onUpdate({ kind: v ? 'WARMUP' : 'WORK' })}/>
          </div>
          {banded ? (
            <>
              <RepsTextInput value={st.repsText||''} onChange={v => onUpdate({ repsText: v })} accent={accent}/>
              <div style={{ marginTop: 8 }}>
                <div className="mono" style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-2)', fontWeight: 600, marginBottom: 6 }}>BAND</div>
                <BandPicker value={st.band} onChange={v => onUpdate({ band: v })}/>
              </div>
            </>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {timed
                ? <TimeStepper label="TIME" value={st.time||60} onChange={v => onUpdate({ time: v })} accent={accent}/>
                : <RepsTextInput value={st.repsText||''} onChange={v => onUpdate({ repsText: v })} accent={accent}/>
              }
              <Stepper label="WEIGHT" unit="kg" value={st.weight||0} min={0} max={400} step={2.5} onChange={v => onUpdate({ weight: v })} accent={accent}/>
            </div>
          )}
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
  const labels = ['↓','⏸','↑','⏸'];
  const update = (i, v) => {
    const next = [...vals]; next[i] = v.replace(/[^0-9Xx]/g, '').slice(0,1);
    onChange(next.every(x => x === '') ? '' : next.join('-'));
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      {vals.map((v, i) => (
        <React.Fragment key={i}>
          <div style={{ textAlign: 'center' }}>
            <div className="mono" style={{ fontSize: 7, color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 2 }}>{labels[i]}</div>
            <input value={v} onChange={e => update(i, e.target.value)} maxLength={1} placeholder="–"
              style={{
                width: 28, boxSizing: 'border-box', textAlign: 'center',
                background: v ? 'var(--bg-1)' : 'transparent',
                border: '1px solid ' + (v ? 'var(--accent)' : 'var(--line-strong)'),
                borderRadius: 5, color: v ? 'var(--accent)' : 'var(--text-3)',
                fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700,
                padding: '3px 0', outline: 'none',
              }}/>
          </div>
          {i < 3 && <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', paddingTop: 12 }}>-</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── REPS TEXT INPUT ───────────────────────────────────────────────
function RepsTextInput({ value, onChange, accent = 'var(--accent)' }) {
  return (
    <div style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 8px' }}>
      <div className="mono" style={{ fontSize: 8, color: accent, letterSpacing: '0.12em', fontWeight: 700, marginBottom: 3 }}>REPS</div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="8"
        style={{
          width: '100%', background: 'transparent', border: 0, outline: 'none',
          color: 'var(--text)', fontFamily: 'JetBrains Mono', fontSize: 15, fontWeight: 700,
          textAlign: 'center', padding: '2px 0',
        }}
      />
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

// ── EXERCISE PICKER ───────────────────────────────────────────────
const EXERCISE_LIBRARY = [
  { name: 'Back Squat',              img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200&q=70', cat: 'LOWER BODY' },
  { name: 'Front Squat',             img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200&q=70', cat: 'LOWER BODY' },
  { name: 'Romanian Deadlift',       img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200&q=70', cat: 'LOWER BODY' },
  { name: 'Deadlift',                img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200&q=70', cat: 'LOWER BODY' },
  { name: 'Walking Lunges',          img: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=200&q=70', cat: 'LOWER BODY' },
  { name: 'Leg Press',               img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200&q=70', cat: 'LOWER BODY' },
  { name: 'Leg Curl',                img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200&q=70', cat: 'LOWER BODY' },
  { name: 'Standing Calf Raise',     img: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=200&q=70', cat: 'LOWER BODY' },
  { name: 'Hip Thrust',              img: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=200&q=70', cat: 'LOWER BODY' },
  { name: 'Bench Press',             img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=200&q=70', cat: 'UPPER PUSH' },
  { name: 'Incline DB Press',        img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=200&q=70', cat: 'UPPER PUSH' },
  { name: 'Overhead Press',          img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=200&q=70', cat: 'UPPER PUSH' },
  { name: 'Cable Fly',               img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=200&q=70', cat: 'UPPER PUSH' },
  { name: 'Lateral Raise',           img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=200&q=70', cat: 'UPPER PUSH' },
  { name: 'Tricep Pushdown',         img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=200&q=70', cat: 'UPPER PUSH' },
  { name: 'Dips',                    img: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=200&q=70', cat: 'UPPER PUSH' },
  { name: 'Pull-up',                 img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200&q=70', cat: 'UPPER PULL' },
  { name: 'Barbell Row',             img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200&q=70', cat: 'UPPER PULL' },
  { name: 'Lat Pulldown',            img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200&q=70', cat: 'UPPER PULL' },
  { name: 'Cable Row',               img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200&q=70', cat: 'UPPER PULL' },
  { name: 'Face Pull',               img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200&q=70', cat: 'UPPER PULL' },
  { name: 'Bicep Curl',              img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200&q=70', cat: 'UPPER PULL' },
  { name: 'Hammer Curl',             img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200&q=70', cat: 'UPPER PULL' },
  { name: 'Plank',                   img: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=200&q=70', cat: 'CORE' },
  { name: 'Dead Bug',                img: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=200&q=70', cat: 'CORE' },
  { name: 'Cable Crunch',            img: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=200&q=70', cat: 'CORE' },
  { name: 'Russian Twist',           img: 'https://images.unsplash.com/photo-1599058917212-d750089bc07e?w=200&q=70', cat: 'CORE' },
  { name: 'Banded Hip Opener',       img: 'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=200&q=70', cat: 'ACTIVATION' },
  { name: 'Banded Glute Activation', img: 'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=200&q=70', cat: 'ACTIVATION' },
  { name: 'Banded Ankle Mobility',   img: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=200&q=70', cat: 'ACTIVATION' },
  { name: 'Exercise Bike',           img: 'https://images.unsplash.com/photo-1591741535018-d042766c62eb?w=200&q=70', cat: 'CARDIO' },
  { name: 'Rowing Machine',          img: 'https://images.unsplash.com/photo-1591741535018-d042766c62eb?w=200&q=70', cat: 'CARDIO' },
  { name: 'Couch Stretch',           img: 'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=200&q=70', cat: 'COOLDOWN' },
  { name: 'Pigeon Pose',             img: 'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=200&q=70', cat: 'COOLDOWN' },
  { name: 'Diaphragmatic Breathing', img: 'https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=200&q=70', cat: 'COOLDOWN' },
];

export function ExercisePicker({ onClose, onPick }) {
  const [query, setQuery] = React.useState('');
  const [lib, setLib] = React.useState(null);

  React.useEffect(() => {
    loadExercises().then(rows => setLib(rows.map(e => ({
      name: e.name,
      img: e.thumbnail_url || videoThumb(e.video_url) || (e.photos && e.photos[0]) || IMG_FALLBACK,
      cat: (e.muscle_group || 'OTHER').toUpperCase(),
      banded: !!e.banded,
      unilateral: !!e.unilateral,
    }))));
  }, []);

  // Prefer the coach's real library; fall back to the built-in list while
  // loading or if the library is empty.
  const base = (lib && lib.length) ? lib : EXERCISE_LIBRARY;
  const filtered = query.trim()
    ? base.filter(e => exerciseMatches(e.name, query, e.cat || ''))
    : base;
  const cats = [...new Set(filtered.map(e => e.cat))];

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)',
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    }}>
      <div onClick={e => e.stopPropagation()} className="sheet-panel" style={{
        background: 'var(--bg-1)', borderTopLeftRadius: 20, borderTopRightRadius: 20,
        border: '1px solid var(--line-strong)', borderBottom: 0,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        animation: 'sheetUp .28s cubic-bezier(.22,.61,.36,1)',
      }}>
        <div style={{ padding: '12px 16px 10px', flexShrink: 0 }}>
          <div style={{ width: 36, height: 4, background: 'var(--line-strong)', borderRadius: 2, margin: '0 auto 12px' }} />
          <div className="label" style={{ marginBottom: 10 }}>// SWITCH EXERCISE</div>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search… (try BB, DB, BW)"
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--bg-2)', border: '1px solid var(--line-strong)', borderRadius: 10,
              padding: '10px 12px', color: 'var(--text)', fontFamily: 'JetBrains Mono', fontSize: 13,
              outline: 'none',
            }}
          />
        </div>
        <div className="scroller" style={{ flex: 1, overflowY: 'auto', padding: '0 16px 28px', minHeight: 0 }}>
          {cats.map(cat => (
            <div key={cat} style={{ marginBottom: 14 }}>
              <div className="label" style={{ marginBottom: 8 }}>// {cat}</div>
              <div style={{ display: 'grid', gap: 6 }}>
                {filtered.filter(e => e.cat === cat).map(ex => (
                  <button key={ex.name} onClick={() => onPick({ name: ex.name, img: ex.img, banded: ex.banded, unilateral: ex.unilateral })} style={{
                    all: 'unset', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 12px', background: 'var(--bg-2)',
                    border: '1px solid var(--line)', borderRadius: 10,
                  }}>
                    <div style={{ width: 36, height: 36, borderRadius: 7, background: `url('${ex.img}') center/cover, var(--bg-3)`, border: '1px solid var(--line)', flexShrink: 0 }}/>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{ex.name}</div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── HELPERS ───────────────────────────────────────────────────────
function clampIdx(v, len) {
  const n = Number.isInteger(v) ? v : 0;
  return Math.max(0, Math.min(n, (len || 1) - 1));
}

function mapDay(day, sIdx, eIdx, mapEx) {
  return { ...day, sections: day.sections.map((s, si) => si!==sIdx ? s : ({ ...s, items: s.items.map((e, ei) => ei!==eIdx ? e : mapEx(e)) })) };
}

function dbToSections(sections) {
  return sections.map(s => ({
    kind: s.kind, title: s.title, intro: s.intro || '', icon: s.icon || '',
    items: [...(s.section_exercises||[])].sort((a,b) => a.sort_order-b.sort_order).map(ex => ({
      id: ex.id, name: ex.name, img: ex.img_url||IMG_FALLBACK, timed: ex.timed, banded: !!ex.banded, unilateral: !!ex.unilateral, tempo: ex.tempo||'', coachNotes: ex.coach_notes||'', ssGroup: ex.superset_group ?? null, alternates: ex.alternates || [],
      setsList: [...(ex.exercise_sets||[])].sort((a,b) => a.set_index-b.set_index).map(st => ({
        id: 's'+st.id.slice(-8), kind: st.kind,
        repsText: st.reps_text || String(st.reps ?? 8),
        weight: Number(st.weight_kg)||0, band: st.band ?? null, rest: st.rest_secs??60,
        time: st.time_secs??60, intensity: st.intensity??6,
      })),
    })),
  }));
}

function mkSet(kind, p) { return { id: randId(), kind, repsText: p.repsText ?? String(p.reps ?? 8), weight:p.weight??0, band:p.band ?? null, rest:p.rest??60, time:p.time??60, intensity:p.intensity??6 }; }
function randId() { return 's'+Math.random().toString(36).slice(2); }

function summarize(e) {
  const work = e.setsList.filter(s => !s.kind || s.kind === 'WORK' || s.kind === 'DROPSET' || s.kind === 'FAILURE' || s.kind === 'PARTIAL');
  if (work.length===0) return '—';
  const w = uniqueRange(work.map(s => s.weight));
  const side = e.unilateral ? '/side' : '';
  if (e.timed) { const t = uniqueRange(work.map(s => s.time), fmtSecs); return `${t}${side}${w!=='0'?' · '+w+'kg':''}`; }
  const repsVal = work[0]?.repsText || '—';
  if (e.banded) { const b = bandOf(work[0]?.band); return `${b ? b.short : 'BAND'} × ${repsVal}${side}`; }
  return `${w==='0'?'BW':w+'kg'} × ${repsVal}${side}`;
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
