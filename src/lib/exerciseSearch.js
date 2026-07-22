// Search shorthand for exercises - typing an abbreviation matches the full word
// so "bb bench" finds "Barbell Bench Press", "db" finds dumbbell work, etc.
// Each key is a typed token; values are phrases that may appear in the name.
export const EXERCISE_ABBR = {
  bb:   ['barbell'],
  db:   ['dumbbell'],
  bw:   ['bodyweight', 'body weight'],
  kb:   ['kettlebell'],
  cb:   ['cable'],
  sm:   ['smith'],
  ez:   ['ez bar', 'ez-bar'],
  mb:   ['medicine ball', 'med ball'],
  ohp:  ['overhead press'],
  rdl:  ['romanian deadlift'],
  bp:   ['bench press'],
  dl:   ['deadlift'],
  sq:   ['squat'],
  bss:  ['bulgarian split squat'],
  gm:   ['good morning'],
  cg:   ['close grip', 'close-grip'],
  wg:   ['wide grip', 'wide-grip'],
  sa:   ['single arm', 'single-arm', 'one arm'],
  sl:   ['single leg', 'single-leg', 'one leg'],
  hspu: ['handstand push'],
};

// Tokens of the query must each match the name (AND), where a token matches if
// it appears in the name OR is an abbreviation whose expansion appears.
export function exerciseMatches(name, query, extra = '') {
  const hay = `${name || ''} ${extra || ''}`.toLowerCase();
  const q = (query || '').trim().toLowerCase();
  if (!q) return true;
  return q.split(/\s+/).every(term => {
    if (hay.includes(term)) return true;
    const exp = EXERCISE_ABBR[term];
    return !!exp && exp.some(e => hay.includes(e));
  });
}
