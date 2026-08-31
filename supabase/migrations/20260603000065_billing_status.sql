-- What Stripe says, rather than what the coach remembers.
--
-- subscription_due is typed in by hand, so it drifts the moment a client's card
-- fails or they cancel. These columns are written only by the Stripe webhook and
-- are never editable in the app - if they disagree with Stripe, Stripe is right
-- and the next event will say so.
--
-- The manual subscription_due stays. It is the answer for a client paying by
-- bank transfer, who has no Stripe subscription to report anything about, and
-- the app prefers the synced date only where one exists.
alter table public.profiles
  -- Which Stripe customer this is. Learned from the first event that arrives
  -- for their email, then used directly, so a client who changes their email in
  -- Stripe doesn't quietly become a second person.
  add column if not exists stripe_customer_id  text,
  -- Stripe's own subscription status, stored verbatim: active, trialing,
  -- past_due, canceled, unpaid, incomplete. Not an enum - Stripe has added to
  -- this list before and a check constraint would reject the event rather than
  -- the app learning a new word.
  add column if not exists billing_status      text,
  add column if not exists billing_period_end  date,
  add column if not exists billing_amount      int,     -- minor units, as Stripe sends it
  add column if not exists billing_currency    text,
  add column if not exists billing_synced_at   timestamptz;

-- One Stripe customer is one client. A duplicate here means two profiles would
-- fight over the same subscription's events, each overwriting the other.
create unique index if not exists profiles_stripe_customer_idx
  on public.profiles (stripe_customer_id) where stripe_customer_id is not null;

-- The webhook writes with the service role, which bypasses RLS. Clients and
-- coaches only ever read these, and the existing profile policies already allow
-- that - so there is deliberately no new write policy here. Nothing signed in
-- as a person should be able to declare itself paid.
