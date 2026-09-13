-- RLS on profiles restricts the row, not the columns.
--
--   create policy "profiles: own update" on public.profiles for update
--     using (auth.uid() = id) with check (auth.uid() = id);
--
-- That says "you may update your own row". It does not say which parts of it,
-- and every protected field lives in that same row - so a client could set
-- their own role, their own session credits, or their own billing_status.
--
-- Migration 065 has a comment saying the billing columns are written by the
-- Stripe webhook "and by nothing else", and leaves out a write policy to make
-- that so. It doesn't: the policy above already covers every column. A comment
-- is not an access control, which is the actual lesson here.
--
-- Postgres can restrict columns with GRANT, but not usefully here: the coach
-- and the client are both the `authenticated` role, so a grant that lets the
-- coach set credits lets the client set their own. The distinction is per-row
-- (am I the owner, or the owner's coach?), so it has to be a trigger.
--
-- The trigger is written as start-from-old, then copy forward the fields this
-- caller is allowed to change. Not as a list of fields to block. That ordering
-- is the point: a column added next year is unwritable until someone names it
-- here, rather than being writable until someone remembers to forbid it. That
-- is exactly how the billing columns came to be writable.

create or replace function public.profiles_guard_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inc public.profiles%rowtype := new;   -- what the caller asked for
begin
  -- No JWT subject means this is not someone using the app: the service role
  -- (the Stripe webhook, the reminder crons) or another security-definer
  -- function such as the sign-up trigger. Those are trusted and unrestricted.
  -- An unauthenticated request cannot arrive here at all - the RLS policies
  -- above require auth.uid() to match, and null matches nothing.
  if auth.uid() is null then
    return new;
  end if;

  -- Nothing an app user sends can move a row to a different id or a different
  -- coach, and nothing below re-enables those.
  new := old;

  if old.trainer_id is not null and old.trainer_id = auth.uid() then
    -- The coach, editing one of their own clients.
    new.name             := inc.name;
    new.email            := inc.email;
    new.date_of_birth    := inc.date_of_birth;
    new.credits          := inc.credits;
    new.client_status    := inc.client_status;
    new.subscription_due := inc.subscription_due;
    new.timezone         := inc.timezone;
    new.billing_url      := inc.billing_url;
    new.daily_step_goal  := inc.daily_step_goal;
    new.archived         := inc.archived;
    new.coach_notes      := inc.coach_notes;
    new.medical_notes    := inc.medical_notes;

  elsif auth.uid() = old.id then
    -- The account's owner, editing themselves. Deliberately short: everything
    -- about the coaching relationship - credits, status, notes, renewal date,
    -- whether they are archived - belongs to the coach, and everything about
    -- payment belongs to Stripe.
    new.name             := inc.name;
    new.date_of_birth    := inc.date_of_birth;
    new.timezone         := inc.timezone;
    -- A coach's own row: their published Stripe customer-portal link.
    new.stripe_portal_url := inc.stripe_portal_url;

  end if;
  -- Any other caller changes nothing. Unreachable while the policies stand,
  -- and harmless if one is ever loosened by accident.

  return new;
end;
$$;

revoke all on function public.profiles_guard_columns() from public, anon, authenticated;

drop trigger if exists profiles_guard_columns on public.profiles;
create trigger profiles_guard_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_columns();

-- Sign-up metadata decided the new account's role:
--
--   v_role := coalesce(new.raw_user_meta_data->>'role', 'client');
--
-- raw_user_meta_data is whatever the caller put in the sign-up request, so
-- anyone could have asked for a trainer account and been given one. The app has
-- never sent a role, and a second coach would be set up by hand, so the value
-- is simply not needed. Every account created through sign-up is a client.
--
-- This rewrites only the role line; the rest of the function is replaced
-- wholesale by the invite migration that follows.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mc    uuid;
  v_tid   uuid;
  v_coach uuid;
  m       record;
begin
  v_tid := nullif(new.raw_user_meta_data->>'trainer_id', '')::uuid;

  if v_tid is null then
    select id into v_coach from public.profiles
      where role = 'trainer' and lower(email) = lower('harrison@harrisonstock.co.uk') limit 1;
    if v_coach is null then
      select id into v_coach from public.profiles where role = 'trainer' order by created_at limit 1;
    end if;
    v_tid := v_coach;
  end if;

  insert into public.profiles (id, name, email, role, trainer_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'client',
    v_tid
  );

  v_mc := nullif(new.raw_user_meta_data->>'managed_client_id', '')::uuid;
  if v_mc is not null then
    select * into m from public.managed_clients where id = v_mc;
    if found then
      update public.managed_clients set linked_profile_id = new.id where id = v_mc;
      update public.profiles p set
        credits       = m.credits,
        client_status = m.client_status,
        coach_notes   = case when coalesce(m.coach_notes, '')   <> '' then m.coach_notes   else p.coach_notes   end,
        medical_notes = case when coalesce(m.medical_notes, '') <> '' then m.medical_notes else p.medical_notes end,
        trainer_id    = coalesce(p.trainer_id, m.trainer_id)
      where p.id = new.id;
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
