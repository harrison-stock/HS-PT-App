// A logged set can name its exercise two different ways.
//
// Sets logged in-app carry an exercise_id pointing at the prescribed
// section_exercises row, and the name comes from that join. Sets brought in
// from a client's history before they joined the app have no prescription to
// point at, so they carry exercise_name as free text instead.
//
// Reading only the join silently drops every imported set - which is exactly
// the history a client most wants to see. Always resolve through this.
export function loggedSetName(ls) {
  return (ls?.section_exercises?.name || ls?.exercise_name || '').trim();
}

// Normalised key for grouping the same lift across sessions, programmes and
// imports. "Back Squat" prescribed in two phases, plus a year of imported
// history, should all be one continuous line on a chart.
export function exerciseKey(name) {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Columns every logged-set query needs for the above to work.
export const LOGGED_SET_NAME_FIELDS = 'exercise_name, section_exercises ( name )';
