// ingest-health — receives wearable webhooks from a health aggregator
// (Terra or Vital) and upserts steps / resting HR / weight into health_daily,
// mirroring weight into body_metrics.
//
// SETUP
//   supabase functions deploy ingest-health --no-verify-jwt
//   supabase secrets set HEALTH_WEBHOOK_SECRET=<aggregator signing secret>
//   Point the aggregator's webhook at:
//   https://<project-ref>.functions.supabase.co/ingest-health
//
// IMPORTANT: when you create a connection session for a client, pass that
// client's profile id as the aggregator "reference_id" (Terra) / "user" client
// id (Vital). Their webhooks then echo it back so we can map data → client.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const WEBHOOK_SECRET = Deno.env.get('HEALTH_WEBHOOK_SECRET') ?? ''

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } })

// ── Signature verification ───────────────────────────────────────────────────
// Terra sends `terra-signature: t=<ts>,v1=<hmac>` — HMAC-SHA256 of `${t}.${body}`.
// Vital uses Svix (`svix-id`/`svix-timestamp`/`svix-signature`). Swap as needed.
// Constant-time compare. A === on hex digests leaks, through how long the
// comparison takes, how many leading characters were right - which is enough to
// find a valid signature a character at a time.
function sameDigest(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const TOLERANCE_SECS = 300

async function verifyTerra(req: Request, raw: string): Promise<boolean> {
  // Fails closed. This used to `return true` when the secret was unset - a
  // convenience for wiring the thing up that becomes, the moment the function
  // is deployed with --no-verify-jwt and the secret forgotten, an unauthed
  // endpoint writing health records for any client whose id you can name.
  // Missing configuration is now a refusal, which is noisy and safe rather than
  // quiet and open.
  if (!WEBHOOK_SECRET) {
    console.error('HEALTH_WEBHOOK_SECRET is not set - refusing every request')
    return false
  }
  const header = req.headers.get('terra-signature') || ''
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')))
  const t = parts['t']; const v1 = parts['v1']
  if (!t || !v1) return false

  // A signature stays valid forever unless its timestamp is checked, so a
  // captured request could be replayed indefinitely.
  const age = Math.abs(Date.now() / 1000 - Number(t))
  if (!Number.isFinite(age) || age > TOLERANCE_SECS) return false

  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(WEBHOOK_SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${raw}`))
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('')
  return sameDigest(hex, v1)
}

const dayOf = (iso: string) => new Date(iso).toISOString().slice(0, 10)
const num = (v: unknown) => (typeof v === 'number' && !isNaN(v) ? v : null)

// Normalise a single aggregator payload into { clientId, day, source, metrics }.
// Field paths below match Terra's shape; adjust the marked lines for Vital.
function normalise(payload: any): null | {
  clientId: string; source: string;
  rows: Record<string, { steps?: number|null; resting_hr?: number|null; avg_hr?: number|null; weight_kg?: number|null }>;
} {
  // reference id we set when creating the connection == our client (profile) id
  const clientId = payload?.user?.reference_id || payload?.reference_id || payload?.user?.client_user_id
  if (!clientId) return null
  const source = (payload?.user?.provider || payload?.provider || 'wearable').toLowerCase()
  const rows: Record<string, any> = {}
  const put = (day: string, patch: any) => { rows[day] = { ...(rows[day] || {}), ...patch } }

  // ── Daily activity (steps, resting/avg HR) ──  [Terra: data[].* ]
  for (const d of (payload?.data || [])) {
    const day = dayOf(d?.metadata?.start_time || d?.metadata?.end_time || new Date().toISOString())
    const steps = num(d?.distance_data?.steps) ?? num(d?.summary?.steps) ?? num(d?.steps)
    const restHr = num(d?.heart_rate_data?.summary?.resting_hr_bpm) ?? num(d?.resting_hr)
    const avgHr = num(d?.heart_rate_data?.summary?.avg_hr_bpm) ?? num(d?.avg_hr)
    if (steps != null || restHr != null || avgHr != null) put(day, { steps, resting_hr: restHr, avg_hr: avgHr })

    // ── Body / weight (smart scales) ──  [Terra: body data]
    const w = num(d?.measurements_data?.measurements?.[0]?.weight_kg) ?? num(d?.weight_kg)
    if (w != null) put(day, { weight_kg: w })
  }
  return Object.keys(rows).length ? { clientId, source, rows } : null
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('ok', { status: 200 })
  const raw = await req.text()

  if (!(await verifyTerra(req, raw))) return new Response('bad signature', { status: 401 })

  let payload: any
  try { payload = JSON.parse(raw) } catch { return new Response('bad json', { status: 400 }) }

  // Connection (auth) events → record the link for the settings UI.
  const type = payload?.type || payload?.event_type
  if (type === 'auth' || type === 'connection.created') {
    const clientId = payload?.user?.reference_id || payload?.reference_id
    const provider = (payload?.user?.provider || payload?.provider || 'wearable').toLowerCase()
    if (clientId) {
      const { error } = await admin.from('wearable_connections').upsert(
        { client_id: clientId, provider, status: 'connected', ref_user_id: payload?.user?.user_id || null, last_sync: new Date().toISOString() },
        { onConflict: 'client_id,provider' })
      // 200 tells the aggregator the event is dealt with and it need not retry.
      // Saying that about a write that failed loses the event for good.
      if (error) {
        console.error('wearable_connections upsert failed', error.message)
        return new Response('write failed', { status: 500 })
      }
    }
    return new Response('ok', { status: 200 })
  }

  const norm = normalise(payload)
  if (!norm) return new Response('ignored', { status: 200 })

  const rows = Object.entries(norm.rows).map(([day, m]) => ({
    client_id: norm.clientId, day, source: norm.source, updated_at: new Date().toISOString(), ...m,
  }))
  if (rows.length) {
    const { error } = await admin.from('health_daily').upsert(rows, { onConflict: 'client_id,day,source' })
    if (error) {
      console.error('health_daily upsert failed', error.message)
      return new Response('write failed', { status: 500 })
    }
    // Mirror any weigh-ins into body_metrics so the existing charts/report pick
    // them up (no unique constraint there, so check-then-write).
    for (const r of rows) {
      if (r.weight_kg != null) {
        const { data: existing } = await admin.from('body_metrics')
          .select('id').eq('client_id', r.client_id).eq('recorded_at', r.day).limit(1).maybeSingle()
        if (existing) await admin.from('body_metrics').update({ weight_kg: r.weight_kg }).eq('id', existing.id)
        else await admin.from('body_metrics').insert({ client_id: r.client_id, recorded_at: r.day, weight_kg: r.weight_kg })
      }
    }
    await admin.from('wearable_connections')
      .update({ last_sync: new Date().toISOString() })
      .eq('client_id', norm.clientId).eq('provider', norm.source)
  }
  return new Response('ok', { status: 200 })
})
