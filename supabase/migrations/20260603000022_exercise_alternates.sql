-- Slice 23: coach-assigned alternate exercises (client can swap at will)
alter table public.section_exercises
  add column if not exists alternates jsonb not null default '[]';
