// Run every *.test.mjs in this directory. `npm test`, and part of `npm run
// build` so a regression stops a deploy rather than being discovered in
// production - which, on this app, has happened.

import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

// These tests read real zip archives, so they need the streaming and file APIs
// that arrived in Node 20. If the build ever runs on something older, say so
// and get out of the way rather than failing a deploy over the runtime.
const missing = ['File', 'Blob', 'DecompressionStream', 'CompressionStream']
  .filter(g => typeof globalThis[g] === 'undefined');
if (missing.length) {
  console.log(`tests skipped: this Node (${process.version}) has no ${missing.join(', ')} - needs Node 20+`);
  process.exit(0);
}

const files = readdirSync(here).filter(f => f.endsWith('.test.mjs')).sort();
let failed = 0;

for (const f of files) {
  console.log(`\n── ${f} ${'─'.repeat(Math.max(0, 58 - f.length))}`);
  const r = spawnSync(process.execPath, [join(here, f)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}

console.log(`\n${failed ? `✗ ${failed} of ${files.length} test files failed` : `✓ ${files.length} test files passed`}\n`);
process.exit(failed ? 1 : 0);
