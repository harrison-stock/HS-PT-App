-- A coach must be able to write inside a client's own workout.
--
-- Migration 060 taught programme_days that a day can belong to a person rather
-- than a phase, but the tables underneath it were left reaching through
-- phase_id to find the owning programme:
--
--   workout_sections -> programme_days -> programme_phases -> programmes
--
-- That join is an inner one. A client's copy has no phase, so it produced no
-- rows and the policy denied everything - inserting the copied sections
-- included. Assigning a single day therefore created an empty workout, and
-- editing a client's workout in the builder wrote nothing at all.
--
-- It went unnoticed because the 060 backfill ran as the migration user, which
-- bypasses row-level security entirely. The app does not.
--
-- Each policy now accepts either route to an owner: through the programme, as
-- before, or directly through the client the day belongs to.

-- Is this day mine to edit: either it sits in a programme I own, or it belongs
-- to one of my clients. Security definer for the same reason is_my_programme
-- is - the policy needs to see rows the caller cannot select directly.
create or replace function public.is_my_day(d_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.programme_days d
     where d.id = d_id
       and (
         exists (select 1 from public.programme_phases ph
                  where ph.id = d.phase_id and public.is_my_programme(ph.programme_id))
         or exists (select 1 from public.profiles p
                     where p.id = d.owner_client_id and p.trainer_id = auth.uid())
       )
  );
$$;

drop policy if exists "workout_sections: trainer all" on public.workout_sections;
create policy "workout_sections: trainer all" on public.workout_sections for all
  using      (public.is_my_day(workout_sections.day_id))
  with check (public.is_my_day(workout_sections.day_id));

drop policy if exists "section_exercises: trainer all" on public.section_exercises;
create policy "section_exercises: trainer all" on public.section_exercises for all
  using (exists (
    select 1 from public.workout_sections s
     where s.id = section_exercises.section_id and public.is_my_day(s.day_id)))
  with check (exists (
    select 1 from public.workout_sections s
     where s.id = section_exercises.section_id and public.is_my_day(s.day_id)));

drop policy if exists "exercise_sets: trainer all" on public.exercise_sets;
create policy "exercise_sets: trainer all" on public.exercise_sets for all
  using (exists (
    select 1 from public.section_exercises ex
      join public.workout_sections s on s.id = ex.section_id
     where ex.id = exercise_sets.exercise_id and public.is_my_day(s.day_id)))
  with check (exists (
    select 1 from public.section_exercises ex
      join public.workout_sections s on s.id = ex.section_id
     where ex.id = exercise_sets.exercise_id and public.is_my_day(s.day_id)));

-- ── Repair ───────────────────────────────────────────────────────────────────
-- Copies created while the policies denied the write are sitting empty on
-- clients' calendars. Refill any that have no sections at all from the template
-- they came from. Runs as the migration user, so the policies above don't apply
-- - which is the same reason this went unnoticed in the first place.
--
-- Only completely empty copies are touched. One a coach has deliberately
-- stripped back would look identical to a failed one, but a client's workout
-- that genuinely has nothing in it is not a state worth preserving.
do $$
declare
  r         record;
  s         record;
  e         record;
  v_new_sec uuid;
  v_new_ex  uuid;
  v_fixed   int := 0;
begin
  for r in
    select d.id, d.origin_day_id
      from public.programme_days d
     where d.owner_client_id is not null
       and d.origin_day_id is not null
       and not exists (select 1 from public.workout_sections ws where ws.day_id = d.id)
       and exists (select 1 from public.workout_sections ws where ws.day_id = d.origin_day_id)
  loop
    for s in select * from public.workout_sections where day_id = r.origin_day_id order by sort_order loop
      insert into public.workout_sections (day_id, kind, title, sort_order, intro, icon)
      values (r.id, s.kind, s.title, s.sort_order, s.intro, s.icon)
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
      end loop;
    end loop;
    v_fixed := v_fixed + 1;
  end loop;

  raise notice 'empty client workouts refilled: %', v_fixed;
end $$;
