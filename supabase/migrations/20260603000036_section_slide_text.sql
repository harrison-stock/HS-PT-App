-- Per-section slide text: shown on the interstitial "section complete → next up"
-- slides during a client's live workout session. Editable in the programme builder.
alter table public.workout_sections
  add column if not exists intro text not null default '';
