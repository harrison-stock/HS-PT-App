# Database migrations

SQL lives in `supabase/migrations/`, one file per change, named
`YYYYMMDDNNNNNN_short_name.sql`. They are applied in filename order.

They used to be applied by hand. That is what broke the app in August 2026: a
deploy naming `library_exercise_id` reached production while the column was
still only in a file in this folder, and because the programme builder deletes a
day's sections before re-inserting them, the failing insert left days
permanently empty. `scripts/migrate.mjs` exists so that can't happen again — it
runs as the first half of `npm run build`, so a migration that fails takes the
deploy down with it instead of shipping code the database can't serve.

## Vercel setup

One environment variable, **`SUPABASE_DB_URL`**, scoped to **Production** only.

Get it from the **Connect** button at the top of the Supabase project — not from
Settings, which no longer carries a Database page.

Pick the **Direct connection** tab (port `5432`), or **Session pooler** if the
project has no direct IPv4. Do *not* use the **Transaction pooler** on port
`6543`: it can't hold the advisory lock or run the DDL these migrations are made
of.

```
postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres
```

The URI arrives with `[YOUR-PASSWORD]` as a placeholder. That's the database
password, not the anon key or the service role key; if it isn't saved anywhere,
reset it under **Database** in the left sidebar. URL-encode it if it contains
`@`, `:`, `/` or `?`.

Nothing else changes — `vercel.json`, the build command and the install step all
stay as they are.

## What happens on a deploy

```
npm run build
  └─ node scripts/migrate.mjs   applies anything not yet recorded
  └─ vite build                 only if that succeeded
```

- **No `SUPABASE_DB_URL`** — skips, exit 0. That is a local `npm run build`, or
  a preview without the secret. The app tolerates a database that's behind; it
  just can't use what's new.
- **Preview deploys** — skipped, because previews point at the production
  database unless somebody has deliberately given them their own. Set
  `MIGRATE_ON_PREVIEW=1` on a preview that has its own database.
- **Production** — takes an advisory lock so two concurrent builds can't race,
  applies each pending file in its own transaction, records it in
  `public.schema_migrations`, and rolls back the file if it throws.

## The baseline

Migrations 001–054 were applied by hand before the runner existed, and several
of them create policies without dropping them first, so they aren't safe to
re-run. On its very first run against a database the script records everything
up to and including `20260603000054_seed_load_split.sql` as applied *without
executing it*, then applies 055 onward normally.

Before it does that it checks for `exercises.load_split` (added by migration
052). If that column is missing the database is further behind than the baseline
claims, and the script refuses rather than marking 54 files done that aren't.
Bring such a database up to 054 by hand first, or insert the versions it really
has into `public.schema_migrations`.

Recording is by filename, so **never rename or renumber a migration that has
shipped** — it will be applied a second time.

## Running it by hand

```bash
SUPABASE_DB_URL='postgresql://...' npm run migrate
```

Safe to run repeatedly; already-applied files are skipped.

## Writing a new one

Write it so re-running it is harmless — `if not exists`, `drop ... if exists`
before `create`, `on conflict do nothing`. The runner won't apply a file twice,
but hand-runs, restored backups and the baseline all mean a file can meet a
database that already has its changes.

Since the deploy now carries the schema with it, new code no longer needs the
`// Fallback if migration NNN isn't applied yet` pattern that appears throughout
`src/`. Leave the existing ones alone — they cost nothing and they cover
databases that are behind — but don't add more.
