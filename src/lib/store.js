// All app data lives in one object, changed only through `reducer` actions.
// The whole object is saved to disk after every change.
import { isDateKey, parseTime } from './dates.js';
import { HOME } from './routes.js';
import { FREQUENCIES } from './recurrence.js';

export const DATA_VERSION = 2;
const MAX_HISTORY = 100;

// Muted colors: categories show up as small dots and thin markers, not big colored areas.
export const CATEGORY_COLORS = [
  '#5b7fd6', '#4f9d7e', '#d0715b', '#d4a03f', '#9273c7', '#3f9bb0', '#cf6b8f', '#7c8593',
];

// Version 1 used brighter colors; existing categories are moved to their calmer equivalents.
const OLD_COLORS = {
  '#4f7cff': '#5b7fd6', '#22a06b': '#4f9d7e', '#e5484d': '#d0715b', '#f59e0b': '#d4a03f',
  '#a855f7': '#9273c7', '#0ea5e9': '#3f9bb0', '#ec4899': '#cf6b8f', '#64748b': '#7c8593',
};

export const THEMES = ['system', 'light', 'dark'];
const DEFAULT_SETTINGS = { theme: 'system' };

export const newId = () => globalThis.crypto.randomUUID();

const newTab = (path = HOME) => ({ id: newId(), history: [path], index: 0 });

export function createInitialData() {
  const tab = newTab();
  return {
    version: DATA_VERSION,
    categories: [
      { id: newId(), name: 'Personal', color: CATEGORY_COLORS[0] },
      { id: newId(), name: 'Work', color: CATEGORY_COLORS[1] },
      { id: newId(), name: 'Health', color: CATEGORY_COLORS[2] },
    ],
    plans: [],
    days: {},
    timetables: [],
    settings: { ...DEFAULT_SETTINGS },
    session: { tabs: [tab], activeTabId: tab.id },
  };
}

