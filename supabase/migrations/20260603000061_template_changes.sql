-- Knowing which client copies have fallen behind their template.
--
-- Now that assigning is a copy, editing a programme deliberately leaves the
-- clients already on it alone. That is the right default and it opens a
-- question the app couldn't previously answer: having changed a programme, who
-- is running an older version of it?
--
-- Two timestamps answer it without comparing content. A template records when
-- its contents last changed; a copy records when it was taken. A copy is behind
-- if it was taken before the last edit.

alter table if exists public.programme_days
  add column if not exists content_updated_at timestamptz not null default now(),
  -- Null on a template, which is never a copy of anything.
  add column if not exists copied_at          timestamptz;

-- Copies made by migration 060 were taken from the template as it stood, so
-- they are current as of now rather than behind by their creation date.
update public.programme_days
   set copied_at = now()
 where owner_client_id is not null and copied_at is null;

create index if not exists programme_days_stale_idx
  on public.programme_days (origin_day_id, copied_at)
  where owner_client_id is not null;
