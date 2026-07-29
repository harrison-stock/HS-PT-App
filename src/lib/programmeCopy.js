import { supabase } from './supabase'

// Deep-copies a programme: phases → days → sections → exercises → sets.
//
// Two things matter here that the original inline version got wrong.
//
// Completeness. Every column added since the schema was first written has to be
// carried across, or a duplicate quietly comes out different from its source.
// Supersets, banded/each-side flags, rep text like "8-10", band levels, cover
// photos, section slide text and icons all live in columns added by later
// migrations, and all of them were being dropped.
//
// Round trips. Copying one row at a time means a 12-week programme costs
// hundreds of sequential requests and takes minutes. Each level is inserted in
// a single batched call and then read back by its natural key, so the whole
// copy is a fixed handful of queries per phase no matter how big it is.

// Read the copied rows back and index them by a stable natural key. Insertion
// order would usually be fine, but a data-copy shouldn't depend on "usually".
const indexBy = (rows, keyFn) => {
  const m = new Map();
  (rows || []).forEach(r => m.set(keyFn(r), r));
  return m;
};

// Some installs may not have run every migration. Try the full row, and on a
// schema error retry without the columns that arrived late, so a duplicate
// still succeeds (minus that field) rather than failing outright.
async function insertRows(table, rows, lateColumns = []) {
  if (!rows.length) return { data: [] };
  const { data, error } = await supabase.from(table).insert(rows).select();
  if (!error) return { data };
  if (!lateColumns.length) return { error };
  const trimmed = rows.map(r => {
    const copy = { ...r };
    lateColumns.forEach(c => delete copy[c]);
    return copy;
  });
  const retry = await supabase.from(table).insert(trimmed).select();
  return retry.error ? { error: retry.error } : { data: retry.data };
}

// Full nested read of a single day - everything needed to reproduce it exactly.
const DAY_SELECT = '*, workout_sections(*, section_exercises(*, exercise_sets(*)))';

// Copy one day's contents into a target (phase, week, weekday) slot, replacing
// whatever is there. Shared by the programme duplicate and the master planner's
// copy-to-other-days, so both stay complete as the schema grows.
async function writeDayInto(src, target) {
  let { data: dayRow } = await supabase
    .from('programme_days')
    .upsert({
      phase_id: target.phaseId, week_index: target.week, day_of_week: target.dow,
      intro: src.intro || '', notes: src.notes || '',
      title: src.title ?? null, image_url: src.image_url ?? null,
    }, { onConflict: 'phase_id,week_index,day_of_week' })
    .select('id').single();
  // Retry without the columns added by later migrations.
  if (!dayRow) {
    ({ data: dayRow } = await supabase
      .from('programme_days')
      .upsert({
        phase_id: target.phaseId, week_index: target.week, day_of_week: target.dow,
        intro: src.intro || '', notes: src.notes || '',
      }, { onConflict: 'phase_id,week_index,day_of_week' })
      .select('id').single());
  }
  if (!dayRow) throw new Error('Could not write the target day');

  // Replace rather than merge - the target should end up identical to the source.
  await supabase.from('workout_sections').delete().eq('day_id', dayRow.id);

  const secs = [...(src.workout_sections || [])].sort((a, b) => a.sort_order - b.sort_order);
  if (!secs.length) return;

  const { data: newSecs, error: sErr } = await insertRows('workout_sections',
    secs.map((s, i) => ({
      day_id: dayRow.id, kind: s.kind, title: s.title, sort_order: i,
      intro: s.intro || '', icon: s.icon || '',
    })),
    ['intro', 'icon'],
  );
  if (sErr) throw new Error(sErr.message);
  const secByOrder = indexBy(newSecs, r => r.sort_order);

  const exRows = [];
  const exSrc = [];
  secs.forEach((s, si) => {
    const newSecId = secByOrder.get(si)?.id;
    if (!newSecId) return;
    const exs = [...(s.section_exercises || [])].sort((a, b) => a.sort_order - b.sort_order);
    exs.forEach((e, i) => {
      exRows.push({
        section_id: newSecId, name: e.name, img_url: e.img_url,
        timed: !!e.timed, banded: !!e.banded, unilateral: !!e.unilateral,
        load_split: e.load_split ?? 1,
        tempo: e.tempo || '', coach_notes: e.coach_notes || '',
        superset_group: e.superset_group ?? null, alternates: e.alternates || [],
        sort_order: i,
      });
      exSrc.push({ src: e, secId: newSecId, sort: i });
    });
  });
  if (!exRows.length) return;

  const { data: newExs, error: eErr } = await insertRows('section_exercises', exRows,
    ['banded', 'unilateral', 'superset_group', 'alternates', 'load_split']);
  if (eErr) throw new Error(eErr.message);
  const exByKey = indexBy(newExs, r => `${r.section_id}:${r.sort_order}`);

  const setRows = [];
  for (const { src: e, secId, sort } of exSrc) {
    const newExId = exByKey.get(`${secId}:${sort}`)?.id;
    if (!newExId) continue;
    [...(e.exercise_sets || [])].sort((a, b) => a.set_index - b.set_index).forEach(st => {
      setRows.push({
        exercise_id: newExId, set_index: st.set_index, kind: st.kind,
        reps: st.reps, reps_text: st.reps_text || '',
        weight_kg: st.weight_kg, band: st.band ?? null,
        rest_secs: st.rest_secs, time_secs: st.time_secs, intensity: st.intensity,
      });
    });
  }
  if (!setRows.length) return;
  const { error: stErr } = await insertRows('exercise_sets', setRows, ['reps_text', 'band']);
  if (stErr) throw new Error(stErr.message);
}

