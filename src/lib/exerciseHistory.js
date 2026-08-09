import { supabase } from './supabase'
import { bandOf } from '../components/bands'

function formatMMSS(secs) {
  const s = parseInt(secs) || 0;
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// The last `limit` sessions in which a client logged a given movement, newest
// first, shaped for display.
//
// Query from the session side so the ordering and the limit apply to
// workout_sessions.completed_at, a top-level column. Reading logged_sets first
// meant slicing an arbitrary chunk of every set the client had ever logged and
// sifting it in JS - fine on a short history, but once a year of imported
// training is in the table the cap lands nowhere near this exercise's recent
// sessions. !inner drops sessions with no matching set, so the limit really is
// the last N times they did this movement.
//
// Pass the name as-is. Wrapping it in double quotes - the convention for an
// in.() list - makes the quotes part of the pattern here, so every one of these
// lookups came back empty. Commas are safe unquoted: PostgREST only splits a
// value on commas inside in.() and or=() lists.
export async function loadExerciseHistory(clientId, exerciseName, limit = 5) {
  if (!clientId || !exerciseName) return [];
  const { data } = await supabase
    .from('workout_sessions')
    .select('id, completed_at, logged_sets!inner(set_index, actual_reps, actual_weight_kg, actual_band, actual_time_secs)')
    .eq('client_id', clientId)
    .not('completed_at', 'is', null)
    .ilike('logged_sets.exercise_name', exerciseName.trim())
    .order('completed_at', { ascending: false })
    .limit(limit);

  return (data || []).map(sess => {
    const rows = [...(sess.logged_sets || [])].sort((a, b) => a.set_index - b.set_index);
    const sets = rows.map(r => {
      if (r.actual_time_secs) return { warmup: false, label: formatMMSS(r.actual_time_secs) };
      const kg = r.actual_weight_kg != null ? parseFloat(r.actual_weight_kg) : null;
      const band = bandOf(r.actual_band);
      if (band) return { warmup: false, label: `${band.short} × ${r.actual_reps ?? '-'}` };
      if (kg != null) return { warmup: false, label: `${kg}kg × ${r.actual_reps ?? '-'}` };
      return { warmup: false, label: `${r.actual_reps ?? '-'} reps` };
    });
    const kgs = rows.map(r => parseFloat(r.actual_weight_kg)).filter(v => !isNaN(v));
    return {
      date: new Date(sess.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      completedAt: sess.completed_at,
      sets,
      top: kgs.length ? Math.max(...kgs) : null,
    };
  });
}
