-- Progress photos couldn't be saved when a coach uploaded them on a client's
-- behalf (assume-control, or a managed client with no auth): the only write
-- policies matched client_id = auth.uid(), so the coach's own uid failed the
-- check on both the table and the storage bucket. Add trainer manage policies
-- for their clients (real profiles + managed clients).

-- Table: a trainer can insert/update/delete rows for their own clients.
drop policy if exists "progress_photos: trainer manage clients" on public.progress_photos;
create policy "progress_photos: trainer manage clients" on public.progress_photos for all
  using (
    exists (select 1 from public.profiles p where p.id = client_id and p.trainer_id = auth.uid())
    or exists (select 1 from public.managed_clients m where m.id = client_id and m.trainer_id = auth.uid())
  )
  with check (
    exists (select 1 from public.profiles p where p.id = client_id and p.trainer_id = auth.uid())
    or exists (select 1 from public.managed_clients m where m.id = client_id and m.trainer_id = auth.uid())
  );

-- Storage: a trainer can upload/manage files under their clients' folders
-- (progress-photos/<client_id>/...).
drop policy if exists "progress photos: trainer manage clients" on storage.objects;
create policy "progress photos: trainer manage clients" on storage.objects for all
  using (
    bucket_id = 'progress-photos'
    and (
      exists (select 1 from public.profiles p where p.id::text = (storage.foldername(name))[1] and p.trainer_id = auth.uid())
      or exists (select 1 from public.managed_clients m where m.id::text = (storage.foldername(name))[1] and m.trainer_id = auth.uid())
    )
  )
  with check (
    bucket_id = 'progress-photos'
    and (
      exists (select 1 from public.profiles p where p.id::text = (storage.foldername(name))[1] and p.trainer_id = auth.uid())
      or exists (select 1 from public.managed_clients m where m.id::text = (storage.foldername(name))[1] and m.trainer_id = auth.uid())
    )
  );
