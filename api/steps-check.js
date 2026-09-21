// GET /api/steps-check — tell a coach when a client has stopped moving.
//
// Run by Vercel Cron (see vercel.json). Steps have been landing in health_daily
// since the wearable integration went in, and until now nothing looked at them:
// a client could go from 11,000 a day to 3,000 and the only way to notice was
// to open their file and read a chart.
//
// This is deliberately coach-facing, not client-facing. A step count falling
// off is a conversation - "what changed this week?" - and the coach is the one
// who knows whether the answer is a new job, an injury, or losing interest.
// Pushing "you're not walking enough" at the client is the version of this that
// gets an app deleted.

import { admin, pushReady, pushToUser } from './_push.js';
// The same tie-break the app's charts use, imported rather than restated: a
// coach told that steps collapsed while the client's own screen disagrees is
// worse than no alert at all.
import { stepsByDay } from '../src/lib/healthSource.js';

// What counts as worth interrupting someone for.
const DROP_PCT = 30;        // this week vs last, as a percentage fall
const MIN_PRIOR = 4000;     // ignore falls from a baseline too small to mean anything
const MIN_DAYS = 4;         // both weeks need enough days logged to compare
const QUIET_DAYS = 7;       // don't tell the same coach about the same client again inside a week

const iso = (d) => d.toISOString().slice(0, 10);
const back = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };

const avg = (byDay, from, to) => {
  const vals = [];
  for (let i = from; i < to; i++) { const v = byDay[back(i)]; if (v != null) vals.push(v); }
  return vals.length ? { avg: Math.round(vals.reduce((a, b) => a + b, 0) / vals.length), days: vals.length } : null;
};

export default async function handler(req, res) {
  if (!pushReady()) return res.status(503).json({ error: 'push not configured' });

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

  const today = iso(new Date());
  const db = admin();

  // Only clients with a coach and with steps in the last fortnight. Everyone
  // else is either unmapped or has nothing to compare.
  const { data: rows, error } = await db.from('health_daily')
    .select('client_id, day, source, steps')
    .gte('day', back(14))
    .not('steps', 'is', null)
    .limit(20000);
  if (error) return res.status(500).json({ error: error.message });
  if (!rows?.length) return res.status(200).json({ checked: 0, alerts: 0, sent: 0 });

  const byClient = new Map();
  for (const r of rows) {
    if (!byClient.has(r.client_id)) byClient.set(r.client_id, []);
    byClient.get(r.client_id).push(r);
  }

  const ids = [...byClient.keys()];
  const [{ data: profs }, { data: managed }] = await Promise.all([
    db.from('profiles').select('id, name, trainer_id').in('id', ids),
    db.from('managed_clients').select('id, name, trainer_id').in('id', ids),
  ]);
  const who = new Map();
  for (const p of [...(profs || []), ...(managed || [])]) {
    if (p.trainer_id) who.set(p.id, { name: p.name || 'A client', coach: p.trainer_id });
  }

  // What each coach has already been told, so a bad month isn't a daily alarm.
  const { data: prior } = await db.from('coach_alerts')
    .select('coach_id, client_id, kind, sent_on').eq('kind', 'steps_drop').in('client_id', ids);
  const lastTold = new Map((prior || []).map(a => [`${a.coach_id}:${a.client_id}`, a.sent_on]));

  const falls = [];
  for (const [clientId, list] of byClient) {
    const info = who.get(clientId);
    if (!info) continue;

    const byDay = stepsByDay(list);
    const week = avg(byDay, 0, 7);
    const before = avg(byDay, 7, 14);
    if (!week || !before) continue;
    if (week.days < MIN_DAYS || before.days < MIN_DAYS) continue;
    if (before.avg < MIN_PRIOR) continue;

    const change = Math.round(((week.avg - before.avg) / before.avg) * 100);
    if (change > -DROP_PCT) continue;

    const seen = lastTold.get(`${info.coach}:${clientId}`);
    if (seen && seen > back(QUIET_DAYS)) continue;

    falls.push({ clientId, coach: info.coach, name: info.name, change, week: week.avg, before: before.avg });
  }

  if (!falls.length) return res.status(200).json({ checked: byClient.size, alerts: 0, sent: 0 });

  // One push per coach, however many clients have slipped. Three separate
  // buzzes on a Monday morning is how notifications get turned off.
  const byCoach = new Map();
  for (const f of falls) {
    if (!byCoach.has(f.coach)) byCoach.set(f.coach, []);
    byCoach.get(f.coach).push(f);
  }

  let sent = 0;
  const writes = [];
  for (const [coachId, list] of byCoach) {
    list.sort((a, b) => a.change - b.change);
    const first = list[0];
    const title = list.length === 1
      ? `${first.name}: steps down ${Math.abs(first.change)}%`
      : `${list.length} clients have slowed down`;
    const body = list.length === 1
      ? `${first.before.toLocaleString()} → ${first.week.toLocaleString()} a day, week on week.`
      : list.slice(0, 3).map(f => `${f.name} ${f.change}%`).join(' · ');

    const r = await pushToUser(db, coachId, {
      title, body,
      link: list.length === 1
        ? { screen: 'coach', clientId: first.clientId, tab: 'overview' }
        : { screen: 'coach' },
      tag: 'hs-pt-steps',
    });
    sent += r.sent;

    // Recorded either way. A coach with no device registered shouldn't leave
    // rows to be re-examined every morning for the rest of time.
    for (const f of list) {
      writes.push({
        coach_id: coachId, client_id: f.clientId, kind: 'steps_drop', sent_on: today,
        detail: `${f.before} → ${f.week} (${f.change}%)`,
      });
    }
  }

  if (writes.length) {
    await db.from('coach_alerts').upsert(writes, { onConflict: 'coach_id,client_id,kind' });
  }

  return res.status(200).json({ checked: byClient.size, alerts: falls.length, sent });
}
