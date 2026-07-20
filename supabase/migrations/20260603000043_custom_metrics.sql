-- Custom client metrics: coaches (or clients) can track any measurement that
-- isn't one of the built-in ones (e.g. resting HR, sleep hours, grip strength).
-- A definition row + a time-series of entries.

create table if not exists public.client_custom_metrics (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null,
  trainer_id  uuid references public.profiles(id) on delete set null,
  name        text not null,
  unit        text not null default '',
  created_at  timestamptz not null default now()
);
alter table public.client_custom_metrics enable row level security;

create table if not exists public.custom_metric_entries (
  id          uuid primary key default gen_random_uuid(),
  metric_id   uuid not null references public.client_custom_metrics(id) on delete cascade,
  recorded_at date not null default current_date,
  value       numeric(10,2) not null,
  created_at  timestamptz not null default now()
);
alter table public.custom_metric_entries enable row level security;

-- Shared predicate: is this custom metric mine (client) or my client's (trainer)?
create or replace function public.can_access_client(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select cid = auth.uid()
    or exists (select 1 from public.profiles p where p.id = cid and p.trainer_id = auth.uid())
    or exists (select 1 from public.managed_clients mc where mc.id = cid and mc.trainer_id = auth.uid());
$$;

drop policy if exists "custom_metrics: access" on public.client_custom_metrics;
create policy "custom_metrics: access" on public.client_custom_metrics for all
  using (public.can_access_client(client_id))
  with check (public.can_access_client(client_id));

drop policy if exists "custom_metric_entries: access" on public.custom_metric_entries;
create policy "custom_metric_entries: access" on public.custom_metric_entries for all
  using (exists (select 1 from public.client_custom_metrics m where m.id = metric_id and public.can_access_client(m.client_id)))
  with check (exists (select 1 from public.client_custom_metrics m where m.id = metric_id and public.can_access_client(m.client_id)));
