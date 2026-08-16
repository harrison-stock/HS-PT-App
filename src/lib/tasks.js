import { supabase } from './supabase'

export const RECURRENCE_OPTIONS = [
  { id: 'none',    label: 'ONCE' },
  { id: 'daily',   label: 'DAILY' },
  { id: 'weekly',  label: 'WEEKLY' },
  { id: 'monthly', label: 'MONTHLY' },
];

// Advance an ISO date (YYYY-MM-DD) by one recurrence interval. Falls back to
// today when the task had no due date. Returns null for a non-recurring value.
export function advanceDate(fromISO, recurrence) {
  if (!recurrence || recurrence === 'none') return null;
  const d = fromISO ? new Date(fromISO + 'T00:00:00Z') : new Date();
  if (recurrence === 'daily')   d.setUTCDate(d.getUTCDate() + 1);
  else if (recurrence === 'weekly')  d.setUTCDate(d.getUTCDate() + 7);
  else if (recurrence === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
  else return null;
  return d.toISOString().slice(0, 10);
}

// Toggle a task's completion. When *completing* a recurring task, the next
// occurrence is created once (guarded by recur_spawned). Completion itself
// always succeeds even if the recurrence columns aren't present yet - the
// recurrence step is best-effort and simply no-ops pre-migration.
export async function setTaskComplete(taskId, complete) {
  await supabase.from('client_tasks')
    .update({ completed_at: complete ? new Date().toISOString() : null })
    .eq('id', taskId);
  if (!complete) return;

  const { data: t } = await supabase.from('client_tasks').select('*').eq('id', taskId).maybeSingle();
  if (!t || !t.recurrence || t.recurrence === 'none' || t.recur_spawned) return;

  const nextDue = advanceDate(t.due_date, t.recurrence);
  const row = {
    client_id: t.client_id, trainer_id: t.trainer_id,
    title: t.title, kind: t.kind, form_id: t.form_id || null,
    due_date: nextDue, recurrence: t.recurrence,
  };
  if (t.icon) row.icon = t.icon;
  let { error } = await supabase.from('client_tasks').insert(row);
  if (error && row.icon) { delete row.icon; ({ error } = await supabase.from('client_tasks').insert(row)); }
  if (!error) await supabase.from('client_tasks').update({ recur_spawned: true }).eq('id', taskId);
}

// Advance past `todayISO` in one go. A client away for a month shouldn't come
// back to four backdated check-ins - they should come back to this week's.
export function nextDueAfter(fromISO, recurrence, todayISO) {
  let d = advanceDate(fromISO, recurrence);
  if (!d) return null;
  // 400 caps a daily task left alone for over a year; anything beyond that is
  // a data problem, not a schedule.
  for (let i = 0; d <= todayISO && i < 400; i++) {
    const n = advanceDate(d, recurrence);
    if (!n) break;
    d = n;
  }
  return d;
}

// A recurring task only spawned its successor when the client ticked it off.
// Miss one week of a weekly check-in and the series stopped dead - which is the
// single thing a weekly check-in must not do, since the weeks a client goes
// quiet are the ones worth chasing. This lays down the next occurrence for any
// recurring task whose due date has passed unanswered. The missed one stays
// exactly where it is: that they skipped it is the useful part.
//
// Inserts run under the trainer's rights, so this is a no-op on the client's
// own device - it catches up when the coach next opens them. Returns whether
// anything was written, so the caller knows to reload.
export async function catchUpRecurring(tasks) {
  const today = new Date().toISOString().slice(0, 10);
  const stalled = (tasks || []).filter(t =>
    t.recurrence && t.recurrence !== 'none' && !t.recur_spawned &&
    !t.completed_at && t.due_date && t.due_date < today);
  if (!stalled.length) return false;

  let wrote = false;
  for (const t of stalled) {
    const due_date = nextDueAfter(t.due_date, t.recurrence, today);
    if (!due_date) continue;
    const row = {
      client_id: t.client_id, trainer_id: t.trainer_id,
      title: t.title, kind: t.kind, form_id: t.form_id || null,
      due_date, recurrence: t.recurrence,
    };
    if (t.icon) row.icon = t.icon;

    // Claim the spawn before making it. This runs on every load of the tasks
    // list, so two of them overlapping - the tab mounting while an action
    // reloads it - would otherwise both see recur_spawned false and both insert,
    // and a client facing two identical check-ins is worse than facing none.
    // The filter makes the update a compare-and-set: only one caller gets a row
    // back. If the insert then fails, the claim is released.
    const { data: claimed } = await supabase.from('client_tasks')
      .update({ recur_spawned: true })
      .eq('id', t.id).eq('recur_spawned', false)
      .select('id');
    if (!claimed || !claimed.length) continue;

    let { error } = await supabase.from('client_tasks').insert(row);
    if (error && row.icon) { delete row.icon; ({ error } = await supabase.from('client_tasks').insert(row)); }
    if (error) await supabase.from('client_tasks').update({ recur_spawned: false }).eq('id', t.id);
    else wrote = true;
  }
  return wrote;
}
