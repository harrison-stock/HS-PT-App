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
