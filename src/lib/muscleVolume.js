import { loggedSetName } from './loggedSets'
import { supabase } from './supabase'

// Maps a free-text exercise name to muscle-map group keys.
//
// A fallback, not the source of truth: an exercise tagged with "muscles worked"
// in the library uses those instead. This is what catches everything else, and
// a name that matches nothing is credited to nothing at all - it silently
// vanishes from the heat map and from every volume total.
//
// Ordered specific -> generic, first match wins. Anything that can name the
// head it loads (incline, decline, lateral, rear) therefore has to sit above
// the general press/row rule that would otherwise swallow it.
const RULES = [
  // Triceps first, because "kickback" also means a glute exercise and the
  // glute rule below would otherwise put arm work on someone's backside.
  [/tricep/i,                                              ['triceps']],

  [/rack pull/i,                                           ['lowerBack', 'upperBack', 'glutes']],
  [/deadlift|good morning|back extension|hyperextension/i,  ['lowerBack', 'hamstrings', 'glutes']],
  [/romanian|rdl|hamstring|leg curl|nordic/i,               ['hamstrings', 'glutes']],
  [/squat|leg press|leg extension|lunge|step[- ]?up|pistol|hack/i, ['quads', 'glutes']],
  [/hip thrust|glute|bridge|kickback/i,                     ['glutes', 'hamstrings']],
  // Abduction is the glute medius; adduction is the groin. Two letters apart
  // and opposite muscles, so both are named rather than left to a partial match.
  [/abduction|abductor/i,                                   ['glutes']],
  [/adduction|adductor|copenhagen/i,                        ['adductors']],
  [/calf|calves/i,                                          ['calves']],

  // Shoulder rotation is the cuff. It has to beat the torso-rotation rule at
  // the bottom, or an external rotation lands on the obliques.
  [/external rotation|internal rotation|cuban press|rotator cuff/i, ['deltsRear', 'deltsSide']],
  [/rear[- ]?delt|reverse (fly|flye|pec)|face pull|pull[- ]?apart|\by raise\b|bent[- ]?over (lateral|raise)/i, ['deltsRear', 'upperBack']],
  [/lateral raise|lat raise|side raise|upright row/i,        ['deltsSide']],
  [/front raise/i,                                           ['deltsFront']],
  // A handstand press is a vertical press, not a push-up, and has to say so
  // before the chest rule reads the word "push".
  [/handstand|\bhspu\b|pike push/i,                          ['deltsFront', 'deltsSide', 'triceps']],

  // An incline press is the clavicular chest's exercise and a decline the
  // sternal one's; a flat press is credited to both because it is.
  [/incline.*(bench|press|fly|flye|push[- ]?up)|(bench|press|fly|flye|push[- ]?up).*incline/i, ['chestUpper', 'deltsFront', 'triceps']],
  [/decline.*(bench|press|fly|flye|push[- ]?up)|(bench|press|fly|flye).*decline/i, ['chestMid', 'triceps']],
  [/svend/i,                                                 ['chestUpper', 'chestMid']],
  [/bench|chest press|push[- ]?up|press[- ]?up|fly|flye|pec/i, ['chestUpper', 'chestMid', 'triceps', 'deltsFront']],
  [/\bdip/i,                                                 ['triceps', 'chestMid']],
  [/overhead press|shoulder press|military|arnold|landmine|\bdelt/i, ['deltsFront', 'deltsSide', 'triceps']],

  [/pullover/i,                                              ['lats', 'chestMid']],
  [/pull[- ]?up|chin[- ]?up|pulldown|\blat\b|lats/i,         ['lats', 'biceps']],
  [/row|shrug|trap/i,                                        ['upperBack', 'biceps']],
  [/curl/i,                                                  ['biceps', 'forearms']],
  [/pushdown|skull|close[- ]?grip/i,                         ['triceps']],

  [/plank|crunch|sit[- ]?up|\babs?\b|hollow|dead bug|bird dog|mountain climber|leg raise|rollout/i, ['abs']],
  [/twist|woodchop|wood chop|side bend|oblique|pallof|anti[- ]?rotation|\brotation\b/i, ['obliques']],
  [/forearm|wrist|grip|farmer/i,                             ['forearms']],

  // Conditioning and full-body work, last: these names are the least specific
  // and would otherwise catch lifts that deserve a better answer.
  [/clean|snatch|thruster|swing/i,                           ['glutes', 'hamstrings', 'deltsFront', 'deltsSide']],
  [/turkish|get[- ]?up/i,                                    ['abs', 'deltsFront', 'deltsSide']],
  [/battle rope|ropes/i,                                     ['deltsFront', 'deltsSide', 'forearms']],
  [/ski erg|skierg/i,                                        ['lats', 'triceps', 'abs']],
  [/treadmill|\brun(ning)?\b|jog|sprint/i,                   ['quads', 'hamstrings', 'calves']],
  [/assault bike|echo bike|air bike|\bbike\b|cycl|\bspin\b/i,  ['quads', 'calves']],
  [/sled|box jump|wall ball|jump squat|burpee/i,             ['quads', 'glutes']],
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
