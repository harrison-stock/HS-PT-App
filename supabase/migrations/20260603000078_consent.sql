-- Explicit consent for health data, recorded rather than assumed.
--
-- Article 9 needs a second basis on top of the Article 6 one, and nearly
-- everything this app stores about a client is health data: injuries, medical
-- notes, measurements, photographs, resting heart rate. The route a personal
-- trainer usually takes is explicit consent, and explicit consent has
-- requirements a tickbox in the terms does not meet. It has to be specific,
-- separate from other agreements, a positive act, recorded, and as easy to
-- withdraw as it was to give.
--
-- Two design choices follow from those requirements.
--
-- First, granularity. Bundling everything into one "I agree" makes the whole
-- thing conditional on the service, and consent that is a precondition of being
-- coached is on shaky ground as freely given. Split up, most of it isn't a
-- precondition at all: injuries and measurements are genuinely needed to
-- programme safely, but progress photographs and a wearable feed are not. So
-- those are separately optional, and refusing them costs the client nothing but
-- the feature. That is also just true, which is the test worth applying.
--
-- Second, append-only. A consent record is never updated. Granting writes a
-- row, withdrawing writes another, and the current position is the latest row
-- for that client and purpose. An audit trail you can edit is not one - "they
-- consented" has to be answerable with what they were shown and when, not with
-- a boolean somebody could have flipped.
create table if not exists public.consent_records (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null,
  purpose     text not null check (purpose in ('health_core', 'photos', 'wearables')),
  granted     boolean not null,
  -- The wording they actually saw, and its version. Keeping the text is the
  -- whole evidentiary point: a version number alone proves nothing once the
  -- wording has moved on, and "we can show what they were told" is the claim
  -- that has to survive.
  version     text not null,
  wording     text not null,
  method      text not null default 'app' check (method in ('app', 'coach_recorded')),
  recorded_at timestamptz not null default now(),
  recorded_by uuid
);

create index if not exists consent_records_client_idx
  on public.consent_records (client_id, purpose, recorded_at desc);

alter table public.consent_records enable row level security;

-- The client decides, and can see every decision they have made.
drop policy if exists "consent_records: client read" on public.consent_records;
create policy "consent_records: client read" on public.consent_records for select
  using (
    client_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = client_id and p.trainer_id = auth.uid())
    or exists (select 1 from public.managed_clients m where m.id = client_id and m.trainer_id = auth.uid())
  );

drop policy if exists "consent_records: client record" on public.consent_records;
create policy "consent_records: client record" on public.consent_records for insert
  with check (client_id = auth.uid() and recorded_by = auth.uid() and method = 'app');

-- A coach may record consent given on paper - an in-person client signing a
-- form - but only as their own act, marked as such, and never as the client.
drop policy if exists "consent_records: coach record" on public.consent_records;
create policy "consent_records: coach record" on public.consent_records for insert
  with check (
    method = 'coach_recorded'
    and recorded_by = auth.uid()
    and (
      exists (select 1 from public.profiles p where p.id = client_id and p.trainer_id = auth.uid())
      or exists (select 1 from public.managed_clients m where m.id = client_id and m.trainer_id = auth.uid())
    )
  );

-- No update, no delete policy, for anybody. Withdrawing writes a new row.

-- Where each client currently stands: the latest decision per purpose.
create or replace view public.current_consent as
  select distinct on (client_id, purpose)
         client_id, purpose, granted, version, method, recorded_at
    from public.consent_records
   order by client_id, purpose, recorded_at desc;

-- Erasure has to take this with it.
--
-- The dynamic check in the test suite walks every table with a client_id and
-- would have caught the omission eventually - but only once a client happened
-- to have both consent records and an erasure in the same run, which is exactly
-- the kind of gap that sits unnoticed. Added deliberately rather than waiting
-- for it to be found.
--
-- There is an argument for keeping proof of consent after erasing everything
-- else. It does not survive contact with the point: a row saying "this person
-- agreed to us holding their injury history" is itself a record about a
-- identifiable person, and keeping it after they asked to be forgotten would be
-- the same mistake in miniature.
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

  select jsonb_build_object(
    'photos',    coalesce((select jsonb_agg(path) from public.progress_photos where client_id = p_client_id), '[]'::jsonb),
    'documents', coalesce((select jsonb_agg(path) from public.client_documents where client_id = p_client_id), '[]'::jsonb)
  ) into v_paths;

  delete from public.logged_sets ls using public.workout_sessions ws
   where ls.session_id = ws.id and ws.client_id = p_client_id;
  delete from public.client_injury_notes n using public.client_injuries i
   where n.injury_id = i.id and i.client_id = p_client_id;
  delete from public.custom_metric_entries e using public.client_custom_metrics m
   where e.metric_id = m.id and m.client_id = p_client_id;

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
  delete from public.consent_records       where client_id = p_client_id;  get diagnostics n = row_count; v_counts := v_counts || jsonb_build_object('consent_records', n);
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
    'auth_user_remains', not v_managed
  );
end;
$$;
