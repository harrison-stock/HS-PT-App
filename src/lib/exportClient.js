import { supabase } from './supabase'

// Everything the app holds about one client, on demand.
//
// The point is reversibility. Data living in someone else's product is only
// really yours if you can get it out, and until now getting it out meant the
// Supabase dashboard and a working knowledge of SQL. A coach deciding whether
// to trust this app with a real client should be able to answer "and what if I
// change my mind" by pressing a button.
//
// Two shapes, because they answer different questions. The JSON is complete and
// is what you would restore from. The CSV is the training log, which is the
// thing anyone actually wants to open in a spreadsheet.

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  // A leading =, +, - or @ is a formula to a spreadsheet, not text. Exported
  // data should never execute when someone opens it.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function toCSV(rows, columns) {
  const cols = columns || [...new Set(rows.flatMap(r => Object.keys(r)))];
  return [cols.join(','), ...rows.map(r => cols.map(c => csvCell(r[c])).join(','))].join('\r\n');
}

// Browsers won't let a page hand over a file without a click somewhere in the
// stack; this is called from one, so the object URL is revoked immediately
// after rather than left holding the blob for the life of the tab.
export function download(filename, text, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const slug = (s) => String(s || 'client').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const stamp = () => new Date().toISOString().slice(0, 10);

/**
 * Gather everything for one client.
 *
 * Read through the ordinary client, not the service role, so it returns exactly
 * what this person is allowed to see - a coach exporting their own client, or a
 * client exporting themselves. Anything RLS would refuse is absent rather than
 * quietly included.
 */
export async function gatherClientData(clientId) {
  const one = async (table, query) => {
    const { data, error } = await query;
    return error ? { table, error: error.message, rows: null } : { table, rows: data ?? null };
  };

  const [profile, managed, workouts, sessions, forms, tasks, metrics, injuries, goals, photos, comments] = await Promise.all([
    // A managed client has no auth account, so their details live in a
    // different table. Try both rather than exporting a record with no name on it.
    one('profile', supabase.from('profiles').select('*').eq('id', clientId).maybeSingle()),
    one('managed', supabase.from('managed_clients').select('*').eq('id', clientId).maybeSingle()),
    one('workouts', supabase.from('client_workouts')
      .select('id, scheduled_date, status, programme_days(id, title, notes, intro, week_index, day_of_week, programme_phases(name, programmes(name)), workout_sections(kind, title, sort_order, section_exercises(name, sort_order, tempo, coach_notes, banded, unilateral, load_split, exercise_sets(set_index, kind, reps, reps_text, weight_kg, rest_secs, time_secs, intensity, band))))')
      .eq('client_id', clientId).order('scheduled_date')),
    one('sessions', supabase.from('workout_sessions')
      .select('id, started_at, completed_at, day_id, logged_sets(set_index, exercise_name, actual_reps, actual_weight_kg, actual_time_secs, actual_band, intensity, section_exercises(name))')
      .eq('client_id', clientId).order('completed_at')),
    one('check_ins', supabase.from('form_responses').select('*').eq('client_id', clientId).order('created_at')),
    one('tasks', supabase.from('client_tasks').select('*').eq('client_id', clientId).order('due_date')),
    one('body_metrics', supabase.from('body_metrics').select('*').eq('client_id', clientId).order('taken_on')),
    one('injuries', supabase.from('client_injuries').select('*, client_injury_notes(*)').eq('client_id', clientId)),
    one('goals', supabase.from('client_goals').select('*').eq('client_id', clientId)),
    one('progress_photos', supabase.from('progress_photos').select('*').eq('client_id', clientId).order('taken_on')),
    one('comments', supabase.from('exercise_comments').select('*, section_exercises(name)').eq('client_id', clientId).order('created_at')),
  ]);

  // A missing row in whichever of the two tables this client isn't in is
  // expected, not a fault, so neither is reported as a warning.
  const parts = [workouts, sessions, forms, tasks, metrics, injuries, goals, photos, comments];
  return {
    exported_at: new Date().toISOString(),
    // Named so a file found in six months explains itself.
    note: 'Full export from the HS PT app. Progress photos are listed by their storage path; the image files themselves are not included.',
    warnings: parts.filter(p => p.error).map(p => `${p.table}: ${p.error}`),
    client: profile.rows || managed.rows || null,
    workouts: workouts.rows || [],
    sessions: sessions.rows || [],
    check_ins: forms.rows || [],
    tasks: tasks.rows || [],
    body_metrics: metrics.rows || [],
    injuries: injuries.rows || [],
    goals: goals.rows || [],
    progress_photos: photos.rows || [],
    comments: comments.rows || [],
  };
}

/** The training log, flattened one row per logged set. */
export function sessionsToRows(data) {
  const dayTitle = {};
  for (const w of data.workouts || []) {
    const d = w.programme_days;
    if (d) dayTitle[d.id] = d.title || d.programme_phases?.name || '';
  }
  const rows = [];
  for (const s of data.sessions || []) {
    for (const ls of (s.logged_sets || [])) {
      rows.push({
        date: (s.completed_at || s.started_at || '').slice(0, 10),
        workout: dayTitle[s.day_id] || '',
        exercise: ls.section_exercises?.name || ls.exercise_name || '',
        set: (ls.set_index ?? 0) + 1,
        reps: ls.actual_reps ?? '',
        weight_kg: ls.actual_weight_kg ?? '',
        time_secs: ls.actual_time_secs ?? '',
        band: ls.actual_band ?? '',
        rpe: ls.intensity ?? '',
      });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

export async function exportClient(clientId, clientName, format = 'json') {
  const data = await gatherClientData(clientId);
  const base = `hs-pt-${slug(clientName)}-${stamp()}`;
  if (format === 'csv') {
    const rows = sessionsToRows(data);
    if (!rows.length) return { error: 'No logged sessions to export yet.' };
    download(`${base}-training-log.csv`, toCSV(rows,
      ['date', 'workout', 'exercise', 'set', 'reps', 'weight_kg', 'time_secs', 'band', 'rpe']));
    return { count: rows.length };
  }
  download(`${base}.json`, JSON.stringify(data, null, 2), 'application/json');
  return { warnings: data.warnings };
}
