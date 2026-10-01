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

import { addDays, daysInMonth, fromKey, pad, toKey, weekday, weekStart, WEEKDAY_NAMES, WEEKDAY_ORDER, formatShort, formatMedium } from './dates.js';

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
  const ta = a.hour === null ? -1 : a.hour * 60 + (a.minute ?? 0);
  const tb = b.hour === null ? -1 : b.hour * 60 + (b.minute ?? 0);
  if (ta !== tb) return ta - tb;
  return a.title.localeCompare(b.title);
}

// Everything that happens on a date: plans and timetable lessons.
export function plansOn(plans, date) {
  return plans.filter((p) => occursOn(p, date)).sort(comparePlans);
}

// Lessons come from the Timetable. They are shown separately and never count as plans.
export const isLesson = (plan) => Boolean(plan.timetableId);
export const tasksOn = (plans, date) => plansOn(plans, date).filter((p) => !isLesson(p));
export const lessonsOn = (plans, date) => plansOn(plans, date).filter(isLesson);

export function dayProgress(plans, date) {
  const list = tasksOn(plans, date);
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

// Summary numbers for a month ("YYYY-MM"). Plan counts only include days up to today.
export function monthStats(plans, days, month, today) {
  const [y, m] = month.split('-').map(Number);
  const stats = { daysDone: 0, daysElapsed: 0, plansDone: 0, plansTotal: 0, bestStreak: 0, busiest: null, busiestCount: 0 };
  let run = 0;
  for (let d = 1; d <= daysInMonth(y, m - 1); d++) {
    const date = `${month}-${pad(d)}`;
    const list = tasksOn(plans, date);
    if (list.length > stats.busiestCount) {
      stats.busiest = date;
      stats.busiestCount = list.length;
    }
    if (date <= today) {
      stats.daysElapsed++;
      stats.plansTotal += list.length;
      stats.plansDone += list.filter((p) => isDone(p, date)).length;
    }
    if (days[date]?.done) {
      stats.daysDone++;
      run++;
      stats.bestStreak = Math.max(stats.bestStreak, run);
    } else run = 0;
  }
  return stats;
}

// Past days, newest first, starting the day before `before`. Each entry lists the plans that
// were done and missed that day. Days without plans are skipped unless the day was completed.
export function historyDays(plans, days, before, count) {
  const tasks = plans.filter((p) => !isLesson(p));
  const earliest = tasks.reduce((min, p) => (p.date < min ? p.date : min), before);
  const out = [];
  let date = addDays(before, -1);
  while (out.length < count && date >= earliest) {
    const list = tasksOn(tasks, date);
    if (list.length || days[date]?.done) {
      out.push({
        date,
        done: list.filter((p) => isDone(p, date)),
        missed: list.filter((p) => !isDone(p, date)),
        dayDone: Boolean(days[date]?.done),
      });
    }
    date = addDays(date, -1);
  }
  return { entries: out, next: date >= earliest ? addDays(date, 1) : null };
}

// One-off plans from the last `withinDays` days that were never completed.
export function unfinishedPlans(plans, today, withinDays = 30) {
  const from = addDays(today, -withinDays);
  return plans
    .filter((p) => !p.repeat && !isLesson(p) && p.date < today && p.date >= from && !isDone(p, p.date))
    .sort((a, b) => (a.date === b.date ? comparePlans(a, b) : a.date < b.date ? 1 : -1));
}

// Activity of one category over the last four weeks (Monday-based), counting plan occurrences.
export function categoryStats(plans, categoryId, today) {
  const tasks = plans.filter((p) => p.categoryId === categoryId && !isLesson(p));
  const firstWeek = addDays(weekStart(today), -21);
  const weeks = [0, 1, 2, 3].map((i) => ({ start: addDays(firstWeek, i * 7), done: 0, total: 0 }));
  for (let i = 0; i < 28; i++) {
    const date = addDays(firstWeek, i);
    if (date > today) break;
    for (const p of tasks) {
      if (!occursOn(p, date)) continue;
      weeks[Math.floor(i / 7)].total++;
      if (isDone(p, date)) weeks[Math.floor(i / 7)].done++;
    }
  }
  const done = weeks.reduce((n, w) => n + w.done, 0);
  const total = weeks.reduce((n, w) => n + w.total, 0);
  return {
    weeks,
    done,
    total,
    rate: total ? Math.round((done / total) * 100) : null,
    thisWeek: weeks[3],
    upcoming: tasks.filter((p) => !p.repeat && p.date >= today && !isDone(p, p.date)).length,
    repeating: tasks.filter((p) => p.repeat).length,
  };
}

// Lessons check themselves once they are over, unless you marked yourself absent.
const DEFAULT_LESSON_MINUTES = 45;
export function lessonAttended(plan, date, now = new Date()) {
  if (plan.absentDates?.includes(date)) return false;
  if (plan.doneDates.includes(date)) return true;
  const today = toKey(now);
  if (date !== today) return date < today;
  const end = (plan.hour ?? 0) * 60 + (plan.minute ?? 0) + (plan.duration ?? DEFAULT_LESSON_MINUTES);
  return now.getHours() * 60 + now.getMinutes() >= end;
}

// First date on or after `from` when the plan happens (null if none within `limit` days).
export function nextOccurrence(plan, from, limit = 400) {
  if (!plan.repeat) return plan.date >= from ? plan.date : null;
  let date = plan.date > from ? plan.date : from;
  for (let i = 0; i < limit; i++, date = addDays(date, 1)) {
    if (plan.repeat.until && date > plan.repeat.until) return null;
    if (occursOn(plan, date)) return date;
  }
  return null;
}

// Every plan of a category as { plan, date }: one-off plans on their date, repeating plans on
// their next date (or their start date if they have ended). Sorted by date, then time.
export function categoryAll(plans, categoryId, today) {
  return plans
    .filter((p) => p.categoryId === categoryId && !isLesson(p))
    .map((plan) => ({ plan, date: plan.repeat ? nextOccurrence(plan, today) ?? plan.date : plan.date }))
    .sort((a, b) => (a.date === b.date ? comparePlans(a.plan, b.plan) : a.date < b.date ? -1 : 1));
}

const startOf = (p) => p.hour * 60 + (p.minute ?? 0);
const endOf = (p) => startOf(p) + (p.duration ?? 30);

// Layout for the week view: per day, all-day items and timed blocks (with side-by-side lanes
// for overlapping blocks), plus the hour range to show (07-22 unless plans fall outside).
export function weekLayout(plans, start) {
  let fromHour = 7;
  let toHour = 22;
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const list = plansOn(plans, date);
    const timed = list.filter((p) => p.hour !== null);
    const blocks = [];
    const laneEnds = [];
    for (const p of timed) {
      fromHour = Math.min(fromHour, p.hour);
      toHour = Math.max(toHour, Math.ceil(endOf(p) / 60));
      let lane = laneEnds.findIndex((end) => end <= startOf(p));
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = endOf(p);
      blocks.push({ plan: p, start: startOf(p), end: endOf(p), lane });
    }
    // Blocks that overlap share the width of their busiest group.
    for (const b of blocks) {
      const overlapping = blocks.filter((o) => o.start < b.end && b.start < o.end);
      b.lanes = Math.max(...overlapping.map((o) => o.lane)) + 1;
    }
    return { date, allDay: list.filter((p) => p.hour === null), blocks };
  });
  return { days, fromHour, toHour: Math.min(24, toHour) };
}