function normalizeRepeat(repeat) {
  if (!repeat || !FREQUENCIES.includes(repeat.freq)) return null;
  const out = { freq: repeat.freq };
  if (repeat.freq === 'weekly') {
    const days = [...new Set((repeat.weekdays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
    out.weekdays = days.sort();
  }
  out.until = isDateKey(repeat.until) ? repeat.until : null;
  return out;
}

const intIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max;

export function normalizePlan(raw) {
  const hour = intIn(raw.hour, 0, 23) ? raw.hour : null;
  return {
    id: raw.id || newId(),
    title: String(raw.title ?? '').trim() || 'Untitled plan',
    notes: String(raw.notes ?? ''),
    categoryId: raw.categoryId || null,
    date: raw.date,
    hour,
    // Start minute and length (in minutes) of a timed plan; e.g. 08:30-09:10 = hour 8, minute 30, duration 40.
    minute: hour !== null && intIn(raw.minute, 0, 59) ? raw.minute : 0,
    duration: hour !== null && intIn(raw.duration, 1, 24 * 60) ? raw.duration : null,
    repeat: normalizeRepeat(raw.repeat),
    doneDates: Array.isArray(raw.doneDates) ? raw.doneDates.filter(isDateKey) : [],
    skipDates: Array.isArray(raw.skipDates) ? raw.skipDates.filter(isDateKey) : [],
    createdAt: raw.createdAt || new Date().toISOString(),
    // Plans generated from a timetable remember which timetable cell they came from.
    ...(raw.timetableId && { timetableId: raw.timetableId, timetableKey: raw.timetableKey }),
  };
}

export function normalizeTimetable(raw) {
  const weekdays = [...new Set((raw.weekdays ?? [1, 2, 3, 4, 5]).filter((d) => intIn(d, 0, 6)))].sort();
  const periods = (raw.periods ?? [])
    .filter((p) => p?.id && parseTime(p.start) !== null)
    .map((p) => ({ id: String(p.id), start: p.start, end: parseTime(p.end) !== null ? p.end : '' }));
  const cells = {};
  for (const [key, value] of Object.entries(raw.cells ?? {})) {
    if (typeof value === 'string' && value.trim()) cells[key] = value.trim();
  }
  return {
    id: raw.id || newId(),
    name: String(raw.name ?? '').trim() || 'School',
    categoryId: raw.categoryId || null,
    weekdays,
    periods,
    cells,
    startDate: raw.startDate,
    until: isDateKey(raw.until) ? raw.until : null,
  };
}

// One weekly repeating plan per filled timetable cell. Plans that already exist for a cell
// keep their id, notes and check marks, so re-saving a timetable never loses history.
function timetablePlans(timetable, existing) {
  const byKey = new Map(existing.map((p) => [p.timetableKey, p]));
  const periods = new Map(timetable.periods.map((p) => [p.id, p]));
  const plans = [];
  for (const [key, subject] of Object.entries(timetable.cells)) {
    const [day, periodId] = key.split(':');
    const weekday = Number(day);
    const period = periods.get(periodId);
    if (!timetable.weekdays.includes(weekday) || !period) continue;
    const start = parseTime(period.start);
    const end = parseTime(period.end);
    const old = byKey.get(key);
    plans.push(
      normalizePlan({
        ...old,
        id: old?.id ?? newId(),
        title: subject,
        categoryId: timetable.categoryId,
        date: timetable.startDate,
        hour: Math.floor(start / 60),
        minute: start % 60,
        duration: end !== null && end > start ? end - start : null,
        repeat: { freq: 'weekly', weekdays: [weekday], until: timetable.until },
        timetableId: timetable.id,
        timetableKey: key,
      }),
    );
  }
  return plans;
}

// Makes data loaded from disk safe to use, filling in anything missing or malformed.
export function normalizeData(raw) {
  if (!raw || typeof raw !== 'object') return createInitialData();
  const categories = (Array.isArray(raw.categories) ? raw.categories : [])
    .filter((c) => c && c.id && typeof c.name === 'string')
    .map((c) => ({ id: c.id, name: c.name, color: OLD_COLORS[c.color] ?? (c.color || CATEGORY_COLORS[0]) }));
  const categoryIds = new Set(categories.map((c) => c.id));
  const plans = (Array.isArray(raw.plans) ? raw.plans : [])
    .filter((p) => p && isDateKey(p.date))
    .map(normalizePlan)
    .map((p) => (p.categoryId && !categoryIds.has(p.categoryId) ? { ...p, categoryId: null } : p));
  const days = {};
  for (const [key, value] of Object.entries(raw.days ?? {})) {
    if (isDateKey(key) && value?.done) days[key] = { done: true };
  }
  let tabs = (raw.session?.tabs ?? [])
    .filter((t) => t?.id && Array.isArray(t.history) && t.history.length)
    .map((t) => ({
      id: t.id,
      history: t.history.map(String),
      index: Math.min(Math.max(0, t.index | 0), t.history.length - 1),
    }));
  if (!tabs.length) tabs = [newTab()];
  const activeTabId = tabs.some((t) => t.id === raw.session?.activeTabId) ? raw.session.activeTabId : tabs[0].id;
  const timetables = (Array.isArray(raw.timetables) ? raw.timetables : [])
    .filter((t) => t?.id && isDateKey(t.startDate))
    .map(normalizeTimetable);
  const settings = {
    ...DEFAULT_SETTINGS,
    ...(THEMES.includes(raw.settings?.theme) && { theme: raw.settings.theme }),
  };
  return { version: DATA_VERSION, categories, plans, days, timetables, settings, session: { tabs, activeTabId } };
}

export const activeTab = (state) =>
  state.session.tabs.find((t) => t.id === state.session.activeTabId) ?? state.session.tabs[0];

export const currentPath = (tab) => tab.history[tab.index];

function updateTab(state, id, fn) {
  return {
    ...state,
    session: { ...state.session, tabs: state.session.tabs.map((t) => (t.id === id ? fn(t) : t)) },
  };
}

function updatePlan(state, id, fn) {
  return { ...state, plans: state.plans.map((p) => (p.id === id ? fn(p) : p)) };
}

const without = (list, value) => list.filter((v) => v !== value);
const withValue = (list, value) => (list.includes(value) ? list : [...list, value]);

// Applies edits to a plan, keeping its check marks attached to the right dates.
function applyPlanChanges(plan, changes) {
  const next = normalizePlan({ ...plan, ...changes });
  if (!next.repeat) {
    // A one-off plan has a single occurrence; carry its done state to the (possibly new) date.
    const wasDone = plan.repeat ? plan.doneDates.includes(next.date) : plan.doneDates.includes(plan.date);
    next.doneDates = wasDone ? [next.date] : [];
    next.skipDates = [];
  }
  return next;
}

export function reducer(state, action) {
  switch (action.type) {
    // ---- Categories -------------------------------------------------------
    case 'category/add': {
      const category = {
        id: action.id ?? newId(),
        name: action.name.trim(),
        color: action.color ?? CATEGORY_COLORS[state.categories.length % CATEGORY_COLORS.length],
      };
      return { ...state, categories: [...state.categories, category] };
    }
    case 'category/update':
      return {
        ...state,
        categories: state.categories.map((c) =>
          c.id === action.id
            ? { ...c, ...(action.name !== undefined && { name: action.name.trim() }), ...(action.color && { color: action.color }) }
            : c,
        ),
      };
    case 'category/delete':
      // Plans in the deleted category are kept, just uncategorized.
      return {
        ...state,
        categories: state.categories.filter((c) => c.id !== action.id),
        plans: state.plans.map((p) => (p.categoryId === action.id ? { ...p, categoryId: null } : p)),
        timetables: state.timetables.map((t) => (t.categoryId === action.id ? { ...t, categoryId: null } : t)),
      };

    // ---- Plans ------------------------------------------------------------
    case 'plan/add':
      return { ...state, plans: [...state.plans, normalizePlan(action.plan)] };
    case 'plan/update':
      return updatePlan(state, action.id, (p) => applyPlanChanges(p, action.changes));
    case 'plan/delete':
      return { ...state, plans: state.plans.filter((p) => p.id !== action.id) };
    case 'plan/skip':
      // Removes one occurrence of a repeating plan, leaving the rest of the series.
      return updatePlan(state, action.id, (p) => ({
        ...p,
        skipDates: withValue(p.skipDates, action.date),
        doneDates: without(p.doneDates, action.date),
      }));
    case 'plan/detach': {
      // Turns one occurrence of a repeating plan into its own one-off plan with `changes`.
      const series = state.plans.find((p) => p.id === action.id);
      if (!series) return state;
      const wasDone = series.doneDates.includes(action.date);
      const single = normalizePlan({
        ...series,
        ...action.changes,
        id: action.newId ?? newId(),
        timetableId: null,
        repeat: null,
        date: action.changes.date ?? action.date,
        skipDates: [],
        createdAt: undefined,
      });
      single.doneDates = wasDone ? [single.date] : [];
      const next = updatePlan(state, action.id, (p) => ({
        ...p,
        skipDates: withValue(p.skipDates, action.date),
        doneDates: without(p.doneDates, action.date),
      }));
      return { ...next, plans: [...next.plans, single] };
    }
    case 'plan/setDone':
      return updatePlan(state, action.id, (p) => ({
        ...p,
        doneDates: action.done ? withValue(p.doneDates, action.date) : without(p.doneDates, action.date),
      }));

    // ---- Whole days -------------------------------------------------------
    case 'day/setDone': {
      const days = { ...state.days };
      if (action.done) days[action.date] = { done: true };
      else delete days[action.date];
      return { ...state, days };
    }

    // ---- Timetables -------------------------------------------------------
    case 'timetable/save': {
      const timetable = normalizeTimetable(action.timetable);
      const existing = state.plans.filter((p) => p.timetableId === timetable.id);
      const others = state.plans.filter((p) => p.timetableId !== timetable.id);
      const known = state.timetables.some((t) => t.id === timetable.id);
      return {
        ...state,
        timetables: known
          ? state.timetables.map((t) => (t.id === timetable.id ? timetable : t))
          : [...state.timetables, timetable],
        plans: [...others, ...timetablePlans(timetable, existing)],
      };
    }
    case 'timetable/delete':
      return {
        ...state,
        timetables: state.timetables.filter((t) => t.id !== action.id),
        plans: state.plans.filter((p) => p.timetableId !== action.id),
      };

    // ---- Settings ---------------------------------------------------------
    case 'settings/update':
      return { ...state, settings: { ...state.settings, ...action.changes } };

    // ---- Tabs and navigation ----------------------------------------------
    case 'tab/open': {
      const tab = newTab(action.path);
      const tabs = [...state.session.tabs];
      tabs.splice(tabs.findIndex((t) => t.id === state.session.activeTabId) + 1, 0, tab);
      return {
        ...state,
        session: { tabs, activeTabId: action.background ? state.session.activeTabId : tab.id },
      };
    }
    case 'tab/close': {
      const { tabs, activeTabId } = state.session;
      const index = tabs.findIndex((t) => t.id === action.id);
      if (index === -1) return state;
      const remaining = tabs.filter((t) => t.id !== action.id);
      if (!remaining.length) {
        const tab = newTab();
        return { ...state, session: { tabs: [tab], activeTabId: tab.id } };
      }
      const nextActive = activeTabId === action.id ? remaining[Math.min(index, remaining.length - 1)].id : activeTabId;
      return { ...state, session: { tabs: remaining, activeTabId: nextActive } };
    }
    case 'tab/move': {
      // Moves a tab so it ends up at position `toIndex`.
      const tabs = [...state.session.tabs];
      const from = tabs.findIndex((t) => t.id === action.id);
      if (from === -1) return state;
      const [tab] = tabs.splice(from, 1);
      tabs.splice(Math.max(0, Math.min(action.toIndex, tabs.length)), 0, tab);
      return { ...state, session: { ...state.session, tabs } };
    }
    case 'tab/activate':
      return state.session.tabs.some((t) => t.id === action.id)
        ? { ...state, session: { ...state.session, activeTabId: action.id } }
        : state;
    case 'tab/cycle': {
      const { tabs, activeTabId } = state.session;
      const index = tabs.findIndex((t) => t.id === activeTabId);
      const next = tabs[(index + action.step + tabs.length) % tabs.length];
      return { ...state, session: { ...state.session, activeTabId: next.id } };
    }
    case 'tab/navigate':
      return updateTab(state, state.session.activeTabId, (tab) => {
        if (currentPath(tab) === action.path) return tab;
        const history = [...tab.history.slice(0, tab.index + 1), action.path].slice(-MAX_HISTORY);
        return { ...tab, history, index: history.length - 1 };
      });
    case 'tab/back':
      return updateTab(state, state.session.activeTabId, (tab) => ({ ...tab, index: Math.max(0, tab.index - 1) }));
    case 'tab/forward':
      return updateTab(state, state.session.activeTabId, (tab) => ({
        ...tab,
        index: Math.min(tab.history.length - 1, tab.index + 1),
      }));

    default:
      throw new Error(`Unknown action: ${action.type}`);
  }
}
