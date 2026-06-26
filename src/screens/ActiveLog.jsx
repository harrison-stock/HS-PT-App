import React from 'react'
import { supabase } from '../lib/supabase'
import { ACTIVE_EXERCISES, PHASES, MUSCLE_LABELS } from '../data/index'
import { muscleGroupsFor } from '../lib/muscleVolume'
import { BodyMap } from './Progress'
import { Hex, HexBackButton } from '../components/hex'
import { IconPause, IconPlay, IconCheck, IconX2, IconChevronLeft, IconChevronRight, IconPlus, IconTrophy, IconTimer, IconFlame, IconBand, IconDumbbell, IconLeaf, IconActivity, IconSwap, IconTrend, IconMetronome, IconClipboard } from '../components/icons'
import { ExerciseComments } from './ExerciseComments'
import { notify, trainerOf } from '../lib/notifications'
import { saveActiveWorkout, loadActiveWorkout, clearActiveWorkout } from '../lib/activeWorkout'
import { BANDS, bandOf } from '../components/bands'

// Active Workout — Everfit-style swipeable cards.
// One full-page card per exercise; horizontal snap-scroll between them.
// Phases (Pulse · Banded · Main · Cooldown) are pinned as a strip up top.
// Tap exercise title to see/swap alternatives.
export function ActiveLog({ go, dayId, userId, resume }) {
  const [exercises, setExercises] = React.useState(ACTIVE_EXERCISES);
  const [activeIdx, setActiveIdx] = React.useState(0); // start on Pulse warm-up
  const [sessionTime, setSessionTime] = React.useState(0);
  const [restTime, setRestTime] = React.useState(0);
  const [resting, setResting] = React.useState(false);
  const [timesUp, setTimesUp] = React.useState(false);
  const [altsForId, setAltsForId] = React.useState(null);
  const [historyForId, setHistoryForId] = React.useState(null);
  const [commentForId, setCommentForId] = React.useState(null);
  const [paused, setPaused] = React.useState(false);
  const [confirmQuit, setConfirmQuit] = React.useState(false);
  const [complete, setComplete] = React.useState(false);
  const scrollRef = React.useRef(null);
  const programmaticRef = React.useRef(false);
  const progClearRef = React.useRef(null);
  const [dbLoading, setDbLoading] = React.useState(!!dayId);
  const [loadError, setLoadError] = React.useState(false);
  const [dayIntro, setDayIntro] = React.useState('');
  const sessionStartRef = React.useRef(new Date().toISOString());

  React.useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setSessionTime((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [paused]);
  React.useEffect(() => {
    if (!resting || paused) return;
    const t = setInterval(() => setRestTime((s) => {
      if (s <= 1) {setResting(false);setTimesUp(true);return 0;}
      return s - 1;
    }), 1000);
    return () => clearInterval(t);
  }, [resting, paused]);
  // Auto-dismiss the "time's up" banner
  React.useEffect(() => {
    if (!timesUp) return;
    const t = setTimeout(() => setTimesUp(false), 3500);
    return () => clearTimeout(t);
  }, [timesUp]);

  React.useEffect(() => {
    if (!dayId) return;
    setDbLoading(true);
    setLoadError(false);
    supabase
      .from('programme_days')
      .select(`id, intro, workout_sections ( id, kind, title, sort_order, section_exercises ( id, name, img_url, timed, banded, unilateral, tempo, coach_notes, superset_group, alternates, sort_order, exercise_sets ( set_index, reps, reps_text, weight_kg, band, rest_secs, time_secs, kind ) ) )`)
      .eq('id', dayId)
      .single()
      .then(({ data, error }) => {
        if (data) {
          const SECTION_TO_PHASE = { PULSE_RAISER: 'pulse', BANDED: 'banded', MAIN: 'main', COOLDOWN: 'cooldown' };
          const rows = [];
          for (const sec of (data.workout_sections || []).sort((a, b) => a.sort_order - b.sort_order)) {
            const phase = SECTION_TO_PHASE[sec.kind] || 'main';
            for (const ex of (sec.section_exercises || []).sort((a, b) => a.sort_order - b.sort_order)) {
              const sets = (ex.exercise_sets || [])
                .sort((a, b) => a.set_index - b.set_index)
                .map(st => (ex.timed
                  ? {
                      time: true,
                      reps: formatMMSS(parseInt(st.time_secs) || 0),
                      kg: null,
                      perSide: !!ex.unilateral,
                      kind: (st.kind && st.kind !== 'WORK') ? st.kind : undefined,
                      done: false, active: false, rpe: null,
                    }
                  : {
                      reps: st.reps_text || String(st.reps ?? 8),
                      kg: parseFloat(st.weight_kg) || null,
                      band: st.band ?? null,
                      perSide: !!ex.unilateral,
                      kind: (st.kind && st.kind !== 'WORK') ? st.kind : undefined,
                      done: false, active: false, rpe: null,
                    }));
              rows.push({
                id: ex.id, name: ex.name, img: ex.img_url || '',
                base: { name: ex.name, img: ex.img_url || '' },
                banded: !!ex.banded, unilateral: !!ex.unilateral,
                phase, tempo: ex.tempo || '', ss: ex.superset_group ?? null,
                rest: parseInt((ex.exercise_sets || [])[0]?.rest_secs) || 60,
                coach: ex.coach_notes || '',
                sets,
                alternatives: (ex.alternates || []).map(a => ({ name: a.name, img: a.img || '', target: '', reason: 'Alternate' })),
              });
            }
          }
          // Resume an interrupted session: overlay saved set progress by
          // exercise id; otherwise clear any stale snapshot for a fresh start.
          if (resume && userId) {
            const snap = loadActiveWorkout(userId);
            if (snap && snap.dayId === dayId && rows.length > 0) {
              const byId = {};
              (snap.exercises || []).forEach(e => { byId[e.id] = e.sets || []; });
              rows.forEach(ex => {
                const saved = byId[ex.id];
                if (saved) ex.sets = ex.sets.map((s, i) => saved[i]
                  ? { ...s, done: !!saved[i].done, reps: saved[i].reps ?? s.reps, kg: saved[i].kg ?? s.kg, band: saved[i].band ?? s.band, rpe: saved[i].rpe ?? s.rpe }
                  : s);
              });
              setActiveIdx(Math.min(snap.activeIdx || 0, rows.length - 1));
              setSessionTime(snap.sessionTime || 0);
              sessionStartRef.current = snap.startedAt || sessionStartRef.current;
            }
          } else if (userId) {
            clearActiveWorkout(userId);
          }
          // A real assigned day must have exercises — never fall back to the
          // built-in demo against a client's actual session.
          if (rows.length > 0) setExercises(rows);
          else setLoadError(true);
          setDayIntro(data.intro || '');
        } else {
          setLoadError(true);
          if (error) console.error('load workout', error);
        }
        setDbLoading(false);
      });
  }, [dayId]);

  // ── Persist in-progress state so a crash/close can be resumed ──
  const liveRef = React.useRef({ sessionTime: 0, activeIdx: 0, exercises });
  React.useEffect(() => { liveRef.current = { sessionTime, activeIdx, exercises }; }, [sessionTime, activeIdx, exercises]);

  const persist = React.useCallback(() => {
    if (!dayId || !userId || complete) return;
    const cur = liveRef.current;
    saveActiveWorkout(userId, {
      dayId, startedAt: sessionStartRef.current,
      sessionTime: cur.sessionTime, activeIdx: cur.activeIdx,
      label: dayIntro || '',
      exercises: cur.exercises.map(ex => ({ id: ex.id, sets: (ex.sets || []).map(s => ({ done: !!s.done, reps: s.reps, kg: s.kg, band: s.band, rpe: s.rpe })) })),
    });
  }, [dayId, userId, complete, dayIntro]);

  // Snapshot on meaningful progress, plus a heartbeat for the running clock.
  React.useEffect(() => { if (!dbLoading) persist(); }, [exercises, activeIdx, dbLoading, persist]);
  React.useEffect(() => {
    if (!dayId || !userId) return;
    const t = setInterval(() => { if (!paused && !complete) persist(); }, 5000);
    return () => clearInterval(t);
  }, [dayId, userId, paused, complete, persist]);

  // Once finished, drop the snapshot so we don't re-prompt.
  React.useEffect(() => { if (complete && userId) clearActiveWorkout(userId); }, [complete, userId]);

  const saveSession = async () => {
    if (!dayId || !userId) return;
    try {
      const { data: ws } = await supabase
        .from('workout_sessions')
        .insert({ client_id: userId, day_id: dayId, started_at: sessionStartRef.current, completed_at: new Date().toISOString() })
        .select('id').single();
      if (ws) {
        const logRows = [];
        exercises.forEach(ex => {
          ex.sets.forEach((s, i) => {
            if (s.done) logRows.push({
              session_id: ws.id, exercise_id: ex.id, set_index: i,
              actual_reps: s.time ? null : (typeof s.reps === 'number' ? s.reps : (parseInt(s.reps) || null)),
              actual_weight_kg: (s.time || s.band) ? null : (s.kg || null),
              actual_band: s.band || null,
              actual_time_secs: s.time ? parseTimeToSeconds(s.reps) : null,
              intensity: s.rpe ? Math.round(s.rpe * 2.5) : null,
            });
          });
        });
        if (logRows.length) await supabase.from('logged_sets').insert(logRows);
        await supabase.from('client_workouts').update({ status: 'completed' }).eq('day_id', dayId).eq('client_id', userId);
        // Notify the coach that the client finished a workout.
        const tId = await trainerOf(userId);
        if (tId) notify({ recipientId: tId, actorId: userId, kind: 'done', title: 'Workout completed', body: 'A client finished a session — review their logged sets.', link: { screen: 'coach' } });
      }
    } catch (e) { console.error('saveSession', e); }
  };

  // Sync activeIdx -> scroll position. While we drive the scroll
  // programmatically, ignore onScroll so it can't fight the animation.
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const card = el.children[activeIdx];
    if (card) {
      programmaticRef.current = true;
      el.scrollTo({ left: card.offsetLeft, behavior: 'instant' });
      clearTimeout(progClearRef.current);
      progClearRef.current = setTimeout(() => {programmaticRef.current = false;}, 120);
    }
  }, [activeIdx]);

  // Sync scroll position -> activeIdx (only for user-driven swipes)
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el || programmaticRef.current) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== activeIdx && idx >= 0 && idx < exercises.length) setActiveIdx(idx);
  };

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const updateSet = (exId, setIdx, patch) => {
    setExercises((prev) => prev.map((e) => e.id !== exId ? e : {
      ...e,
      sets: e.sets.map((s, i) => i !== setIdx ? s : { ...s, ...patch })
    }));
  };

  const completeSet = (exId, setIdx) => {
    const e = exercises.find((x) => x.id === exId);
    const wasDone = e.sets[setIdx].done;
    updateSet(exId, setIdx, { done: !wasDone, active: false });
    if (!wasDone) {
      const nextIdx = setIdx + 1;
      if (nextIdx < e.sets.length) updateSet(exId, nextIdx, { active: true });
      if (e.rest > 0) {
        setRestTime(e.rest);
        setResting(true);
        setTimesUp(false);
      }
    }
  };

  const swapExercise = (alt) => {
    setExercises((prev) => prev.map((e) => {
      if (e.id !== altsForId) return e;
      return {
        ...e,
        name: alt.name,
        img: alt.img || e.img,
        target: alt.target,
        // keep same set scheme; reset perf
        sets: e.sets.map((s) => ({ ...s, done: false, active: false, rpe: null }))
      };
    }));
    setAltsForId(null);
  };

  // Append a new set (optionally a special type), mirroring the last set's load.
  const addSet = (exId, kind) => {
    setExercises((prev) => prev.map((e) => {
      if (e.id !== exId) return e;
      const base = [...e.sets].reverse().find((s) => !s.time) || e.sets[e.sets.length - 1] || { reps: 8, kg: null };
      let clone = { ...base, done: false, active: false, rpe: null, kind: kind || undefined };
      if (kind === 'WARMUP' && clone.kg != null) clone = { ...clone, kg: Math.round(clone.kg * 0.6 / 2.5) * 2.5, reps: 12 };
      if (kind === 'DROPSET' && clone.kg != null) clone = { ...clone, kg: Math.round(clone.kg * 0.7 / 2.5) * 2.5, reps: 12 };
      if (kind === 'FAILURE') clone = { ...clone, reps: 'AMRAP' };
      if (kind === 'PARTIAL' && typeof clone.reps === 'number') clone = { ...clone, reps: Math.round(clone.reps / 2) };
      return { ...e, sets: [...e.sets, clone] };
    }));
  };

  const altsFor = exercises.find((e) => e.id === altsForId);
  const historyFor = exercises.find((e) => e.id === historyForId);

  // Phase counts for the strip
  const phaseCounts = PHASES.map((p) => ({
    ...p,
    count: exercises.filter((e) => e.phase === p.id).length,
    done: exercises.filter((e) => e.phase === p.id && e.sets.every((s) => s.done)).length,
    firstRailIdx: 0
  }));

  // Build the rail: exercises (consecutive supersets merged into one card),
  // with a section-end divider slide at each phase boundary.
  const railItems = [];
  for (let i = 0; i < exercises.length;) {
    const e = exercises[i];
    let last = e;
    if (e.ss != null) {
      const group = [e];
      let j = i + 1;
      while (j < exercises.length && exercises[j].ss === e.ss) { group.push(exercises[j]); j++; }
      railItems.push({ type: 'superset', group, exIdx: i });
      last = group[group.length - 1];
      i = j;
    } else {
      railItems.push({ type: 'ex', ex: e, exIdx: i });
      i += 1;
    }
    const next = exercises[i];
    if (next && next.phase !== last.phase) {
      railItems.push({ type: 'divider', phaseId: last.phase, nextPhaseId: next.phase });
    }
  }
  // Final "cooldown complete · ready to finish?" slide
  if (exercises.length) {
    railItems.push({ type: 'finish', phaseId: exercises[exercises.length - 1].phase });
  }
  // Resolve each phase's first rail index for the strip nav
  const railPhase = (it) => it.type === 'ex' ? it.ex.phase : it.type === 'superset' ? it.group[0].phase : null;
  phaseCounts.forEach((p) => {
    p.firstRailIdx = railItems.findIndex((it) => railPhase(it) === p.id);
  });

  const activeItem = railItems[activeIdx] || railItems[0];
  const ex = activeItem.type === 'ex' ? activeItem.ex
    : activeItem.type === 'superset' ? activeItem.group[0]
    : exercises[Math.max(0, activeItem ? exercises.findIndex((e) => e.phase === activeItem.phaseId) : 0)];
  const currentPhaseId = activeItem.type === 'ex' ? activeItem.ex.phase
    : activeItem.type === 'superset' ? activeItem.group[0].phase
    : activeItem.phaseId;
  const lastIdx = railItems.length - 1;

  if (dbLoading) return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', background: 'var(--bg-0)' }}>
      <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.2em' }}>LOADING WORKOUT…</div>
    </div>
  );

  if (loadError) return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', background: 'var(--bg-0)', padding: 28 }}>
      <div style={{ textAlign: 'center', maxWidth: 300 }}>
        <Hex size={46} square style={{ margin: '0 auto 14px', background: 'color-mix(in srgb, var(--c-coral) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--c-coral) 45%, transparent)', color: 'var(--c-coral)' }}>
          <IconX2 size={20} />
        </Hex>
        <div className="h-bold" style={{ fontSize: 18, marginBottom: 8 }}>WORKOUT UNAVAILABLE</div>
        <div className="mono" style={{ fontSize: 11.5, color: 'var(--text-2)', lineHeight: 1.6, marginBottom: 22 }}>
          This session couldn't be loaded or has no exercises yet. Please check your connection or contact your coach.
        </div>
        <button onClick={() => go('workouts')} className="btn-primary" style={{ width: '100%', color: 'var(--heading-deep)' }}>BACK TO WORKOUTS</button>
      </div>
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-0)' }}>
      {/* Top bar */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
        padding: '54px 14px 10px',
        background: 'linear-gradient(180deg, var(--bg-0) 70%, transparent)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <HexBackButton onClick={() => go('workouts')} size={34} />
          <div style={{ textAlign: 'center' }}>
            <div className="label">// SESSION</div>
            <div className="mono" style={{ fontSize: 14, color: 'var(--accent)', letterSpacing: '0.1em', fontWeight: 600 }}>{fmt(sessionTime)}</div>
          </div>
          <button style={{ all: 'unset', cursor: 'pointer', width: 34, height: 34, display: 'grid', placeItems: 'center' }}
          data-comment-anchor="0c1a829dfe-button-110-11"
          aria-label="Pause" onClick={() => setPaused(true)}>
            <Hex size={34} square style={{
              background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--accent)'
            }}>
              <IconPause size={15} />
            </Hex>
          </button>
        </div>

        {/* Phase strip — hexagon progress nodes (mirrors home roadmap) */}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${phaseCounts.length}, 1fr)`, gap: 10, marginBottom: 10 }} data-comment-anchor="86e6e73e80-div-154-9">
          {phaseCounts.map((p) => {
            const isCurrent = currentPhaseId === p.id;
            const allDone = p.count > 0 && p.done === p.count;
            return (
              <button key={p.id} onClick={() => p.firstRailIdx >= 0 && setActiveIdx(p.firstRailIdx)}
              style={{
                all: 'unset', cursor: 'pointer', boxSizing: 'border-box',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                padding: '5px 2px 4px', borderRadius: 11,
                background: isCurrent ? `color-mix(in srgb, ${p.accent} 12%, transparent)` : 'transparent',
                border: isCurrent ? `1.5px solid ${p.accent}` : '1.5px solid transparent',
                boxShadow: isCurrent ? `0 0 calc(10px * var(--glow)) color-mix(in srgb, ${p.accent} 35%, transparent)` : 'none'
              }}>
                <div style={{ position: 'relative', width: 28, height: 28, display: 'grid', placeItems: 'center' }}>
                  {allDone ?
                  // Fully done → solid fill + tick
                  <Hex size={26} square style={{
                    background: p.accent, color: 'var(--on-accent)',
                    boxShadow: `0 0 calc(7px * var(--glow)) color-mix(in srgb, ${p.accent} 55%, transparent)`
                  }}>
                    <IconCheck size={11} sw={3} />
                  </Hex> :
                  // Not done → coloured (phase accent tint), with cute phase icon
                  <Hex size={26} square style={{
                    background: `color-mix(in srgb, ${p.accent} ${isCurrent ? 26 : 16}%, var(--bg-3))`,
                    border: `1.5px solid color-mix(in srgb, ${p.accent} ${isCurrent ? 70 : 42}%, transparent)`,
                    color: p.accent
                  }}>
                    {(PHASE_ICON[p.id] || PHASE_ICON._default)(13)}
                  </Hex>}
                </div>
                <div className="mono" style={{
                  fontSize: 9.5, letterSpacing: '0.1em',
                  color: p.accent, opacity: isCurrent || allDone ? 1 : 0.78, fontWeight: 700
                }}>{p.label.toUpperCase()}</div>
                <div className="mono" style={{
                  fontSize: 9.5, letterSpacing: '0.04em', fontWeight: 600,
                  color: isCurrent ? 'var(--text)' : 'var(--text-2)'
                }}>{p.done}/{p.count}</div>
              </button>);

          })}
        </div>
      </div>

      {/* Horizontal swipeable rail */}
      <style>{`
        .everfit-rail::-webkit-scrollbar { display: none; }
      `}</style>
      <div ref={scrollRef} onScroll={onScroll} className="everfit-rail"
      style={{
        position: 'absolute', top: 192, bottom: 130, left: 0, right: 0,
        overflowX: 'auto', overflowY: 'hidden',
        display: 'flex',
        scrollSnapType: 'x mandatory',
        scrollbarWidth: 'none',
        WebkitOverflowScrolling: 'touch'
      }}>
        {railItems.map((it, i) =>
        it.type === 'finish' ?
        <FinishSlide key={`f${i}`} phaseId={it.phaseId} onFinish={async () => { try { localStorage.setItem('hs_today_complete', '1'); } catch (e) {} await saveSession(); setComplete(true); }} /> :
        it.type === 'divider' ?
        <SectionDivider key={`d${i}`} phaseId={it.phaseId} nextPhaseId={it.nextPhaseId} exercises={exercises} onContinue={() => setActiveIdx(i + 1)} /> :
        it.type === 'superset' ?
        <SupersetCard key={`ss${it.group[0].id}`} group={it.group}
          intro={it.exIdx === 0 ? dayIntro : ''}
          onComplete={(exId, si) => completeSet(exId, si)}
          onUpdate={(exId, si, p) => updateSet(exId, si, p)}
          onAddRound={() => it.group.forEach(e => addSet(e.id, 'WORK'))}
          onTitle={(exId) => setAltsForId(exId)}
          onComment={dayId ? (exId) => setCommentForId(exId) : null}
          onHistory={(exId) => setHistoryForId(exId)} /> :
        <ExerciseCard key={it.ex.id} ex={it.ex} idx={it.exIdx} total={exercises.length}
        intro={it.exIdx === 0 ? dayIntro : ''}
        onComplete={(si) => completeSet(it.ex.id, si)}
        onUpdate={(si, p) => updateSet(it.ex.id, si, p)}
        onTitle={() => setAltsForId(it.ex.id)}
        onAddSet={(kind) => addSet(it.ex.id, kind)}
        onComment={dayId ? () => setCommentForId(it.ex.id) : null}
        onHistory={() => setHistoryForId(it.ex.id)} />

        )}
      </div>

      {/* Pagination dots / counter */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 110, zIndex: 9,
        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 4
      }}>
        <button onClick={() => activeIdx > 0 && setActiveIdx(activeIdx - 1)}
        style={{
          all: 'unset', cursor: activeIdx > 0 ? 'pointer' : 'default',
          opacity: activeIdx > 0 ? 1 : 0.3,
          color: 'var(--text-2)', padding: 6
        }}>
          <IconChevronLeft size={14} />
        </button>
        <div style={{ display: 'flex', gap: 4, padding: '4px 10px', background: 'rgba(0,0,0,0.4)', borderRadius: 999, border: '1px solid var(--line)' }}>
          {railItems.map((it, i) =>
          <span key={i} style={{
            width: i === activeIdx ? 14 : 4, height: 4, borderRadius: 2,
            background: i === activeIdx ? 'var(--accent)' : it.type === 'divider' ? 'color-mix(in srgb, var(--accent) 35%, var(--line-strong))' : 'var(--line-strong)',
            transition: 'all .25s',
            boxShadow: i === activeIdx ? '0 0 calc(6px * var(--glow)) var(--accent-glow)' : 'none'
          }} />
          )}
        </div>
        <button onClick={() => activeIdx < lastIdx && setActiveIdx(activeIdx + 1)}
        style={{
          all: 'unset', cursor: activeIdx < lastIdx ? 'pointer' : 'default',
          opacity: activeIdx < lastIdx ? 1 : 0.3,
          color: 'var(--text-2)', padding: 6
        }}>
          <IconChevronRight size={14} />
        </button>
      </div>

      {/* Bottom action bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 9,
        padding: '14px 14px 28px',
        background: 'linear-gradient(180deg, transparent, var(--bg-0) 30%)'
      }}>
        {resting &&
        <div className="card" style={{ padding: 10, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 12,
          borderColor: 'color-mix(in srgb, var(--accent-2) 50%, transparent)',
          background: 'color-mix(in srgb, var(--accent-2) 8%, transparent)'
        }}>
            <RestRing seconds={restTime} total={ex.rest} />
            <div style={{ flex: 1 }}>
              <div className="label" style={{ color: 'var(--accent-2)' }}>// RESTING</div>
              <div className="h-bold" style={{ fontSize: 20, color: 'var(--accent-2)' }}>{fmt(restTime)}</div>
            </div>
            <button className="btn-ghost" onClick={() => {setResting(false);setRestTime(0);}}>SKIP</button>
            <button className="btn-ghost" onClick={() => setRestTime((s) => s + 30)}>+30s</button>
          </div>
        }
        {timesUp &&
        <button onClick={() => setTimesUp(false)} style={{
          all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
          width: '100%', boxSizing: 'border-box',
          padding: '12px 14px', marginBottom: 10, borderRadius: 'var(--radius)',
          border: '1px solid var(--accent-2)',
          background: 'color-mix(in srgb, var(--accent-2) 16%, transparent)',
          animation: 'fadeIn .25s ease'
        }}>
          <Hex size={34} square style={{
            background: 'var(--accent-2)', color: 'var(--on-accent)',
            boxShadow: '0 0 calc(12px * var(--glow)) color-mix(in srgb, var(--accent-2) 60%, transparent)'
          }}>
            <IconCheck size={18} sw={3} />
          </Hex>
          <div style={{ flex: 1 }}>
            <div className="h-bold" style={{ fontSize: 16, color: 'var(--accent-2)', lineHeight: 1 }}>TIME'S UP</div>
            <div className="mono" style={{ fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.08em', marginTop: 3 }}>
              REST COMPLETE · NEXT SET READY
            </div>
          </div>
          <IconX2 size={15} style={{ color: 'var(--text-3)' }} />
        </button>
        }
        {activeItem.type !== 'finish' &&
        <button className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
        onClick={() => { if (activeIdx < lastIdx) { setActiveIdx(activeIdx + 1); } else { try { localStorage.setItem('hs_today_complete', '1'); } catch (e) {} setComplete(true); } }}>
          {activeItem.type === 'divider' ? <>CONTINUE <IconChevronRight size={14} /></> :
           <>NEXT EXERCISE <IconChevronRight size={14} /></>}
        </button>
        }
      </div>

      {/* Alternatives sheet */}
      {altsFor && <AlternativesSheet ex={altsFor} onClose={() => setAltsForId(null)} onPick={swapExercise} />}

      {/* Prior progress sheet */}
      {historyFor && <PriorProgressSheet ex={historyFor} onClose={() => setHistoryForId(null)} />}

      {/* Exercise comments */}
      {commentForId && (
        <ExerciseComments
          exerciseId={commentForId} clientId={userId}
          exerciseName={exercises.find(e => e.id === commentForId)?.name}
          onClose={() => setCommentForId(null)}
        />
      )}

      {/* Session complete — results screen */}
      {complete && <SessionComplete exercises={exercises} sessionTime={sessionTime} go={go} />}

      {/* Paused overlay */}
      {paused &&
      <div style={{
        position: 'absolute', inset: 0, zIndex: 70,
        background: 'rgba(6,10,12,0.86)', backdropFilter: 'blur(10px)',
        display: 'grid', placeItems: 'center', padding: 24,
        animation: 'fadeIn .2s ease'
      }}>
          <style>{`@keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
          <div style={{ textAlign: 'center', width: '100%', maxWidth: 300 }}>
            <img src="assets/logomark.svg" alt="HS" style={{
              width: 64, height: 64, display: 'block', margin: '0 auto 18px',
              filter: 'drop-shadow(0 0 calc(16px * var(--glow)) var(--accent-glow))'
            }} />
            <div className="label" style={{ color: 'var(--accent)', marginBottom: 6 }}>// SESSION PAUSED</div>
            <div className="h-bold" style={{ fontSize: 30, marginBottom: 6, color: '#eceff4' }}>PAUSED</div>
            <div className="mono" style={{ fontSize: 13, color: 'rgba(255,255,255,0.72)', letterSpacing: '0.08em', marginBottom: 24 }}>
              {fmt(sessionTime)} ELAPSED
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              <button className="btn-primary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}
            onClick={() => setPaused(false)}>
                <IconPlay size={14} /> RESUME
              </button>
              <button onClick={() => setConfirmQuit(true)} style={{
              width: '100%', padding: '13px 16px', borderRadius: 12,
              background: 'transparent',
              border: '1px solid color-mix(in srgb, var(--c-coral) 55%, transparent)',
              color: 'var(--c-coral)', cursor: 'pointer',
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 600, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase'
            }}>QUIT WORKOUT</button>
            </div>
          </div>

          {/* Are-you-sure confirm */}
          {confirmQuit &&
          <div style={{
            position: 'absolute', inset: 0, zIndex: 5,
            background: 'rgba(6,10,12,0.6)', backdropFilter: 'blur(4px)',
            display: 'grid', placeItems: 'center', padding: 28,
            animation: 'fadeIn .15s ease'
          }}>
            <div className="card" style={{ width: '100%', maxWidth: 300, padding: 20, textAlign: 'center', background: 'var(--bg-2)' }}>
              <Hex size={44} square style={{
                margin: '0 auto 14px',
                background: 'color-mix(in srgb, var(--c-coral) 16%, transparent)',
                border: '1px solid color-mix(in srgb, var(--c-coral) 45%, transparent)',
                color: 'var(--c-coral)'
              }}>
                <IconX2 size={20} />
              </Hex>
              <div className="h-bold" style={{ fontSize: 19, marginBottom: 8 }}>QUIT WORKOUT?</div>
              <div className="mono" style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 20 }}>
                Your progress for this session won't be saved. Are you sure?
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <button onClick={() => { if (userId) clearActiveWorkout(userId); go('dashboard'); }} style={{
                  width: '100%', padding: '12px 16px', borderRadius: 11,
                  background: 'var(--c-coral)', color: '#eceff4', border: 'none', cursor: 'pointer',
                  fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase'
                }}>YES, QUIT</button>
                <button onClick={() => setConfirmQuit(false)} className="btn-ghost" style={{ width: '100%' }}>
                  KEEP TRAINING
                </button>
              </div>
            </div>
          </div>
          }
        </div>
      }
    </div>);

}

