-- Tie a programmed movement, and every set logged against it, back to the
-- library exercise it came from.
--
-- Exercise history used to be matched on exercise_name, so a movement logged as
-- "Barbell Squat" in one programme and written as "Back Squat" in the next
-- looked like two unrelated exercises. section_exercises.id can't stand in for
-- a stable identity either: it's a per-day row, recreated whenever a day is
-- saved, so it only ever matches sets logged against that one instance.
--
-- logged_sets carries its own copy rather than reaching through
-- section_exercises, for the same reason exercise_name is already denormalised
-- there: logged_sets.exercise_id is ON DELETE CASCADE, so a client's history
-- must not depend on the programme row it was performed from still existing.

alter table section_exercises
  add column if not exists library_exercise_id uuid references exercises(id) on delete set null;

alter table logged_sets
  add column if not exists library_exercise_id uuid references exercises(id) on delete set null;

-- Backfill from the names already stored. Only where the name resolves to
-- exactly one library exercise for that trainer - an ambiguous name is left
-- null and falls back to name matching, which is what it did before.
update section_exercises se
set library_exercise_id = x.id
from exercises x
where se.library_exercise_id is null
  and lower(btrim(x.name)) = lower(btrim(se.name))
  and not exists (
    select 1 from exercises x2
    where lower(btrim(x2.name)) = lower(btrim(se.name)) and x2.id <> x.id
  );

update logged_sets ls
set library_exercise_id = x.id
from exercises x
where ls.library_exercise_id is null
  and ls.exercise_name is not null
  and lower(btrim(x.name)) = lower(btrim(ls.exercise_name))
  and not exists (
    select 1 from exercises x2
    where lower(btrim(x2.name)) = lower(btrim(ls.exercise_name)) and x2.id <> x.id
  );

create index if not exists idx_logged_sets_library_exercise on logged_sets (library_exercise_id);
create index if not exists idx_section_exercises_library on section_exercises (library_exercise_id);
