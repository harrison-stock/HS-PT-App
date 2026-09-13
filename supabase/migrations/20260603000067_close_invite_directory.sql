-- The invites table was readable by every signed-in user.
--
--   create policy "invites: authenticated read" on public.invites
--     for select to authenticated using (true);
--
-- The comment beside it said "needed to validate code on claim". Nothing
-- validates a code by reading this table. The sign-up screen takes the invite
-- details from the URL it was sent, and the only write a non-trainer makes is
-- the claim stamp, which has its own policy and does not read the row back.
-- So the policy bought nothing, and it cost this:
--
--   1. Sign up. Sign-up is open, and every new account is routed to the coach.
--   2. Select every invite - names, emails, trainer ids, invite codes, and the
--      managed_client_id of each person who has not yet joined.
--   3. Sign up a second time with someone else's managed_client_id in the
--      metadata, which is the same shape the real invite link uses.
--   4. handle_new_user() trusts it and moves that person's medical notes,
--      injuries, measurements, photos, tasks and training history onto the
--      new account.
--
-- Steps 3 and 4 are a separate fix - the trigger should be verifying a hashed,
-- single-use, email-matched token instead of believing whatever sign-up
-- metadata tells it. This migration removes step 2, which is what makes the
-- rest reachable without knowing a victim's UUID in advance: managed_clients
-- is trainer-only, profiles are own-read, and with this policy gone there is
-- no route left by which one client can learn another's identifiers.
drop policy if exists "invites: authenticated read" on public.invites;

-- A claimer may still find the one invite they were sent, by its code, so the
-- app can tell an already-claimed link from a live one. The code is the secret;
-- knowing it is what proves the link was addressed to you. This returns at most
-- the single row whose code you already had, never a list.
drop policy if exists "invites: read own code" on public.invites;
create policy "invites: read own code" on public.invites for select
  to authenticated
  using (claimed_by = auth.uid());
