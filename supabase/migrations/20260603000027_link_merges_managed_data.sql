-- Slice 28: when an invited managed client signs up, MERGE their pre-signup data.
--
-- Previously handle_new_user only set managed_clients.linked_profile_id, leaving
-- all the work a coach did against the managed-client id (tasks, goals, injuries,
-- metrics, assigned workouts, logged sessions, photos) orphaned — the client app
-- reads everything by their new auth uid and saw none of it. This re-points those
-- rows to the new profile id and copies the coach-set fields onto the profile.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mc uuid;
  m    record;
begin
  insert into public.profiles (id, name, email, role, trainer_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'client'),
    nullif(new.raw_user_meta_data->>'trainer_id', '')::uuid
  );

  v_mc := nullif(new.raw_user_meta_data->>'managed_client_id', '')::uuid;
  if v_mc is not null then
    select * into m from public.managed_clients where id = v_mc;
    if found then
      update public.managed_clients set linked_profile_id = new.id where id = v_mc;

      -- Carry the coach-set profile fields onto the real account.
      update public.profiles p set
        credits       = m.credits,
        client_status = m.client_status,
        coach_notes   = case when coalesce(m.coach_notes, '')   <> '' then m.coach_notes   else p.coach_notes   end,
        medical_notes = case when coalesce(m.medical_notes, '') <> '' then m.medical_notes else p.medical_notes end,
        trainer_id    = coalesce(p.trainer_id, m.trainer_id)
      where p.id = new.id;

      -- Re-point all pre-signup data from the managed id to the new profile id.
      update public.client_tasks     set client_id = new.id where client_id = v_mc;
      update public.client_goals     set client_id = new.id where client_id = v_mc;
      update public.client_injuries  set client_id = new.id where client_id = v_mc;
      update public.body_metrics     set client_id = new.id where client_id = v_mc;
      update public.client_workouts  set client_id = new.id where client_id = v_mc;
      update public.workout_sessions set client_id = new.id where client_id = v_mc;
      update public.progress_photos  set client_id = new.id where client_id = v_mc;
    end if;
  end if;

  return new;
end;
$$;
