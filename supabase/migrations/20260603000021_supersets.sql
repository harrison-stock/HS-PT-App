-- Slice 22: supersets — group consecutive exercises within a workout section
alter table public.section_exercises
  add column if not exists superset_group int;
