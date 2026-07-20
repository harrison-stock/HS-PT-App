-- Editable date of birth for managed clients (real clients use profiles.date_of_birth).
alter table public.managed_clients
  add column if not exists date_of_birth date;

-- ── Client vault: coach-attached documents (consent forms, PARQs, etc.) ───────
create table if not exists public.client_documents (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null,
  trainer_id  uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  path        text not null,
  size_bytes  bigint,
  created_at  timestamptz not null default now()
);
alter table public.client_documents enable row level security;

-- Trainer manages docs for their own clients (real or managed).
drop policy if exists "client_documents: trainer" on public.client_documents;
create policy "client_documents: trainer" on public.client_documents for all
  using (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());
-- Client can read their own documents.
drop policy if exists "client_documents: client read" on public.client_documents;
create policy "client_documents: client read" on public.client_documents for select
  using (client_id = auth.uid());

-- ── Storage bucket (private) ─────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('client-vault', 'client-vault', false)
on conflict (id) do nothing;

-- Trainers manage files under their own folder: client-vault/<trainer_uid>/...
drop policy if exists "vault: trainer manage own" on storage.objects;
create policy "vault: trainer manage own" on storage.objects for all
  using (bucket_id = 'client-vault' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'client-vault' and (storage.foldername(name))[1] = auth.uid()::text);
