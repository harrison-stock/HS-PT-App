import { supabase } from './supabase'

export const FIELD_TYPES = [
  { type: 'text',     label: 'Short text' },
  { type: 'textarea', label: 'Paragraph' },
  { type: 'number',   label: 'Number' },
  { type: 'scale',    label: 'Scale (1–5)' },
  { type: 'choice',   label: 'Multiple choice' },
  { type: 'yesno',    label: 'Yes / No' },
];

export async function loadForms() {
  const { data } = await supabase.from('forms').select('*').order('updated_at', { ascending: false });
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

export async function deleteForm(id) {
  await supabase.from('forms').delete().eq('id', id);
}

export async function submitFormResponse({ formId, clientId, taskId, answers }) {
  const { error } = await supabase.from('form_responses')
    .insert({ form_id: formId, client_id: clientId, task_id: taskId || null, answers });
  return { error };
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
    .select('id, form_id, task_id, answers, submitted_at, forms ( id, title, description, fields )')
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
    const f = r.forms;
    if (!f) continue; // form deleted since; the response is orphaned
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
        points: [...g.entries].reverse()
          .map(e => ({ at: e.submitted_at, v: toNum(e.answers?.[fl.id]) }))
          .filter(p => p.v != null),
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
