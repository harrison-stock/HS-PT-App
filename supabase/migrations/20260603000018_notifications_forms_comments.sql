-- Slice 18: notifications, forms, exercise comments

-- ── notifications ────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  actor_id    uuid references public.profiles(id) on delete set null,
  kind        text not null default 'info',
  title       text not null default '',
  body        text not null default '',
  link        jsonb,                       -- { screen, clientId, ... }
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
alter table public.notifications enable row level security;

-- You can read & mark-read your own notifications.
drop policy if exists "notifications: own read" on public.notifications;
create policy "notifications: own read" on public.notifications for select
  using (recipient_id = auth.uid());
drop policy if exists "notifications: own update" on public.notifications;
create policy "notifications: own update" on public.notifications for update
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- You may notify the counterparty in your coach/client relationship.
drop policy if exists "notifications: notify counterparty" on public.notifications;
create policy "notifications: notify counterparty" on public.notifications for insert
  with check (
    actor_id = auth.uid() and (
      recipient_id = (select trainer_id from public.profiles where id = auth.uid())
      or auth.uid() = (select trainer_id from public.profiles where id = recipient_id)
    )
  );

-- Live updates
alter publication supabase_realtime add table public.notifications;

-- ── forms (coach's reusable form library) ────────────────────────────────────
create table if not exists public.forms (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.profiles(id) on delete cascade,
  title       text not null default '',
  description text not null default '',
  fields      jsonb not null default '[]',  -- [{ id, type, label, options, min, max, required }]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.forms enable row level security;
drop policy if exists "forms: trainer all" on public.forms;
create policy "forms: trainer all" on public.forms for all
  using (trainer_id = auth.uid()) with check (trainer_id = auth.uid());
drop policy if exists "forms: client read" on public.forms;
create policy "forms: client read" on public.forms for select
  using (trainer_id = (select trainer_id from public.profiles where id = auth.uid()));

-- ── form_responses ───────────────────────────────────────────────────────────
create table if not exists public.form_responses (
  id           uuid primary key default gen_random_uuid(),
  form_id      uuid not null references public.forms(id) on delete cascade,
  client_id    uuid not null,
  task_id      uuid,
  answers      jsonb not null default '{}',
  submitted_at timestamptz not null default now()
);
alter table public.form_responses enable row level security;
drop policy if exists "form_responses: client own" on public.form_responses;
create policy "form_responses: client own" on public.form_responses for all
  using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists "form_responses: trainer read" on public.form_responses;
create policy "form_responses: trainer read" on public.form_responses for select
  using (exists (select 1 from public.forms f where f.id = form_id and f.trainer_id = auth.uid()));

-- ── client_tasks: support assigning a form ───────────────────────────────────
alter table public.client_tasks drop constraint if exists client_tasks_kind_check;
alter table public.client_tasks add constraint client_tasks_kind_check check (kind in ('check','log','photo','form'));
alter table public.client_tasks add column if not exists form_id uuid references public.forms(id) on delete set null;

-- ── exercise_comments (per client, per exercise) ─────────────────────────────
create table if not exists public.exercise_comments (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null,
  exercise_id uuid not null references public.section_exercises(id) on delete cascade,
  author_id   uuid references public.profiles(id) on delete set null,
  body        text not null default '',
  created_at  timestamptz not null default now()
);
alter table public.exercise_comments enable row level security;
-- Client and their trainer can read/write comments.
drop policy if exists "exercise_comments: access" on public.exercise_comments;
create policy "exercise_comments: access" on public.exercise_comments for all
  using (
    client_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = client_id and p.trainer_id = auth.uid())
  )
  with check (
    client_id = auth.uid()
    or exists (select 1 from public.profiles p where p.id = client_id and p.trainer_id = auth.uid())
  );