// ── EXERCISE CARD (one per swipe page) ───────────────────────────
function ExerciseCard({ ex, idx, total, onComplete, onUpdate, onTitle, onAddSet, onHistory, onComment, intro }) {
  const phase = PHASES.find((p) => p.id === ex.phase);
  const phaseColor = phase?.accent || 'var(--accent)';
  return (
    <div style={{
      flex: '0 0 100%', width: '100%', height: '100%',
      scrollSnapAlign: 'center',
      padding: '0 14px',
      overflow: 'hidden',
      display: 'flex', flexDirection: 'column'
    }}>
      <div className="scroller" style={{ height: '100%', paddingBottom: 10 }}>
        {intro && (
          <div className="card" style={{ marginBottom: 12, padding: 12, borderColor: 'color-mix(in srgb, var(--accent) 30%, var(--line))', background: 'var(--accent-soft)' }}>
            <div className="label" style={{ color: 'var(--accent)', marginBottom: 5 }}>// TODAY'S WORKOUT</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{intro}</div>
          </div>
        )}
        {/* Exercise video — YouTube embed slot */}
        <div style={{
          position: 'relative', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
          marginBottom: 12, border: '1px solid var(--line-strong)',
          aspectRatio: '16 / 9',
          background: `linear-gradient(180deg, rgba(7,7,12,0.35) 0%, rgba(7,7,12,0.65) 100%), url('${ex.img}') center/cover`
        }}>
          {/* YouTube play glyph — embed mounts here */}
          <div style={{
            position: 'absolute', inset: 0, margin: 'auto',
            width: 58, height: 40, borderRadius: 10,
            background: '#FF0000',
            display: 'grid', placeItems: 'center',
            boxShadow: '0 2px 12px rgba(0,0,0,0.45)'
          }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
          </div>
        </div>

        {/* Title + actions */}
        <div style={{ marginTop: 4, marginBottom: 18 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {ex.ss != null && (
              <span className="mono" style={{ display: 'inline-block', fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--accent-2)', background: 'color-mix(in srgb, var(--accent-2) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-2) 40%, transparent)', borderRadius: 6, padding: '3px 8px' }}>
                ⛓ SUPERSET
              </span>
            )}
            {ex.unilateral && (
              <span className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--c-amber)', background: 'color-mix(in srgb, var(--c-amber) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--c-amber) 40%, transparent)', borderRadius: 6, padding: '3px 8px' }}>
                <IconSwap size={11}/> EACH SIDE
              </span>
            )}
          </div>
          <div className="h-bold" style={{ fontSize: 23, fontWeight: 900, letterSpacing: '0.01em', lineHeight: 1.05, marginBottom: 14 }}>
            {ex.name.toUpperCase()}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={onTitle} aria-label="Swap exercise" style={{ all: 'unset', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <Hex size={32} square style={{ background: 'var(--bg-2)', border: '1px solid var(--line-strong)', color: 'var(--text-2)' }}>
                <IconSwap size={15} />
              </Hex>
            </button>
            <button onClick={onHistory} aria-label="Prior progress" style={{ all: 'unset', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <Hex size={32} square style={{ background: 'var(--bg-2)', border: '1px solid var(--line-strong)', color: 'var(--text-2)' }}>
                <IconTrend size={15} />
              </Hex>
            </button>
            {onComment &&
            <button onClick={onComment} aria-label="Comments" style={{ all: 'unset', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
              <Hex size={32} square style={{ background: 'var(--bg-2)', border: '1px solid var(--line-strong)', color: 'var(--text-2)' }}>
                <IconClipboard size={15} />
              </Hex>
            </button>}
            {ex.tempo &&
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '6px 12px 6px 10px', borderRadius: 999,
              background: '#fff',
              border: '1px solid var(--line-strong)',
              color: '#0A1F22'
            }}>
              <IconMetronome size={13} style={{ color: 'var(--text-3)' }} />
              <span className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-3)' }}>TEMPO</span>
              <span className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-3)' }}>{ex.tempo}</span>
            </div>
            }
          </div>
        </div>

        {/* Performance log */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--line)' }}>
            <span className="label">// PERFORMANCE LOG</span>
            <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em' }}>
              {ex.rest > 0 ? `REST ${ex.rest}S` : 'NO REST'}
            </span>
          </div>
          {/* header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 1fr 56px 36px', gap: 8, padding: '8px 14px', fontSize: 9, color: 'var(--text-3)' }} className="mono">
            <span style={{ letterSpacing: '0.1em' }}>SET</span>
            <span style={{ letterSpacing: '0.1em' }}>{ex.banded ? 'BAND' : ex.sets[0]?.kg != null ? 'KG' : 'TYPE'}</span>
            <span style={{ letterSpacing: '0.1em' }}>{ex.sets[0]?.time ? 'TIME' : 'REPS'}{ex.unilateral ? '/SIDE' : ''}</span>
            <span style={{ letterSpacing: '0.04em' }}>DIFFICULTY</span>
            <span />
          </div>
          {(() => {
            let wn = 0;
            return (ex.sets || []).map((s, i) => {
              if (!s) return null;
              if (!s.kind) wn += 1;
              return (
                <LogSetRow key={i} idx={i} setNum={wn} set={s} color={phaseColor} banded={ex.banded}
                onComplete={() => onComplete(i)}
                onRpe={(rpe) => onUpdate(i, { rpe })}
                onReps={(reps) => onUpdate(i, { reps })}
                onKg={(kg) => onUpdate(i, { kg })}
                onBand={(band) => onUpdate(i, { band })}
                onKind={(kind) => onUpdate(i, kindPatch(s, kind))} />);
            });
          })()}
          <AddSetControl onAdd={onAddSet} />
        </div>

        {/* Coach note */}
        {ex.coach &&
        <div className="card" style={{ marginTop: 12, padding: 12 }}>
            <div className="label" style={{ marginBottom: 6 }}>// COACH NOTE</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{ex.coach}</div>
          </div>
        }

        {/* Athlete comment */}
        <ExerciseComment />
      </div>
    </div>);

}

// Build the set patch when changing a set's status/type.
function kindPatch(set, kind) {
  const patch = { kind: kind || undefined };
  if (kind === 'FAILURE') {
    patch.reps = 'AMRAP';
  } else if (typeof set.reps === 'string') {
    // leaving FAILURE → restore a numeric rep count
    patch.reps = 8;
  }
  if (kind === 'PARTIAL' && typeof set.reps === 'number') patch.reps = Math.max(1, Math.round(set.reps / 2));
  return patch;
}

// Athlete-side comment field shown under the coach note.
function ExerciseComment() {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState('');
  const [saved, setSaved] = React.useState('');

  if (saved && !open) {
    return (
      <div className="card" style={{ marginTop: 12, padding: 12, borderColor: 'color-mix(in srgb, var(--accent) 30%, var(--line))' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <span className="label" style={{ color: 'var(--accent)' }}>// YOUR COMMENT</span>
          <button onClick={() => {setText(saved);setOpen(true);}} className="mono" style={{
            all: 'unset', cursor: 'pointer', fontSize: 9, letterSpacing: '0.1em', color: 'var(--text-3)'
          }}>EDIT</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{saved}</div>
      </div>);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={{
        all: 'unset', width: '100%', boxSizing: 'border-box', marginTop: 10, padding: '10px 4px',
        color: 'var(--text-2)', cursor: 'pointer',
        fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7
      }}>
        <IconPlus size={13} style={{ color: 'var(--accent)' }} /> Add a comment
      </button>);
  }

  return (
    <div className="card" style={{ marginTop: 12, padding: 12 }}>
      <div className="label" style={{ marginBottom: 8 }}>// ADD A COMMENT</div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus
      placeholder="How did this exercise feel? Note anything for your coach…"
      style={{
        width: '100%', minHeight: 64, resize: 'vertical', boxSizing: 'border-box',
        background: 'var(--bg-1)', border: '1px solid var(--line-strong)', borderRadius: 8,
        padding: '9px 10px', color: 'var(--text)', outline: 'none',
        fontFamily: 'JetBrains Mono', fontSize: 12, lineHeight: 1.5
      }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={() => {setOpen(false);setText(saved);}} className="btn-ghost" style={{ flex: 1 }}>CANCEL</button>
        <button onClick={() => {setSaved(text.trim());setOpen(false);}} className="btn-primary"
        style={{ flex: 1, opacity: text.trim() ? 1 : 0.5, pointerEvents: text.trim() ? 'auto' : 'none' }}>
          SAVE
        </button>
      </div>
    </div>);

}

// ── FINAL SLIDE (after cooldown) ─────────────────────────────────
// "Cooldown complete · ready to finish?" — last rail slide before results.
function FinishSlide({ phaseId, onFinish }) {
  const phase = PHASES.find((p) => p.id === phaseId) || {};
  const confetti = ['var(--c-amber)', 'var(--c-blue)', 'var(--c-coral)', 'var(--accent)', 'var(--c-pink)'];
  return (
    <div style={{
      flex: '0 0 100%', width: '100%', height: '100%',
      scrollSnapAlign: 'center', padding: '0 14px', overflow: 'hidden',
      display: 'flex', flexDirection: 'column'
    }}>
      <div className="scroller" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingBottom: 10 }}>
        <div style={{ position: 'relative', width: '100%', height: 0 }}>
          {confetti.concat(confetti).map((c, i) => {
            const seed = (i * 137.5) % 100;
            return (
              <span key={i} style={{
                position: 'absolute',
                left: `${seed}%`, top: `${-90 - (i % 5) * 28}px`,
                width: i % 2 ? 7 : 9, height: i % 3 ? 9 : 6,
                background: c, borderRadius: 1,
                transform: `rotate(${seed * 3.6}deg)`, opacity: 0.85
              }} />);
          })}
        </div>

        <img src="assets/logomark.svg" alt="HS" style={{
          width: 96, height: 96, display: 'block', marginBottom: 24,
          filter: 'drop-shadow(0 0 calc(34px * var(--glow)) var(--accent-glow))'
        }} />

        <div className="mono" style={{ fontSize: 11, letterSpacing: '0.22em', fontWeight: 700, color: 'var(--accent-2)', marginBottom: 10 }}>
          ✓ {(phase.label || 'COOLDOWN').toUpperCase()} COMPLETE
        </div>
        <div className="h-bold" style={{ fontSize: 28, marginBottom: 12 }}>READY TO FINISH?</div>
        <div className="mono" style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-2)', maxWidth: 300, marginBottom: 26 }}>
          That's every block done. Wrap up the session to log your sets and see your results.
        </div>

        <button onClick={onFinish} className="btn-primary" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px 30px'
        }}>
          FINISH &amp; SEE RESULTS <IconCheck size={15} sw={3} />
        </button>
      </div>
    </div>);

}

