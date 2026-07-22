import { supabase } from './supabase'

const BUCKET = 'progress-photos';

// Loads a client's photos grouped by date, newest first, with signed URLs
// (the bucket is private - clients see their own, trainers their clients').
export async function loadPhotoHistory(clientId) {
  const { data: rows } = await supabase
    .from('progress_photos')
    .select('*')
    .eq('client_id', clientId)
    .order('taken_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(60);

  const withUrls = await Promise.all((rows || []).map(async r => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(r.path, 3600);
    return { ...r, url: data?.signedUrl || null };
  }));

  const groups = [];
  for (const r of withUrls) {
    let g = groups.find(x => x.date === r.taken_on);
    if (!g) { g = { date: r.taken_on, shots: {} }; groups.push(g); }
    if (!g.shots[r.pose]) g.shots[r.pose] = r;
  }
  return groups;
}

export async function uploadProgressPhoto(clientId, pose, file) {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${clientId}/${Date.now()}-${pose}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (error) return { error };
  const { error: dbErr } = await supabase.from('progress_photos')
    .insert({ client_id: clientId, pose, path });
  return { error: dbErr };
}

export async function deleteProgressPhoto(row) {
  await supabase.storage.from(BUCKET).remove([row.path]);
  await supabase.from('progress_photos').delete().eq('id', row.id);
}
