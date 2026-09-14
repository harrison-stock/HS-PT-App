-- Finishing the client-owned-day model: managed clients get to own one too.
--
-- Migration 060 gave every client their own copy of an assigned workout, so a
-- coach could change one person's Thursday without touching the template every
-- other client is running. It declared ownership as:
--
--   owner_client_id uuid references public.profiles(id) on delete cascade
--
-- Managed clients are not in profiles. They are the coach's own records for
-- someone who hasn't joined the app - which is most of an in-person roster -
-- and their ids live in managed_clients. So the constraint cannot be satisfied
-- for them at all: 060's backfill skipped their assignments, and every runtime
-- copy for one of them has been failing on the foreign key ever since.
--
-- That failure is not loud. materialiseDay falls back to the template on error,
-- so a managed client assigned a workout gets the shared row on their calendar,
-- and the next edit to "their" Thursday rewrites the programme for everyone.
--
-- The constraint is the wrong half, and the same was true of health_daily in
-- 066. client_id columns across this schema - body_metrics, client_workouts,
-- client_tasks - deliberately carry no profiles reference for exactly this
-- reason: a client is one of two kinds of row.
alter table public.programme_days
  drop constraint if exists programme_days_owner_client_id_fkey;

-- Dropping the constraint drops its cascade, and an owned day belongs to its
-- owner however that owner is stored. A trigger takes over so nothing is
-- orphaned - covering both kinds of client, which the old cascade never did.
create or replace function public.drop_owned_days()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.programme_days where owner_client_id = old.id;
  return old;
end;
$$;

drop trigger if exists profiles_drop_owned_days on public.profiles;
create trigger profiles_drop_owned_days
  after delete on public.profiles
  for each row execute function public.drop_owned_days();

drop trigger if exists managed_clients_drop_owned_days on public.managed_clients;
create trigger managed_clients_drop_owned_days
  after delete on public.managed_clients
  for each row execute function public.drop_owned_days();

-- ── Repair the assignments 060 could not make ───────────────────────────────
-- Any scheduled workout still pointing at a shared template. For a managed
-- client that is every one of them; for anyone else it is whatever has been
-- assigned since, through the failing path. Each gets the copy it should have
-- had, built the same way 060 built the others.
do $$
declare
  r          record;
  s          record;
  e          record;
  v_new_day  uuid;
  v_new_sec  uuid;
  v_new_ex   uuid;
  v_copies   int := 0;
begin
  for r in
    select distinct cw.client_id, cw.day_id
      from public.client_workouts cw
      join public.programme_days d on d.id = cw.day_id
     where d.owner_client_id is null
  loop
    insert into public.programme_days
      (phase_id, week_index, day_of_week, notes, intro, image_url, title, owner_client_id, origin_day_id, copied_at)
    select null, d.week_index, d.day_of_week, d.notes, d.intro, d.image_url, d.title, r.client_id, d.id, now()
      from public.programme_days d where d.id = r.day_id
    returning id into v_new_day;

    for s in select * from public.workout_sections where day_id = r.day_id order by sort_order loop
      insert into public.workout_sections (day_id, kind, title, sort_order, intro, icon)
      values (v_new_day, s.kind, s.title, s.sort_order, s.intro, s.icon)
      returning id into v_new_sec;

      for e in select * from public.section_exercises where section_id = s.id order by sort_order loop
        insert into public.section_exercises
          (section_id, name, img_url, timed, sort_order, tempo, coach_notes, superset_group,
           alternates, banded, unilateral, load_split, library_exercise_id)
        values
          (v_new_sec, e.name, e.img_url, e.timed, e.sort_order, e.tempo, e.coach_notes, e.superset_group,
           e.alternates, e.banded, e.unilateral, e.load_split, e.library_exercise_id)
        returning id into v_new_ex;

        insert into public.exercise_sets
          (exercise_id, set_index, kind, reps, weight_kg, rest_secs, time_secs, intensity, reps_text, band)
        select v_new_ex, set_index, kind, reps, weight_kg, rest_secs, time_secs, intensity, reps_text, band
          from public.exercise_sets where exercise_id = e.id;

        -- What this client logged against the template exercise belongs to
        -- their copy of it, so a finished session still lines its sets up with
        -- the movements that prescribed them.
        update public.logged_sets ls
           set exercise_id = v_new_ex
          from public.workout_sessions ws
         where ls.session_id = ws.id
           and ws.client_id = r.client_id
           and ls.exercise_id = e.id;
      end loop;
    end loop;

    update public.workout_sessions
       set day_id = v_new_day
     where client_id = r.client_id and day_id = r.day_id;

    update public.client_workouts
       set day_id = v_new_day
     where client_id = r.client_id and day_id = r.day_id;

    v_copies := v_copies + 1;
  end loop;

  raise notice 'owned-day copies repaired: %', v_copies;
end $$;

-- Nothing on a calendar should point at a template any more. Said as an index
-- rather than a constraint because a template day legitimately has no owner -
-- it is only being scheduled that makes ownership necessary.
create index if not exists programme_days_unowned_idx
  on public.programme_days (id) where owner_client_id is null;
