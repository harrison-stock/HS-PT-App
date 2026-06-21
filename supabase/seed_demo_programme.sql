-- Demo / reference programme so the coach has a fully-populated example to learn
-- from in the Programme Builder. Builds "Demo · Hypertrophy (3-Day Split)" with
-- two phases, weekly days, sections, exercises and sets — and showcases a
-- superset and an alternate-exercise swap. Also assigns the first week's sessions
-- to the John Doe managed client so the Training calendar / next-session populate.
--
-- Run in the Supabase SQL editor AFTER seed_john_doe.sql. Safe to re-run.

do $$
declare
  v_coach uuid;
  v_mc    uuid;
  v_prog  uuid;
  v_ph1   uuid;  -- Foundation
  v_ph2   uuid;  -- Build
  v_day   uuid;
  v_sec   uuid;
  v_ex    uuid;
  v_w     int;
begin
  -- ── Coach ─────────────────────────────────────────────────────────────────
  select id into v_coach from public.profiles where lower(email) = lower('harrison@harrisonstock.co.uk') limit 1;
  if v_coach is null then
    select id into v_coach from public.profiles where role = 'trainer' order by created_at limit 1;
  end if;
  if v_coach is null then raise exception 'No trainer profile found to attach the demo programme to'; end if;

  -- John Doe (optional — used only for session assignment)
  select id into v_mc from public.managed_clients
   where trainer_id = v_coach and name = 'John Doe' order by created_at limit 1;

  -- ── Clean re-run: drop any prior copy of this demo programme ───────────────
  for v_prog in
    select id from public.programmes where trainer_id = v_coach and name = 'Demo · Hypertrophy (3-Day Split)'
  loop
    delete from public.client_workouts where day_id in (
      select pd.id from public.programme_days pd
      join public.programme_phases pp on pp.id = pd.phase_id
      where pp.programme_id = v_prog
    );
    delete from public.programmes where id = v_prog;  -- cascades phases→days→sections→exercises→sets
  end loop;

  -- ── Programme + phases ─────────────────────────────────────────────────────
  insert into public.programmes (trainer_id, name, tag)
  values (v_coach, 'Demo · Hypertrophy (3-Day Split)', 'STRENGTH')
  returning id into v_prog;

  insert into public.programme_phases (programme_id, phase_index, name, focus, weeks)
  values (v_prog, 0, 'Foundation', 'Groove the movement patterns and build a base of volume.', 4)
  returning id into v_ph1;

  insert into public.programme_phases (programme_id, phase_index, name, focus, weeks)
  values (v_prog, 1, 'Build', 'Progressive overload — add load and intensity week on week.', 4)
  returning id into v_ph2;

  -- ════════════════════════════════════════════════════════════════════════
  --  Each phase gets the same 3-day template across every week so the roadmap
  --  reads cleanly. day_of_week: 0=Mon, 2=Wed, 4=Fri.
  -- ════════════════════════════════════════════════════════════════════════
  for v_w in 0..3 loop
    -- ───────────────────────── DAY 1 · PUSH (Mon) ─────────────────────────
    insert into public.programme_days (phase_id, week_index, day_of_week)
    values (v_ph1, v_w, 0) returning id into v_day;

    -- Pulse raiser
    insert into public.workout_sections (day_id, kind, title, sort_order)
    values (v_day, 'PULSE_RAISER', 'Pulse raiser', 0) returning id into v_sec;
    insert into public.section_exercises (section_id, name, timed, sort_order)
    values (v_sec, 'Rower', true, 0) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, time_secs, rest_secs)
    values (v_ex, 0, 'WORK', 300, 0);

    -- Main
    insert into public.workout_sections (day_id, kind, title, sort_order)
    values (v_day, 'MAIN', 'Main lifts', 1) returning id into v_sec;

    insert into public.section_exercises (section_id, name, sort_order, coach_notes, alternates)
    values (v_sec, 'Barbell Bench Press', 0, 'Two warm-up sets, then three hard working sets. Leave 1–2 reps in the tank.',
            '[{"name":"Dumbbell Bench Press","img":""},{"name":"Machine Chest Press","img":""}]'::jsonb)
    returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WARMUP', 10, 40, 60, 4),
      (v_ex, 1, 'WARMUP', 6,  60, 60, 6),
      (v_ex, 2, 'WORK',   8,  80, 120, 8),
      (v_ex, 3, 'WORK',   8,  80, 120, 8),
      (v_ex, 4, 'WORK',   8,  80, 120, 9);

    insert into public.section_exercises (section_id, name, sort_order)
    values (v_sec, 'Seated Overhead Press', 1) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WORK', 10, 35, 90, 7),
      (v_ex, 1, 'WORK', 10, 35, 90, 8),
      (v_ex, 2, 'WORK', 10, 35, 90, 8);

    -- Superset: triceps + lateral raises (superset_group = 1)
    insert into public.section_exercises (section_id, name, sort_order, superset_group)
    values (v_sec, 'Cable Triceps Pushdown', 2, 1) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WORK', 12, 25, 30, 8),
      (v_ex, 1, 'WORK', 12, 25, 30, 8),
      (v_ex, 2, 'WORK', 12, 25, 30, 9);
    insert into public.section_exercises (section_id, name, sort_order, superset_group)
    values (v_sec, 'Dumbbell Lateral Raise', 3, 1) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WORK', 15, 8, 90, 8),
      (v_ex, 1, 'WORK', 15, 8, 90, 8),
      (v_ex, 2, 'WORK', 15, 8, 90, 9);

    -- Cooldown
    insert into public.workout_sections (day_id, kind, title, sort_order)
    values (v_day, 'COOLDOWN', 'Cooldown', 2) returning id into v_sec;
    insert into public.section_exercises (section_id, name, timed, sort_order)
    values (v_sec, 'Chest & shoulder stretch', true, 0) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, time_secs, rest_secs)
    values (v_ex, 0, 'WORK', 180, 0);

    -- ───────────────────────── DAY 2 · PULL (Wed) ─────────────────────────
    insert into public.programme_days (phase_id, week_index, day_of_week)
    values (v_ph1, v_w, 2) returning id into v_day;

    insert into public.workout_sections (day_id, kind, title, sort_order)
    values (v_day, 'PULSE_RAISER', 'Pulse raiser', 0) returning id into v_sec;
    insert into public.section_exercises (section_id, name, timed, sort_order)
    values (v_sec, 'Assault bike', true, 0) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, time_secs, rest_secs)
    values (v_ex, 0, 'WORK', 300, 0);

    insert into public.workout_sections (day_id, kind, title, sort_order)
    values (v_day, 'MAIN', 'Main lifts', 1) returning id into v_sec;

    insert into public.section_exercises (section_id, name, sort_order, coach_notes, alternates)
    values (v_sec, 'Lat Pulldown', 0, 'Drive the elbows down, pause at the bottom.',
            '[{"name":"Assisted Pull-Up","img":""},{"name":"Pull-Up","img":""}]'::jsonb)
    returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WARMUP', 12, 30, 60, 5),
      (v_ex, 1, 'WORK',   10, 55, 90, 8),
      (v_ex, 2, 'WORK',   10, 55, 90, 8),
      (v_ex, 3, 'WORK',   10, 55, 90, 9);

    insert into public.section_exercises (section_id, name, sort_order)
    values (v_sec, 'Chest-Supported Row', 1) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WORK', 12, 50, 90, 7),
      (v_ex, 1, 'WORK', 12, 50, 90, 8),
      (v_ex, 2, 'WORK', 12, 50, 90, 8);

    insert into public.section_exercises (section_id, name, sort_order)
    values (v_sec, 'Face Pull', 2) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WORK', 15, 20, 60, 8),
      (v_ex, 1, 'WORK', 15, 20, 60, 8);

    insert into public.section_exercises (section_id, name, sort_order)
    values (v_sec, 'Dumbbell Bicep Curl', 3) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WORK', 12, 12, 60, 8),
      (v_ex, 1, 'WORK', 12, 12, 60, 8),
      (v_ex, 2, 'WORK', 10, 12, 60, 9);

    insert into public.workout_sections (day_id, kind, title, sort_order)
    values (v_day, 'COOLDOWN', 'Cooldown', 2) returning id into v_sec;
    insert into public.section_exercises (section_id, name, timed, sort_order)
    values (v_sec, 'Lat & spine decompression hang', true, 0) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, time_secs, rest_secs)
    values (v_ex, 0, 'WORK', 120, 0);

    -- ───────────────────────── DAY 3 · LEGS (Fri) ─────────────────────────
    insert into public.programme_days (phase_id, week_index, day_of_week)
    values (v_ph1, v_w, 4) returning id into v_day;

    insert into public.workout_sections (day_id, kind, title, sort_order)
    values (v_day, 'PULSE_RAISER', 'Pulse raiser', 0) returning id into v_sec;
    insert into public.section_exercises (section_id, name, timed, sort_order)
    values (v_sec, 'Spin bike', true, 0) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, time_secs, rest_secs)
    values (v_ex, 0, 'WORK', 300, 0);

    insert into public.workout_sections (day_id, kind, title, sort_order)
    values (v_day, 'BANDED', 'Activation', 1) returning id into v_sec;
    insert into public.section_exercises (section_id, name, sort_order)
    values (v_sec, 'Banded Glute Bridge', 0) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, rest_secs, intensity) values
      (v_ex, 0, 'WORK', 20, 45, 6),
      (v_ex, 1, 'WORK', 20, 45, 6);

    insert into public.workout_sections (day_id, kind, title, sort_order)
    values (v_day, 'MAIN', 'Main lifts', 2) returning id into v_sec;

    insert into public.section_exercises (section_id, name, sort_order, coach_notes, alternates)
    values (v_sec, 'Back Squat', 0, 'Brace hard, sit between the hips, drive through mid-foot.',
            '[{"name":"Hack Squat","img":""},{"name":"Leg Press","img":""}]'::jsonb)
    returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WARMUP', 10, 40, 60, 4),
      (v_ex, 1, 'WARMUP', 6,  70, 90, 6),
      (v_ex, 2, 'WORK',   8,  90, 150, 8),
      (v_ex, 3, 'WORK',   8,  90, 150, 8),
      (v_ex, 4, 'WORK',   8,  90, 150, 9);

    insert into public.section_exercises (section_id, name, sort_order)
    values (v_sec, 'Romanian Deadlift', 1) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WORK', 10, 70, 120, 7),
      (v_ex, 1, 'WORK', 10, 70, 120, 8),
      (v_ex, 2, 'WORK', 10, 70, 120, 8);

    insert into public.section_exercises (section_id, name, sort_order)
    values (v_sec, 'Leg Extension', 2) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WORK', 15, 40, 60, 8),
      (v_ex, 1, 'WORK', 15, 40, 60, 8),
      (v_ex, 2, 'WORK', 15, 40, 60, 9);

    insert into public.section_exercises (section_id, name, sort_order)
    values (v_sec, 'Standing Calf Raise', 3) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WORK', 15, 60, 45, 8),
      (v_ex, 1, 'WORK', 15, 60, 45, 8),
      (v_ex, 2, 'WORK', 15, 60, 45, 9);

    insert into public.workout_sections (day_id, kind, title, sort_order)
    values (v_day, 'COOLDOWN', 'Cooldown', 3) returning id into v_sec;
    insert into public.section_exercises (section_id, name, timed, sort_order)
    values (v_sec, 'Hip flexor & hamstring stretch', true, 0) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, time_secs, rest_secs)
    values (v_ex, 0, 'WORK', 240, 0);
  end loop;

  -- ── Phase 2 "Build": copy the same template (heavier intent via notes) ──────
  for v_w in 0..3 loop
    -- DAY 1 · PUSH
    insert into public.programme_days (phase_id, week_index, day_of_week)
    values (v_ph2, v_w, 0) returning id into v_day;
    insert into public.workout_sections (day_id, kind, title, sort_order)
    values (v_day, 'MAIN', 'Main lifts', 0) returning id into v_sec;
    insert into public.section_exercises (section_id, name, sort_order, coach_notes, alternates)
    values (v_sec, 'Barbell Bench Press', 0, 'Add 2.5 kg from last week if all sets hit. Stop 1 rep short.',
            '[{"name":"Dumbbell Bench Press","img":""}]'::jsonb)
    returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WORK', 6, 90, 150, 9),
      (v_ex, 1, 'WORK', 6, 90, 150, 9),
      (v_ex, 2, 'WORK', 6, 90, 150, 9),
      (v_ex, 3, 'WORK', 6, 90, 150, 10);
    insert into public.section_exercises (section_id, name, sort_order)
    values (v_sec, 'Incline Dumbbell Press', 1) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WORK', 10, 28, 90, 8),
      (v_ex, 1, 'WORK', 10, 28, 90, 8),
      (v_ex, 2, 'WORK', 10, 28, 90, 9);

    -- DAY 2 · PULL
    insert into public.programme_days (phase_id, week_index, day_of_week)
    values (v_ph2, v_w, 2) returning id into v_day;
    insert into public.workout_sections (day_id, kind, title, sort_order)
    values (v_day, 'MAIN', 'Main lifts', 0) returning id into v_sec;
    insert into public.section_exercises (section_id, name, sort_order, coach_notes)
    values (v_sec, 'Barbell Row', 0, 'Heavy and strict — no jerking.') returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WORK', 8, 70, 120, 8),
      (v_ex, 1, 'WORK', 8, 70, 120, 9),
      (v_ex, 2, 'WORK', 8, 70, 120, 9);
    insert into public.section_exercises (section_id, name, sort_order)
    values (v_sec, 'Lat Pulldown', 1) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WORK', 10, 60, 90, 8),
      (v_ex, 1, 'WORK', 10, 60, 90, 8),
      (v_ex, 2, 'WORK', 10, 60, 90, 9);

    -- DAY 3 · LEGS
    insert into public.programme_days (phase_id, week_index, day_of_week)
    values (v_ph2, v_w, 4) returning id into v_day;
    insert into public.workout_sections (day_id, kind, title, sort_order)
    values (v_day, 'MAIN', 'Main lifts', 0) returning id into v_sec;
    insert into public.section_exercises (section_id, name, sort_order, coach_notes, alternates)
    values (v_sec, 'Back Squat', 0, 'Top set then back-offs. Push the top set hard.',
            '[{"name":"Leg Press","img":""}]'::jsonb)
    returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WARMUP', 5, 60,  90, 5),
      (v_ex, 1, 'WORK',   5, 100, 180, 9),
      (v_ex, 2, 'WORK',   8, 85,  150, 8),
      (v_ex, 3, 'WORK',   8, 85,  150, 9);
    insert into public.section_exercises (section_id, name, sort_order)
    values (v_sec, 'Walking Lunge', 1) returning id into v_ex;
    insert into public.exercise_sets (exercise_id, set_index, kind, reps, weight_kg, rest_secs, intensity) values
      (v_ex, 0, 'WORK', 12, 16, 90, 8),
      (v_ex, 1, 'WORK', 12, 16, 90, 9);
  end loop;

  -- ── Assign Foundation · Week 1 to John Doe so the calendar populates ───────
  if v_mc is not null then
    delete from public.client_workouts where client_id = v_mc and day_id in (
      select pd.id from public.programme_days pd
      join public.programme_phases pp on pp.id = pd.phase_id
      where pp.programme_id = v_prog
    );
    -- Schedule this week's Mon/Wed/Fri sessions (relative to the current Monday)
    insert into public.client_workouts (client_id, trainer_id, day_id, scheduled_date, status)
    select v_mc, v_coach, pd.id,
           (date_trunc('week', current_date)::date + pd.day_of_week),
           case when (date_trunc('week', current_date)::date + pd.day_of_week) < current_date
                then 'completed' else 'scheduled' end
    from public.programme_days pd
    where pd.phase_id = v_ph1 and pd.week_index = 0;
  end if;

  raise notice 'Demo programme seeded (programme %, % assigned to John Doe).', v_prog, coalesce(v_mc::text, 'not');
end $$;
