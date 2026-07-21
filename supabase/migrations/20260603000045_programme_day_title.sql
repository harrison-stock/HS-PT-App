-- Give programme days (workouts) an optional name/title so coaches can label
-- each session (e.g. "Push Day", "Lower Body") instead of just the weekday.
-- Surfaced to the client on the workout intro slide and session lists.

alter table if exists programme_days
  add column if not exists title text;
