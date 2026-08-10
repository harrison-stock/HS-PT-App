-- Deleting a programme must not delete the training that was done from it.
--
-- workout_sessions.day_id still referenced programme_days ON DELETE CASCADE, so
-- deleting a programme (which cascades programmes -> programme_phases ->
-- programme_days) took every session logged against it, and every logged_set in
-- those sessions with it. Migration 056 closed the sibling path - a day being
-- re-saved wiping its logged sets - but not this one.
--
-- day_id has been nullable since migration 040 (imported history has no
-- programme day), so SET NULL is already a shape the app handles: a detached
-- session keeps its client, its dates and all its sets, and still counts
-- towards progress and exercise history, which read by client and date rather
-- than by day.

alter table workout_sessions
  drop constraint if exists workout_sessions_day_id_fkey;

alter table workout_sessions
  add constraint workout_sessions_day_id_fkey
  foreign key (day_id) references programme_days(id) on delete set null;
