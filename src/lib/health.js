import { supabase } from './supabase'
import { todayISO, ymd as localISO } from './day'

// Recent daily health metrics (steps / resting HR / weight) for a client.
// Collapses multiple sources per day, preferring non-null values.
export async function loadHealthDaily(userId, days = 30) {
  if (!userId) return [];
  const since = localISO(new Date(Date.now() - days * 86400000));
  const { data } = await supabase
    .from('health_daily')
    .select('day, source, steps, resting_hr, avg_hr, weight_kg')
    .eq('client_id', userId)
    .gte('day', since)
    .order('day', { ascending: true });

  return mergeDaily(data || []);
}

/**
 * Collapse several sources for the same day into one row.
 *
 * A day can carry both a typed figure and a synced one, so which wins has to be
 * decided rather than left to row order. The device wins: manual entry is what
 * you do when there is no device, and a watch that counted 6,000 is better
 * evidence than a person remembering 9,000. Applying manual first and letting
 * the rest overwrite it makes that explicit and repeatable.
 */
export function mergeDaily(rows) {
  const byDay = {};
  const ordered = [...(rows || [])].sort((a, b) =>
    (a.source === 'manual' ? 0 : 1) - (b.source === 'manual' ? 0 : 1));
  for (const r of ordered) {
    const d = (byDay[r.day] = byDay[r.day] || { day: r.day, steps: null, resting_hr: null, avg_hr: null, weight_kg: null });
    for (const k of ['steps', 'resting_hr', 'avg_hr', 'weight_kg']) if (r[k] != null) d[k] = r[k];
  }
  return Object.values(byDay).sort((a, b) => (a.day < b.day ? -1 : 1));
}

// Re-exported so callers that already import it from here keep working. The
// reason it is not defined here is in lib/day.js.
export { todayISO };

/**
 * Type in a day's steps.
 *
 * Written as source 'manual' so it never overwrites what a wearable reported -
 * the two sit side by side on the same day and loadHealthDaily prefers the
 * device. Passing null clears the entry rather than storing a zero, because
 * "I didn't record it" and "I didn't move" are different days.
 */
export async function saveManualSteps(clientId, day, steps) {
  if (!clientId || !day) return { error: { message: 'Missing client or day' } };
  if (steps == null || steps === '') {
    const { error } = await supabase.from('health_daily')
      .delete().eq('client_id', clientId).eq('day', day).eq('source', 'manual');
    return { error: error || null };
  }
  const n = Math.round(Number(steps));
  if (!Number.isFinite(n) || n < 0 || n > 200000) return { error: { message: 'Steps must be between 0 and 200,000' } };
  const { error } = await supabase.from('health_daily')
    .upsert({ client_id: clientId, day, source: 'manual', steps: n, updated_at: new Date().toISOString() },
      { onConflict: 'client_id,day,source' });
  return { error: error || null };
}

/**
 * The shape of someone's week, against their target.
 *
 * Two seven-day windows rather than one, because an average on its own says
 * nothing a coach can act on. 8,400 is good news or bad news entirely
 * depending on whether last week was 6,000 or 12,000, and it is the second
 * case that wants a message on a Monday morning.
 */
export function stepSummary(rows, goal) {
  const days = (rows || []).filter(d => d.steps != null);
  const byDay = Object.fromEntries(days.map(d => [d.day, d.steps]));

  const back = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return localISO(d); };
  const windowAvg = (from, to) => {
    const vals = [];
    for (let i = from; i < to; i++) { const v = byDay[back(i)]; if (v != null) vals.push(v); }
    return vals.length ? { avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), days: vals.length } : null;
  };

  const week = windowAvg(0, 7);
  const prior = windowAvg(7, 14);
  const today = byDay[todayISO()] ?? null;
  const latest = days.length ? days[days.length - 1] : null;

  // A streak needs a target to be a streak against, and counts back from
  // yesterday: today isn't over, so a low count so far isn't a broken streak.
  let streak = 0;
  if (goal > 0) {
    for (let i = 1; i < 90; i++) {
      const v = byDay[back(i)];
      if (v == null || v < goal) break;
      streak++;
    }
    if ((byDay[todayISO()] ?? 0) >= goal) streak++;
  }

  // How many of the last seven actually met the target - the number a coach
  // asks about. An average of 9,000 hides four good days and three on the sofa.
  let onTarget = 0;
  if (goal > 0) for (let i = 0; i < 7; i++) { const v = byDay[back(i)]; if (v != null && v >= goal) onTarget++; }

  const change = week && prior && prior.avg > 0
    ? Math.round(((week.avg - prior.avg) / prior.avg) * 100)
    : null;

  return {
    today, latest, streak, change, onTarget,
    week: week?.avg ?? null, weekDays: week?.days ?? 0,
    prior: prior?.avg ?? null, priorDays: prior?.days ?? 0,
    hitToday: goal > 0 && today != null && today >= goal,
  };
}

export async function loadConnections(userId) {
  if (!userId) return [];
  const { data } = await supabase
    .from('wearable_connections')
    .select('provider, status, last_sync')
    .eq('client_id', userId)
    .order('provider');
  return data || [];
}

// Asks the edge function for a hosted connect URL and opens it.
export async function startWearableConnect() {
  const { data, error } = await supabase.functions.invoke('health-connect-init', { body: {} });
  if (error || data?.error) return { error: data?.error || error?.message || 'Could not start connection' };
  if (data?.url) { window.location.href = data.url; return {}; }
  return { error: 'No connection URL returned' };
}
