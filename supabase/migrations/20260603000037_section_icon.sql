-- Per-section icon: coaches can pick a curated glyph ('lib:<key>') or paste a
-- custom SVG ('<svg …>') in the programme builder. Empty = default by kind.
alter table public.workout_sections
  add column if not exists icon text not null default '';
