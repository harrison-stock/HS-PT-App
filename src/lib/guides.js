import { supabase } from './supabase'
export { uploadExerciseImage as uploadGuideImage } from './exercises'

export const GUIDE_KINDS = ['ARTICLE', 'VIDEO', 'GUIDE'];
export const GUIDE_CATEGORIES = ['TECHNIQUE', 'MOBILITY', 'RECOVERY', 'PROGRAMMING', 'NUTRITION', 'MINDSET'];

const FALLBACK_IMG = 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600&q=70';

export function shapeGuide(g) {
  return {
    id: g.id,
    title: g.title,
    kind: g.kind,
    category: g.category,
    minutes: g.minutes,
    img: g.img_url || FALLBACK_IMG,
    video: g.video_url || '',
    link: g.link_url || '',
    body: g.body || '',
    file: g.file_url || '',
    fileName: g.file_name || '',
  };
}

export async function loadGuides() {
  const { data, error } = await supabase.from('guides').select('*').order('updated_at', { ascending: false });
  if (error) return [];
  return (data || []).map(shapeGuide);
}

export async function saveGuide(trainerId, draft) {
  const payload = {
    trainer_id: trainerId,
    title: draft.title.trim(),
    kind: draft.kind,
    category: draft.category,
    minutes: parseInt(draft.minutes) || 0,
    img_url: draft.img?.trim() || '',
    video_url: draft.video?.trim() || '',
    link_url: draft.link?.trim() || '',
    body: draft.body?.trim() || '',
    file_url: draft.file?.trim() || '',
    file_name: draft.fileName?.trim() || '',
    updated_at: new Date().toISOString(),
  };
  // Strip the attachment columns and retry if they aren't there yet (migration 049).
  const { file_url, file_name, ...noFile } = payload;

  if (draft.id) {
    let { error } = await supabase.from('guides').update(payload).eq('id', draft.id);
    if (error) ({ error } = await supabase.from('guides').update(noFile).eq('id', draft.id));
    return error ? { error } : { id: draft.id };
  }
  let { data, error } = await supabase.from('guides').insert(payload).select('id').single();
  if (error) ({ data, error } = await supabase.from('guides').insert(noFile).select('id').single());
  return error || !data ? { error: error || new Error('Insert failed') } : { id: data.id };
}

export async function deleteGuide(id) {
  await supabase.from('guides').delete().eq('id', id);
}