// ── SUPERSET CARD (interleaved, round-based) ─────────────────────
// Renders a superset group as rounds: round 1 = one set of each exercise,
// round 2 = the next set of each, etc., so the client alternates A1→A2→A1…
function SupersetCard({ group, onComplete, onUpdate, onTitle, onAddRound, onComment, onHistory, intro }) {
  const phase = PHASES.find((p) => p.id === group[0].phase);
  const phaseColor = phase?.accent || 'var(--accent)';
  const maxRounds = Math.max(...group.map((e) => e.sets.length));
  const letter = (gi) => `${String.fromCharCode(65)}${gi + 1}`; // A1, A2, …

  return (
    <div style={{ flex: '0 0 100%', width: '100%', height: '100%', scrollSnapAlign: 'center', padding: '0 14px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="scroller" style={{ height: '100%', paddingBottom: 10 }}>
        {intro && (
          <div className="card" style={{ marginBottom: 12, padding: 12, borderColor: 'color-mix(in srgb, var(--accent) 30%, var(--line))', background: 'var(--accent-soft)' }}>
            <div className="label" style={{ color: 'var(--accent)', marginBottom: 5 }}>// TODAY'S WORKOUT</div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-line' }}>{intro}</div>
          </div>
        )}

        {/* Superset header */}
        <div style={{ marginTop: 4, marginBottom: 14 }}>
          <div className="mono" style={{ display: 'inline-block', fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', color: 'var(--accent-2)', background: 'color-mix(in srgb, var(--accent-2) 16%, transparent)', border: '1px solid color-mix(in srgb, var(--accent-2) 40%, transparent)', borderRadius: 6, padding: '3px 8px', marginBottom: 10 }}>
            ⛓ SUPERSET · {group.length} EXERCISES
          </div>
          {group.map((e, gi) => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: gi < group.length - 1 ? '1px dashed var(--line)' : 'none' }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `url('${e.img}') center/cover, var(--bg-3)`, border: '1px solid var(--line)', flexShrink: 0 }}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="mono" style={{ fontSize: 9, fontWeight: 800, color: 'var(--accent-2)', letterSpacing: '0.06em' }}>{letter(gi)}</div>
                <div style={{ fontSize: 15, fontWeight: 800, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
              </div>
              <button onClick={() => onTitle(e.id)} aria-label="Swap" style={{ all: 'unset', cursor: 'pointer' }}><Hex size={28} square style={{ background: 'var(--bg-2)', border: '1px solid var(--line-strong)', color: 'var(--text-2)' }}><IconSwap size={13}/></Hex></button>
              <button onClick={() => onHistory(e.id)} aria-label="History" style={{ all: 'unset', cursor: 'pointer' }}><Hex size={28} square style={{ background: 'var(--bg-2)', border: '1px solid var(--line-strong)', color: 'var(--text-2)' }}><IconTrend size={13}/></Hex></button>
              {onComment && <button onClick={() => onComment(e.id)} aria-label="Comments" style={{ all: 'unset', cursor: 'pointer' }}><Hex size={28} square style={{ background: 'var(--bg-2)', border: '1px solid var(--line-strong)', color: 'var(--text-2)' }}><IconClipboard size={13}/></Hex></button>}
            </div>
          ))}
        </div>

        {/* Rounds */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
            <span className="label">// SUPERSET ROUNDS</span>
          </div>
          {Array.from({ length: maxRounds }).map((_, r) => (
            <div key={r} style={{ borderBottom: '1px solid var(--line)' }}>
              <div className="mono" style={{ fontSize: 9, color: phaseColor, letterSpacing: '0.12em', fontWeight: 700, padding: '8px 14px 2px' }}>ROUND {r + 1}</div>
              {group.map((e, gi) => {
                const s = e.sets[r];
                if (!s) return null;
                return (
                  <div key={e.id} style={{ padding: '0 0 2px' }}>
                    <div className="mono" style={{ fontSize: 8.5, color: 'var(--text-3)', letterSpacing: '0.06em', padding: '2px 14px 0' }}>
                      {letter(gi)} · {e.name.toUpperCase()}
                    </div>
                    <LogSetRow idx={r} setNum={r + 1} set={s} color={phaseColor}
                      onComplete={() => onComplete(e.id, r)}
                      onRpe={(rpe) => onUpdate(e.id, r, { rpe })}
                      onReps={(reps) => onUpdate(e.id, r, { reps })}
                      onKg={(kg) => onUpdate(e.id, r, { kg })}
                      onKind={(kind) => onUpdate(e.id, r, kindPatch(s, kind))} />
                  </div>
                );
              })}
            </div>
          ))}
          <button onClick={onAddRound} style={{ all: 'unset', cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center', padding: '12px 0', color: phaseColor, fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.12em', fontWeight: 700 }}>+ ADD ROUND</button>
        </div>

        {group.some((e) => e.coach) && (
          <div className="card" style={{ marginTop: 12, padding: 12, display: 'grid', gap: 8 }}>
            {group.map((e) => e.coach ? (
              <div key={e.id}>
                <div className="mono" style={{ fontSize: 8.5, color: 'var(--accent-2)', letterSpacing: '0.06em', marginBottom: 3 }}>{e.name.toUpperCase()}</div>
                <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{e.coach}</div>
              </div>
            ) : null)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── SECTION-END DIVIDER (between phases) ─────────────────────────
// Celebratory interstitial shown when one phase ends and the next begins.
function SectionDivider({ phaseId, nextPhaseId, exercises, onContinue }) {
  const phase = PHASES.find((p) => p.id === phaseId) || {};
  const next = PHASES.find((p) => p.id === nextPhaseId) || {};
  const color = phase.accent || 'var(--accent)';
  const count = exercises.filter((e) => e.phase === phaseId).length;
  const blurb = SECTION_BLURB[nextPhaseId] || 'Take a breath and reset before the next block.';
  const confetti = ['var(--c-amber)', 'var(--c-blue)', 'var(--c-coral)', 'var(--accent)', 'var(--c-pink)'];
  return (
    <div style={{
      flex: '0 0 100%', width: '100%', height: '100%',
      scrollSnapAlign: 'center', padding: '0 14px', overflow: 'hidden',
      display: 'flex', flexDirection: 'column'
    }}>
      <div className="scroller" style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingBottom: 10 }}>
        {/* Confetti */}
        <div style={{ position: 'relative', width: '100%', height: 0 }}>
          {confetti.concat(confetti).map((c, i) => {
            const seed = (i * 137.5) % 100;
            return (
              <span key={i} style={{
                position: 'absolute',
                left: `${seed}%`, top: `${-90 - (i % 5) * 28}px`,
                width: i % 2 ? 7 : 9, height: i % 3 ? 9 : 6,
                background: c, borderRadius: 1,
                transform: `rotate(${seed * 3.6}deg)`, opacity: 0.85
              }} />);
          })}
        </div>

        {/* Big brand hex with the count */}
        <Hex size={140} square style={{
          background: `linear-gradient(160deg, ${color}, color-mix(in srgb, ${color} 70%, #000))`,
          boxShadow: `0 0 calc(40px * var(--glow)) color-mix(in srgb, ${color} 45%, transparent)`,
          color: 'var(--on-accent)', marginBottom: 26
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
            {(PHASE_ICON[phaseId] || PHASE_ICON._default)(64)}
          </div>
        </Hex>

        <div className="mono" style={{ fontSize: 11, letterSpacing: '0.22em', fontWeight: 700, color, marginBottom: 10 }}>
          ✓ {phase.label ? phase.label.toUpperCase() : 'SECTION'} COMPLETE
        </div>
        <div className="h-bold" style={{ fontSize: 26, marginBottom: 18 }}>
          NEXT · {next.label ? next.label.toUpperCase() : ''}
        </div>
        <div className="mono" style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-2)', maxWidth: 300, marginBottom: 24 }}>
          {blurb}
        </div>

        <button onClick={onContinue} className="btn-primary" style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 28px'
        }}>
          START {next.label ? next.label.toUpperCase() : 'NEXT'} <IconChevronRight size={14} />
        </button>
      </div>
    </div>);

}

// ── SESSION COMPLETE (post-workout results) ──────────────────────
// Celebratory results screen: summary stats, PRs, and a muscle map of
// what was trained this session.
export function SessionComplete({ exercises, sessionTime, go, onClose }) {
  const [side, setSide] = React.useState('front');

  const setsDone = exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const setsTotal = exercises.reduce((n, e) => n + e.sets.length, 0);
  const volume = exercises.reduce((n, e) => n + e.sets.filter((s) => s.done && s.kg).reduce((a, s) => a + s.kg * (typeof s.reps === 'number' ? s.reps : 0), 0), 0);
  const fmtT = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // Top sets — heaviest done working set per weighted exercise.
  const prs = exercises
    .filter((e) => e.sets.some((s) => s.kg && s.done))
    .map((e) => {
      const done = e.sets.filter((s) => s.kg && s.done);
      const top = Math.max(...done.map((s) => s.kg));
      const set = done.find((s) => s.kg === top);
      return { name: e.name, kg: top, reps: typeof set?.reps === 'number' ? set.reps : null };
    })
    .sort((a, b) => b.kg - a.kg)
    .slice(0, 2);

  // Muscles trained — inferred from the names of exercises with completed sets.
  const trained = React.useMemo(() => {
    const counts = {};
    exercises.forEach((e) => {
      const doneSets = e.sets.filter((s) => s.done).length;
      if (!doneSets) return;
      muscleGroupsFor(e.name).forEach((g, i) => {
        counts[g] = (counts[g] || 0) + doneSets * (i === 0 ? 1 : 0.6);
      });
    });
    const max = Math.max(1, ...Object.values(counts));
    return Object.fromEntries(Object.entries(counts).map(([g, v]) => [g, v / max]));
  }, [exercises]);
  const intensity = (g) => trained[g] || 0;
  const data = Object.fromEntries(Object.keys(trained).map((g) => [g, { sets: 1 }]));
  const trainedLabels = Object.keys(trained).map((g) => (MUSCLE_LABELS || {})[g] || g);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 75,
      background: 'var(--bg-1)', display: 'flex', flexDirection: 'column',
      animation: 'fadeIn .25s ease'
    }}>
      <div style={{
        flexShrink: 0, padding: '54px 18px 18px', textAlign: 'center', position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--accent) 16%, var(--bg-1)), var(--bg-1))'
      }}>
        {onClose &&
        <HexBackButton onClick={onClose} variant="overlay" size={36}
          style={{ position: 'absolute', top: 50, left: 16, zIndex: 3 }} />
        }
        {['var(--c-amber)', 'var(--c-blue)', 'var(--c-coral)', 'var(--accent)', 'var(--c-pink)', 'var(--accent-2)'].map((c, i) => {
          const x = (i * 53) % 100;
          return <span key={i} style={{
            position: 'absolute', top: `${20 + (i % 3) * 22}px`, left: `${6 + x * 0.86}%`,
            width: i % 2 ? 7 : 9, height: i % 3 ? 9 : 6, background: c, borderRadius: 1,
            transform: `rotate(${x * 3.6}deg)`, opacity: 0.85
          }} />;
        })}
        <Hex size={92} square style={{
          margin: '6px auto 16px',
          background: 'linear-gradient(160deg, var(--accent), var(--accent-2))',
          color: 'var(--on-accent)',
          boxShadow: '0 0 calc(34px * var(--glow)) var(--accent-glow)'
        }}>
          <IconTrophy size={40} />
        </Hex>
        <div className="mono" style={{ fontSize: 11, letterSpacing: '0.22em', fontWeight: 700, color: 'var(--accent)', marginBottom: 8 }}>
          ✓ SESSION COMPLETE
        </div>
        <div className="h-bold" style={{ fontSize: 26, lineHeight: 1.05 }}>NICE WORK</div>
      </div>

      <div className="scroller" style={{ flex: 1, padding: '12px 16px 24px', minHeight: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 16 }}>
          <SCKpi label="TIME" value={fmtT(sessionTime)} unit="" />
          <SCKpi label="VOLUME" value={volume.toLocaleString()} unit="KG" />
          <SCKpi label="SETS" value={`${setsDone}/${setsTotal}`} unit="" />
        </div>

        {prs.length > 0 && <>
          <div className="label" style={{ margin: '0 2px 8px' }}>// TOP SETS</div>
          <div style={{ display: 'grid', gap: 8, marginBottom: 18 }}>
            {prs.map((pr, i) =>
            <div key={i} className="card" style={{
              padding: 12, display: 'flex', alignItems: 'center', gap: 12,
              background: 'color-mix(in srgb, var(--c-amber) 9%, var(--bg-2))',
              borderColor: 'color-mix(in srgb, var(--c-amber) 38%, var(--line))'
            }}>
              <Hex size={34} square style={{
                background: 'color-mix(in srgb, var(--c-amber) 18%, transparent)',
                border: '1px solid color-mix(in srgb, var(--c-amber) 45%, transparent)',
                color: 'var(--c-amber)', flexShrink: 0
              }}>
                <IconTrophy size={16} />
              </Hex>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{pr.name}</div>
                <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 3 }}>
                  BEST TODAY{pr.reps ? ` · × ${pr.reps}` : ''}
                </div>
              </div>
              <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: 'var(--c-amber)' }}>{pr.kg}kg</span>
            </div>
            )}
          </div>
        </>}

        {/* Session breakdown — grouped by zone, what was completed vs missed */}
        <div className="label" style={{ margin: '0 2px 8px' }}>// SESSION BREAKDOWN</div>
        <div style={{ display: 'grid', gap: 14, marginBottom: 18 }}>
          {PHASES.filter((ph) => exercises.some((e) => e.phase === ph.id)).map((ph) => {
            const zoneEx = exercises.filter((e) => e.phase === ph.id);
            return (
              <div key={ph.id}>
                {/* Zone header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '0 2px' }}>
                  <Hex size={22} square style={{
                    background: `color-mix(in srgb, ${ph.accent} 18%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${ph.accent} 45%, transparent)`,
                    color: ph.accent
                  }}>{(PHASE_ICON[ph.id] || PHASE_ICON._default)(11)}</Hex>
                  <span className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: ph.accent }}>
                    {ph.label.toUpperCase()}
                  </span>
                </div>
                {/* Zone exercises */}
                <div style={{ display: 'grid', gap: 6 }}>
                  {zoneEx.map((e, i) => {
                    const done = e.sets.filter((s) => s.done).length;
                    const total = e.sets.length;
                    const missed = total - done;
                    const full = missed === 0;
                    return (
                      <div key={i} className="card" style={{
                        padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
                        borderColor: full ? 'color-mix(in srgb, var(--accent) 30%, var(--line))' : 'color-mix(in srgb, var(--c-amber) 30%, var(--line))'
                      }}>
                        <Hex size={26} square style={{
                          background: full ? 'color-mix(in srgb, var(--accent) 18%, transparent)' : 'color-mix(in srgb, var(--c-amber) 16%, transparent)',
                          border: `1px solid color-mix(in srgb, ${full ? 'var(--accent)' : 'var(--c-amber)'} 45%, transparent)`,
                          color: full ? 'var(--accent)' : 'var(--c-amber)', flexShrink: 0
                        }}>
                          {full ? <IconCheck size={12} sw={3} /> : <span className="mono" style={{ fontSize: 10, fontWeight: 800 }}>{missed}</span>}
                        </Hex>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                          <div className="mono" style={{ fontSize: 10, letterSpacing: '0.06em', marginTop: 3, color: full ? 'var(--accent)' : 'var(--c-amber)' }}>
                            {full ? `ALL ${total} SETS HIT` : `${done}/${total} SETS · ${missed} MISSED`}
                          </div>
                        </div>
                      </div>);
                  })}
                </div>
              </div>);
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 2px 8px' }}>
          <div className="label">// MUSCLES TRAINED</div>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg-3)', borderRadius: 999, padding: 3 }}>
            {['front', 'back'].map((s) =>
            <button key={s} onClick={() => setSide(s)} style={{
              all: 'unset', cursor: 'pointer', padding: '4px 12px', borderRadius: 999,
              fontFamily: 'JetBrains Mono', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
              background: side === s ? 'var(--accent)' : 'transparent',
              color: side === s ? 'var(--on-accent)' : 'var(--text-3)'
            }}>{s.toUpperCase()}</button>
            )}
          </div>
        </div>
        <div className="card" style={{ padding: 8, marginBottom: 12 }}>
          {BodyMap &&
          <BodyMap side={side} intensity={intensity} picked={null} onPick={() => {}}
            data={data} labels={MUSCLE_LABELS || {}} heatColor="var(--accent)" />}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 22 }}>
          {trainedLabels.map((l) =>
          <span key={l} className="chip chip-accent" style={{ fontSize: 9 }}>{l.toUpperCase()}</span>
          )}
        </div>

        <button className="btn-primary" style={{ width: '100%', marginBottom: 8 }} onClick={() => go('progress')}>
          VIEW FULL PROGRESS
        </button>
        <button className="btn-ghost" style={{ width: '100%' }} onClick={() => go('dashboard')}>
          BACK TO HOME
        </button>
      </div>
    </div>);

}

