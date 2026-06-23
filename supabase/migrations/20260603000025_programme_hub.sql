-- Slice 26: turn the Programmes tab into a hub.
--  • is_adhoc flags a programme as a standalone one-off workout (single day)
--    so it lives under "Ad-hoc workouts" rather than the multi-phase list.
--  • task_templates are reusable tasks/forms a coach can assign in one tap.

alter table public.programmes
  add column if not exists is_adhoc boolean not null default false;

create table if not exists public.task_templates (
  id          uuid primary key default gen_random_uuid(),
  trainer_id  uuid not null references public.profiles(id) on delete cascade,
  title       text not null default '',
  kind        text not null default 'check' check (kind in ('check','log','photo','form')),
  form_id     uuid references public.forms(id) on delete set null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.task_templates enable row level security;

drop policy if exists "task_templates: trainer all" on public.task_templates;
create policy "task_templates: trainer all" on public.task_templates for all
  using  (trainer_id = auth.uid())
  with check (trainer_id = auth.uid());
