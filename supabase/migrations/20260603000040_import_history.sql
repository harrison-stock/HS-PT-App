-- Support importing external workout history (e.g. from Everfit). Imported
-- sessions have no programme day, so day_id becomes nullable, and a `source`
-- tag lets us identify (and later bulk-remove) imported rows.
alter table public.workout_sessions alter column day_id drop not null;
alter table public.workout_sessions add column if not exists source text not null default '';
