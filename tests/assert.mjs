// The smallest thing that will do. No runner, no config, no dependency that
// needs installing before a test can be run.

let pass = 0, fail = 0;
const failures = [];

export function t(name, cond, detail) {
  if (cond) { pass++; return }
  fail++;
  failures.push(name);
  console.log(`  FAIL  ${name}${detail === undefined ? '' : `\n          got: ${JSON.stringify(detail)}`}`);
}

export const eq = (name, actual, expected) =>
  t(name, JSON.stringify(actual) === JSON.stringify(expected), actual);

export function group(name) { console.log(`\n${name}`) }
export function note(line) { console.log(`  · ${line}`) }

/**
 * Report and set the exit code.
 *
 * The expected count is passed in and checked, because a test file that throws
 * halfway through, or one where a rename quietly orphans a block, otherwise
 * reports "all green" on whatever it managed to reach.
 */
export function done(expected) {
  const total = pass + fail;
  if (total !== expected) {
    console.log(`\n✗ ran ${total} checks, expected ${expected} - a test was skipped, added or lost`);
    process.exitCode = 1;
    return;
  }
  console.log(`\n${fail ? '✗' : '✓'} ${pass}/${total} passed`);
  if (fail) process.exitCode = 1;
}
