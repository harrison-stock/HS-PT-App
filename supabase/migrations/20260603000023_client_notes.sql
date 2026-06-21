-- Slice 24: coach's free-text notes + medical/limitations notes on a client.
-- Powers the Everfit-style client Overview where the coach can jot things down.
-- Stored on both real profiles and managed (no-login) clients.

alter table public.profiles
  add column if not exists coach_notes   text not null default '',
  add column if not exists medical_notes text not null default '';

alter table public.managed_clients
  add column if not exists coach_notes   text not null default '',
  add column if not exists medical_notes text not null default '';
