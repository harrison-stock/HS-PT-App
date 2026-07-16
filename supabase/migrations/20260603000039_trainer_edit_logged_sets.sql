-- Let trainers amend a completed session's logged sets (data-quality fixes,
-- e.g. a typo in a logged weight). Trainers could already INSERT and READ
-- their clients' logged sets; this adds UPDATE and DELETE, scoped to sessions
-- belonging to their own clients (real profiles or managed clients).

-- Shared predicate: the logged_set's session belongs to one of my clients.
create or replace function public.is_my_client_session(sess uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workout_sessions ws
    join   public.profiles p on p.id = ws.client_id
    where  ws.id = sess and p.trainer_id = auth.uid()
  ) or exists (
    select 1 from public.workout_sessions ws
    join   public.managed_clients mc on mc.id = ws.client_id
    where  ws.id = sess and mc.trainer_id = auth.uid()
  );
$$;

drop policy if exists "logged_sets: trainer update" on public.logged_sets;
create policy "logged_sets: trainer update" on public.logged_sets for update
  using (public.is_my_client_session(session_id))
  with check (public.is_my_client_session(session_id));

drop policy if exists "logged_sets: trainer delete" on public.logged_sets;
create policy "logged_sets: trainer delete" on public.logged_sets for delete
  using (public.is_my_client_session(session_id));