function SCKpi({ label, value, unit }) {
  return (
    <div className="card" style={{ padding: '10px 12px' }}>
      <div className="label" style={{ marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span className="h-bold" style={{ fontSize: 20, color: 'var(--accent)', lineHeight: 1 }}>{value}</span>
        {unit && <span className="mono" style={{ fontSize: 9, color: 'var(--text-3)' }}>{unit}</span>}
      </div>
    </div>);
}

// Cute little icon per training phase (rendered inside the phase-strip hex).
const PHASE_ICON = {
  pulse:    (s) => <IconFlame size={s} />,
  banded:   (s) => <IconBand size={s} />,
  main:     (s) => <IconDumbbell size={s} />,
  cooldown: (s) => <IconLeaf size={s} />,
  _default: (s) => <IconActivity size={s} />
};

const SECTION_BLURB = {
  banded: 'Glutes fired and hips open — now load the pattern with banded activation and pre-stretches before your main lifts.',
  main: 'Primed and warm. Time for the working sets — control the tempo, chase quality reps, and stop at your target RPE.',
  cooldown: 'Heavy lifting done. Bring the heart rate down and lengthen everything you just trained with slow, nasal breathing.'
};


function AlternativesSheet({ ex, onClose, onPick }) {
  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 60,
      background: 'rgba(7,7,12,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-end'
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxHeight: '80%',
        background: 'var(--bg-1)',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        border: '1px solid var(--line-strong)',
        borderBottom: 0,
        padding: '12px 16px 28px',
        animation: 'slideUp .25s ease',
        overflow: 'auto'
      }}>
        {/* Drag handle */}
        <div style={{ width: 36, height: 4, background: 'var(--line-strong)', borderRadius: 2, margin: '0 auto 14px' }} />

        <div className="label">// SWAP EXERCISE</div>
        <div className="h-bold" style={{ fontSize: 18, marginTop: 4, marginBottom: 14 }}>
          ALTERNATIVES FOR {ex.name.toUpperCase()}
        </div>

        {/* Currently selected */}
        <div style={{
          padding: 12, borderRadius: 10, marginBottom: 12,
          background: 'var(--accent-soft)',
          border: '1px solid var(--accent)',
          display: 'flex', alignItems: 'center', gap: 12
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 8, flexShrink: 0,
            background: `url('${ex.img}') center/cover, var(--bg-3)`
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{ex.name}</div>
            <div className="mono" style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.1em', marginTop: 2 }}>
              CURRENT · {ex.target.toUpperCase()}
            </div>
          </div>
          <span className="chip chip-accent">● SELECTED</span>
        </div>

        <div className="label" style={{ margin: '0 4px 8px' }}>// OPTIONS</div>
        {(() => {
          // Offer the original (to revert) + coach alternates, minus the current pick.
          const opts = [{ name: ex.base?.name || ex.name, img: ex.base?.img || ex.img, target: '', reason: 'Original', _orig: true },
            ...(ex.alternatives || [])].filter(o => o.name !== ex.name);
          if (opts.length === 0) return <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', padding: '4px 4px 10px' }}>No alternates set for this exercise.</div>;
          return (
            <div style={{ display: 'grid', gap: 8 }}>
              {opts.map((alt, i) =>
              <button key={i} onClick={() => onPick(alt)} style={{ all: 'unset', cursor: 'pointer', display: 'block' }}>
                <div className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 8, flexShrink: 0, background: alt.img ? `url('${alt.img}') center/cover, var(--bg-3)` : 'var(--bg-3)', border: '1px solid var(--line)' }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{alt.name}</div>
                    <div className="mono" style={{ fontSize: 9, color: alt._orig ? 'var(--accent)' : 'var(--text-3)', letterSpacing: '0.08em', marginTop: 2 }}>
                      {alt._orig ? 'ORIGINAL' : 'ALTERNATE'}
                    </div>
                  </div>
                  <IconChevronRight size={14} style={{ color: 'var(--text-3)' }} />
                </div>
              </button>
              )}
            </div>
          );
        })()}

        <button onClick={onClose} className="btn-ghost" style={{ width: '100%', marginTop: 14 }}>
          KEEP CURRENT
        </button>
      </div>
    </div>);

}

