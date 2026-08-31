// POST /api/stripe — Stripe's webhook.
//
// The billing links gave a client somewhere to pay. This is how the app finds
// out whether they did. Nothing here is ever written from the browser: a client
// who could declare themselves paid would be the whole problem.
//
// Everything is driven by the signed event. Statuses are stored exactly as
// Stripe words them, so a status Stripe invents next year arrives as itself
// rather than being rejected by a check constraint.

import { admin, stripeReady, readRawBody, verifyEvent, toDate } from './_stripe.js';

// Vercel parses JSON by default, and a parsed body cannot be verified -
// re-serialising it will not reproduce Stripe's exact bytes.
export const config = { api: { bodyParser: false } };

// LIKE wildcards in a value are a filter, not text. A Stripe customer's email
// is unlikely to contain one, but "unlikely" is not a reason to let %@% match
// every client on the roster.
const escapeLike = (s) => String(s).replace(/([\\%_])/g, '\\$1');

// Who this event is about.
//
// The customer id is the real key, but it is only known once an event has
// carried it, so the first one falls back to the email Stripe holds and records
// the id for every event after. Clients only - a coach is not their own client.
async function findClient(db, customerId, email) {
  if (customerId) {
    const { data } = await db.from('profiles')
      .select('id, billing_synced_at').eq('stripe_customer_id', customerId).maybeSingle();
    if (data) return data;
  }
  if (email) {
    const { data } = await db.from('profiles')
      .select('id, billing_synced_at')
      .ilike('email', escapeLike(email))
      .eq('role', 'client')
      .maybeSingle();
    if (data) {
      if (customerId) {
        await db.from('profiles').update({ stripe_customer_id: customerId }).eq('id', data.id);
      }
      return data;
    }
  }
  return null;
}

// What each event means for the row. Anything not listed is acknowledged and
// ignored - Stripe sends a great many events and retrying the ones we don't
// want is worse than dropping them.
function patchFor(event) {
  const o = event.data?.object || {};
  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const price = o.items?.data?.[0]?.price || {};
      return {
        // A deleted subscription can still arrive with status 'active'; what it
        // means is that it is over.
        billing_status: event.type.endsWith('deleted') ? 'canceled' : (o.status || null),
        billing_period_end: toDate(o.current_period_end),
        billing_amount: Number.isFinite(price.unit_amount) ? price.unit_amount : null,
        billing_currency: price.currency || null,
      };
    }
    case 'invoice.payment_succeeded':
      return {
        billing_status: 'active',
        billing_period_end: toDate(o.lines?.data?.[0]?.period?.end),
      };
    case 'invoice.payment_failed':
      return { billing_status: 'past_due' };
    // Carries the customer id for someone who has just subscribed, which is how
    // a client stops being matched by email from here on.
    case 'checkout.session.completed':
      return {};
    default:
      return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!stripeReady()) return res.status(503).json({ error: 'stripe not configured' });

  let event;
  try {
    const raw = await readRawBody(req);
    event = verifyEvent(raw, req.headers['stripe-signature']);
  } catch (e) {
    // Deliberately uninformative. Which half of the check failed is not
    // something an unverified caller gets to learn.
    return res.status(400).json({ error: 'invalid signature' });
  }

  const patch = patchFor(event);
  if (!patch) return res.status(200).json({ ignored: event.type });

  const o = event.data?.object || {};
  const customerId = typeof o.customer === 'string' ? o.customer : o.customer?.id || null;
  const email = o.customer_email || o.customer_details?.email || null;

  const db = admin();
  const client = await findClient(db, customerId, email);
  // A paying customer who isn't on the roster is not an error - a coach may
  // take money from someone who never signed into the app. Acknowledge it, or
  // Stripe retries a delivery that can never land.
  if (!client) return res.status(200).json({ unmatched: true });

  // Stripe does not guarantee order, and a retry of an older event can arrive
  // after a newer one. The event's own timestamp decides.
  const eventAt = new Date((event.created || 0) * 1000);
  if (client.billing_synced_at && new Date(client.billing_synced_at) > eventAt) {
    return res.status(200).json({ stale: event.type });
  }

  const { error } = await db.from('profiles')
    .update({ ...patch, billing_synced_at: eventAt.toISOString() })
    .eq('id', client.id);
  // A failed write must not be acknowledged - a non-2xx is what makes Stripe
  // try again.
  if (error) return res.status(500).json({ error: 'could not record event' });

  return res.status(200).json({ ok: true, type: event.type });
}
