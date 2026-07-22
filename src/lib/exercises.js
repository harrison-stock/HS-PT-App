import { supabase } from './supabase'

export const MODALITIES = ['Strength', 'Cardio', 'Mobility', 'Plyometric', 'Olympic', 'Bodyweight'];
// Primary muscle group - the six groupings used across the app.
export const MUSCLE_GROUPS = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];
// Detailed muscles for the multi-select "muscles worked" - keys match the
// muscle-map / volume groups so logged work lights up the right regions.
export const ALL_MUSCLES = [
  { key: 'chest', label: 'Chest' },
  { key: 'upperBack', label: 'Upper Back' },
  { key: 'lats', label: 'Lats' },
  { key: 'lowerBack', label: 'Lower Back' },
  { key: 'shoulders', label: 'Shoulders' },
  { key: 'biceps', label: 'Biceps' },
  { key: 'triceps', label: 'Triceps' },
  { key: 'forearms', label: 'Forearms' },
  { key: 'abs', label: 'Abs' },
  { key: 'obliques', label: 'Obliques' },
  { key: 'quads', label: 'Quads' },
  { key: 'hamstrings', label: 'Hamstrings' },
  { key: 'glutes', label: 'Glutes' },
  { key: 'calves', label: 'Calves' },
];
export const MOVEMENT_PATTERNS = [
  'Upper Body Vertical Push', 'Upper Body Horizontal Push',
  'Upper Body Vertical Pull', 'Upper Body Horizontal Pull',
  'Lower Body Squat', 'Lower Body Hinge', 'Lunge', 'Carry',
  'Rotation', 'Core / Anti-Rotation', 'Gait / Cardio',
];
export const CATEGORIES = ['Strength', 'Cardio', 'Timed', 'Reps Only', 'Distance', 'Mobility'];
export const TRACKING_OPTIONS = ['Weight', 'Reps', 'Time', 'Distance', 'RPE', 'Tempo', 'Rest', 'Incline', 'Height', 'Calories', 'Heart Rate'];

const BUCKET = 'exercise-media';

export async function loadExercises() {
  const { data } = await supabase
    .from('exercises')
    .select('*')
    .order('name', { ascending: true });
  return data || [];
}

export async function saveExercise(trainerId, draft) {
  const payload = {
    trainer_id: trainerId,
    name: draft.name.trim(),
    modality: draft.modality,
    muscle_group: draft.muscle_group,
    movement_pattern: draft.movement_pattern,
    category: draft.category,
    tracking_fields: draft.tracking_fields,
    muscles_worked: draft.muscles_worked || [],
    instructions: draft.instructions.trim(),
    link_url: draft.link_url.trim(),
    video_url: draft.video_url.trim(),
    thumbnail_url: draft.thumbnail_url || '',
    photos: draft.photos || [],
    banded: !!draft.banded,
    unilateral: !!draft.unilateral,
    updated_at: new Date().toISOString(),
  };
  if (draft.id) {
    const { error } = await supabase.from('exercises').update(payload).eq('id', draft.id);
    return error ? { error } : { id: draft.id };
  }
  const { data, error } = await supabase.from('exercises').insert(payload).select('id').single();
  return error ? { error } : { id: data.id };
}

export async function deleteExercise(id) {
  await supabase.from('exercises').delete().eq('id', id);
}

// Uploads an image to the public exercise-media bucket and returns its URL.
export async function uploadExerciseImage(trainerId, file) {
  const ext = (file.name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
  const path = `${trainerId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'image/jpeg' });
  if (error) return { error };
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return { url: data.publicUrl };
}

// Build a name -> detailed-muscle-keys map from the library, for volume mapping.
export function exerciseMuscleMap(list) {
  const m = {};
  for (const e of (list || [])) {
    if (e.muscles_worked && e.muscles_worked.length) m[(e.name || '').trim().toLowerCase()] = e.muscles_worked;
  }
  return m;
}

export async function loadExerciseMuscleMap() {
  return exerciseMuscleMap(await loadExercises());
}

// Best-effort YouTube/Vimeo thumbnail from a video URL.
export function videoThumb(url) {
  if (!url) return '';
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  if (yt) return `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`;
  return '';
}
