import { supabase } from './supabase'
import { REGION_LABELS, REGION_SINGULAR } from '../data/musclePaths'

export const SEV_COLOR = { mild: 'var(--c-amber)', moderate: 'var(--c-coral)', severe: '#d93434' };
export const SEV_LABEL = { mild: 'MILD', moderate: 'MODERATE', severe: 'SEVERE' };
export const SEV_VAL   = { mild: 0.35, moderate: 0.65, severe: 1.0 };
export const LAT_LABEL = { left: 'Left', right: 'Right', both: 'Both' };

// "Right Knee" (singular when one-sided) or "Knees" when bilateral.
export function injuryTitle(inj) {
  const g = inj.muscle_group;
  if (inj.laterality && inj.laterality !== 'both') {
    const base = REGION_SINGULAR[g] || REGION_LABELS[g] || (g || '').replace(/([A-Z])/g, ' $1').trim();
    return `${LAT_LABEL[inj.laterality]} ${base}`;
  }
  return REGION_LABELS[g] || (g || '').replace(/([A-Z])/g, ' $1').trim();
}

export async function loadInjuries(clientId) {
  const { data } = await supabase
    .from('client_injuries')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  return data || [];
}

export async function reportInjury({ clientId, trainerId, group, side, severity, note, laterality }) {
  const { data } = await supabase
    .from('client_injuries')
    .insert({
      client_id: clientId, trainer_id: trainerId || null,
      muscle_group: group, body_side: side, severity, note: note || '',
      laterality: laterality || 'both',
    })
    .select('id').single();
  return data?.id;
}

export async function resolveInjury(id) {
  await supabase.from('client_injuries').update({ resolved_at: new Date().toISOString() }).eq('id', id);
}

export async function reopenInjury(id) {
  await supabase.from('client_injuries').update({ resolved_at: null }).eq('id', id);
}

export async function loadInjuryNotes(injuryId) {
  const { data } = await supabase
    .from('client_injury_notes')
    .select('*')
    .eq('injury_id', injuryId)
    .order('created_at', { ascending: true });
  return data || [];
}

export async function addInjuryNote(injuryId, authorId, body) {
  await supabase.from('client_injury_notes').insert({ injury_id: injuryId, author_id: authorId, body });
}
