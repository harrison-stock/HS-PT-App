import { supabase } from './supabase'
import { muscleGroupsFor } from './muscleVolume'

// ── Programme performance reports ─────────────────────────────────────────────
// Sessions tie to a programme via day_id → programme_days → programme_phases →
// programmes. We compare the FIRST week vs the FINAL week of training to show
// strength progression, body-metric trends and which muscles grew the most.

const DAY = 86_400_000;
const dateOnly = (iso) => new Date(new Date(iso).toISOString().slice(0, 10));
// Epley estimated 1-rep-max - a fair single number to compare sets across weeks.
export const e1rm = (w, r) => (w > 0 && r > 0 ? w * (1 + r / 30) : 0);

// Programmes this client has actually logged sessions against, newest last.
export async function loadReportProgrammes(clientId) {
  const { data } = await supabase
    .from('workout_sessions')
    .select('completed_at, programme_days!inner ( programme_phases!inner ( programme_id, programmes!inner ( name, tag ) ) )')
    .eq('client_id', clientId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: true });

  const map = new Map();
  for (const s of (data || [])) {
    const p = s.programme_days?.programme_phases?.programmes;
    const id = s.programme_days?.programme_phases?.programme_id;
    if (!id || !p) continue;
    if (!map.has(id)) map.set(id, { id, name: p.name, tag: p.tag, sessions: 0, first: s.completed_at, last: s.completed_at });
    const e = map.get(id);
    e.sessions += 1;
    if (s.completed_at < e.first) e.first = s.completed_at;
    if (s.completed_at > e.last) e.last = s.completed_at;
  }
  return [...map.values()].sort((a, b) => (a.last < b.last ? 1 : -1));
}

// Build the full report for one programme.
export async function buildProgrammeReport(clientId, programmeId, nameMuscleMap) {
  const { data: sessions } = await supabase
    .from('workout_sessions')
    .select(`id, completed_at,
             programme_days!inner ( programme_phases!inner ( programme_id, name ) ),
             logged_sets ( actual_weight_kg, actual_reps, set_index, section_exercises ( name ) )`)
    .eq('client_id', clientId)
    .not('completed_at', 'is', null)
    .eq('programme_days.programme_phases.programme_id', programmeId)
    .order('completed_at', { ascending: true });

  const list = sessions || [];
  if (list.length < 2) {
    return { empty: true, sessionCount: list.length };
  }

  const earliest = dateOnly(list[0].completed_at);
  const latest = dateOnly(list[list.length - 1].completed_at);
  const spanDays = Math.round((latest - earliest) / DAY);

  // First/final week windows. If the programme is too short for two 7-day
  // windows that don't overlap, split it down the middle instead.
  let firstEnd = new Date(earliest); firstEnd.setDate(firstEnd.getDate() + 7);
  let finalStart = new Date(latest); finalStart.setDate(finalStart.getDate() - 7);
  if (finalStart <= firstEnd) {
    const mid = new Date(earliest.getTime() + (latest - earliest) / 2);
    firstEnd = mid; finalStart = mid;
  }
  const inFirst = (s) => dateOnly(s.completed_at) < firstEnd || +dateOnly(s.completed_at) === +earliest;
  const inFinal = (s) => dateOnly(s.completed_at) > finalStart || +dateOnly(s.completed_at) === +latest;

  const firstSessions = list.filter(inFirst);
  const finalSessions = list.filter(s => inFinal(s) && !inFirst(s));

  // ── Per-exercise best set in each window ──
  const collect = (sess) => {
    const ex = {}; // name → { bestE, weight, reps, volume }
    for (const s of sess) {
      for (const ls of (s.logged_sets || [])) {
        const name = (ls.section_exercises?.name || '').trim();
        if (!name) continue;
        const w = parseFloat(ls.actual_weight_kg) || 0;
        const r = ls.actual_reps || 0;
        if (!r) continue;
        const E = e1rm(w, r);
        if (!ex[name]) ex[name] = { name, bestE: 0, weight: 0, reps: 0, volume: 0, score: 0 };
        const o = ex[name];
        o.volume += Math.round(w * r);
        // "best" = top estimated 1RM; for bodyweight/timed work, fall back to reps.
        const score = E > 0 ? E : r;
        if (score > o.score) { o.score = score; o.bestE = E; o.weight = w; o.reps = r; }
      }
    }
    return ex;
  };
  const firstEx = collect(firstSessions);
  const finalEx = collect(finalSessions);

  const exercises = [];
  for (const name of Object.keys(finalEx)) {
    const a = firstEx[name];
    const b = finalEx[name];
    if (!a) continue; // need both windows to compare
    const weighted = a.bestE > 0 && b.bestE > 0;
    const before = weighted ? a.bestE : a.reps;
    const after = weighted ? b.bestE : b.reps;
    const pct = before > 0 ? ((after - before) / before) * 100 : 0;
    exercises.push({
      name, weighted,
      firstWeight: a.weight, firstReps: a.reps, firstE: a.bestE,
      finalWeight: b.weight, finalReps: b.reps, finalE: b.bestE,
      e1rmDelta: b.bestE - a.bestE,
      pct,
    });
  }
  exercises.sort((x, y) => y.pct - x.pct);

  // ── Muscle volume per window (first vs final) ──
  const vol = (sess) => {
    const g = {};
    for (const s of sess) {
      for (const ls of (s.logged_sets || [])) {
        const nm = (ls.section_exercises?.name || '').trim();
        const lower = nm.toLowerCase();
        const groups = (nameMuscleMap && nameMuscleMap[lower]) || muscleGroupsFor(nm);
        const w = parseFloat(ls.actual_weight_kg) || 0;
        const r = ls.actual_reps || 0;
        const kg = Math.round(w * r) || r; // bodyweight/timed → count reps as work
        for (const grp of groups) g[grp] = (g[grp] || 0) + kg;
      }
    }
    return g;
  };
  const firstVol = vol(firstSessions);
  const finalVol = vol(finalSessions);
  const groups = new Set([...Object.keys(firstVol), ...Object.keys(finalVol)]);
  const muscles = {};
  for (const grp of groups) {
    const a = firstVol[grp] || 0;
    const b = finalVol[grp] || 0;
    muscles[grp] = { first: a, final: b, delta: b - a, pct: a > 0 ? ((b - a) / a) * 100 : (b > 0 ? 100 : 0) };
  }

  // ── Body-metric trend across the programme window ──
  const { data: metricRows } = await supabase
    .from('body_metrics')
    .select('weight_kg, body_fat_pct, waist_cm, recorded_at')
    .eq('client_id', clientId)
    .gte('recorded_at', earliest.toISOString().slice(0, 10))
    .lte('recorded_at', new Date(latest.getTime() + DAY).toISOString().slice(0, 10))
    .order('recorded_at', { ascending: true });

  const metricSeries = (col) => (metricRows || []).map(m => m[col]).filter(v => v != null).map(Number);
  const metric = (col, unit) => {
    const s = metricSeries(col);
    if (!s.length) return null;
    return { start: s[0], end: s[s.length - 1], delta: +(s[s.length - 1] - s[0]).toFixed(1), series: s, unit };
  };

  return {
    empty: false,
    sessionCount: list.length,
    start: earliest.toISOString().slice(0, 10),
    end: latest.toISOString().slice(0, 10),
    spanDays,
    firstCount: firstSessions.length,
    finalCount: finalSessions.length,
    exercises,
    muscles,
    metrics: {
      weight: metric('weight_kg', 'kg'),
      bodyfat: metric('body_fat_pct', '%'),
      waist: metric('waist_cm', 'cm'),
    },
  };
}
