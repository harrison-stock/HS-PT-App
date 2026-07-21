-- Optional cover photo per programme phase, set in the roadmap editor and used
-- to visually distinguish phases.
alter table if exists programme_phases
  add column if not exists image_url text;
