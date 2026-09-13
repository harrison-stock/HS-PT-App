-- The builder offers set types the database refuses.
--
--   exercise_sets.kind  check (kind in ('WARMUP','WORK','DROP'))
--
-- while the buttons emit DROPSET, FAILURE and PARTIAL, and SK_META names those
-- three plus WARMUP. 'DROP' is a leftover from before the rename and nothing
-- has produced it in a long time.
--
-- The consequence was not a rejected button. Saving a day deletes its sections
-- and rebuilds them, so a set type the constraint won't take fails after the
-- old structure is already gone - and the insert's result was never checked,
-- so the coach was told the programme saved while the exercise ended up with
-- no sets at all.
--
-- The constraint is the thing that is wrong here: these are real prescriptions
-- a coach means to write. Widened to what the app actually offers, with the
-- old spelling folded into the new one.
update public.exercise_sets set kind = 'DROPSET' where kind = 'DROP';

alter table public.exercise_sets drop constraint if exists exercise_sets_kind_check;
alter table public.exercise_sets
  add constraint exercise_sets_kind_check
  check (kind in ('WARMUP','WORK','DROPSET','FAILURE','PARTIAL'));