// Everfit-style set-type metadata
const SET_TYPE = {
  WARMUP: { letter: 'W', label: 'WARM-UP', color: 'var(--c-amber)' },
  DROPSET: { letter: 'D', label: 'DROP SET', color: 'var(--c-blue)' },
  FAILURE: { letter: 'F', label: 'TO FAILURE', color: 'var(--c-coral)' },
  PARTIAL: { letter: 'P', label: 'PARTIAL REPS', color: 'var(--c-pink)' }
};

// Ordered list for the add-set type switcher
const ADD_SET_TYPES = [
{ kind: undefined, label: 'Regular', color: 'var(--accent)' },
{ kind: 'WARMUP', label: 'Warm-up', color: 'var(--c-amber)' },
{ kind: 'DROPSET', label: 'Drop set', color: 'var(--c-blue)' },
{ kind: 'FAILURE', label: 'Failure', color: 'var(--c-coral)' },
{ kind: 'PARTIAL', label: 'Partial reps', color: 'var(--c-pink)' }];


function addSetBtnStyle(c) {
  return {
    flex: '1 1 auto', minWidth: 64,
    padding: '7px 8px', borderRadius: 7,
    background: `color-mix(in srgb, ${c} 10%, transparent)`,
    border: `1px solid color-mix(in srgb, ${c} 38%, transparent)`,
    color: c, cursor: 'pointer',
    fontFamily: 'JetBrains Mono', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
    textTransform: 'uppercase'
  };
}

