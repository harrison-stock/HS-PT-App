-- Assignment becomes a copy.
--
-- Until now a client's calendar pointed at the programme's own day row, so the
-- schedule was a snapshot while the content stayed live. Editing a programme
-- silently rewrote it for every client already on it, and for sessions they had
-- already finished; there was no way to change one client's Thursday; and Sync
-- existed only to patch the frozen half. It is also the root of the delete
-- cascade that cost logged sets - migrations 056 and 057 held that off, this
-- removes the reason.
--
-- Rather than a parallel set of tables, a client's copy is an ordinary
-- programme_days row that belongs to a person instead of a phase. Every read
-- path, RLS policy and builder already understands that shape, so the copy is
-- interchangeable with the original everywhere it matters.
--
--   phase_id null + owner_client_id set  ->  this client's own workout
--   phase_id set  + owner_client_id null ->  a programme's template day
--
-- One copy per client per template day. A day repeated on two dates is the same
-- workout in that client's plan, and giving it two copies would leave a logged
-- session with no single day to belong to.

-- ── Schema ───────────────────────────────────────────────────────────────────
alter table public.programme_days alter column phase_id drop not null;

alter table public.programme_days
  add column if not exists owner_client_id uuid references public.profiles(id) on delete cascade,
  -- Which template it came from. Nulled rather than cascaded if the programme
  -- is deleted: the client still did the work, it just no longer traces back.
  add column if not exists origin_day_id   uuid references public.programme_days(id) on delete set null;

create index if not exists programme_days_owner_idx  on public.programme_days (owner_client_id) where owner_client_id is not null;
create index if not exists programme_days_origin_idx on public.programme_days (origin_day_id)   where origin_day_id is not null;

-- A copy has no phase, so the trainer policy that reaches through phase_id no
-- longer matches it. Ownership answers the same question by a different route.
drop policy if exists "programme_days: trainer all" on public.programme_days;
create policy "programme_days: trainer all" on public.programme_days for all
  using (
    exists (select 1 from public.programme_phases ph
             where ph.id = programme_days.phase_id and public.is_my_programme(ph.programme_id))
    or exists (select 1 from public.profiles p
                where p.id = programme_days.owner_client_id and p.trainer_id = auth.uid())
  )
  with check (
    exists (select 1 from public.programme_phases ph
             where ph.id = programme_days.phase_id and public.is_my_programme(ph.programme_id))
    or exists (select 1 from public.profiles p
                where p.id = programme_days.owner_client_id and p.trainer_id = auth.uid())
  );
-- The client-side read policy already keys off client_workouts.day_id, which
-- points at the copy after this runs, so it needs no change.

-- ── Backfill ─────────────────────────────────────────────────────────────────
-- Every assignment that still points at a template gets its own copy, and
-- everything that referred to the template by id is moved across with it:
-- the assignment, any logged session, and the logged sets inside it. Miss any
-- one of those and a finished workout stops resolving - which is exactly the
-- failure this app has already had once.
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
      (phase_id, week_index, day_of_week, notes, intro, image_url, title, owner_client_id, origin_day_id)
    select null, d.week_index, d.day_of_week, d.notes, d.intro, d.image_url, d.title, r.client_id, d.id
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

        -- What this client actually logged against the template exercise now
        -- belongs to their copy of it, so a finished session still lines its
        -- sets up with the movements it prescribed.
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

  raise notice 'client-owned days created: %', v_copies;
end $$;
