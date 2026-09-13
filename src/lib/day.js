// A calendar day, as the person looking at the screen would name it.
//
// `new Date().toISOString().slice(0, 10)` is the obvious way to write this and
// is wrong for half the year: toISOString converts to UTC first, so between
// midnight and 01:00 during British Summer Time it returns yesterday. Every
// date column this is compared against - scheduled_date, due_date, taken_on,
// recorded_at, health_daily.day - is a plain date with no timezone, written by
// someone who meant the day they were having.
//
// The bug is small and constant: for one hour a night, seven months a year, the
// app disagrees with the calendar. A workout logged at 00:30 lands on
// yesterday; a step count typed in after a late session counts towards a day
// that has finished; a task due today isn't due yet.
//
// This was in ten places. It is in one now.

/** A Date as YYYY-MM-DD in the local timezone. */
export const ymd = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Today, locally. */
export const todayISO = () => ymd(new Date());

/** N days either side of today, locally. Negative goes back. */
export const dayOffset = (n) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};
