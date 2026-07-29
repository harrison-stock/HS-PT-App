// Split loads: showing the per-hand weight for anything held in both hands.
//
// Weights are stored and logged as the TOTAL moved, because that's what volume
// and progression maths need. A client reading "48kg" on a dumbbell press needs
// to know that's two 24s, not one 48. These helpers derive the per-hand figure
// for display only - nothing here changes what's stored.

// Movements normally held one per hand. Used only to pre-fill the toggle when a
// movement is first created or imported; the coach's setting always wins after
// that, so a false positive costs one tap to undo.
const TWO_HANDED = /(^|[^a-z])(db|kb|dumbbell|dumbell|kettlebell)([^a-z]|$)/i;

export function guessSplit(name) {
  return TWO_HANDED.test(String(name || '')) ? 2 : 1;
}

// Returns { n, each } when a split is worth showing, otherwise null.
export function splitLoad(kg, split) {
  const n = parseInt(split) || 1;
  const total = parseFloat(kg);
  if (n < 2 || !total || isNaN(total)) return null;
  // Two decimal places covers the 2.5kg-increment world without showing
  // "24.000000001" from a float divide.
  return { n, each: Math.round((total / n) * 100) / 100 };
}

// "2 × 24kg" - the phrase shown under a prescribed weight.
export function splitLabel(kg, split, unit = 'kg') {
  const s = splitLoad(kg, split);
  return s ? `${s.n} × ${s.each}${unit}` : '';
}
