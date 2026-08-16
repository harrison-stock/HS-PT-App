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
