import { supabase } from './supabase'

// Maps a free-text exercise name to muscle-map group keys.
// Rules are ordered specific → generic; the first match wins.
const RULES = [
  [/deadlift|good morning|back extension|hyperextension/i, ['lowerBack', 'hamstrings', 'glutes']],
  [/romanian|rdl|hamstring|leg curl|nordic/i,              ['hamstrings', 'glutes']],
  [/squat|leg press|leg extension|lunge|step[- ]?up|pistol|hack/i, ['quads', 'glutes']],
  [/hip thrust|glute|bridge|kickback/i,                    ['glutes', 'hamstrings']],
  [/calf|calves/i,                                         ['calves']],
  [/bench|chest press|push[- ]?up|press[- ]?up|fly|flye|pec/i, ['chest', 'triceps', 'shoulders']],
  [/\bdip/i,                                               ['triceps', 'chest']],
  [/overhead press|shoulder press|military|arnold|lateral raise|front raise|delt|landmine/i, ['shoulders', 'triceps']],
  [/pull[- ]?up|chin[- ]?up|pulldown|\blat\b|lats/i,       ['lats', 'biceps']],
  [/row|face pull|reverse fly|shrug|trap/i,                ['upperBack', 'biceps']],
  [/curl/i,                                                ['biceps', 'forearms']],
  [/tricep|pushdown|skull|close[- ]?grip/i,                ['triceps']],
  [/plank|crunch|sit[- ]?up|\babs?\b|hollow|dead bug|leg raise|rollout/i, ['abs']],
  [/twist|woodchop|side bend|oblique|pallof/i,             ['obliques']],
  [/forearm|wrist|grip|farmer/i,                           ['forearms']],
  [/clean|snatch|thruster|swing/i,                         ['glutes', 'hamstrings', 'shoulders']],
];

export function muscleGroupsFor(name) {
  for (const [re, groups] of RULES) {
    if (re.test(name || '')) return groups;
  }
  return [];
}

function humanizeDays(iso) {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

// Aggregates completed-session set volume per muscle group over the last
// `rangeDays` days. Returns { group: { sets, reps, kg, sessions, lastWorked } }
// containing only groups that were actually worked.
export async function loadMuscleVolume(clientId, rangeDays) {
  const since = new Date(Date.now() - rangeDays * 86_400_000).toISOString();
  const { data: sessions } = await supabase
    .from('workout_sessions')
    .select('id, completed_at, logged_sets ( actual_weight_kg, actual_reps, section_exercises ( name ) )')
    .eq('client_id', clientId)
    .not('completed_at', 'is', null)
    .gte('completed_at', since);

  const agg = {};
  for (const sess of (sessions || [])) {
    for (const ls of (sess.logged_sets || [])) {
      const groups = muscleGroupsFor(ls.section_exercises?.name);
      const w = parseFloat(ls.actual_weight_kg) || 0;
      const r = ls.actual_reps || 0;
      for (const g of groups) {
        if (!agg[g]) agg[g] = { sets: 0, reps: 0, kg: 0, sessionIds: new Set(), last: null };
        agg[g].sets += 1;
        agg[g].reps += r;
        agg[g].kg += Math.round(w * r);
        agg[g].sessionIds.add(sess.id);
        if (!agg[g].last || sess.completed_at > agg[g].last) agg[g].last = sess.completed_at;
      }
    }
  }

  const out = {};
  for (const [g, d] of Object.entries(agg)) {
    out[g] = { sets: d.sets, reps: d.reps, kg: d.kg, sessions: d.sessionIds.size, lastWorked: humanizeDays(d.last) };
  }
  return out;
}
