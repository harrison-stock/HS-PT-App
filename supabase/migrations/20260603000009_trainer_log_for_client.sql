-- Allow trainer to log workout sessions on behalf of their clients

-- workout_sessions: trainer can INSERT (client must be one of theirs)
drop policy if exists "workout_sessions: trainer insert" on public.workout_sessions;
create policy "workout_sessions: trainer insert" on public.workout_sessions for insert
  with check (exists (
    select 1 from public.profiles p
    where p.id = client_id and p.trainer_id = auth.uid()
  ));

-- logged_sets: trainer can INSERT into sessions belonging to their clients
drop policy if exists "logged_sets: trainer insert" on public.logged_sets;
create policy "logged_sets: trainer insert" on public.logged_sets for insert
  with check (exists (
    select 1 from public.workout_sessions ws
    join   public.profiles p on p.id = ws.client_id
    where  ws.id = session_id and p.trainer_id = auth.uid()
  ));

-- client_workouts: trainer can UPDATE status for their clients
drop policy if exists "client_workouts: trainer update" on public.client_workouts;
create policy "client_workouts: trainer update" on public.client_workouts for update
  using (exists (
    select 1 from public.profiles p
    where p.id = client_id and p.trainer_id = auth.uid()
  ));
