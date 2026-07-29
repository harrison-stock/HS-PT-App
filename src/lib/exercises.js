import { supabase } from './supabase'
import { compressImage } from './imageCompress'

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
// Also carries guide/recipe uploads, which include PDFs and other documents -
// compressImage passes anything that isn't a bitmap straight through.
export async function uploadExerciseImage(trainerId, original) {
  const file = await compressImage(original);
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

// Best-effort YouTube thumbnail from a video URL. Shorts are included because
// short-form demos are the usual format for an exercise clip - without them a
// perfectly good video would show no still at all.
export function videoThumb(url) {
  if (!url) return '';
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([\w-]{11})/);
  if (yt) return `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`;
  return '';
}

// ── BULK IMPORT ───────────────────────────────────────────────────
// Match a free-text CSV value against a fixed option list, case- and
// punctuation-insensitively. Returns the canonical option or the fallback, so a
// typo in a spreadsheet degrades to a sensible default instead of writing
// garbage the filters can't see.
const loose = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function matchOption(value, options, fallback = '') {
  const v = loose(value);
  if (!v) return fallback;
  const exact = options.find(o => loose(o) === v);
  if (exact) return exact;
  const partial = options.find(o => loose(o).includes(v) || v.includes(loose(o)));
  return partial || fallback;
}

// Spreadsheets express "yes" a dozen ways. Accept the common ones.
export function parseBool(value) {
  return /^(y|yes|true|1|x|✓)$/i.test(String(value || '').trim());
}

// Split a multi-value cell on comma, semicolon, slash or pipe.
export function splitList(value) {
  return String(value || '').split(/[,;/|]/).map(s => s.trim()).filter(Boolean);
}

// Map free-text muscle names onto the detailed muscle keys used for volume
// mapping - accepts either the key ("upperBack") or the label ("Upper Back").
export function matchMuscles(value) {
  const out = [];
  for (const part of splitList(value)) {
    const p = loose(part);
    const hit = ALL_MUSCLES.find(m => loose(m.key) === p || loose(m.label) === p);
    if (hit && !out.includes(hit.key)) out.push(hit.key);
  }
  return out;
}

// Inserts many exercises in chunks. Returns { inserted, error }.
export async function importExercises(trainerId, drafts) {
  const now = new Date().toISOString();
  const rows = drafts.map(d => ({
    trainer_id: trainerId,
    name: d.name,
    modality: d.modality,
    muscle_group: d.muscle_group,
    movement_pattern: d.movement_pattern,
    category: d.category,
    tracking_fields: d.tracking_fields,
    muscles_worked: d.muscles_worked || [],
    instructions: d.instructions || '',
    link_url: d.link_url || '',
    video_url: d.video_url || '',
    thumbnail_url: d.thumbnail_url || '',
    photos: [],
    banded: !!d.banded,
    unilateral: !!d.unilateral,
    updated_at: now,
  }));
  let inserted = 0;
  // Chunked so one oversized request can't blow the payload limit, and so a
  // partial failure still leaves the successful batches in place.
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await supabase.from('exercises').insert(rows.slice(i, i + 100));
    if (error) return { inserted, error };
    inserted += Math.min(100, rows.length - i);
  }
  return { inserted };
}

// Updates existing rows by id, one at a time (only ever used for the handful of
// names that collided with the library on import).
export async function updateExercises(updates) {
  let updated = 0;
  for (const { id, patch } of updates) {
    const { error } = await supabase.from('exercises')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return { updated, error };
    updated++;
  }
  return { updated };
}
