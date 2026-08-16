// Shared push machinery for the two API routes.
//
// Lives outside the app bundle: the VAPID private key and the service-role key
// must never reach a browser. Vercel treats a leading-underscore file in /api
// as a helper rather than a route, so this isn't reachable over HTTP.

import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

const PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY || '';
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const SUBJECT     = process.env.VAPID_SUBJECT || 'mailto:harrison@harrisonstock.co.uk';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const pushReady = () => !!(PUBLIC_KEY && PRIVATE_KEY && SUPABASE_URL && SERVICE_KEY);

if (PUBLIC_KEY && PRIVATE_KEY) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
}

// Service role: the sender has to read other people's subscription rows, which
// RLS quite rightly forbids to everyone else.
export const admin = () => createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Deliver to every device a user has registered. A subscription outlives the
// install that made it, so the push service reports the dead ones with 404 or
// 410 - those get cleared out here, because a phone that was reinstalled would
// otherwise fail forever on every send.
export async function pushToUser(db, userId, payload) {
  const { data: subs } = await db.from('push_subscriptions')
    .select('id, endpoint, p256dh, auth').eq('user_id', userId);
  if (!subs?.length) return { sent: 0, removed: 0 };

  const body = JSON.stringify(payload);
  let sent = 0;
  const dead = [];

  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        body,
        { TTL: payload.ttl ?? 3600 },
      );
      sent++;
    } catch (err) {
      const code = err?.statusCode;
      if (code === 404 || code === 410) dead.push(s.id);
      // Anything else (429, 5xx, a network blip) is transient - keep the
      // subscription and let the next send try again.
    }
  }));

  if (dead.length) await db.from('push_subscriptions').delete().in('id', dead);
  if (sent) {
    await db.from('push_subscriptions').update({ last_used_at: new Date().toISOString() })
      .eq('user_id', userId);
  }
  return { sent, removed: dead.length };
}

export async function readJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { return {}; }
}

const KIND_WORD = { form: 'check-in', log: 'log', photo: 'photo', check: 'task' };

// What to say to one client about everything they owe. One push however much
// that is - four separate buzzes for four overdue tasks is how an app gets its
// notifications turned off.
export function summariseDue(tasks, today) {
  const overdue = tasks.filter(t => t.due_date < today).length;
  if (tasks.length === 1) {
    const t = tasks[0];
    const late = t.due_date < today;
    return {
      title: late ? `Still to do: ${t.title}` : t.title,
      body: `Your ${KIND_WORD[t.kind] || 'task'} is ${late ? 'overdue' : 'due today'}.`,
    };
  }
  return {
    title: `${tasks.length} things to do`,
    body: `${overdue ? `${overdue} overdue, ` : ''}${tasks.length - overdue} due today.`,
  };
}
