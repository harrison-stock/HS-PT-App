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