// Single "ADD SET" button — adds a plain set. Change a set's status by
// tapping its number/letter badge in the row.
function AddSetControl({ onAdd }) {
  return (
    <div style={{ padding: '10px 12px', borderTop: '1px dashed var(--line-strong)' }}>
      <button onClick={() => onAdd()} style={{
        width: '100%', padding: '10px 12px', borderRadius: 8,
        background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
        border: '1px solid color-mix(in srgb, var(--accent) 38%, transparent)',
        color: 'var(--accent)', cursor: 'pointer',
        fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
        textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6
      }}>
        <IconPlus size={13} /> Add Set
      </button>
    </div>);

}

// Set badge — hex showing the working-set number (regular) or the type
// letter (W/D/F/P). Tapping it opens a picker to change the set's status.
function SetTypeBadge({ set, setNum, onKind }) {
  const [open, setOpen] = React.useState(false);
  const type = SET_TYPE[set.kind];
  const color = type ? type.color : 'var(--text-2)';
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen((o) => !o)} aria-label="Change set type" style={{
        all: 'unset', cursor: 'pointer', display: 'grid', placeItems: 'center'
      }}>
        <Hex size={26} square className="mono" style={{
          background: type ? `color-mix(in srgb, ${type.color} 20%, transparent)` : 'color-mix(in srgb, var(--text-3) 14%, transparent)',
          border: type ? 'none' : '1px solid var(--line-strong)',
          color: color, fontSize: 11, fontWeight: 800
        }}>{type ? type.letter : String(setNum)}</Hex>
      </button>

      {open &&
      <>
        {/* Fixed scrim + centered sheet — escapes the card's overflow clip so it's always visible/scrollable */}
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(7,7,12,0.55)', backdropFilter: 'blur(2px)' }} />
        <div style={{
          position: 'fixed', zIndex: 61, left: '50%', top: '50%', transform: 'translate(-50%, -50%)',
          width: 230, maxHeight: '76%', overflowY: 'auto',
          padding: 8, borderRadius: 14,
          background: 'var(--bg-3)', border: '1px solid var(--line-strong)',
          boxShadow: '0 18px 44px rgba(0,0,0,0.55)'
        }}>
          <div className="label" style={{ padding: '6px 8px 10px' }} data-comment-anchor="f8a87b5317-div-667-11">// SET STATUS</div>
          <div style={{ display: 'grid', gap: 4 }}>
            {ADD_SET_TYPES.map((t) => {
              const sel = (set.kind || undefined) === t.kind;
              return (
                <button key={t.label} onClick={() => {onKind(t.kind);setOpen(false);}} style={{
                  all: 'unset', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 10px', borderRadius: 9,
                  background: sel ? `color-mix(in srgb, ${t.color} 16%, transparent)` : 'transparent',
                  border: sel ? `1px solid color-mix(in srgb, ${t.color} 45%, transparent)` : '1px solid transparent'
                }}>
                  <Hex size={22} square className="mono" style={{
                    background: `color-mix(in srgb, ${t.color} 20%, transparent)`,
                    color: t.color, fontSize: 11, fontWeight: 800
                  }}>{t.kind ? SET_TYPE[t.kind].letter : '#'}</Hex>
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, letterSpacing: '0.04em' }}>
                    {t.label}
                  </span>
                  {sel && <IconCheck size={13} sw={3} style={{ marginLeft: 'auto', color: t.color }} />}
                </button>);
            })}
          </div>
        </div>
      </>}
    </div>);

}

