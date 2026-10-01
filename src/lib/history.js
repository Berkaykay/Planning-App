// Undo / redo for the planner. Changes to plans, categories, days and timetables can be undone;
// tab and settings changes can't (just like a browser doesn't "undo" switching tabs).
import { reducer } from './store.js';

const UNDOABLE_KEYS = ['categories', 'plans', 'days', 'timetables'];
const NOT_UNDOABLE = /^(tab\/|settings\/)/;
const LIMIT = 50;

const snapshot = (data) => Object.fromEntries(UNDOABLE_KEYS.map((k) => [k, data[k]]));

export const initHistory = (data) => ({ data, past: [], future: [], last: null, seq: 0 });

export function historyReducer(h, action) {
  if (action.type === 'history/undo' || action.type === 'history/redo') {
    const undo = action.type === 'history/undo';
    const from = undo ? h.past : h.future;
    if (!from.length) return h;
    const entry = from[from.length - 1];
    const moved = { snapshot: snapshot(h.data), action: entry.action };
    return {
      data: { ...h.data, ...entry.snapshot },
      past: undo ? h.past.slice(0, -1) : [...h.past, moved],
      future: undo ? [...h.future, moved] : h.future.slice(0, -1),
      last: { type: action.type, of: entry.action },
      seq: h.seq + 1,
    };
  }
  const data = reducer(h.data, action);
  if (data === h.data) return h;
  if (NOT_UNDOABLE.test(action.type)) return { ...h, data };
  return {
    data,
    past: [...h.past, { snapshot: snapshot(h.data), action }].slice(-LIMIT),
    future: [],
    last: { type: action.type, action, before: h.data },
    seq: h.seq + 1,
  };
}

const title = (data, id) => {
  const plan = data.plans.find((p) => p.id === id);
  return plan ? `"${plan.title}"` : 'plan';
};

// Short message for the "… · Undo" pop-up, or null when an action doesn't need one.
export function describeChange(last) {
  if (!last) return null;
  if (last.type === 'history/undo') return 'Undone';
  if (last.type === 'history/redo') return 'Redone';
  const { action: a, before } = last;
  switch (a.type) {
    case 'plan/delete':
      return `Deleted ${title(before, a.id)}`;
    case 'plan/skip':
      return `Removed ${title(before, a.id)} from that day`;
    case 'plan/setDone':
      return a.done ? `Completed ${title(before, a.id)}` : null;
    case 'day/setDone':
      return a.done ? 'Day marked complete' : null;
    case 'plans/moveToDate':
      return `Moved ${a.ids.length} plan${a.ids.length === 1 ? '' : 's'}`;
    case 'plan/update':
      return 'date' in a.changes || 'hour' in a.changes ? `Updated ${title(before, a.id)}` : null;
    case 'plan/detach':
      return `Changed ${title(before, a.id)} for that day`;
    case 'category/delete':
      return `Deleted category "${before.categories.find((c) => c.id === a.id)?.name ?? ''}"`;
    case 'timetable/delete':
      return 'Deleted timetable';
    case 'data/replace':
      return 'Backup imported';
    default:
      return null;
  }
}
