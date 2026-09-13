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
  // Required, not optional. This used to run the check only `if (secret)`, so
  // forgetting to set it left a public URL that sends every client their
  // reminders on demand - and the comment beside it reasoned that the worst
  // case was "slightly early, once", which is true only until someone calls it
  // in a loop. Missing configuration is now a refusal.
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(503).json({ error: 'CRON_SECRET is not configured' });
  if ((req.headers.authorization || '') !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorised' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const db = admin();

  // remind='off' is excluded outright. 'due' is a single nudge on the day, so
  // anything already overdue has had its one chance; 'chase' keeps going for as
  // long as the task does.
  const { data: rows, error } = await db.from('client_tasks')
    .select('id, client_id, title, kind, due_date, reminded_on, remind')
    .is('completed_at', null)
    .not('due_date', 'is', null)
    .lte('due_date', today)
    .neq('remind', 'off')
    .or(`reminded_on.is.null,reminded_on.lt.${today}`)
    .limit(500);

  if (error) return res.status(500).json({ error: error.message });
  let due = (rows || []).filter(t => t.remind === 'chase' || t.due_date === today);
  if (!due.length) return res.status(200).json({ clients: 0, tasks: 0, sent: 0 });

  // An archived client is one the coach has stopped working with. Chasing them
  // daily about a check-in they will never do is the clearest possible way to
  // get the app's notifications turned off - by someone who has already left.
  const ids = [...new Set(due.map(t => t.client_id))];
  const { data: live } = await db.from('profiles').select('id').in('id', ids).eq('archived', false);
  const active = new Set((live || []).map(r => r.id));
  due = due.filter(t => active.has(t.client_id));
  if (!due.length) return res.status(200).json({ clients: 0, tasks: 0, sent: 0 });

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
