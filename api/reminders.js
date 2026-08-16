// GET /api/reminders — nudge clients about what's due today.
//
// Run by Vercel Cron (see vercel.json). Covers the two things a client is meant
// to do off their own bat and reliably forgets: the weekly check-in form, and a
// task like a weight log. A workout has a session behind it and its own place
// in the app; a form sitting unanswered has nothing to remind anyone it exists.
//
// Overdue counts as well as due today. A check-in missed on Monday still wants
// answering on Wednesday, and the recurrence catch-up deliberately leaves the
// missed one in place rather than tidying it away.
//
// client_tasks.reminded_on is a date, compared against today, so this is safe
// to run repeatedly: a retry, an overlapping run, or a tightened schedule can't
// tell anyone twice in one day.

import { admin, pushReady, pushToUser, summariseDue } from './_push.js';

export default async function handler(req, res) {
  if (!pushReady()) return res.status(503).json({ error: 'push not configured' });

  // Vercel signs its own cron requests; the secret is for anyone else who finds
  // the URL. Unset means open, which is survivable - the worst a stranger can
  // do is make today's reminders go out slightly early, once.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${secret}`) return res.status(401).json({ error: 'unauthorised' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const db = admin();

  const { data: due, error } = await db.from('client_tasks')
    .select('id, client_id, title, kind, due_date, reminded_on')
    .is('completed_at', null)
    .not('due_date', 'is', null)
    .lte('due_date', today)
    .or(`reminded_on.is.null,reminded_on.lt.${today}`)
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  if (!due?.length) return res.status(200).json({ clients: 0, tasks: 0, sent: 0 });

  // One push per client, however much they owe. Four separate buzzes for four
  // overdue tasks is how an app gets its notifications turned off.
  const byClient = new Map();
  for (const t of due) {
    if (!byClient.has(t.client_id)) byClient.set(t.client_id, []);
    byClient.get(t.client_id).push(t);
  }

  let sent = 0;
  const remindedIds = [];

  for (const [clientId, tasks] of byClient) {
    const { title, body } = summariseDue(tasks, today);
    const r = await pushToUser(db, clientId, {
      title, body, link: { screen: 'dashboard' },
      // One slot in the shade for reminders, so today's replaces yesterday's.
      tag: 'hs-pt-due',
    });
    sent += r.sent;
    // Marked either way. A client with no device registered shouldn't leave
    // rows to be re-examined on every run for the rest of time.
    remindedIds.push(...tasks.map(t => t.id));
  }

  if (remindedIds.length) {
    await db.from('client_tasks').update({ reminded_on: today }).in('id', remindedIds);
  }

  return res.status(200).json({ clients: byClient.size, tasks: due.length, sent });
}
