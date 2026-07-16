-- Allow clients to favourite exercises (was recipes/guides only).
alter table public.favourites drop constraint if exists favourites_item_type_check;
alter table public.favourites
  add constraint favourites_item_type_check
  check (item_type in ('recipe', 'guide', 'exercise'));
