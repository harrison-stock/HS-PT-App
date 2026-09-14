-- What "archive" and "erase" actually mean, and a clock that enforces the
-- difference without anyone having to remember.
--
-- Until now the two were tangled. Archiving a registered client set a flag;
-- archiving a managed one DELETED the row and everything hanging off it. So the
-- same button on the same screen meant "hide this person" for one kind of
-- client and "destroy their records" for the other, and neither was erasure in
-- any sense a client asking about their data would recognise: the training,
-- health and measurement rows keyed to a client_id with no foreign key were
-- left behind either way.
--
-- The decisions here are the coach's, not the code's, and they are:
--
--   ARCHIVE   they have stopped training with you. Off the roster, signed out,
--             their login stops working. Nothing is deleted and it is
--             reversible.
--   RETAIN    seven years from the day they were archived. That is the usual
--             window for a claim about an injury to surface, and it is the
--             reason to keep health records at all once someone has left.
--   ERASE     everything, at the end of that seven years or on request. Not a
--             flag - the rows go.
--
-- Storage objects are named back to the caller rather than deleted here,
-- because SQL cannot reach the bucket.

-- ── Lifecycle columns ───────────────────────────────────────────────────────
-- archived_at is the retention clock. Without it "archived" is a state with no
-- start date, and a seven-year rule has nothing to count from.
alter table public.profiles
  add column if not exists archived_at timestamptz;

alter table public.managed_clients
  add column if not exists archived    boolean not null default false,
  add column if not exists archived_at timestamptz;

-- Anyone already archived has been so since we don't know when. Dating them
-- from now is the only defensible guess, and it errs towards keeping.
update public.profiles set archived_at = now() where archived is true and archived_at is null;

-- The column guard from 068 starts every update from the old row and copies
-- forward only the fields the caller may change, so a column added later is
-- unwritable until someone names it here. That is the whole design, and it just
-- caught this: archiving set `archived` and silently dropped `archived_at`,
-- leaving a client archived with no date to count seven years from. Named.
create or replace function public.profiles_guard_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inc public.profiles%rowtype := new;
begin
  if auth.uid() is null then
    return new;
  end if;

  new := old;

  if old.trainer_id is not null and old.trainer_id = auth.uid() then
    new.name             := inc.name;
    new.email            := inc.email;
    new.date_of_birth    := inc.date_of_birth;
    new.credits          := inc.credits;
    new.client_status    := inc.client_status;
    new.subscription_due := inc.subscription_due;
    new.timezone         := inc.timezone;
    new.billing_url      := inc.billing_url;
    new.daily_step_goal  := inc.daily_step_goal;
    new.archived         := inc.archived;
    new.archived_at      := inc.archived_at;
    new.coach_notes      := inc.coach_notes;
    new.medical_notes    := inc.medical_notes;

  elsif auth.uid() = old.id then
    new.name              := inc.name;
    new.date_of_birth     := inc.date_of_birth;
    new.timezone          := inc.timezone;
    new.stripe_portal_url := inc.stripe_portal_url;

  end if;

  return new;
end;
$$;

-- ── Erasure requests ────────────────────────────────────────────────────────
-- A client asking to be erased is a thing that has to leave a record: the date
-- they asked is what a response time is measured against, and "we never got it"
-- is not an answer anyone should have to rely on. The coach decides; the
-- request stands either way.
create table if not exists public.erasure_requests (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null,
  trainer_id   uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  status       text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  decided_at   timestamptz,
  decided_by   uuid references public.profiles(id) on delete set null,
  note         text
);
create unique index if not exists erasure_requests_open_idx
  on public.erasure_requests (client_id) where status = 'pending';

alter table public.erasure_requests enable row level security;

drop policy if exists "erasure_requests: client read" on public.erasure_requests;
create policy "erasure_requests: client read" on public.erasure_requests for select
  using (client_id = auth.uid() or trainer_id = auth.uid());

drop policy if exists "erasure_requests: client ask" on public.erasure_requests;
create policy "erasure_requests: client ask" on public.erasure_requests for insert
  with check (client_id = auth.uid() and status = 'pending');

-- Only the coach decides, and only on their own client's request. A client
-- cannot withdraw the record of having asked, which is the point of keeping it.
drop policy if exists "erasure_requests: trainer decide" on public.erasure_requests;
create policy "erasure_requests: trainer decide" on public.erasure_requests for update
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());

