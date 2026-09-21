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
signature instead.

**`HEALTH_WEBHOOK_SECRET` is required, not optional.** The function refuses
every request when it isn't set, and logs why. It used to accept anything
instead — a convenience for wiring it up that, combined with `--no-verify-jwt`,
left a public endpoint that would write health records for any client whose id
you could name. So if data isn't arriving, check that secret first: the symptom
is a 401 on every delivery in Terra's webhook log.

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

### Apple Health is the exception

Apple is not in that list of providers, and no aggregator can put it there.
HealthKit has no cloud API — the data lives on the phone, and the only two ways
out of it are a native iOS app holding a HealthKit entitlement or the Health
app's own export button. Terra can't reach it either.

So Apple Health is handled separately and needs nothing set up: on their Profile
screen, a client picks the zip the Health app produced and it is read **in the
browser, on their phone** (`src/lib/appleHealth.js`). The archive is never
uploaded — partly because it is routinely hundreds of megabytes, and mostly
because it contains their whole medical history when all we want is three
numbers. What gets written is a row per day in `health_daily` with
`source = 'apple_health'`.

Two things about it worth knowing:

- **It's a snapshot, not a sync.** It stops the moment the file was made. The
  client re-exports whenever they want it brought up to date, and the app
  labels the entry IMPORTED rather than SYNCED so nobody mistakes stale data
  for a broken watch.
- **The export is not de-duplicated.** An iPhone and an Apple Watch both record
  the same walk and both sets of samples are in the file. Steps are therefore
  totalled per device and the day takes the *largest* of those totals, never the
  sum — otherwise a 9,500-step day reads as 13,500. `src/lib/healthSource.js`
  then decides between that and anything Terra sent: a worn device beats an
  export, which beats a number typed in by hand.

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
