-- Per-exercise coach notes + per-workout intro text
alter table public.programme_days    add column if not exists intro        text not null default '';
alter table public.section_exercises add column if not exists coach_notes  text not null default '';