// ---- Deadlines ---------------------------------------------------------------

// Whole days from `today` to `due` (negative when overdue).
export const daysUntil = (due, today) => Math.round((fromKey(due) - fromKey(today)) / 86_400_000);

// "Overdue by 2 days", "Due today", "Due tomorrow", "Due in 5 days" or "Due Fri, Oct 9".
export function dueLabel(due, today) {
  const n = daysUntil(due, today);
  if (n < 0) return `Overdue by ${-n} day${n === -1 ? '' : 's'}`;
  if (n === 0) return 'Due today';
  if (n === 1) return 'Due tomorrow';
  if (n <= 14) return `Due in ${n} days`;
  return `Due ${formatMedium(due)}`;
}

const byDue = (a, b) => (a.due === b.due ? (a.hour ?? 24) * 60 + a.minute - ((b.hour ?? 24) * 60 + b.minute) : a.due < b.due ? -1 : 1);

export const deadlinesDueOn = (deadlines, date) => deadlines.filter((d) => d.due === date).sort(byDue);

// Unfinished deadlines still ahead on `date` (due that day or later), plus overdue ones when
// `date` is today. Soonest first.
export function openDeadlines(deadlines, date, today) {
  return deadlines.filter((d) => !d.done && (d.due >= date || (date === today && d.due < today))).sort(byDue);
}

// ---- Dashboard stats -----------------------------------------------------------

// Completed days in a row, ending today (or yesterday, if today isn't completed yet).
export function currentStreak(days, today) {
  let date = days[today]?.done ? today : addDays(today, -1);
  let n = 0;
  while (days[date]?.done) {
    n++;
    date = addDays(date, -1);
  }
  return n;
}

// Plans done / total from `from` to `to` (inclusive, capped at today), plus lessons attended.
export function rangeStats(plans, from, to, today, now = new Date()) {
  const s = { done: 0, total: 0, lessons: 0, lessonsTotal: 0 };
  for (let date = from; date <= to && date <= today; date = addDays(date, 1)) {
    for (const p of plansOn(plans, date)) {
      if (isLesson(p)) {
        s.lessonsTotal++;
        if (lessonAttended(p, date, now)) s.lessons++;
      } else {
        s.total++;
        if (isDone(p, date)) s.done++;
      }
    }
  }
  return s;
}

// The next lesson and the next timed plan still to start today.
export function upNext(plans, today, now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  const later = plansOn(plans, today).filter((p) => p.hour !== null && p.hour * 60 + p.minute > minutes);
  return {
    lesson: later.find((p) => isLesson(p)) ?? null,
    plan: later.find((p) => !isLesson(p) && !isDone(p, today)) ?? null,
    minutes,
  };
}
