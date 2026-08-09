-- Stop a programme edit from destroying what a client actually lifted.
--
-- logged_sets.exercise_id referenced section_exercises ON DELETE CASCADE. Saving
-- a day in the builder deletes and re-inserts that day's workout_sections
-- wholesale, which cascades through section_exercises and took every logged set
-- performed against them with it. So editing a workout silently wiped the
-- history of every client who had already trained it - and re-opening one of
-- those sessions then found neither a prescription nor any logged sets, which
-- is what surfaced as "workout unavailable".
--
-- The reference is a convenience, not the record: logged_sets already carries
-- exercise_name and library_exercise_id, so a set stands on its own once the
-- programme row is gone. Point it at SET NULL and the history survives.

alter table logged_sets
  drop constraint if exists logged_sets_exercise_id_fkey;

alter table logged_sets
  add constraint logged_sets_exercise_id_fkey
  foreign key (exercise_id) references section_exercises(id) on delete set null;

-- exercise_name has been written for a while but isn't guaranteed on older
-- rows; backfill any that are still null so a detached set still names itself.
update logged_sets ls
set exercise_name = se.name
from section_exercises se
where ls.exercise_name is null and se.id = ls.exercise_id;
