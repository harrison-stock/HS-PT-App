-- Per-day nutrition totals imported from a client's Cronometer "Daily
-- Nutrition" CSV export. One row per client per day; re-importing a date
-- overwrites it (upsert on client_id + log_date).
create table if not exists nutrition_logs (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null,
  log_date     date not null,
  energy_kcal  numeric,
  protein_g    numeric,
  carbs_g      numeric,
  fat_g        numeric,
  completed    boolean not null default false,
  source       text not null default 'cronometer',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (client_id, log_date)
);

create index if not exists nutrition_logs_client_date_idx
  on nutrition_logs (client_id, log_date desc);

alter table nutrition_logs enable row level security;

-- A client can read their own nutrition rows.
drop policy if exists nutrition_read_own on nutrition_logs;
create policy nutrition_read_own on nutrition_logs
  for select using (client_id = auth.uid());

-- A trainer can read + write nutrition rows for clients on their roster
-- (real profiles or managed clients they own).
drop policy if exists nutrition_trainer_all on nutrition_logs;
create policy nutrition_trainer_all on nutrition_logs
  for all using (
    exists (select 1 from profiles p where p.id = nutrition_logs.client_id and p.trainer_id = auth.uid())
    or exists (select 1 from managed_clients m where m.id = nutrition_logs.client_id and m.trainer_id = auth.uid())
  ) with check (
    exists (select 1 from profiles p where p.id = nutrition_logs.client_id and p.trainer_id = auth.uid())
    or exists (select 1 from managed_clients m where m.id = nutrition_logs.client_id and m.trainer_id = auth.uid())
  );

-- Optional per-client protein target (g/day) so adherence can be measured
-- against a real number rather than just "did they log".
alter table if exists profiles          add column if not exists protein_target_g numeric;
alter table if exists managed_clients   add column if not exists protein_target_g numeric;
