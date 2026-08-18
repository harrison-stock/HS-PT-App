import { loggedSetName } from './loggedSets'
import { supabase } from './supabase'

// Maps a free-text exercise name to muscle-map group keys.
// Rules are ordered specific -> generic; the first match wins, so anything that
// can name the head it loads (incline, decline, lateral, rear) has to sit above
// the general press/row rule that would otherwise swallow it.
const RULES = [
  [/deadlift|good morning|back extension|hyperextension/i, ['lowerBack', 'hamstrings', 'glutes']],
  [/romanian|rdl|hamstring|leg curl|nordic/i,              ['hamstrings', 'glutes']],
  [/squat|leg press|leg extension|lunge|step[- ]?up|pistol|hack/i, ['quads', 'glutes']],
  [/hip thrust|glute|bridge|kickback/i,                    ['glutes', 'hamstrings']],
  [/calf|calves/i,                                         ['calves']],
  [/rear[- ]?delt|reverse (fly|flye|pec)|face pull|bent[- ]?over (lateral|raise)/i, ['deltsRear', 'upperBack']],
  [/lateral raise|lat raise|side raise|upright row/i,       ['deltsSide']],
  [/front raise/i,                                          ['deltsFront']],
  // An incline press is the clavicular chest's exercise and a decline the
  // sternal one's; a flat press is credited to both because it is.
  [/incline.*(bench|press|fly|flye|push[- ]?up)|(bench|press|fly|flye|push[- ]?up).*incline/i, ['chestUpper', 'deltsFront', 'triceps']],
  [/decline.*(bench|press|fly|flye|push[- ]?up)|(bench|press|fly|flye).*decline/i, ['chestMid', 'triceps']],
  [/bench|chest press|push[- ]?up|press[- ]?up|fly|flye|pec/i, ['chestUpper', 'chestMid', 'triceps', 'deltsFront']],
  [/\bdip/i,                                               ['triceps', 'chestMid']],
  [/overhead press|shoulder press|military|arnold|landmine|\bdelt/i, ['deltsFront', 'deltsSide', 'triceps']],
  [/pull[- ]?up|chin[- ]?up|pulldown|\blat\b|lats/i,       ['lats', 'biceps']],
  [/row|shrug|trap/i,                                      ['upperBack', 'biceps']],
  [/curl/i,                                                ['biceps', 'forearms']],
  [/tricep|pushdown|skull|close[- ]?grip/i,                ['triceps']],
  [/plank|crunch|sit[- ]?up|\babs?\b|hollow|dead bug|leg raise|rollout/i, ['abs']],
  [/twist|woodchop|side bend|oblique|pallof/i,             ['obliques']],
  [/forearm|wrist|grip|farmer/i,                           ['forearms']],
  [/clean|snatch|thruster|swing/i,                         ['glutes', 'hamstrings', 'deltsFront', 'deltsSide']],
];

// The map splits the chest and the deltoid into heads; the tags a coach saved
// before that split did not. A library exercise still marked 'chest' or
// 'shoulders' lights the whole muscle rather than nothing at all.
const GROUP_PARTS = {
  chest:     ['chestUpper', 'chestMid'],
  shoulders: ['deltsFront', 'deltsSide', 'deltsRear'],
};

export function expandGroups(groups) {
  const out = [];
  for (const g of (groups || [])) {
    for (const k of (GROUP_PARTS[g] || [g])) if (!out.includes(k)) out.push(k);
  }
  return out;
}

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
export async function loadMuscleVolume(clientId, rangeDays, nameMuscleMap) {
  const since = new Date(Date.now() - rangeDays * 86_400_000).toISOString();
  const { data: sessions } = await supabase
    .from('workout_sessions')
    .select('id, completed_at, logged_sets ( actual_weight_kg, actual_reps, exercise_name, section_exercises ( name ) )')
    .eq('client_id', clientId)
    .not('completed_at', 'is', null)
    .gte('completed_at', since);

  const agg = {};
  for (const sess of (sessions || [])) {
    for (const ls of (sess.logged_sets || [])) {
      const name = loggedSetName(ls);
      const nm = name.toLowerCase();
      // Prefer the coach's library "muscles worked"; fall back to name heuristics.
      const groups = expandGroups((nameMuscleMap && nameMuscleMap[nm]) || muscleGroupsFor(name));
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
