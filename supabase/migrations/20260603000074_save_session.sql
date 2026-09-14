-- Saving a workout, all at once or not at all.
--
-- The logger writes a session, replaces its logged sets, and marks the
-- occurrence complete. From the browser those are three or four separate
-- requests, and nothing joins them: the fix in #130 stopped the app lying about
-- the outcome and stopped a failed insert destroying the previous results, but
-- it cannot make the sequence indivisible. A connection that dies between the
-- sets landing and the occurrence being marked done still leaves a session
-- stored against a workout the calendar thinks is outstanding.
--
-- A function call is one statement, so it is one transaction. Every write below
-- happens or none of them does.
--
-- Deliberately SECURITY INVOKER - the default, said out loud because it matters
-- here. The client already has rights over their own sessions and sets, and the
-- coach over their clients'; row-level security still applies inside this
-- function exactly as it does outside it. Nothing is being granted. The only
-- thing this adds is that the writes cannot come apart.
create or replace function public.save_workout_session(
  p_client_id         uuid,
  p_day_id            uuid,
  p_client_workout_id uuid,
  p_started_at        timestamptz,
  p_completed_at      timestamptz,
  p_session_id        uuid,
  p_sets              jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_session uuid;
  v_count   int;
begin
  if p_client_id is null or p_day_id is null then
    raise exception 'client and day are required';
  end if;

  if p_session_id is not null then
    -- Amending. started_at is left alone on purpose: it is when the client
    -- actually began, and the session's length is read back from the gap
    -- between the two stamps.
    update public.workout_sessions
       set completed_at = p_completed_at
     where id = p_session_id and client_id = p_client_id
    returning id into v_session;
    -- Nothing updated means row-level security refused it, or the session has
    -- been deleted since. Either way this is not a save that half-worked.
    if v_session is null then
      raise exception 'that session could not be updated';
    end if;
  else
    insert into public.workout_sessions
      (client_id, day_id, client_workout_id, started_at, completed_at)
    values
      (p_client_id, p_day_id, p_client_workout_id, p_started_at, p_completed_at)
    returning id into v_session;
  end if;

  -- Safe to delete first now. If anything below fails, this goes back too.
  delete from public.logged_sets where session_id = v_session;

  insert into public.logged_sets
    (session_id, exercise_id, exercise_name, library_exercise_id, set_index,
     actual_reps, actual_weight_kg, actual_band, actual_time_secs, intensity)
  select
    v_session, s.exercise_id, s.exercise_name, s.library_exercise_id, s.set_index,
    s.actual_reps, s.actual_weight_kg, s.actual_band, s.actual_time_secs, s.intensity
  from jsonb_to_recordset(coalesce(p_sets, '[]'::jsonb)) as s(
    exercise_id         uuid,
    exercise_name       text,
    library_exercise_id uuid,
    set_index           int,
    actual_reps         int,
    actual_weight_kg    numeric,
    actual_band         text,
    actual_time_secs    int,
    intensity           int
  );

  get diagnostics v_count = row_count;
  if v_count <> jsonb_array_length(coalesce(p_sets, '[]'::jsonb)) then
    raise exception 'only % of % sets could be stored', v_count, jsonb_array_length(coalesce(p_sets, '[]'::jsonb));
  end if;

  -- This occurrence, not every scheduled instance of the workout.
  if p_client_workout_id is not null then
    update public.client_workouts set status = 'completed' where id = p_client_workout_id;
  else
    update public.client_workouts set status = 'completed'
     where day_id = p_day_id and client_id = p_client_id;
  end if;

  return v_session;
end;
$$;

revoke all on function public.save_workout_session(uuid, uuid, uuid, timestamptz, timestamptz, uuid, jsonb) from public, anon;
grant execute on function public.save_workout_session(uuid, uuid, uuid, timestamptz, timestamptz, uuid, jsonb) to authenticated;