// ── SET ROW ──────────────────────────────────────────────────────
function LogSetRow({ idx, setNum, set, color = 'var(--lime)', banded, onComplete, onReps, onKg, onBand, onRpe, onKind }) {
  if (!set) return null;
  const type = SET_TYPE[set.kind];
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '32px 1fr 1fr 56px 36px', gap: 8,
      padding: '10px 14px', alignItems: 'center',
      background: set.active ? 'rgba(70,187,192,0.05)' : type ? `color-mix(in srgb, ${type.color} 6%, transparent)` : 'transparent',
      borderTop: '1px solid var(--line)',
      position: 'relative'
    }}>
      {set.active && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: 'var(--accent)', boxShadow: '0 0 calc(8px * var(--glow)) var(--accent-glow)' }} />}
      <SetTypeBadge set={set} setNum={setNum} onKind={onKind} />
      {banded ?
      <BandCell band={set.band} done={set.done} onChange={onBand} /> :
      set.kg != null ?
      <NumCell value={set.kg} suffix="kg" done={set.done} onChange={onKg} /> :
      <span className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.08em', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            {set.time ? <><IconTimer size={11} />TIMED</> : 'BW'}
          </span>}
      {set.time ?
      <TimeCell value={set.reps} done={set.done} onChange={onReps} /> :
      <RepsCell set={set} onChange={onReps} />}
      <RpeCell value={set.rpe} done={set.done} onChange={onRpe} />
      <button onClick={onComplete} aria-label="Complete set" style={{
        all: 'unset', cursor: 'pointer',
        width: 30, height: 30, display: 'grid', placeItems: 'center'
      }}>
        <Hex size={26} square style={{
          background: set.done ? color : 'transparent',
          border: '1.5px solid ' + (set.done ? color : 'var(--line-strong)'),
          color: set.done ? 'var(--on-accent)' : 'var(--tick-idle)',
          boxShadow: set.done ? `0 0 calc(7px * var(--glow)) color-mix(in srgb, ${color} 55%, transparent)` : 'none'
        }}>
          <IconCheck size={13} sw={3} />
        </Hex>
      </button>
    </div>);

}

// Band selector for the client log — tap to pick a band colour.
function BandCell({ band, done, onChange }) {
  const [open, setOpen] = React.useState(false);
  const b = bandOf(band);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        all: 'unset', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 6px', borderRadius: 7, border: '1px solid var(--line-strong)', background: 'var(--bg-2)',
        opacity: done ? 0.7 : 1, maxWidth: '100%', boxSizing: 'border-box',
      }}>
        {b
          ? <><span style={{ width: 14, height: 14, borderRadius: 4, background: b.color, border: '1px solid rgba(255,255,255,0.35)', flexShrink: 0 }}/><span className="mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>{b.short}</span></>
          : <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 700 }}>PICK BAND</span>}
        <span style={{ color: 'var(--text-3)', fontSize: 9 }}>▾</span>
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 30 }}/>
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 31, minWidth: 150,
            background: 'var(--bg-3)', border: '1px solid var(--line-strong)', borderRadius: 10, padding: 6,
            boxShadow: '0 8px 28px rgba(0,0,0,0.5)', display: 'grid', gap: 2 }}>
            {BANDS.map(opt => (
              <button key={opt.key} onClick={() => { onChange(opt.key); setOpen(false); }} style={{
                all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 9px', borderRadius: 7,
                background: band === opt.key ? 'var(--bg-2)' : 'transparent',
              }}>
                <span style={{ width: 16, height: 16, borderRadius: 4, background: opt.color, border: '1px solid rgba(255,255,255,0.35)', flexShrink: 0 }}/>
                <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)' }}>{opt.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RepsCell({ set, onChange }) {
  if (typeof set.reps === 'string') {
    return (
      <div className="mono" style={{
        fontSize: 13, fontWeight: 600,
        color: set.done ? 'var(--text-3)' : 'var(--text)',
        letterSpacing: '0.04em',
        textDecoration: set.done ? 'line-through' : 'none'
      }}>
        {set.reps}
      </div>);

  }
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <input value={set.reps || ''} onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      style={{
        width: '100%', background: 'transparent', border: 0,
        color: set.done ? 'var(--text-2)' : 'var(--text)',
        fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 600,
        letterSpacing: '0.04em', outline: 'none',
        textDecoration: set.done ? 'line-through' : 'none',
        textDecorationColor: 'var(--text-3)'
      }} />
      
    </div>);

}

function NumCell({ value, suffix, done, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
      <input value={value || ''} onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      style={{
        width: '100%', background: 'transparent', border: 0,
        color: done ? 'var(--text-2)' : 'var(--text)',
        fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 600,
        letterSpacing: '0.04em', outline: 'none',
        textDecoration: done ? 'line-through' : 'none',
        textDecorationColor: 'var(--text-3)'
      }} />
      
      {suffix && <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)' }}>{suffix}</span>}
    </div>);

}

// Parse a stored time value ("60s" / "5 min" / "01:00" / "90") to seconds.
function parseTimeToSeconds(value) {
  const str = String(value || '').trim();
  let m;
  if ((m = str.match(/^(\d+):(\d{1,2})$/))) return (+m[1]) * 60 + (+m[2]);
  if (/min/i.test(str)) return Math.round(parseFloat(str) * 60) || 0;
  if ((m = str.match(/^([\d.]+)\s*s?$/i))) return Math.round(parseFloat(m[1])) || 0;
  return parseInt(str, 10) || 0;
}
function formatMMSS(secs) {
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Editable time field — always displays/edits in MM:SS (stopwatch style).
function TimeCell({ value, done, onChange }) {
  const display = formatMMSS(parseTimeToSeconds(value));
  const onInput = (e) => {
    // Treat typed digits as a right-to-left stopwatch entry: last 4 digits = MMSS.
    const digits = e.target.value.replace(/\D/g, '').slice(-4).padStart(3, '0');
    const ss = digits.slice(-2);
    const mm = digits.slice(0, -2);
    onChange(`${String(parseInt(mm, 10)).padStart(2, '0')}:${ss}`);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <IconTimer size={11} style={{ color: 'var(--text-3)', flexShrink: 0 }} />
      <input value={display} inputMode="numeric" onChange={onInput}
      style={{
        width: '100%', minWidth: 0, background: 'transparent', border: 0,
        color: done ? 'var(--text-2)' : 'var(--text)',
        fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 600,
        letterSpacing: '0.06em', outline: 'none',
        textDecoration: done ? 'line-through' : 'none',
        textDecorationColor: 'var(--text-3)'
      }} />
    </div>);

}

// Difficulty — a 4-level rating: Light · Moderate · Challenging · Intense.
// Stored as 1-4. Tapping the cell opens a 4-segment picker.
const RPE_LEVELS = [
  { n: 1, label: 'LIGHT',       color: 'var(--text-3)' },
  { n: 2, label: 'MODERATE',    color: 'var(--accent)' },
  { n: 3, label: 'CHALLENGING', color: 'var(--c-amber)' },
  { n: 4, label: 'INTENSE',     color: 'var(--c-coral)' }
];
const RPE_COLOR = (v) => (RPE_LEVELS.find((l) => l.n === v) || {}).color || 'var(--text-3)';
const RPE_LABEL = (v) => (RPE_LEVELS.find((l) => l.n === v) || {}).label || '';

function RpeCell({ value, done, onChange }) {
  const [open, setOpen] = React.useState(false);
  const color = value == null ? 'var(--text-3)' : RPE_COLOR(value);
  const short = value == null ? '—' : RPE_LABEL(value).slice(0, 3);

  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'flex-start' }}>
      <button onClick={() => setOpen((o) => !o)} className="mono" style={{
        background: value == null ? 'transparent' : `color-mix(in srgb, ${color} 14%, transparent)`,
        border: '1px solid ' + (value == null ? 'var(--line-strong)' : `color-mix(in srgb, ${color} 50%, transparent)`),
        borderStyle: value == null ? 'dashed' : 'solid',
        color: value == null ? 'var(--text-3)' : done ? 'var(--text-3)' : color,
        borderRadius: 7, padding: '4px 7px', minWidth: 30,
        fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 3
      }}>
        {short}
        <IconChevronRight size={9} style={{ transform: 'rotate(90deg)', opacity: 0.6 }} />
      </button>

      {open &&
      <>
        {/* tap-away scrim */}
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
        <div style={{
          position: 'absolute', zIndex: 41, right: 0, bottom: 'calc(100% + 8px)',
          width: 184, padding: 12, borderRadius: 12,
          background: 'var(--bg-3)', border: '1px solid var(--line-strong)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.45)'
        }}>
          <div style={{ marginBottom: 8 }}>
            <span className="label">// DIFFICULTY</span>
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            {RPE_LEVELS.map((lvl) => {
              const sel = value === lvl.n;
              return (
                <button key={lvl.n} onClick={() => {onChange(lvl.n);setOpen(false);}}
                style={{
                  all: 'unset', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '8px 10px', borderRadius: 8,
                  background: sel ? `color-mix(in srgb, ${lvl.color} 18%, transparent)` : 'transparent',
                  border: '1px solid ' + (sel ? `color-mix(in srgb, ${lvl.color} 50%, transparent)` : 'transparent')
                }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: lvl.color, flexShrink: 0, boxShadow: sel ? `0 0 6px ${lvl.color}` : 'none' }} />
                  <span className="mono" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: sel ? lvl.color : 'var(--text-2)' }}>{lvl.label}</span>
                  {sel && <IconCheck size={12} sw={3} style={{ marginLeft: 'auto', color: lvl.color }} />}
                </button>);
            })}
          </div>
        </div>
      </>}
    </div>);

}

