-- Recurring tasks & forms. When a client completes a recurring task, the app
-- spawns the next occurrence (advanced by the interval) exactly once.
alter table if exists client_tasks
  add column if not exists recurrence text,          -- null/none | daily | weekly | monthly
  add column if not exists recur_spawned boolean not null default false;

-- Templates can carry a default recurrence too.
alter table if exists task_templates
  add column if not exists recurrence text;
