import { supabase } from './supabase'

// Billing links, kept at arm's length.
//
// These are URLs a coach pastes in, rendered as buttons a client taps. That is
// a link someone else controls appearing in someone else's app, so it is
// checked rather than trusted: https only, no javascript: or data:, and nothing
// that fails to parse. A coach with a typo gets no button rather than a broken
// or dangerous one.
export function safeUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  let u;
  try { u = new URL(s); } catch (e) { return null; }
  return u.protocol === 'https:' ? u.href : null;
}

// Stripe's own hosts, so the app can say whether a link goes where it claims.
// Not a security boundary - safeUrl is - just honesty in the interface.
export function isStripeUrl(url) {
  try { return /(^|\.)stripe\.com$/.test(new URL(url).hostname); } catch (e) { return false; }
}

// The portal link belongs to the trainer, and every one of their clients uses
// it. Fetched from the client's own trainer_id rather than stored twice, so
// changing it in one place changes it everywhere.
export async function loadPortalUrl(trainerId) {
  if (!trainerId) return null;
  const { data } = await supabase.from('profiles')
    .select('stripe_portal_url').eq('id', trainerId).maybeSingle();
  return safeUrl(data?.stripe_portal_url);
}

// How a Stripe status reads to a person.
//
// Stored verbatim from Stripe, so this has to cope with a word it has never
// seen: an unknown status shows itself rather than being hidden, which is the
// honest failure and tells whoever is looking what to search for.
const STATUS = {
  active:             { label: 'Active',          tone: 'good' },
  trialing:           { label: 'Trial',           tone: 'good' },
  past_due:           { label: 'Payment failed',  tone: 'bad'  },
  unpaid:             { label: 'Unpaid',          tone: 'bad'  },
  incomplete:         { label: 'Incomplete',      tone: 'warn' },
  incomplete_expired: { label: 'Expired',         tone: 'bad'  },
  paused:             { label: 'Paused',          tone: 'warn' },
  canceled:           { label: 'Cancelled',       tone: 'idle' },
};

const TONE = {
  good: 'var(--accent)',
  warn: 'var(--c-amber)',
  bad:  'var(--c-coral)',
  idle: 'var(--text-3)',
};

export function billingStatus(profile) {
  const raw = profile?.billing_status;
  if (!raw) return null;
  const meta = STATUS[raw] || { label: String(raw).replace(/_/g, ' '), tone: 'warn' };
  return { ...meta, raw, color: TONE[meta.tone] };
}

// Stripe's date where there is one, the coach's typed date otherwise. A client
// paying by bank transfer has no subscription for Stripe to report on, and the
// manual date is the only answer that exists for them.
export function renewalDate(profile) {
  const synced = profile?.billing_period_end;
  return {
    date: synced || profile?.subscription_due || null,
    fromStripe: !!synced,
  };
}

export function formatAmount(profile) {
  const amt = profile?.billing_amount;
  if (!Number.isFinite(amt)) return null;
  const cur = (profile?.billing_currency || 'gbp').toUpperCase();
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: cur }).format(amt / 100);
  } catch (e) {
    return `${(amt / 100).toFixed(2)} ${cur}`;
  }
}
