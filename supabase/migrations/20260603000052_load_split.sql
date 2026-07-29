-- Slice 52: split loads.
--
-- A prescribed weight is stored as the TOTAL being moved, which is what volume
-- and progression maths need. But for anything held in both hands - dumbbells,
-- kettlebells - the total is not what the client picks up off the rack. "48kg"
-- means two 24s, and reading it as a single 48kg dumbbell is a genuine mistake
-- to make mid-session.
--
-- load_split records how many implements the load is spread across. 1 (the
-- default) is everything that behaves as it always has: a barbell, a machine,
-- a single dumbbell. 2 means one in each hand, and the app shows the per-hand
-- figure alongside the total.
--
-- Stored on the library so it's set once per movement, and copied onto each
-- prescribed exercise so changing the library later doesn't silently rewrite
-- programmes already written.

alter table public.exercises
  add column if not exists load_split smallint not null default 1;

alter table public.section_exercises
  add column if not exists load_split smallint not null default 1;

-- Guard against nonsense values without being prescriptive about the ceiling.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'exercises_load_split_range'
  ) then
    alter table public.exercises
      add constraint exercises_load_split_range check (load_split between 1 and 4);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'section_exercises_load_split_range'
  ) then
    alter table public.section_exercises
      add constraint section_exercises_load_split_range check (load_split between 1 and 4);
  end if;
end $$;
