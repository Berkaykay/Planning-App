// Dates are stored as local "YYYY-MM-DD" keys so they never shift with time zones.

export const pad = (n) => String(n).padStart(2, '0');

export function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return toKey(fromKey(value)) === value;
}

export function isMonthKey(value) {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export const todayKey = () => toKey(new Date());

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

export const weekday = (key) => fromKey(key).getDay(); // 0 = Sunday

export const daysInMonth = (year, monthIndex) => new Date(year, monthIndex + 1, 0).getDate();

export const monthOf = (key) => key.slice(0, 7);

export function addMonths(monthKey, n) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

// The 6x7 grid of date keys shown for a month, starting on Monday.
export function monthGrid(monthKey) {
  const first = `${monthKey}-01`;
  const offset = (weekday(first) + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

// Monday-start week containing the date.
export function weekStart(key) {
  return addDays(key, -((weekday(key) + 6) % 7));
}

const fmt = (key, options) => fromKey(key).toLocaleDateString('en-US', options);

export const formatLong = (key) => fmt(key, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
export const formatMedium = (key) => fmt(key, { weekday: 'short', month: 'short', day: 'numeric' });
export const formatShort = (key) => fmt(key, { month: 'short', day: 'numeric' });
export const formatWeekday = (key) => fmt(key, { weekday: 'short' });

export function formatMonth(monthKey) {
  return fromKey(`${monthKey}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export const formatHour = (hour) => `${pad(hour)}:00`;

export function relativeDayLabel(key, today = todayKey()) {
  if (key === today) return 'Today';
  if (key === addDays(today, 1)) return 'Tomorrow';
  if (key === addDays(today, -1)) return 'Yesterday';
  return formatMedium(key);
}

export const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
// Display order for weekday pickers (Monday first).
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
