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
