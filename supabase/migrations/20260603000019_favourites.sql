-- Slice 20: per-user favourites for recipes & guides

create table if not exists public.favourites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  item_type  text not null check (item_type in ('recipe','guide')),
  item_id    uuid not null,
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);
alter table public.favourites enable row level security;

drop policy if exists "favourites: own" on public.favourites;
create policy "favourites: own" on public.favourites for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
