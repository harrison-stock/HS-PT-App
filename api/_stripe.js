// Shared Stripe machinery. Underscore-prefixed, so Vercel treats it as a
// helper and never exposes it as a route - it holds the webhook secret and the
// service-role key, neither of which may reach a browser.

import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

export const stripeReady = () => !!(WEBHOOK_SECRET && SUPABASE_URL && SERVICE_KEY);

// Service role: the webhook arrives as nobody, and has to write a profile row
// that RLS quite rightly lets no anonymous caller near.
export const admin = () => createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Vercel parses JSON bodies by default, and a parsed body cannot be verified -
// re-serialising it will not reproduce Stripe's byte order or spacing. The
// route disables the parser and hands the raw bytes to this instead.
export function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      // A Stripe event is a few kB. Anything approaching a megabyte is not one,
      // and reading it into memory is the whole attack.
      if (size > 1_048_576) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// Verify the Stripe-Signature header against the raw body.
//
// Deliberately hand-rolled rather than pulling in the Stripe SDK for one
// function: the scheme is small, and the parts that matter are the parts a
// wrapper would hide. Both are here on purpose -
//
//   the compare is constant-time, so a wrong signature cannot be walked
//   character by character from how long the rejection took;
//
//   the timestamp is checked, so a signature captured once cannot be replayed
//   for ever. Stripe's own tolerance is five minutes.
//
// Returns the parsed event, or throws. The caller answers 400 either way and
// says nothing about which part failed.
export function verifyEvent(rawBody, signatureHeader, { tolerance = 300, now = Date.now() } = {}) {
  if (!WEBHOOK_SECRET) throw new Error('no webhook secret configured');
  if (!signatureHeader) throw new Error('missing signature');

  // t=1710000000,v1=abc...,v1=def...   (more than one v1 during a secret roll)
  const parts = String(signatureHeader).split(',').map(s => s.trim());
  const timestamp = parts.find(p => p.startsWith('t='))?.slice(2);
  const signatures = parts.filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  if (!timestamp || !signatures.length) throw new Error('malformed signature');

  const age = Math.abs(Math.floor(now / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > tolerance) throw new Error('timestamp outside tolerance');

  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(`${timestamp}.${rawBody.toString('utf8')}`, 'utf8')
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const ok = signatures.some((sig) => {
    const given = Buffer.from(sig, 'utf8');
    // timingSafeEqual throws on a length mismatch, which is itself a leak if
    // left to bubble - a wrong length is simply not a match.
    return given.length === expectedBuf.length && crypto.timingSafeEqual(given, expectedBuf);
  });
  if (!ok) throw new Error('signature mismatch');

  return JSON.parse(rawBody.toString('utf8'));
}

// A Stripe timestamp is seconds; the column is a date.
export const toDate = (secs) =>
  Number.isFinite(secs) && secs > 0 ? new Date(secs * 1000).toISOString().slice(0, 10) : null;
