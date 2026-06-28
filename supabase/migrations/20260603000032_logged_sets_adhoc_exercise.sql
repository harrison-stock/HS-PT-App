-- Slice 33: let clients add exercises mid-session. Those aren't in the
-- programme, so logged_sets must accept a null exercise_id + a free-text name.
alter table public.logged_sets alter column exercise_id drop not null;
alter table public.logged_sets add column if not exists exercise_name text;
