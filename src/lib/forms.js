import { supabase } from './supabase'

export const FIELD_TYPES = [
  { type: 'text',     label: 'Short text' },
  { type: 'textarea', label: 'Paragraph' },
  { type: 'number',   label: 'Number' },
  { type: 'scale',    label: 'Scale (1–5)' },
  { type: 'choice',   label: 'Multiple choice' },
  { type: 'yesno',    label: 'Yes / No' },
];

export async function loadForms({ includeArchived = false } = {}) {
  let q = supabase.from('forms').select('*');
  // Archived forms are retired, not deleted: they stay out of the picker so a
  // coach isn't offered something they've stopped using, while every answer
  // anyone gave them stays readable.
  if (!includeArchived) q = q.or('archived.is.null,archived.eq.false');
  const { data } = await q.order('updated_at', { ascending: false });
  return data || [];
}

export async function loadForm(id) {
  const { data } = await supabase.from('forms').select('*').eq('id', id).maybeSingle();
  return data || null;
}

export async function saveForm(trainerId, draft) {
  const payload = {
    trainer_id: trainerId,
    title: draft.title.trim(),
    description: draft.description.trim(),
    fields: draft.fields,
    updated_at: new Date().toISOString(),
  };
  if (draft.id) {
    const { error } = await supabase.from('forms').update(payload).eq('id', draft.id);
    return error ? { error } : { id: draft.id };
  }
  const { data, error } = await supabase.from('forms').insert(payload).select('id').single();
  return error ? { error } : { id: data.id };
}

/**
 * Retire a form.
 *
 * This used to delete the row, and form_responses cascaded from it - so tidying
 * up a form a coach had stopped using destroyed every answer anyone had ever
 * given it. Months of weekly check-ins, gone, as a side effect of housekeeping.
 * The form is archived instead: out of the picker, still there behind the
 * answers that reference it.
 */
export async function archiveForm(id) {
  const { error } = await supabase.from('forms').update({ archived: true }).eq('id', id);
  if (!error) return {};
  // A database behind migration 075 has no archived column. Deleting is what it
  // did before and the responses now survive it, so this is safe either way.
  return supabase.from('forms').delete().eq('id', id);
}

// Old name, same job.
export const deleteForm = archiveForm;

/**
 * Submit a check-in, with the questions it was actually asked.
 *
 * The answers are keyed by field id and the questions were read from the live
 * form, so editing a question rewrote history: change "How is your sleep?
 * (1-5)" to "How is your energy? (1-5)" and every answer ever given to the
 * first is displayed against the second. Nothing is corrupted and every number
 * is wrong. The response now carries its own copy of what it was asked.
 */
export async function submitFormResponse({ formId, clientId, taskId, answers, form }) {
  const row = { form_id: formId, client_id: clientId, task_id: taskId || null, answers };
  if (form) {
    row.fields = form.fields || [];
    row.form_title = form.title || '';
    row.trainer_id = form.trainer_id || null;
  }
  const { error } = await supabase.from('form_responses').insert(row);
  if (!error) return {};
  // Pre-075 databases have none of those columns.
  const { fields, form_title, trainer_id, ...bare } = row;
  return supabase.from('form_responses').insert(bare);
}

export async function loadResponses(formId, clientId) {
  let q = supabase.from('form_responses').select('*').eq('form_id', formId).order('submitted_at', { ascending: false });
  if (clientId) q = q.eq('client_id', clientId);
  const { data } = await q;
  return data || [];
}

// Every form submission a client has made, newest first, with the form
// definition alongside so the answers can be labelled and typed. `loadResponses`
// above answers "who filled in this form"; this answers "what has this client
// sent me", which is the question a weekly check-in actually raises.
export async function loadClientResponses(clientId) {
  if (!clientId) return [];
  const { data } = await supabase.from('form_responses')
    .select('id, form_id, task_id, answers, fields, form_title, submitted_at, forms ( id, title, description, fields )')
    .eq('client_id', clientId)
    .order('submitted_at', { ascending: false });
  return data || [];
}

// Group a client's submissions by the form they answered, newest form activity
// first, and pull out the fields worth tracking across weeks - the ones with a
// number behind them. Text answers are read, numbers are compared.
export function groupResponses(rows) {
  const byForm = new Map();
  for (const r of rows || []) {
    // A response whose form has been retired still carries what it was asked,
    // so it is shown rather than dropped. It used to be skipped outright, which
    // meant tidying up a form made a client's history vanish from this screen
    // even where the rows survived.
    const f = r.forms || { id: `retired:${r.form_id || r.id}`, title: r.form_title || 'Retired form', fields: r.fields || [], retired: true };
    if (!byForm.has(f.id)) byForm.set(f.id, { form: f, entries: [] });
    byForm.get(f.id).entries.push(r);
  }
  return [...byForm.values()].map(g => ({
    ...g,
    // Ascending for the trend, so left-to-right reads as time passing.
    trend: (g.form.fields || [])
      .filter(fl => fl.type === 'number' || fl.type === 'scale')
      .map(fl => ({
        field: fl,
        // Only weeks that were asked this question, as it currently reads.
        //
        // Answers are keyed by field id, so a question that has been reworded
        // keeps lining up with older answers given to the version before - and
        // for a 1-5 scale that silently charts "how is your sleep" and "how is
        // your energy" as one line. Where a response carries its own snapshot,
        // its label has to still match; entries from before snapshots existed
        // are taken at face value, since there is nothing better to go on.
        points: [...g.entries].reverse()
          .map(e => {
            const asked = (e.fields || []).find(x => x.id === fl.id);
            if (asked && (asked.label !== fl.label || asked.type !== fl.type)) return null;
            return { at: e.submitted_at, v: toNum(e.answers?.[fl.id]) };
          })
          .filter(p => p && p.v != null),
      }))
      // One reading isn't a trend - it just puts an empty table above the entry
      // it came from.
      .filter(t => t.points.length > 1),
  })).sort((a, b) => (b.entries[0]?.submitted_at || '').localeCompare(a.entries[0]?.submitted_at || ''));
}

function toNum(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

// How an answer reads back, whatever the field type stored.
export function answerText(field, raw) {
  if (raw == null || raw === '') return null;
  if (field.type === 'yesno') return raw === true || raw === 'yes' || raw === 'true' ? 'Yes' : 'No';
  if (Array.isArray(raw)) return raw.join(', ');
  if (field.type === 'scale') {
    const max = field.max ?? 5;
    return `${raw} / ${max}`;
  }
  return String(raw);
}
