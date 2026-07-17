-- Optional per-task brand icon (name from the brand icon set, e.g. 'Dumbbell').
-- Empty = fall back to the default icon for the task kind.
alter table public.client_tasks
  add column if not exists icon text not null default '';

-- Task templates can carry a default icon too, applied when the template is used.
alter table public.task_templates
  add column if not exists icon text not null default '';
