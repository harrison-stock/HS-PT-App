import { supabase } from './supabase'
import { todayISO } from './day'

// Two separate decisions: telling someone a task exists, and nagging them about
// it. A weekly check-in wants both; "bring your trainers on Thursday" wants the
// first and not the second.
export const REMIND_OPTIONS = [
  { id: 'chase', label: 'UNTIL DONE', hint: 'On the due date, then daily while it stays overdue.' },
  { id: 'due',   label: 'ON THE DAY', hint: 'One reminder on the due date, then leave it.' },
  { id: 'off',   label: 'NEVER',      hint: 'No reminders. It just sits in their list.' },
];

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
  else if (recurrence === 'monthly') {
    // setUTCMonth on the 31st rolls into the month after next - 31 January
    // becomes 3 March - which is not what anyone means by monthly. Clamp to the
    // last day of the target month instead.
    const day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, lastDay));
  }
  else return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Toggle a task's completion.
 *
 * One server-side call, because the two halves need different rights. Marking
 * it done is the client's to do; laying down the next occurrence is the
 * coach's, and the client has no insert permission on client_tasks. This used
 * to be an update followed by an insert from the browser, so when a client
 * ticked off a weekly check-in the update went through, the insert was refused
 * by RLS, the refusal was never checked, and the series quietly ended. It
 * worked when the coach ticked it - which is why nobody noticed it failing for
 * the only person who was supposed to.
 *
 * Returns { error } so a caller can say something when it doesn't work.
 */
export async function setTaskComplete(taskId, complete) {
  const { error } = await supabase.rpc('complete_task', { p_task_id: taskId, p_complete: !!complete });
  if (!error) return {};

  // A database still behind migration 071 has no such function. Fall back to
  // what the app did before, which at least completes the task - the spawn is
  // then repaired by catchUpRecurring next time the coach opens them.
  if (/complete_task|function|schema cache/i.test(error.message || '')) {
    const { error: upErr } = await supabase.from('client_tasks')
      .update({ completed_at: complete ? new Date().toISOString() : null })
      .eq('id', taskId);
    return upErr ? { error: upErr } : {};
  }
  return { error };
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
  const today = todayISO();
  // Completed ones count too. A series that was ticked off before migration 071
  // had its successor refused by RLS, so the task most in need of repair is the
  // one that looks finished.
  const stalled = (tasks || []).filter(t =>
    t.recurrence && t.recurrence !== 'none' && !t.recur_spawned &&
    t.due_date && t.due_date < today);
  if (!stalled.length) return false;

  let wrote = false;
  for (const t of stalled) {
    const due_date = nextDueAfter(t.due_date, t.recurrence, today);
    if (!due_date) continue;
    const row = {
      client_id: t.client_id, trainer_id: t.trainer_id,
      title: t.title, kind: t.kind, form_id: t.form_id || null,
      due_date, recurrence: t.recurrence,
      notify_on_assign: t.notify_on_assign !== false,
      remind: t.remind || 'chase',
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
    if (error) {
      const { icon: _i, notify_on_assign: _n, remind: _m, ...bare } = row;
      ({ error } = await supabase.from('client_tasks').insert(bare));
    }
    if (error) await supabase.from('client_tasks').update({ recur_spawned: false }).eq('id', t.id);
    else wrote = true;
  }
  return wrote;
}
