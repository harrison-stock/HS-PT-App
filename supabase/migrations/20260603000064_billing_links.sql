-- Somewhere for Stripe to live, without Stripe living here.
--
-- Payment is taken in Stripe. What the app was missing was the other half:
-- a client could see a renewal date they had no way to act on, and had to ask
-- their coach to change a card. Two links close that, and neither needs a
-- secret key, a webhook, or a subscription table to go stale.
--
--   stripe_portal_url  the trainer's Stripe customer-portal login link. One
--                      per trainer, shared by every client - Stripe takes the
--                      email and sends its own magic link, so the app never
--                      has to know which Stripe customer is which.
--
--   billing_url        a payment or subscription link for one client, for
--                      starting or restarting a plan. Per client because the
--                      plan is.
--
-- Both nullable: the feature is dormant until a link is pasted in, which is
-- the correct state for a coach invoicing by bank transfer.
alter table public.profiles
  add column if not exists stripe_portal_url text,
  add column if not exists billing_url       text;

-- Coach-managed clients have no login, so no portal of their own - but a coach
-- may still want the payment link on their file alongside everyone else's.
alter table public.managed_clients
  add column if not exists billing_url text;
