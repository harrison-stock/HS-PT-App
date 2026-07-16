-- Workout cover photo: coaches can upload a hero image for a specific day
-- (programme_days). Shown to the client at the top of the workout preview.
alter table public.programme_days
  add column if not exists image_url text;

-- ── Storage bucket (public) ──────────────────────────────────────────────────
-- Public so clients can render the cover in previews without signed-URL round
-- trips. Only trainers can write, and only under their own <uid>/ folder.
insert into storage.buckets (id, name, public)
values ('workout-photos', 'workout-photos', true)
on conflict (id) do nothing;

drop policy if exists "workout photos: public read" on storage.objects;
create policy "workout photos: public read" on storage.objects for select
  using (bucket_id = 'workout-photos');

drop policy if exists "workout photos: trainer manage own" on storage.objects;
create policy "workout photos: trainer manage own" on storage.objects for all
  using (
    bucket_id = 'workout-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'workout-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
