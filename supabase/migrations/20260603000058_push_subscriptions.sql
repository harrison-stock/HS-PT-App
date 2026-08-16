-- Web push: where to deliver, and what has already been sent.
--
-- A push subscription is issued by the browser's push service, not by us, and
-- is per install rather than per user - the same client on a phone and a laptop
-- is two rows, and reinstalling produces a third. endpoint is the identity the
-- push service gave it, so it carries the uniqueness.

create table if not exists public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- A subscription belongs to whoever's browser produced it, and nobody else has
-- any business reading the endpoint - it's a capability: anyone holding it can
-- push to that device. The sender runs service-role and bypasses this.
drop policy if exists "push_subscriptions: own" on public.push_subscriptions;
create policy "push_subscriptions: own" on public.push_subscriptions for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Which day a task last had a reminder sent for it. A date rather than a
-- timestamp, and compared against the current day, so the reminder job is safe
-- to run as often as it likes and a client still only gets told once - whether
-- that's a retry, an overlapping run, or a schedule someone tightened.
alter table if exists public.client_tasks
  add column if not exists reminded_on date;
