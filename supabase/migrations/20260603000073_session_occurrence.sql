-- A session belonged to a day, not to the day it was actually done on.
--
-- client_workouts is the schedule: one row per client per date, and its id is
-- the only thing in the schema that identifies a particular occurrence. Nothing
-- referred to it. workout_sessions carried client_id and day_id, and the app
-- matched on those:
--
--   update client_workouts set status = 'completed'
--    where day_id = ... and client_id = ...
--
-- Assign the same workout twice - which the assignment model deliberately
-- supports, one copy on two dates - and finishing Tuesday's marked Thursday's
-- done as well. Opening Tuesday's results afterwards showed Thursday's, because
-- the lookup took the most recent completed session for that day.
--
-- So a session now says which occurrence it was.
alter table public.workout_sessions
  add column if not exists client_workout_id uuid references public.client_workouts(id) on delete set null;

create index if not exists workout_sessions_occurrence_idx
  on public.workout_sessions (client_workout_id) where client_workout_id is not null;

-- Backfill. Every existing session is matched to the occurrence of the same
-- client and day whose scheduled date is nearest the day it was completed -
-- which is the best available evidence and, for the overwhelming majority
-- (one occurrence per day), simply the only candidate. An occurrence is claimed
-- once: two sessions against one repeated day resolve to the two nearest dates
-- rather than both to the same row.
with ranked as (
  select
    ws.id as session_id,
    cw.id as workout_id,
    row_number() over (
      partition by ws.id
      order by abs(cw.scheduled_date - coalesce(ws.completed_at, ws.started_at)::date), cw.scheduled_date
    ) as by_session,
    row_number() over (
      partition by cw.id
      order by abs(cw.scheduled_date - coalesce(ws.completed_at, ws.started_at)::date),
               coalesce(ws.completed_at, ws.started_at)
    ) as by_workout
  from public.workout_sessions ws
  join public.client_workouts cw
    on cw.client_id = ws.client_id and cw.day_id = ws.day_id
  where ws.client_workout_id is null
)
update public.workout_sessions ws
   set client_workout_id = r.workout_id
  from ranked r
 where r.session_id = ws.id
   and r.by_session = 1
   and r.by_workout = 1;
