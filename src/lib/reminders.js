// Which notifications are due right now, and what they say. Pure: the app shows them (see
// useReminders in App.jsx) and remembers which keys it has already shown.
import { addDays, formatTime, formatTimeRange, parseTime, toKey } from './dates.js';
import { isDone, isLesson, lessonAttended, plansOn } from './recurrence.js';

// True when `now` falls inside quiet hours. A range like 23:00–07:00 runs past midnight.
export function inQuietHours(quiet, now) {
  if (!quiet?.enabled) return false;
  const from = parseTime(quiet.from);
  const to = parseTime(quiet.to);
  if (from === null || to === null || from === to) return false;
  const m = now.getHours() * 60 + now.getMinutes();
  return from < to ? m >= from && m < to : m >= from || m < to;
}

// The settings that apply to one category: its own choices, falling back to the defaults.
export function categoryReminder(reminders, categoryId) {
  const own = (categoryId && reminders.perCategory?.[categoryId]) || {};
  return {
    enabled: own.enabled !== false,
    sound: own.sound ?? reminders.sound,
    minutes: own.minutes ?? reminders.minutes,
  };
}

// "🏫 Okul · " (or nothing for plans without a category).
const categoryPrefix = (category) => (category ? `${category.icon ? `${category.icon} ` : ''}${category.name} · ` : '');

// Notifications due at `now`: [{ key, title, body, sound }]. Plans and lessons are announced
// `minutes` before they start (lessons only if turned on); deadlines once the day before and once
// on the day, from 08:00.
export function dueReminders({ plans, deadlines = [], categories = [], reminders, now = new Date() }) {
  if (!reminders?.enabled || inQuietHours(reminders.quiet, now)) return [];
  const date = toKey(now);
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const byId = new Map(categories.map((c) => [c.id, c]));
  const out = [];

  for (const p of plansOn(plans, date)) {
    if (p.hour === null) continue;
    if (isLesson(p) ? !reminders.lessons || lessonAttended(p, date, now) : isDone(p, date)) continue;
    const r = categoryReminder(reminders, p.categoryId);
    if (!r.enabled) continue;
    const lead = p.hour * 60 + p.minute - minutesNow;
    if (lead < 0 || lead > r.minutes) continue;
    out.push({
      key: `${p.id}:${date}`,
      title: p.title,
      body: `${categoryPrefix(byId.get(p.categoryId))}${formatTimeRange(p)} · ${lead === 0 ? 'starts now' : `starts in ${lead} min`}`,
      sound: r.sound,
    });
  }

  if (now.getHours() >= 8) {
    for (const d of deadlines) {
      if (d.done) continue;
      const when = d.due === date ? 'today' : d.due === addDays(date, 1) ? 'tomorrow' : null;
      if (!when) continue;
      const r = categoryReminder(reminders, d.categoryId);
      if (!r.enabled) continue;
      out.push({
        key: `deadline:${d.id}:${date}`,
        title: d.title,
        body: `${categoryPrefix(byId.get(d.categoryId))}Due ${when}${d.hour !== null ? ` at ${formatTime(d.hour, d.minute)}` : ''}`,
        sound: r.sound,
      });
    }
  }
  return out;
}
