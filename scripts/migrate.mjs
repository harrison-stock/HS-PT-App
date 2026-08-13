#!/usr/bin/env node
// Apply pending SQL migrations before the app that depends on them ships.
//
// Migrations used to be applied by hand, which meant a deploy could reach
// production ahead of its schema. When that happened the queries naming the new
// column failed, and because the builder deletes a day's sections before
// re-inserting them, a failed insert left the day empty rather than merely
// missing a column. Hence this.
//
// Runs from the Vercel build, before `vite build`, so a failed migration fails
// the deploy instead of shipping code the database can't serve.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'migrations');

// Everything up to and including this was applied by hand before the runner
// existed. Those files aren't all safe to re-run (several create policies
// without dropping them first), so the first run records them as done rather
// than executing them. Anything after it is applied normally.
const BASELINE = '20260603000054_seed_load_split.sql';

// Baselining is a claim about a database nobody has checked, so it's worth one
// piece of evidence before making it. exercises.load_split arrives in migration
// 052; if it's missing, the database is further behind than the baseline says
// and recording 54 files as done would bury that for good.
const BASELINE_PROOF = `
  select 1 from information_schema.columns
   where table_schema = 'public' and table_name = 'exercises'
     and column_name = 'load_split'`;

// One arbitrary but fixed key, so two builds can't migrate at the same time.
const LOCK_KEY = 4977123;

const log = (...a) => console.log('[migrate]', ...a);

const url = process.env.SUPABASE_DB_URL || process.env.DATABASE_URL;
if (!url) {
  // A local `npm run build`, or a preview without the secret. Not an error -
  // the app tolerates a database that's behind, it just can't use what's new.
  log('no SUPABASE_DB_URL set - skipping migrations');
  process.exit(0);
}

// Preview deploys share production's database unless someone has pointed them
// elsewhere, so they don't migrate by default.
const onVercel = !!process.env.VERCEL;
const env = process.env.VERCEL_ENV;
if (onVercel && env !== 'production' && process.env.MIGRATE_ON_PREVIEW !== '1') {
  log(`VERCEL_ENV=${env} - skipping (set MIGRATE_ON_PREVIEW=1 to override)`);
  process.exit(0);
}

const files = readdirSync(DIR).filter(f => f.endsWith('.sql')).sort();
if (!files.length) { log('no migration files found'); process.exit(0); }

const client = new pg.Client({
  connectionString: url,
  // Supabase terminates plain connections; its CA isn't in the build image.
  ssl: url.includes('localhost') || url.includes('127.0.0.1') ? false : { rejectUnauthorized: false },
});

let locked = false;
try {
  await client.connect();
  await client.query(`
    create table if not exists public.schema_migrations (
      version     text primary key,
      applied_at  timestamptz not null default now()
    )`);

  await client.query('select pg_advisory_lock($1)', [LOCK_KEY]);
  locked = true;

  const { rows } = await client.query('select version from public.schema_migrations');
  const done = new Set(rows.map(r => r.version));

  // First run: take the pre-existing schema as read.
  if (done.size === 0) {
    const { rowCount } = await client.query(BASELINE_PROOF);
    if (!rowCount) {
      throw new Error(
        'refusing to baseline: exercises.load_split is missing, so this database ' +
        'is behind migration 052. Bring it up to ' + BASELINE + ' by hand first, ' +
        'or seed public.schema_migrations with the versions it really has.'
      );
    }
    const already = files.filter(f => f <= BASELINE);
    for (const f of already) {
      await client.query('insert into public.schema_migrations (version) values ($1) on conflict do nothing', [f]);
      done.add(f);
    }
    log(`first run - baselined ${already.length} migration(s) up to ${BASELINE}`);
  }

  const pending = files.filter(f => !done.has(f));
  if (!pending.length) { log('up to date'); }

  for (const f of pending) {
    const sql = readFileSync(join(DIR, f), 'utf8');
    log(`applying ${f}`);
    try {
      await client.query('begin');
      await client.query(sql);
      await client.query('insert into public.schema_migrations (version) values ($1)', [f]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback').catch(() => {});
      // Fail the build. Shipping the app against a schema it expects to have
      // and doesn't is the thing this script exists to prevent.
      log(`FAILED on ${f}: ${err.message}`);
      throw err;
    }
  }
  if (pending.length) log(`applied ${pending.length} migration(s)`);
} catch (err) {
  console.error('[migrate] migration failed - aborting the build');
  console.error(err.message);
  // The two ways the connection string itself is wrong are both worth naming,
  // because neither error says anything about Supabase.
  // Two colons in the address is an IPv6 one; node puts it on err.address, and
  // in the message either way.
  if (err.code === 'ENETUNREACH' && /:.*:/.test(err.address || err.message || '')) {
    console.error(
      "[migrate] that's an IPv6 address, and Vercel's build machines are IPv4-only. " +
      "Supabase's direct connection (db.<ref>.supabase.co) is IPv6 unless the project " +
      'has the IPv4 add-on. Use the Session pooler string from the Connect dialog ' +
      'instead: postgres.<ref>@aws-N-<region>.pooler.supabase.com:5432.'
    );
  }
  if (url.includes(':6543')) {
    console.error(
      '[migrate] port 6543 is the transaction pooler, which cannot run DDL or hold ' +
      'an advisory lock. Use the session pooler on 5432.'
    );
  }
  process.exitCode = 1;
} finally {
  if (locked) await client.query('select pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => {});
  await client.end().catch(() => {});
}