-- ── Erasure ─────────────────────────────────────────────────────────────────
-- Every table keyed to a client, and every child reachable only through one.
-- The list is the whole point: an erasure that misses a table is worse than no
-- erasure at all, because it is reported as done.
--
-- Returns what it removed, and the storage paths the caller must delete - the
-- photos and documents themselves live in a bucket this cannot reach, and
-- deleting the row that names a file is not deleting the file.
create or replace function public.erase_client(p_client_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paths   jsonb;
  v_counts  jsonb := '{}'::jsonb;
  v_managed boolean;
  n         int;
begin
  if auth.uid() is null then
    null; -- service role: the retention sweep
  elsif not exists (
      select 1 from public.profiles p where p.id = p_client_id and p.trainer_id = auth.uid()
      union all
      select 1 from public.managed_clients m where m.id = p_client_id and m.trainer_id = auth.uid()
  ) then
    raise exception 'not your client';
  end if;

  -- Collected before anything is deleted; afterwards there is nothing to read.
  select jsonb_build_object(
    'photos',    coalesce((select jsonb_agg(path) from public.progress_photos where client_id = p_client_id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(path) from public.client_documents where client_id = p_client_id), '[]'::jsonb)
  ) into v_paths;

  -- Children first, where the parent is about to go and nothing cascades.
  delete from public.logged_sets ls using public.workout_sessions ws
   where ls.session_id = ws.id and ws.client_id = p_client_id;
  delete from public.client_injury_notes n using public.client_injuries i
   where n.injury_id = i.id and i.client_id = p_client_id;
  delete from public.custom_metric_entries e using public.client_custom_metrics m
   where e.metric_id = m.id and m.client_id = p_client_id;

  -- Their own copies of workouts, and everything under them.
  delete from public.exercise_sets es using public.section_exercises se, public.workout_sections ws, public.programme_days d
   where es.exercise_id = se.id and se.section_id = ws.id and ws.day_id = d.id and d.owner_client_id = p_client_id;
  delete from public.section_exercises se using public.workout_sections ws, public.programme_days d
   where se.section_id = ws.id and ws.day_id = d.id and d.owner_client_id = p_client_id;
  delete from public.workout_sections ws using public.programme_days d
   where ws.day_id = d.id and d.owner_client_id = p_client_id;

  delete from public.workout_sessions      where client_id = p_client_id;  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('workout_sessions', n);
  delete from public.client_workouts       where client_id = p_client_id;  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('client_workouts', n);
  delete from public.programme_days        where owner_client_id = p_client_id; get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('programme_days', n);
  delete from public.client_injuries       where client_id = p_client_id;  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('client_injuries', n);
  delete from public.body_metrics          where client_id = p_client_id;  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('body_metrics', n);
  delete from public.client_custom_metrics where client_id = p_client_id;  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('client_custom_metrics', n);
  delete from public.client_goals          where client_id = p_client_id;  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('client_goals', n);
  delete from public.client_tasks          where client_id = p_client_id;  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('client_tasks', n);
  delete from public.form_responses        where client_id = p_client_id;  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('form_responses', n);
  delete from public.exercise_comments     where client_id = p_client_id;  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('exercise_comments', n);
  delete from public.progress_photos       where client_id = p_client_id;  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('progress_photos', n);
  delete from public.client_documents      where client_id = p_client_id;  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('client_documents', n);
  delete from public.health_daily          where client_id = p_client_id;  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('health_daily', n);
  delete from public.wearable_connections  where client_id = p_client_id;
  delete from public.coach_alerts          where client_id = p_client_id;
  delete from public.push_subscriptions    where user_id  = p_client_id;
  delete from public.notifications         where recipient_id = p_client_id or actor_id = p_client_id;
  delete from public.invites               where managed_client_id = p_client_id or claimed_by = p_client_id;
  delete from public.erasure_requests      where client_id = p_client_id;

  select exists (select 1 from public.managed_clients where id = p_client_id) into v_managed;
  delete from public.managed_clients where id = p_client_id;
  delete from public.profiles        where id = p_client_id;

  return jsonb_build_object(
    'client_id', p_client_id,
    'erased_at', now(),
    'counts',    v_counts,
    'storage',   v_paths,
    -- A registered client still has an auth user, which only the service role
    -- can remove. Saying so is better than leaving a login for a person whose
    -- records are gone.
    'auth_user_remains', not v_managed
  );
end;
$$;

revoke all on function public.erase_client(uuid) from public, anon;
grant execute on function public.erase_client(uuid) to authenticated;

-- Who is due. Seven years from the day they were archived, in one place so the
-- rule is a number in a view rather than a condition copied into a cron job.
create or replace view public.clients_due_erasure as
  select id as client_id, name, archived_at, trainer_id, false as managed
    from public.profiles
   where archived is true and archived_at is not null and archived_at < now() - interval '7 years'
  union all
  select id, name, archived_at, trainer_id, true
    from public.managed_clients
   where archived is true and archived_at is not null and archived_at < now() - interval '7 years';
