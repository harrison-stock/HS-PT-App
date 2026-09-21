// Which source to believe when two of them describe the same day.
//
// A day in health_daily is unique on (client, day, source), which is what makes
// it possible for a client to type 9,000 in on Tuesday, their Garmin to report
// 6,200 for the same Tuesday, and an Apple Health export to later claim 5,400.
// All three rows are kept - none of them is wrong about what its own source
// said - so something has to decide which number the app shows. Left to row
// order it is whatever Postgres happened to return, which is not a decision.
//
// This file exists because the rule was written twice: once in the client for
// the charts, once in the drop-off cron for the alert. The old comment beside
// the copy said it was "restated here because this runs server-side with no
// access to the client bundle", which was never true of a function that touches
// nothing. Two copies of a tie-break rule is how a coach gets told someone's
// steps collapsed while the client's own screen shows they didn't.

const RANK = {
  // What you do when there is no device: a number someone remembered at the end
  // of the day, and people are generous with themselves.
  manual: 0,
  // Real samples from a real sensor, but from a file exported at one moment,
  // and mostly counted by a phone - which is only measuring you while you are
  // carrying it. Better than a guess, worse than something you wear.
  apple_health: 1,
};

// Anything else is a live connection to a worn device, which is the best
// evidence available and the thing still reporting tomorrow.
export const sourceRank = (source) => RANK[source] ?? 2;

const FIELDS = ['steps', 'resting_hr', 'avg_hr', 'weight_kg'];

/**
 * Collapse several sources for the same day into one row per day.
 *
 * Applied weakest-first so the stronger source overwrites it, field by field -
 * which means a Garmin that reported steps but no weight doesn't wipe out the
 * weight a set of scales sent for the same day.
 */
export function mergeDaily(rows) {
  const ordered = [...(rows || [])].sort((a, b) =>
    // Equal ranks - two worn devices - are settled by name rather than left to
    // row order. The choice between a Garmin and a Fitbit is arbitrary; which
    // one wins being arbitrary *and* changing between page loads is not.
    sourceRank(a.source) - sourceRank(b.source) || (a.source < b.source ? -1 : a.source > b.source ? 1 : 0));

  const byDay = {};
  for (const r of ordered) {
    const d = (byDay[r.day] = byDay[r.day] || { day: r.day, steps: null, resting_hr: null, avg_hr: null, weight_kg: null });
    for (const k of FIELDS) if (r[k] != null) d[k] = r[k];
  }
  return Object.values(byDay).sort((a, b) => (a.day < b.day ? -1 : 1));
}

/** Just the steps, keyed by day - what the drop-off check compares. */
export function stepsByDay(rows) {
  const out = {};
  for (const d of mergeDaily(rows)) if (d.steps != null) out[d.day] = d.steps;
  return out;
}
