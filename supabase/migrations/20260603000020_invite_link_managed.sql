-- Slice 21: Supabase Auth invites — link the managed client on accept
--
-- When an invited client accepts (auth.users row created), the handle_new_user
-- trigger already copies name/email/role/trainer_id from raw_user_meta_data.
-- This also links the managed_clients row carried in metadata, so the trainer's
-- existing client record connects to the new account automatically.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mc uuid;
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
    update public.managed_clients set linked_profile_id = new.id where id = v_mc;
  end if;

  return new;
end;
$$;
