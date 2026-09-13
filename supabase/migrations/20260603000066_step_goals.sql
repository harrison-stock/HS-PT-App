-- Out-of-gym activity: a target to hit, a way to enter it by hand, and a way
-- for the coach to be told when someone stops moving.
--
-- ── First, make sure the tables this alters are actually there ───────────────
--
-- This migration shipped assuming health_daily existed, because migration 030
-- creates it. In production it did not: 030 sits below the runner's baseline,
-- and the baseline is a guess. The runner records every file up to 054 as
-- applied on the evidence of a single column (exercises.load_split, from 052)
-- being present - which proves that one migration ran and nothing about the
-- other fifty-three. 030 had never actually been applied, so this file failed
-- on `drop policy ... on public.health_daily`, and it failed on every deploy
-- from 6 September onwards. Nothing merged after that date reached production:
-- not the step tracking this migration is for, and not the access-control
-- fixes that followed it.
--
-- So it now creates what it alters. Every statement is guarded, so this is a
-- no-op against a database where 030 did run, and a repair against one where
-- it did not. Editing a migration that has shipped is normally forbidden - but
-- this one has never once applied anywhere, so there is no database in which
-- its old contents are recorded as done.
--
-- The runner's baseline check is widened in the same change, so the next table
-- the baseline invents is caught by the build rather than by a feature quietly
-- doing nothing.

create table if not exists public.health_daily (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null,
  day         date not null,
  source      text not null default 'wearable',
  steps       int,
  resting_hr  int,
  avg_hr      int,
  weight_kg   numeric(6,2),
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (client_id, day, source)
);
alter table public.health_daily enable row level security;

drop policy if exists "health_daily: client all" on public.health_daily;
create policy "health_daily: client all" on public.health_daily for all
  using (client_id = auth.uid()) with check (client_id = auth.uid());

create table if not exists public.wearable_connections (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.profiles(id) on delete cascade,
  provider     text not null,
  status       text not null default 'connected',
  ref_user_id  text,
  last_sync    timestamptz,
  created_at   timestamptz not null default now(),
  unique (client_id, provider)
);
alter table public.wearable_connections enable row level security;

drop policy if exists "wearable_connections: client all" on public.wearable_connections;
create policy "wearable_connections: client all" on public.wearable_connections for all
  using (client_id = auth.uid()) with check (client_id = auth.uid());

drop policy if exists "wearable_connections: trainer read" on public.wearable_connections;
create policy "wearable_connections: trainer read" on public.wearable_connections for select
  using (
    exists (select 1 from public.profiles p where p.id = client_id and p.trainer_id = auth.uid())
    or exists (select 1 from public.managed_clients mc where mc.id = client_id and mc.trainer_id = auth.uid())
  );

-- ── The step goal itself ────────────────────────────────────────────────────
--
-- The wearable plumbing (health_daily, wearable_connections, the ingest-health
-- function) has existed since slice 31 but was only ever a read-out: numbers
-- arrived, drew a chart, and nothing followed. Three gaps closed here.

-- ── 1. A standing daily step target ──────────────────────────────────────────
-- Deliberately a number on the client, not a task per day.
--
-- A daily task would have meant a row per client per day forever, a task list
-- that fills with yesterday's steps, and a recurrence chain that stalls the
-- first time someone misses one. A step goal is not a to-do; it is a standing
-- target that today either meets or doesn't. So it is one integer, and the
-- comparison happens at read time against whatever health_daily holds.
alter table if exists public.profiles
  add column if not exists daily_step_goal int;
alter table if exists public.managed_clients
  add column if not exists daily_step_goal int;

-- ── 2. Let health_daily hold a managed client, and a coach write to it ───────
-- The table was built for wearable webhooks, which only ever fire for someone
-- with an account, so client_id pointed at profiles. Manual entry breaks that
-- assumption: the clients most likely to need steps typed in for them are the
-- ones who haven't signed up yet. body_metrics already omits the constraint for
-- exactly this reason.
alter table if exists public.health_daily
  drop constraint if exists health_daily_client_id_fkey;

-- The read policy stays as it was; this adds writing, on the same terms as
-- every other client-owned table: a coach may write for their own clients,
-- real or managed, and nobody else's.
drop policy if exists "health_daily: trainer read"  on public.health_daily;
drop policy if exists "health_daily: trainer write" on public.health_daily;
create policy "health_daily: trainer write" on public.health_daily for all
  using (
    exists (select 1 from public.profiles p where p.id = client_id and p.trainer_id = auth.uid())
    or exists (select 1 from public.managed_clients mc where mc.id = client_id and mc.trainer_id = auth.uid())
  )
  with check (
    exists (select 1 from public.profiles p where p.id = client_id and p.trainer_id = auth.uid())
    or exists (select 1 from public.managed_clients mc where mc.id = client_id and mc.trainer_id = auth.uid())
  );

-- Manual entry upserts on (client_id, day, source), which the original table
-- already declares unique. A typed figure and a synced one can therefore sit
-- side by side for the same day, and the reader decides which wins.

-- ── 3. Somewhere to record that the coach has been told ──────────────────────
-- The drop-off sweep runs daily and would otherwise say the same thing every
-- morning for as long as someone stayed on the sofa, which is how a useful
-- alert becomes one that gets swiped away unread. One row per coach per client
-- per kind of alert, carrying the date it last went out.
create table if not exists public.coach_alerts (
  id         uuid primary key default gen_random_uuid(),
  coach_id   uuid not null references public.profiles(id) on delete cascade,
  client_id  uuid not null,
  kind       text not null,
  sent_on    date not null default current_date,
  detail     text,
  created_at timestamptz not null default now(),
  unique (coach_id, client_id, kind)
);
alter table public.coach_alerts enable row level security;

-- Read-only to the coach it belongs to. Written by the cron under the service
-- role and by nothing else, so an alert can't be forged or cleared from the
-- app to silence it.
drop policy if exists "coach_alerts: coach read" on public.coach_alerts;
create policy "coach_alerts: coach read" on public.coach_alerts for select
  using (coach_id = auth.uid());

create index if not exists health_daily_client_day_idx
  on public.health_daily (client_id, day desc);
