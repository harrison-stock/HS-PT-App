// POST /api/push — send a push to one user.
//
// Called by the app when something happens that the other party should hear
// about (a form assigned, a workout logged). The caller proves who they are
// with their own Supabase JWT; the route decides who they're allowed to reach.
//
// That check is the whole point of the route. Anyone can post to it, and the
// subscription endpoints it works with are capabilities - hand one out and the
// holder can push to that phone. So a caller may only reach the two parties
// they already have a relationship with: their coach, or one of their clients.

import { admin, pushReady, pushToUser, readJson } from './_push.js';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (!pushReady()) return res.status(503).json({ error: 'push not configured' });

  const token = (req.headers.authorization || '').replace(/^Bearer /i, '');
  if (!token) return res.status(401).json({ error: 'missing token' });

  // Validate the JWT by using it, rather than decoding it here - an expired or
  // forged token simply fails to resolve a user.
  const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: { user } } = await asCaller.auth.getUser();
  if (!user) return res.status(401).json({ error: 'invalid token' });

  const { recipientId, title, body, link, tag } = await readJson(req);
  if (!recipientId || !title) return res.status(400).json({ error: 'recipientId and title required' });
  // Pushing to yourself is always a mistake somewhere upstream, never a threat.
  if (recipientId === user.id) return res.status(200).json({ sent: 0 });

  const db = admin();
  const { data: pair } = await db.from('profiles')
    .select('id, trainer_id').in('id', [user.id, recipientId]);
  const me = pair?.find(p => p.id === user.id);
  const them = pair?.find(p => p.id === recipientId);
  if (!me || !them) return res.status(404).json({ error: 'unknown user' });

  const linked = me.trainer_id === them.id || them.trainer_id === me.id;
  if (!linked) return res.status(403).json({ error: 'not your coach or client' });

  // Titles and bodies come from the app but end up on someone's lock screen,
  // so they're capped rather than trusted to be sensible.
  const result = await pushToUser(db, recipientId, {
    title: String(title).slice(0, 120),
    body: String(body || '').slice(0, 300),
    link: link || null,
    tag: tag || undefined,
  });

  return res.status(200).json(result);
}
