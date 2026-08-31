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
