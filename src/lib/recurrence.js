// Decides on which dates a plan shows up, and whether each occurrence is done.
//
// A plan has a start `date`. A one-off plan (repeat = null) only occurs on that date.
// A repeating plan occurs from its start date on, following `repeat`:
//   { freq: 'daily' }
//   { freq: 'weekly', weekdays: [1, 3, 5] }   (0 = Sunday)
//   { freq: 'monthly' }                       (same day of month as the start date)
// with an optional `until` end date. Single occurrences can be removed via `skipDates`.
// Completion is stored per occurrence in `doneDates`, so each day of a repeating
// plan starts unchecked and past check marks stay as history.

import { addDays, daysInMonth, fromKey, weekday, WEEKDAY_NAMES, WEEKDAY_ORDER, formatShort } from './dates.js';

export const FREQUENCIES = ['daily', 'weekly', 'monthly'];

export function occursOn(plan, date) {
  const { repeat } = plan;
  if (!repeat) return plan.date === date;
  if (date < plan.date) return false;
  if (repeat.until && date > repeat.until) return false;
  if (plan.skipDates?.includes(date)) return false;
  switch (repeat.freq) {
    case 'daily':
      return true;
    case 'weekly': {
      const days = repeat.weekdays?.length ? repeat.weekdays : [weekday(plan.date)];
      return days.includes(weekday(date));
    }
    case 'monthly': {
      // A plan started on the 31st shows on the last day of shorter months.
      const startDay = fromKey(plan.date).getDate();
      const d = fromKey(date);
      return d.getDate() === Math.min(startDay, daysInMonth(d.getFullYear(), d.getMonth()));
    }
    default:
      return false;
  }
}

export const isDone = (plan, date) => plan.doneDates.includes(date);

// Sort order inside a day: all-day plans first, then by hour, then by title.
export function comparePlans(a, b) {
  const ha = a.hour ?? -1;
  const hb = b.hour ?? -1;
  if (ha !== hb) return ha - hb;
  return a.title.localeCompare(b.title);
}

export function plansOn(plans, date) {
  return plans.filter((p) => occursOn(p, date)).sort(comparePlans);
}

export function dayProgress(plans, date) {
  const list = plansOn(plans, date);
  return { total: list.length, done: list.filter((p) => isDone(p, date)).length };
}

export function describeRepeat(plan) {
  const { repeat } = plan;
  if (!repeat) return 'Does not repeat';
  let text;
  if (repeat.freq === 'daily') text = 'Every day';
  else if (repeat.freq === 'weekly') {
    const days = repeat.weekdays?.length ? repeat.weekdays : [weekday(plan.date)];
    if (days.length === 7) text = 'Every day';
    else if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) text = 'Every weekday';
    else text = `Every ${WEEKDAY_ORDER.filter((d) => days.includes(d)).map((d) => WEEKDAY_NAMES[d]).join(', ')}`;
  } else text = `Monthly on day ${fromKey(plan.date).getDate()}`;
  if (repeat.until) text += ` until ${formatShort(repeat.until)}`;
  return text;
}

// Consecutive scheduled days completed, counting back from today
// (today only counts once it is done, so an unfinished today doesn't break the streak).
export function streak(plan, today) {
  let count = 0;
  let date = today;
  if (occursOn(plan, date) && !isDone(plan, date)) date = addDays(date, -1);
  for (let i = 0; i < 3660 && date >= plan.date; i++, date = addDays(date, -1)) {
    if (!occursOn(plan, date)) continue;
    if (!isDone(plan, date)) break;
    count++;
  }
  return count;
}
