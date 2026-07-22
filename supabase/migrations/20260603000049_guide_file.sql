-- Attach a downloadable file (e.g. a PDF) to a guide, plus its display name.
alter table if exists guides
  add column if not exists file_url text,
  add column if not exists file_name text;