function RestRing({ seconds, total }) {
  const r = 24;const c = 2 * Math.PI * r;
  const pct = total ? seconds / total : 0;
  return (
    <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="color-mix(in srgb, var(--accent-2) 20%, transparent)" strokeWidth="5" />
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--accent-2)" strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 28 28)"
        style={{ filter: 'drop-shadow(0 0 calc(5px * var(--glow)) color-mix(in srgb, var(--accent-2) 60%, transparent))', transition: 'stroke-dashoffset 1s linear' }} />
      </svg>
      <span className="mono" style={{
        position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
        fontSize: 14, fontWeight: 700, color: 'var(--accent-2)'
      }} data-comment-anchor="dd98036798-span-794-7">{seconds}</span>
    </div>);

}

function actionBtnStyle() {
  return {
    all: 'unset', cursor: 'pointer',
    flex: 1, textAlign: 'center',
    padding: '9px 10px', borderRadius: 8,
    border: '1px solid var(--line-strong)',
    background: 'var(--bg-2)',
    color: 'var(--text-2)',
    fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4
  };
}

// ── PRIOR PROGRESS SHEET ──────────────────────────────────────────
// Shows past sessions for this exercise (all sets), like the exercise
// breakdown in Progress. Prior data is synthesised from the current
// set scheme with a gentle downward ramp into the past.
function PriorProgressSheet({ ex, onClose }) {
  const sessions = React.useMemo(() => buildPriorSessions(ex), [ex.id, ex.name]);
  const isWeighted = ex.sets.some((s) => s.kg != null);
  // Best top-set per session for the mini trend
  const trend = sessions.map((s) => s.top).reverse();

  return (
    <div onClick={onClose} style={{
      position: 'absolute', inset: 0, zIndex: 60,
      background: 'rgba(7,7,12,0.7)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'flex-end'
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxHeight: '82%',
        background: 'var(--bg-1)',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        border: '1px solid var(--line-strong)', borderBottom: 0,
        padding: '12px 16px 28px',
        animation: 'slideUp .25s ease', overflow: 'auto'
      }}>
        <div style={{ width: 36, height: 4, background: 'var(--line-strong)', borderRadius: 2, margin: '0 auto 14px' }} />

        <div className="label">// PRIOR PROGRESS</div>
        <div className="h-bold" style={{ fontSize: 18, marginTop: 4, marginBottom: 4 }}>
          {ex.name.toUpperCase()}
        </div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.08em', marginBottom: 14 }}>
          LAST {sessions.length} SESSIONS
        </div>

        {/* Trend line */}
        {isWeighted &&
        <div className="card" style={{ padding: 12, marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span className="label">// TOP SET (KG)</span>
            <span className="mono" style={{ fontSize: 11, color: '#189CAA', fontWeight: 600 }}>
              ▲ {trend[trend.length - 1] - trend[0]}kg
            </span>
          </div>
          <MiniLine data={trend} color="var(--accent)" />
        </div>
        }

        {/* Sessions */}
        <div style={{ display: 'grid', gap: 8 }}>
          {sessions.map((sess, i) =>
          <div key={i} className="card" style={{ padding: 12,
            borderColor: i === 0 ? 'color-mix(in srgb, var(--accent) 40%, var(--line))' : 'var(--line)'
          }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span className="mono" style={{ fontSize: 11, color: 'var(--text)', letterSpacing: '0.06em', fontWeight: 700 }}>
                  {sess.date.toUpperCase()}
                  {i === 0 && <span style={{ marginLeft: 8, color: 'var(--accent)', fontSize: 9, letterSpacing: '0.1em' }}>LAST TIME</span>}
                </span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em' }}>
                  {sess.sets.length} SETS
                </span>
              </div>
              <div style={{ display: 'grid', gap: 2 }}>
                {(() => { let wn = 0; return sess.sets.map((s, si) => {
                  if (!s.warmup) wn += 1;
                  return (
              <div key={si} style={{
                display: 'grid', gridTemplateColumns: '20px 1fr', gap: 10, alignItems: 'center',
                padding: '5px 2px',
                borderTop: si === 0 ? 'none' : '1px solid color-mix(in srgb, var(--line) 60%, transparent)'
              }}>
                <span className="mono" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: s.warmup ? 'var(--text-3)' : 'var(--accent)' }}>
                  {s.warmup ? 'W' : wn}
                </span>
                <span className="mono" style={{ fontSize: 12.5, fontWeight: 600, color: s.warmup ? 'var(--text-3)' : 'var(--text)' }}>
                  {s.label}
                </span>
              </div>);
                }); })()}
              </div>
            </div>
          )}
        </div>

        <button onClick={onClose} className="btn-ghost" style={{ width: '100%', marginTop: 14 }}>
          CLOSE
        </button>
      </div>
    </div>);

}

// Build believable past sessions for an exercise from its current set scheme.
function buildPriorSessions(ex) {
  const dates = ['4 days ago', '8 days ago', '12 days ago'];
  const baseKg = (() => {
    const w = ex.sets.find((s) => s.kg != null);
    return w ? w.kg : null;
  })();
  const baseReps = (() => {
    const r = ex.sets.find((s) => typeof s.reps === 'number');
    return r ? r.reps : null;
  })();
  const round = (x) => Math.round(x / 2.5) * 2.5;
  return dates.map((date, di) => {
    const drop = (di + 1) * 0.05; // ~5% lighter each session back
    const sets = ex.sets.map((s) => {
      if (s.kg != null) {
        const kg = round(s.kg * (1 - drop));
        const reps = typeof s.reps === 'number' ? s.reps : s.reps;
        return { warmup: s.kind === 'WARMUP', label: `${kg}kg × ${reps}` };
      }
      if (s.time) return { warmup: false, label: formatMMSS(parseTimeToSeconds(s.reps)) };
      const reps = typeof s.reps === 'number' ? Math.max(1, s.reps - di) : s.reps;
      return { warmup: false, label: `${reps}${s.perSide ? '/side' : ' reps'}` };
    });
    const top = baseKg != null ? round(baseKg * (1 - drop)) : baseReps != null ? Math.max(1, baseReps - di) : 0;
    return { date, sets, top };
  });
}

// ── SESSION RESULTS (standalone) ─────────────────────────────────
// Loads the most recent completed session for a programme day and
// renders the results screen from the real logged sets.
export function SessionResults({ dayId, userId, go, onClose }) {
  const [state, setState] = React.useState(null); // null=loading, 'none', or { exercises, sessionTime }

  React.useEffect(() => {
    if (!dayId || !userId) { setState('none'); return; }
    supabase
      .from('workout_sessions')
      .select('id, started_at, completed_at, logged_sets ( exercise_id, set_index, actual_reps, actual_weight_kg, actual_time_secs, section_exercises ( id, name, workout_sections ( kind ) ) )')
      .eq('client_id', userId)
      .eq('day_id', dayId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) { setState('none'); return; }
        const KIND_TO_PHASE = { PULSE_RAISER: 'pulse', BANDED: 'banded', MAIN: 'main', COOLDOWN: 'cooldown' };
        const exMap = new Map();
        [...(data.logged_sets || [])]
          .sort((a, b) => a.set_index - b.set_index)
          .forEach((ls) => {
            const se = ls.section_exercises;
            if (!se) return;
            if (!exMap.has(se.id)) exMap.set(se.id, {
              id: se.id, name: se.name,
              phase: KIND_TO_PHASE[se.workout_sections?.kind] || 'main',
              sets: [],
            });
            exMap.get(se.id).sets.push({
              reps: ls.actual_time_secs ? `${ls.actual_time_secs}s` : (ls.actual_reps ?? 0),
              kg: ls.actual_weight_kg ? parseFloat(ls.actual_weight_kg) : null,
              done: true,
              time: !!ls.actual_time_secs,
            });
          });
        const sessionTime = Math.max(0, Math.round((new Date(data.completed_at) - new Date(data.started_at)) / 1000));
        setState({ exercises: [...exMap.values()], sessionTime });
      });
  }, [dayId, userId]);

  if (state === null) return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--bg-1)' }}>
      <div className="mono" style={{ fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.2em' }}>LOADING RESULTS…</div>
    </div>
  );

  if (state === 'none' || state.exercises.length === 0) return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--bg-1)', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: 11, color: 'var(--text-3)', letterSpacing: '0.12em', lineHeight: 1.8, marginBottom: 18 }}>
          NO LOGGED RESULTS FOUND<br/>
          <span style={{ fontSize: 9 }}>This workout was marked complete without logged sets</span>
        </div>
        <button className="btn-ghost" onClick={onClose || (() => go('dashboard'))}>BACK</button>
      </div>
    </div>
  );

  return <SessionComplete exercises={state.exercises} sessionTime={state.sessionTime} go={go} onClose={onClose}/>;
}