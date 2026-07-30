// Restoring a logged session onto the exercise sheet, for editing.
//
// Saving an edit rewrites the session's sets from whatever the sheet holds, so
// anything the sheet fails to show is destroyed. Rebuilding the sheet from the
// programme alone is not enough: during a session a client can add sets to an
// exercise and add exercises that were never prescribed, and neither has
// anywhere to land in a prescription-shaped sheet. Both were being dropped.
//
// Given the prescription rows and the stored session, this puts back all three:
// the prescribed sets, the extra sets, and the extra exercises. Pure, so it can
// be tested against the shapes that actually caused losses.

const nameKey = (n) => `name:${String(n || '').trim().toLowerCase()}`;
const keyOf = (ls) => ls.exercise_id || nameKey(ls.exercise_name);

// One logged row, applied over the set it corresponds to on the sheet.
function asSet(ls, base, formatMMSS) {
  return {
    ...base, done: true,
    reps: base.time ? formatMMSS(parseInt(ls.actual_time_secs) || 0) : (ls.actual_reps ?? base.reps),
    kg: base.time ? null : (ls.actual_weight_kg != null ? parseFloat(ls.actual_weight_kg) : base.kg),
    band: ls.actual_band ?? base.band,
    rpe: ls.intensity ? Math.round(ls.intensity / 2.5) : base.rpe,
  };
}

/**
 * @param rows        exercise rows built from the programme (mutated in place)
 * @param logged      the session's logged_sets
 * @param formatMMSS  seconds -> "mm:ss", for timed exercises
 * @returns the same array, with extra exercises appended
 */
export function restoreLoggedSession(rows, logged, formatMMSS) {
  const sets = logged || [];
  if (!sets.length) return rows;

  const byEx = {};
  sets.forEach(ls => { (byEx[keyOf(ls)] = byEx[keyOf(ls)] || {})[ls.set_index] = ls; });

  rows.forEach(ex => {
    const m = byEx[ex.id] || byEx[nameKey(ex.name)];
    if (!m) return;
    const template = ex.sets[0] || { reps: '8', kg: null, done: false, active: false, rpe: null };
    // Sets the client added run past the end of the prescription.
    const highest = Math.max(ex.sets.length - 1, ...Object.keys(m).map(Number));
    const out = [];
    for (let i = 0; i <= highest; i++) {
      const base = ex.sets[i] || { ...template, kind: undefined, done: false, active: false, rpe: null };
      out.push(m[i] ? asSet(m[i], base, formatMMSS) : base);
    }
    ex.sets = out;
  });

  // Exercises the client added mid-session have no prescription to match, so
  // rebuild a card for each from what was logged.
  const prescribedIds = new Set(rows.map(r => r.id));
  const prescribedNames = new Set(rows.map(r => nameKey(r.name)));
  const extras = {};
  sets.forEach(ls => {
    const k = keyOf(ls);
    if (prescribedIds.has(ls.exercise_id) || prescribedNames.has(k)) return;
    (extras[k] = extras[k] || { name: ls.exercise_name || 'Exercise', sets: {} }).sets[ls.set_index] = ls;
  });

  Object.entries(extras).forEach(([k, ex]) => {
    const idxs = Object.keys(ex.sets).map(Number).sort((a, b) => a - b);
    const timed = idxs.some(i => ex.sets[i].actual_time_secs != null);
    const base = { reps: '8', kg: null, band: null, perSide: false, done: false, active: false, rpe: null, ...(timed ? { time: true } : null) };
    rows.push({
      id: `logged:${k}`, name: ex.name, img: '',
      base: { name: ex.name, img: '' },
      banded: idxs.some(i => !!ex.sets[i].actual_band), unilateral: false, split: 1,
      phase: 'main', tempo: '', ss: null, rest: 60, coach: '',
      sets: Array.from({ length: idxs[idxs.length - 1] + 1 }, (_, i) =>
        ex.sets[i] ? asSet(ex.sets[i], base, formatMMSS) : { ...base }),
      alternatives: [],
    });
  });

  return rows;
}
