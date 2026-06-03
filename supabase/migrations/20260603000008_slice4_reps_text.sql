-- Reps as free text (e.g. "8-10", "AMRAP") for programme builder
alter table public.exercise_sets add column if not exists reps_text text not null default '';

-- Workout sessions: one row per completed client session
create table if not exists public.workout_sessions (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.profiles(id) on delete cascade,
  day_id       uuid not null references public.programme_days(id) on delete cascade,
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  notes        text not null default '',
  created_at   timestamptz not null default now()
);
alter table public.workout_sessions enable row level security;
drop policy if exists "workout_sessions: client own"   on public.workout_sessions;
drop policy if exists "workout_sessions: trainer read" on public.workout_sessions;
create policy "workout_sessions: client own" on public.workout_sessions for all
  using  (client_id = auth.uid())
  with check (client_id = auth.uid());
create policy "workout_sessions: trainer read" on public.workout_sessions for select
  using (exists (
    select 1 from public.profiles p
    where p.id = client_id and p.trainer_id = auth.uid()
  ));

-- Logged sets: one row per completed set
create table if not exists public.logged_sets (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id      uuid not null references public.section_exercises(id) on delete cascade,
  set_index        integer not null,
  actual_reps      integer,
  actual_weight_kg numeric(6,2),
  actual_time_secs integer,
  intensity        integer check (intensity between 1 and 10),
  completed_at     timestamptz not null default now()
);
alter table public.logged_sets enable row level security;
drop policy if exists "logged_sets: client own"   on public.logged_sets;
drop policy if exists "logged_sets: trainer read" on public.logged_sets;
create policy "logged_sets: client own" on public.logged_sets for all
  using (exists (
    select 1 from public.workout_sessions ws
    where ws.id = session_id and ws.client_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.workout_sessions ws
    where ws.id = session_id and ws.client_id = auth.uid()
  ));
create policy "logged_sets: trainer read" on public.logged_sets for select
  using (exists (
    select 1 from public.workout_sessions ws
    join   public.profiles p on p.id = ws.client_id
    where  ws.id = session_id and p.trainer_id = auth.uid()
  ));
