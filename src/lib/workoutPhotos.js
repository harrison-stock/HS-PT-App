import { supabase } from './supabase'

const BUCKET = 'workout-photos';

// Uploads a workout cover image under the trainer's own folder and returns its
// public URL. The bucket is public (read-only) so clients render it directly.
export async function uploadWorkoutPhoto(trainerId, file) {
  if (!trainerId) return { error: { message: 'Missing trainer id' } };
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${trainerId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
  if (error) return { error };
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data?.publicUrl || null };
}
