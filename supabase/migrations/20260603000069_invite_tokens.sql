-- Sign-up believed whatever it was told.
--
--   v_mc := nullif(new.raw_user_meta_data->>'managed_client_id', '')::uuid;
--   ... transfers that person's notes, injuries, measurements, photos,
--       workouts and sessions onto the new account ...
--
-- raw_user_meta_data is part of the sign-up request, so it is the attacker's
-- to write. Migration 067 removed the directory that handed out other people's
-- managed_client_id values; this removes the part that acted on them.
--
-- The shape of the fix is: an invite is a secret the coach sends to one person,
-- the database stores only its hash, and the invite row - not the sign-up
-- request - decides which coach and which existing client record the new
-- account belongs to. Sign-up metadata now contributes a display name and
-- nothing else that matters.

-- ── The token ────────────────────────────────────────────────────────────────
alter table public.invites
  add column if not exists token_hash text,
  add column if not exists expires_at  timestamptz;

-- Existing links carry a 6-byte code in their URL and must keep working, so
-- their hash is derived from the code they already have. New invites get 32
-- bytes and never store the plaintext at all - once the coach has copied the
-- link, nothing in the database can reproduce it.
update public.invites
   set token_hash = encode(sha256(convert_to(code, 'utf8')), 'hex')
 where token_hash is null and code is not null;

-- A link that lives forever is a credential nobody remembers issuing. Existing
-- unclaimed invites get a fresh fortnight from this deployment rather than
-- being dated from when they were made, so none of them breaks today.
update public.invites
   set expires_at = now() + interval '14 days'
 where expires_at is null and claimed_by is null;

alter table public.invites alter column code drop not null;
alter table public.invites alter column code drop default;

create unique index if not exists invites_token_hash_key on public.invites (token_hash) where token_hash is not null;

-- ── The claim ────────────────────────────────────────────────────────────────
-- Claiming used to be a client-side update, permitted by:
--
--   create policy "invites: claim" on public.invites for update
--     to authenticated using (claimed_by is null) ...
--
-- which let any signed-in user claim any unclaimed invite they could name. It
-- is no longer needed: the trigger below does the claim as part of creating the
-- account, in one statement that cannot be raced.
drop policy if exists "invites: claim" on public.invites;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
  v_hash  text;
  v_tid   uuid;
  v_mc    uuid;
  v_coach uuid;
  inv     public.invites%rowtype;
  m       public.managed_clients%rowtype;
begin
  v_token := nullif(new.raw_user_meta_data->>'invite_token', '');

  if v_token is not null then
    v_hash := encode(sha256(convert_to(v_token, 'utf8')), 'hex');

    -- Selected under a row lock rather than claimed outright, because
    -- invites.claimed_by is a foreign key to profiles and this profile does
    -- not exist yet. Claiming here aborts the whole sign-up on the constraint,
    -- so the claim is stamped further down, once there is a row to point at.
    --
    -- The lock is what keeps that safe. A second sign-up presenting the same
    -- token blocks here until this transaction commits, then re-evaluates its
    -- conditions against the committed row, finds claimed_by already set, and
    -- matches nothing. Every condition sits in this one statement so none of
    -- them can be evaluated against a row that has moved on since.
    --
    -- The email test is skipped when the coach created the invite without one,
    -- because then the token is the only thing identifying the recipient and
    -- the coach is handing the link over themselves.
    select i.* into inv from public.invites i
     where i.token_hash = v_hash
       and i.claimed_by is null
       and (i.expires_at is null or i.expires_at > now())
       and (coalesce(i.client_email, '') = '' or lower(i.client_email) = lower(new.email))
       for update;

    if found then
      v_tid := inv.trainer_id;
      v_mc  := inv.managed_client_id;
    end if;
  end if;

  -- No invite, or one that didn't hold up: still a client, still routed to the
  -- coach, but attached to no existing record. Someone signing up with a stale
  -- or forged token gets an ordinary empty account, which is the right outcome
  -- - it is indistinguishable from signing up off the front page.
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
    -- The one thing sign-up metadata is still trusted for, and the worst it can
    -- do is give someone a silly display name.
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), inv.client_name, split_part(new.email, '@', 1)),
    new.email,
    'client',
    v_tid
  );

  -- Now the profile exists, the invite can point at it. Same transaction as the
  -- account it belongs to: either both happen or neither does, so there is no
  -- state in which someone has an account against an invite still marked open.
  if inv.id is not null then
    update public.invites set claimed_by = new.id, claimed_at = now() where id = inv.id;
  end if;

  -- Adopt the record the coach has been keeping. Claiming the link and claiming
  -- the record are separate one-time steps: linked_profile_id in the where
  -- clause means a managed client already joined to an account cannot be taken
  -- over by a second one, whatever the invite says.
  if v_mc is not null then
    update public.managed_clients
       set linked_profile_id = new.id
     where id = v_mc and linked_profile_id is null and trainer_id = v_tid
    returning * into m;

    if found then
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
      update public.health_daily     set client_id = new.id where client_id = v_mc;
      update public.form_responses   set client_id = new.id where client_id = v_mc;
      update public.client_documents set client_id = new.id where client_id = v_mc;
    end if;
  end if;

  return new;
end;
$$;

-- The coach needs one token back at the moment they create an invite, and never
-- again. Returns the plaintext to the caller and stores only its hash.
create or replace function public.create_invite(
  p_client_name text,
  p_client_email text,
  p_managed_client_id uuid default null,
  p_days int default 14
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'trainer') then
    raise exception 'only a coach can create an invite';
  end if;
  -- A coach may only attach an invite to a client record that is already theirs.
  if p_managed_client_id is not null
     and not exists (select 1 from public.managed_clients
                      where id = p_managed_client_id and trainer_id = auth.uid()) then
    raise exception 'that client is not yours';
  end if;

  v_token := encode(gen_random_bytes(32), 'hex');

  insert into public.invites (trainer_id, client_name, client_email, managed_client_id, token_hash, expires_at)
  values (auth.uid(), coalesce(p_client_name, ''), coalesce(p_client_email, ''), p_managed_client_id,
          encode(sha256(convert_to(v_token, 'utf8')), 'hex'),
          now() + make_interval(days => greatest(1, least(90, p_days))));

  return v_token;
end;
$$;

revoke all on function public.create_invite(text, text, uuid, int) from public, anon;
grant execute on function public.create_invite(text, text, uuid, int) to authenticated;
