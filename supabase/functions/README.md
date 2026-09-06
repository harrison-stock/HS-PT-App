# Edge Functions

Deno functions that run on Supabase rather than Vercel, because they need the
service role or have to receive a webhook from somewhere that can't be given a
Vercel URL.

| Function | What it does | Needs |
|---|---|---|
| `invite-client` | Creates an auth user for a managed client and emails them | service role |
| `send-reset` | Password reset via Resend, since built-in SMTP isn't configured | `RESEND_API_KEY` |
| `delete-client` | Removes a client and everything of theirs | service role |
| `health-connect-init` | Starts a wearable connection for the signed-in client | Terra keys |
| `ingest-health` | Receives wearable webhooks and writes `health_daily` | Terra keys |

---

## Wearables (steps, resting HR, weight)

Two functions, one aggregator. The aggregator — **Terra** — talks to Garmin,
Fitbit, Withings, Oura, Whoop, Apple Health, Google Fit and Strava so this app
doesn't have to. One integration, one webhook, every device.

Nothing here is required for the app to work. Steps can be typed in by hand on
the client's Progress screen, and everything downstream — the daily target, the
streak, the coach's 7-day average, the drop-off alert — reads `health_daily`
and neither knows nor cares whether a watch or a person put the number there.
Connecting a device just stops anyone having to.

### What to set, and where

**In Supabase** → Project Settings → Edge Functions → Secrets:

| Secret | Where it comes from |
|---|---|
| `TERRA_API_KEY` | Terra dashboard → API keys |
| `TERRA_DEV_ID` | Terra dashboard → the dev id shown beside the key |
| `HEALTH_WEBHOOK_SECRET` | Terra dashboard → Webhooks → signing secret |
| `APP_URL` | `https://app.harrisonstock.co.uk` — where clients land after connecting |

Then deploy both:

```bash
supabase functions deploy health-connect-init
supabase functions deploy ingest-health --no-verify-jwt
```

`--no-verify-jwt` on the second one is deliberate and necessary: Terra is not a
signed-in user, so it has no JWT to present. Its request is authenticated by the
signature instead, which is why `HEALTH_WEBHOOK_SECRET` must be set in
production. **Leave it unset and the function accepts anything that reaches it**
— that's a deliberate convenience for wiring the thing up, and a hole if it's
still true a week later.

**In Terra** → Webhooks → set the destination to:

```
https://<project-ref>.functions.supabase.co/ingest-health
```

### The one thing that has to be right

When a client taps CONNECT A DEVICE, `health-connect-init` asks Terra for a
widget session and passes that client's **profile id** as `reference_id`.
Terra echoes it back on every webhook, and that echo is the only thing tying
incoming data to a person. Change how it's passed on one side without the other
and the data arrives correctly and belongs to nobody.

### Cost

Terra charges per connected user per month — around $0.20 at small volume, with
a free tier for development. Clients who never connect a device cost nothing, so
this scales with the clients who actually use it.

### If you'd rather not

Direct Strava OAuth is the obvious alternative and, for this app, the worse one.
It's a token refresh cycle, a webhook subscription and rate limits, for one
provider — and Strava reports *workouts*, not steps or resting HR. It's the
right integration for a running coach and the wrong one here, where the number
that matters most is how much someone moved on the days they didn't train.
