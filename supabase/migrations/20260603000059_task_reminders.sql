-- Per-task control over what the client actually gets told.
--
-- Push arrived as all-or-nothing: every task pushed on assignment, and every
-- task with a due date was chased daily until it was done. That's right for a
-- weekly check-in and wrong for "bring your trainers on Thursday" - a coach
-- needs to decide per task, not per app.
--
-- Two separate decisions, because they genuinely are separate: telling someone
-- a task exists is not the same as nagging them about it.
--
--   notify_on_assign - push once, when it's set
--   remind           - off   | never chase
--                      due   | once, on the day it's due
--                      chase | on the day, and every day it stays overdue
--
-- Defaults preserve exactly what the app did before this migration, so nothing
-- in flight changes behaviour.

alter table if exists public.client_tasks
  add column if not exists notify_on_assign boolean not null default true,
  add column if not exists remind           text    not null default 'chase';

alter table if exists public.client_tasks
  drop constraint if exists client_tasks_remind_check;
alter table if exists public.client_tasks
  add constraint client_tasks_remind_check check (remind in ('off', 'due', 'chase'));

-- Templates carry the same choice, so a saved "weekly check-in" template
-- remembers that it should chase and a "bring your kit" one remembers not to.
alter table if exists public.task_templates
  add column if not exists notify_on_assign boolean not null default true,
  add column if not exists remind           text    not null default 'chase';

alter table if exists public.task_templates
  drop constraint if exists task_templates_remind_check;
alter table if exists public.task_templates
  add constraint task_templates_remind_check check (remind in ('off', 'due', 'chase'));

-- The daily sweep reads exactly this: unfinished, dated, still wanting a
-- reminder today. Worth an index once a roster has a year of tasks behind it.
create index if not exists client_tasks_due_sweep_idx
  on public.client_tasks (due_date, remind)
  where completed_at is null;
