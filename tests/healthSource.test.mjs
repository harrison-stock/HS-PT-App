// Which source wins when several of them describe the same day.
//
// This is the rule that decides what number a client sees on their own screen
// and what number their coach's drop-off alert compares - so the cases below
// are mostly the same assertion twice with the rows in the other order. That is
// the bug this file exists to catch: a precedence rule that is really just
// whatever order the database happened to return.

import { mergeDaily, stepsByDay, sourceRank } from '../src/lib/healthSource.js';
import { t, eq, group, done } from './assert.mjs';

const DAY = '2026-09-20';
const row = (source, o) => ({ day: DAY, source, steps: null, resting_hr: null, avg_hr: null, weight_kg: null, ...o });
const steps = (...rows) => mergeDaily(rows)[0].steps;

group('Precedence, and the same thing with the rows reversed');
const manual = row('manual', { steps: 9000 });
const watch = row('garmin', { steps: 6200 });
const apple = row('apple_health', { steps: 5400 });

t('a worn device beats a number someone typed', steps(manual, watch) === 6200);
t('  - in either row order', steps(watch, manual) === 6200);
t('a worn device beats an Apple Health export', steps(apple, watch) === 6200);
t('  - in either row order', steps(watch, apple) === 6200);
t('an export beats a number someone typed', steps(manual, apple) === 5400);
t('  - in either row order', steps(apple, manual) === 5400);
t('all three present resolve to the watch', steps(apple, manual, watch) === 6200);
t('  - in any of six orders', [
  [apple, manual, watch], [apple, watch, manual], [manual, apple, watch],
  [manual, watch, apple], [watch, apple, manual], [watch, manual, apple],
].every(o => steps(...o) === 6200));

group('Merging is per field, not per row');
// A watch that reported steps but no weight must not blank out the weight a set
// of scales sent for the same day.
const merged = mergeDaily([
  row('withings', { weight_kg: 80.4 }),
  row('garmin', { steps: 6200, resting_hr: 51 }),
  row('apple_health', { steps: 5400, weight_kg: 79.9, avg_hr: 68 }),
])[0];
eq('the whole day resolves field by field', merged,
  { day: DAY, steps: 6200, resting_hr: 51, avg_hr: 68, weight_kg: 80.4 });

group('Stability and edges');
t('two equally-ranked devices resolve the same way whatever the row order',
  steps(row('fitbit', { steps: 1 }), row('withings', { steps: 2 })) ===
  steps(row('withings', { steps: 2 }), row('fitbit', { steps: 1 })));
t('an unrecognised source is treated as a live device',
  sourceRank('whoop') === 2 && sourceRank('apple_health') === 1 && sourceRank('manual') === 0);
eq('days come back oldest first',
  mergeDaily([row('garmin', { steps: 1 }), { ...row('garmin', { steps: 2 }), day: '2026-09-01' }]).map(d => d.day),
  ['2026-09-01', DAY]);
t('nothing in, nothing out', mergeDaily([]).length === 0 && mergeDaily(null).length === 0);

group('The coach-side view uses the same rule');
eq('days with no steps are left out', stepsByDay([
  row('garmin', { resting_hr: 50 }),
  { ...row('garmin', { steps: 5 }), day: '2026-09-01' },
]), { '2026-09-01': 5 });
t('and precedence still applies', stepsByDay([manual, watch])[DAY] === 6200);

done(15);
