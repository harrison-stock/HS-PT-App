# Push notifications

Three moving parts: the browser holds a **subscription**, `push_subscriptions`
stores it, and the two routes in this folder do the sending.

- `POST /api/push` — one push, now. Called by the app whenever `notify()` writes
  an in-app notification, so a form assigned or a workout logged reaches the
  other person's phone as well as their notifications list.
- `GET /api/reminders` — run daily by Vercel Cron. Pushes clients about check-ins
  and tasks that are due or overdue.
- `api/_push.js` — shared sending code. The leading underscore keeps Vercel from
  exposing it as a route; it holds the keys and must never be reachable.

## Setup

### 1. Generate a key pair

```bash
npx web-push generate-vapid-keys
```

Two values, used once and kept forever. Changing them later invalidates every
subscription your clients have, and each of them has to toggle notifications off
and on again — so store them somewhere you won't lose them.

### 2. Add four environment variables in Vercel

| Variable | Value | Scope |
|---|---|---|
| `VITE_VAPID_PUBLIC_KEY` | the **public** key | Production, Preview |
| `VAPID_PRIVATE_KEY` | the **private** key | Production |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API Keys → `service_role` | Production |
| `CRON_SECRET` | any long random string | Production |

`VITE_` is the only prefix that reaches the browser, which is exactly right
here: the public key is meant to be public, and the other three must never
leave the server. Don't put a `VITE_` prefix on any of them.

`VAPID_SUBJECT` is optional and defaults to a `mailto:` for Harrison. Push
services want a way to contact whoever is sending.

### 3. Redeploy

The feature is dormant until the keys exist. Without them the toggle in Profile
reads "not configured on this deployment yet", `/api/push` answers `503`, and
nothing else misbehaves — so adding the variables is the only step that turns it
on.

## Clients have to opt in

Profile → NOTIFICATIONS → toggle on. It has to be a real tap: browsers refuse a
permission prompt raised any other way, and iOS refuses it without saying so.

**On iPhone the app must be installed to the home screen first.** Safari will not
deliver web push to a normal tab, and gives no error explaining why — the toggle
says so rather than failing silently.

One row per install, keyed by the endpoint the push service issues. The same
person on a phone and a laptop is two rows, and both get the push.

## What gets sent

| Trigger | Who hears about it |
|---|---|
| Anything that calls `notify()` — form assigned, task set, workout logged, injury reported | the counterparty |
| Daily reminder sweep at 08:00 UTC | clients with a task or check-in due or overdue |
| Rest timer expiring | the client, from their own device |

The rest timer is **local**, not pushed: the deadline lives on the phone and the
server never sees it. It fires when the page is hidden but still alive, and on
iOS when the app is reopened. A rest ending while an iPhone is genuinely
suspended cannot be announced by any web API — that is a platform limit, not a
gap in this code.

## Behaviour worth knowing

- **One push per client per sweep**, however many things they owe. Four buzzes
  for four overdue tasks is how an app gets its notifications turned off.
- **`reminded_on` is a date**, compared against today, so the sweep is safe to
  run repeatedly — a retry or an overlapping run can't tell anyone twice.
- **Dead subscriptions clear themselves.** A reinstalled phone makes the old
  endpoint return `404`/`410`, and those rows are deleted on the spot. A `500`
  or a timeout is transient and the subscription is kept.
- **`/api/push` only reaches your coach or your client.** A subscription endpoint
  is a capability — anyone holding one can push to that device — so the route
  checks the caller's JWT against the `profiles` link before sending anywhere.

## Changing the schedule

`vercel.json`. The cron expression is UTC. Vercel's Hobby plan allows one run a
day per job; a paid plan allows finer schedules if you ever want a second sweep
in the evening.

---

# Billing status

Payment is taken in Stripe. `POST /api/stripe` is how the app finds out whether
it worked, so a client's subscription state on their file is Stripe's answer
rather than something typed in and forgotten.

Nothing in the browser can write these columns. `billing_status`,
`billing_period_end`, `billing_amount` and `billing_currency` are set only by
this route, using the service role — a client able to declare themselves paid
would be the whole problem.

## Setup

### 1. Add the endpoint in Stripe

Developers → Webhooks → **Add endpoint**, pointing at
`https://app.harrisonstock.co.uk/api/stripe`, and subscribe it to:

| Event | What it sets |
|---|---|
| `customer.subscription.created` | status, renewal date, amount |
| `customer.subscription.updated` | the same, on any change |
| `customer.subscription.deleted` | `canceled` |
| `invoice.payment_succeeded` | `active`, renewal date |
| `invoice.payment_failed` | `past_due` |
| `checkout.session.completed` | links the Stripe customer to the client |

Anything else is acknowledged and ignored, so subscribing to more does no harm
beyond noise.

### 2. Add one environment variable

| Variable | Value | Scope |
|---|---|---|
| `STRIPE_WEBHOOK_SECRET` | the endpoint's signing secret, `whsec_…` | Production |

`SUPABASE_SERVICE_ROLE_KEY` is already set for push and is reused here. No
Stripe API key is needed: the route only ever reads what Stripe sends it, and
never calls Stripe back.

Without the secret the route answers `503` and nothing else changes — the
manual renewal date carries on working exactly as before.

## How a client gets matched

By `stripe_customer_id` once it is known. The first event for someone falls back
to the email Stripe holds and records the customer id, so every event after that
is matched directly. A payment from someone who isn't on the roster is
acknowledged and ignored rather than retried for ever.

## Behaviour worth knowing

- **Signatures are verified** against the raw body, with a constant-time compare
  and Stripe's five-minute timestamp tolerance, so a captured request cannot be
  replayed later. A failure answers `400` and says nothing about which part
  failed.
- **Out-of-order events can't go backwards.** Stripe doesn't guarantee delivery
  order and retries freely, so each event's own timestamp is compared against
  `billing_synced_at` and an older one is dropped.
- **A write failure is not acknowledged.** Anything other than a 2xx is what
  makes Stripe try again, so a database error answers `500` on purpose.
- **The manual renewal date still works.** A client paying by bank transfer has
  no Stripe subscription to report anything, and their typed date is the only
  answer that exists. The synced date is preferred only where there is one.
- **A failed payment reaches the coach hub** as the top item in the digest. It
  is the one thing on that list that costs money for every day it goes unseen.
