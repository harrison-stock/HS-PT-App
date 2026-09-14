// GET /api/retention — erase clients whose retention period has run out.
//
// Run weekly by Vercel Cron (see vercel.json). The rule: records are kept for
// seven years from the day a client was archived, then removed. Seven years is
// roughly how long a question about an injury can take to surface, which is the
// reason to keep health records after someone has left at all - and once that
// reason has expired, keeping them is just holding someone's medical history
// for no stated purpose, which is the thing storage limitation is about.
//
// A rule nobody runs is not a retention policy, it is a sentence in a document.
// This is the part that makes it true.

import { admin, pushReady, pushToUser } from './_push.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET is not configured' });
  if ((req.headers.authorization || '') !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorised' });
  }

  const db = admin();

  // The view owns the seven years, so the rule lives in one place rather than
  // being a condition copied into a cron job where nobody would find it.
  const { data: due, error } = await db.from('clients_due_erasure').select('*');
  if (error) return res.status(500).json({ error: error.message });
  if (!due?.length) return res.status(200).json({ due: 0, erased: 0 });

  const erased = [];
  const failed = [];

  for (const c of due) {
    const { data: result, error: eErr } = await db.rpc('erase_client', { p_client_id: c.client_id });
    if (eErr) { failed.push({ client: c.client_id, error: eErr.message }); continue; }

    // The files themselves. Deleting the row that names a photo is not
    // deleting the photo, and an erasure that leaves them behind is not one.
    const paths = [...(result?.storage?.photos || []), ...(result?.storage?.documents || [])].filter(Boolean);
    if (paths.length) {
      for (const bucket of ['progress-photos', 'client-vault']) {
        const { error: sErr } = await db.storage.from(bucket).remove(paths);
        if (sErr && !/not found/i.test(sErr.message || '')) {
          failed.push({ client: c.client_id, error: `${bucket}: ${sErr.message}` });
        }
      }
    }

    // A registered client still has an auth user, which the app's own key
    // cannot remove. Say so rather than leaving a working login for someone
    // whose records are gone.
    if (result?.auth_user_remains) {
      try { await db.auth.admin.deleteUser(c.client_id); }
      catch (e) { failed.push({ client: c.client_id, error: `auth user: ${e?.message || 'not removed'}` }); }
    }

    erased.push({ client: c.client_id, name: c.name, trainer_id: c.trainer_id, archived_at: c.archived_at });
  }

  // Tell the coach what left. Erasure is not reversible and it happened without
  // anyone pressing anything, so it should never be something they find out
  // about by noticing an absence.
  if (pushReady() && erased.length) {
    const byCoach = new Map();
    for (const e of erased) {
      if (!e.trainer_id) continue;
      if (!byCoach.has(e.trainer_id)) byCoach.set(e.trainer_id, []);
      byCoach.get(e.trainer_id).push(e);
    }
    for (const [coachId, list] of byCoach) {
      await pushToUser(db, coachId, {
        title: list.length === 1 ? `${list[0].name || 'A client'}'s records have been erased`
                                 : `${list.length} clients' records have been erased`,
        body: 'Seven years after archiving, as set out in your retention policy.',
        link: { screen: 'coach' },
        tag: 'hs-pt-retention',
      });
    }
  }

  return res.status(200).json({ due: due.length, erased: erased.length, failed });
}
