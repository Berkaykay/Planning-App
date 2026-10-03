// Ctrl+K quick search: everything you can jump to, and a simple scored match over it.
import { formatLong, formatMedium, formatTime, isDateKey } from './dates.js';
import { paths } from './routes.js';
import { isLesson, nextOccurrence } from './recurrence.js';

const PAGES = [
  { label: 'Dashboard', icon: '◧', path: paths.dashboard() },
  { label: 'Calendar', icon: '▦', path: paths.calendar() },
  { label: 'Today', icon: '☰', path: null, keywords: 'day planner' },
  { label: 'Week', icon: '▥', path: paths.week() },
  { label: 'Timetable', icon: '▤', path: paths.timetable(), keywords: 'lessons school' },
  { label: 'History', icon: '↺', path: paths.history(), keywords: 'past done' },
  { label: 'Categories', icon: '◉', path: paths.categories() },
  { label: 'Settings', icon: '⚙', path: paths.settings(), keywords: 'notifications sounds updates tray theme' },
];

const ACTIONS = [
  { label: 'New plan…', icon: '+', command: 'new-plan', keywords: 'add create' },
  { label: 'New deadline…', icon: '⚑', command: 'new-deadline', keywords: 'add create homework due' },
];

// Every searchable thing: { id, kind, label, detail, icon, path | command, keywords }.
export function buildSearchItems(state, today) {
  const items = [];
  for (const p of PAGES) items.push({ id: `page:${p.label}`, kind: 'page', ...p, path: p.path ?? paths.day(today) });
  for (const a of ACTIONS) items.push({ id: `action:${a.command}`, kind: 'action', ...a });
  for (const c of state.categories) {
    items.push({ id: `category:${c.id}`, kind: 'category', label: c.name, icon: c.icon || '●', color: c.color, detail: 'Category', path: paths.category(c.id) });
  }
  const categoryName = new Map(state.categories.map((c) => [c.id, c.name]));
  for (const p of state.plans) {
    if (isLesson(p)) continue;
    // Repeating plans open on their next date; finished one-off plans on their own date.
    const date = (p.repeat && nextOccurrence(p, today)) || p.date;
    const time = p.hour === null ? '' : ` · ${formatTime(p.hour, p.minute)}`;
    items.push({
      id: `plan:${p.id}`,
      kind: 'plan',
      label: p.title,
      icon: p.repeat ? '↻' : '○',
      detail: `${formatMedium(date)}${time}${p.categoryId ? ` · ${categoryName.get(p.categoryId) ?? ''}` : ''}`,
      path: paths.day(date),
      keywords: `${p.notes} ${categoryName.get(p.categoryId) ?? ''}`,
    });
  }
  for (const d of state.deadlines) {
    items.push({
      id: `deadline:${d.id}`,
      kind: 'deadline',
      label: d.title,
      icon: '⚑',
      detail: `${d.done ? 'Done · ' : ''}Due ${formatMedium(d.due)}`,
      path: paths.calendar(d.due),
      keywords: `${d.notes} ${categoryName.get(d.categoryId) ?? ''} deadline homework`,
      done: d.done,
    });
  }
  return items;
}

// How well `item` matches `q` (lowercase): 0 = no match. Title matches beat keyword matches,
// and the start of the title or of a word beats the middle.
function score(item, q) {
  const label = item.label.toLowerCase();
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.split(/[\s\-_/]+/).some((w) => w.startsWith(q))) return 60;
  if (label.includes(q)) return 40;
  const words = q.split(/\s+/).filter(Boolean);
  const hay = `${label} ${(item.keywords ?? '').toLowerCase()} ${(item.detail ?? '').toLowerCase()}`;
  if (words.length && words.every((w) => hay.includes(w))) return 20;
  return 0;
}

const KIND_ORDER = { action: 0, page: 1, category: 2, plan: 3, deadline: 4 };

// The best matches for `query`, at most `limit`. With no query: pages and actions. A date such
// as 2026-10-12 adds an "Open day" result at the top.
export function searchItems(items, query, limit = 12) {
  const q = query.trim().toLowerCase();
  if (!q) return items.filter((i) => i.kind === 'page' || i.kind === 'action').slice(0, limit);
  const results = items
    .map((item) => ({ item, s: score(item, q) - (item.done ? 5 : 0) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s || KIND_ORDER[a.item.kind] - KIND_ORDER[b.item.kind] || a.item.label.localeCompare(b.item.label))
    .map((r) => r.item);
  if (isDateKey(q)) results.unshift({ id: `date:${q}`, kind: 'page', label: `Open ${formatLong(q)}`, icon: '☰', path: paths.day(q) });
  return results.slice(0, limit);
}
