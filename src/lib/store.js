// All app data lives in one object, changed only through `reducer` actions.
// The whole object is saved to disk after every change.
import { isDateKey } from './dates.js';
import { HOME } from './routes.js';
import { FREQUENCIES } from './recurrence.js';

export const DATA_VERSION = 1;
const MAX_HISTORY = 100;

export const CATEGORY_COLORS = [
  '#4f7cff', '#22a06b', '#e5484d', '#f59e0b', '#a855f7', '#0ea5e9', '#ec4899', '#64748b',
];

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

export function normalizePlan(raw) {
  const hour = Number.isInteger(raw.hour) && raw.hour >= 0 && raw.hour <= 23 ? raw.hour : null;
  return {
    id: raw.id || newId(),
    title: String(raw.title ?? '').trim() || 'Untitled plan',
    notes: String(raw.notes ?? ''),
    categoryId: raw.categoryId || null,
    date: raw.date,
    hour,
    repeat: normalizeRepeat(raw.repeat),
    doneDates: Array.isArray(raw.doneDates) ? raw.doneDates.filter(isDateKey) : [],
    skipDates: Array.isArray(raw.skipDates) ? raw.skipDates.filter(isDateKey) : [],
    createdAt: raw.createdAt || new Date().toISOString(),
  };
}

// Makes data loaded from disk safe to use, filling in anything missing or malformed.
export function normalizeData(raw) {
  if (!raw || typeof raw !== 'object') return createInitialData();
  const categories = (Array.isArray(raw.categories) ? raw.categories : [])
    .filter((c) => c && c.id && typeof c.name === 'string')
    .map((c) => ({ id: c.id, name: c.name, color: c.color || CATEGORY_COLORS[0] }));
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
  return { version: DATA_VERSION, categories, plans, days, session: { tabs, activeTabId } };
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