/**
 * Copy a saved day into any number of (phase, week, weekday) slots.
 * targets: [{ phaseId, week, dow }]. Returns { count } or { error }.
 *
 * The source is re-read in full rather than trusting whatever the caller had
 * loaded, so a screen with a narrow select can still produce an exact copy.
 */
export async function copyDayToSlots(sourceDayId, targets) {
  const { data: src, error } = await supabase
    .from('programme_days').select(DAY_SELECT).eq('id', sourceDayId).single();
  if (error || !src) return { error: error || { message: 'Could not read the source day' } };

  const list = targets.filter(t =>
    !(t.phaseId === src.phase_id && t.week === src.week_index && t.dow === src.day_of_week));

  try {
    for (const t of list) await writeDayInto(src, t);
    return { count: list.length };
  } catch (e) {
    return { error: { message: e.message || 'Copy failed' } };
  }
}

export async function duplicateProgramme(trainerId, prog) {
  const { data: newProg, error: pErr } = await supabase
    .from('programmes')
    .insert({
      trainer_id: trainerId,
      name: `${prog.name} (Copy)`,
      tag: prog.tag,
      is_adhoc: !!prog.is_adhoc,
      status: 'active',
    })
    .select('id').single();
  if (pErr || !newProg) return { error: pErr || { message: 'Could not create the programme' } };

  const phases = [...(prog.phaseList || [])].filter(ph => ph.id);

  for (let pi = 0; pi < phases.length; pi++) {
    const ph = phases[pi];

    const { data: phaseRows, error: phErr } = await insertRows('programme_phases', [{
      programme_id: newProg.id, phase_index: pi,
      name: ph.name, focus: ph.focus, weeks: ph.weeks,
      image_url: ph.image_url ?? ph.imageUrl ?? null,
    }], ['image_url']);
    if (phErr) return { error: phErr };
    const newPhaseId = phaseRows[0]?.id;
    if (!newPhaseId) continue;

    const { data: days } = await supabase
      .from('programme_days')
      .select('*, workout_sections(*, section_exercises(*, exercise_sets(*)))')
      .eq('phase_id', ph.id);
    if (!days || !days.length) continue;

    // ── Days ──
    const { data: newDays, error: dErr } = await insertRows('programme_days',
      days.map(d => ({
        phase_id: newPhaseId,
        week_index: d.week_index,
        day_of_week: d.day_of_week,
        intro: d.intro || '',
        notes: d.notes || '',
        title: d.title ?? null,
        image_url: d.image_url ?? null,
      })),
      ['title', 'image_url'],
    );
    if (dErr) return { error: dErr };
    // (phase_id, week_index, day_of_week) is unique by table constraint.
    const dayByKey = indexBy(newDays, r => `${r.week_index}:${r.day_of_week}`);

    // ── Sections ──
    // sort_order is reassigned from position so it's dense and unique within a
    // day, which is what makes it usable as the lookup key below.
    const sectionRows = [];
    const sectionSrc = [];
    for (const d of days) {
      const newDayId = dayByKey.get(`${d.week_index}:${d.day_of_week}`)?.id;
      if (!newDayId) continue;
      const secs = [...(d.workout_sections || [])].sort((a, b) => a.sort_order - b.sort_order);
      secs.forEach((s, i) => {
        sectionRows.push({
          day_id: newDayId, kind: s.kind, title: s.title, sort_order: i,
          intro: s.intro || '', icon: s.icon || '',
        });
        sectionSrc.push({ src: s, dayId: newDayId, sort: i });
      });
    }
    const { data: newSections, error: sErr } = await insertRows('workout_sections', sectionRows, ['intro', 'icon']);
    if (sErr) return { error: sErr };
    const secByKey = indexBy(newSections, r => `${r.day_id}:${r.sort_order}`);

    // ── Exercises ──
    const exRows = [];
    const exSrc = [];
    for (const { src, dayId, sort } of sectionSrc) {
      const newSecId = secByKey.get(`${dayId}:${sort}`)?.id;
      if (!newSecId) continue;
      const exs = [...(src.section_exercises || [])].sort((a, b) => a.sort_order - b.sort_order);
      exs.forEach((e, i) => {
        exRows.push({
          section_id: newSecId, name: e.name, img_url: e.img_url,
          timed: !!e.timed, banded: !!e.banded, unilateral: !!e.unilateral,
          load_split: e.load_split ?? 1,
          tempo: e.tempo || '', coach_notes: e.coach_notes || '',
          superset_group: e.superset_group ?? null,
          alternates: e.alternates || [],
          sort_order: i,
        });
        exSrc.push({ src: e, secId: newSecId, sort: i });
      });
    }
    const { data: newExs, error: eErr } = await insertRows('section_exercises', exRows,
      ['banded', 'unilateral', 'superset_group', 'alternates', 'load_split']);
    if (eErr) return { error: eErr };
    const exByKey = indexBy(newExs, r => `${r.section_id}:${r.sort_order}`);

    // ── Sets ──
    const setRows = [];
    for (const { src, secId, sort } of exSrc) {
      const newExId = exByKey.get(`${secId}:${sort}`)?.id;
      if (!newExId) continue;
      const sets = [...(src.exercise_sets || [])].sort((a, b) => a.set_index - b.set_index);
      sets.forEach(st => {
        setRows.push({
          exercise_id: newExId, set_index: st.set_index, kind: st.kind,
          reps: st.reps, reps_text: st.reps_text || '',
          weight_kg: st.weight_kg, band: st.band ?? null,
          rest_secs: st.rest_secs, time_secs: st.time_secs, intensity: st.intensity,
        });
      });
    }
    const { error: stErr } = await insertRows('exercise_sets', setRows, ['reps_text', 'band']);
    if (stErr) return { error: stErr };
  }

  return { id: newProg.id };
}
