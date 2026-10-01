import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reducer, createInitialData, normalizeData, normalizePlan } from '../../src/lib/store.js';
import { categoryStats, dayProgress, historyDays, lessonsOn, monthStats, tasksOn, unfinishedPlans } from '../../src/lib/recurrence.js';
import { historyReducer, initHistory } from '../../src/lib/history.js';

const run = (state, ...actions) => actions.reduce(reducer, state);
const base = () => ({ ...createInitialData(), categories: [], plans: [] });
const plan = (fields) => normalizePlan({ title: 'P', date: '2026-10-01', ...fields });
const lesson = (fields) => plan({ timetableId: 'tt', timetableKey: 'k', hour: 8, repeat: { freq: 'daily' }, ...fields });

test('lessons are kept apart from plans in counts and stats', () => {
  const plans = [plan({ id: 'a', title: 'Homework' }), lesson({ id: 'l', title: 'Math' })];
  assert.deepEqual(tasksOn(plans, '2026-10-01').map((p) => p.id), ['a']);
  assert.deepEqual(lessonsOn(plans, '2026-10-01').map((p) => p.id), ['l']);
  assert.deepEqual(dayProgress(plans, '2026-10-01'), { total: 1, done: 0 });
  assert.equal(monthStats(plans, {}, '2026-10', '2026-10-31').plansTotal, 1);
});

test('historyDays lists past days newest first with done and missed plans', () => {
  const plans = [
    plan({ id: 'a', date: '2026-09-29', doneDates: ['2026-09-29'] }),
    plan({ id: 'b', date: '2026-09-29' }),
    plan({ id: 'c', date: '2026-09-27' }),
    lesson({ id: 'l', date: '2026-09-01' }),
  ];
  const { entries, next } = historyDays(plans, { '2026-09-28': { done: true } }, '2026-10-01', 10);
  assert.deepEqual(entries.map((e) => [e.date, e.done.length, e.missed.length, e.dayDone]), [
    ['2026-09-29', 1, 1, false],
    ['2026-09-28', 0, 0, true],
    ['2026-09-27', 0, 1, false],
  ]);
  assert.equal(next, null);
  assert.equal(historyDays(plans, {}, '2026-10-01', 1).entries.length, 1);
});

test('unfinishedPlans returns recent undone one-off plans, newest first', () => {
  const plans = [
    plan({ id: 'old', date: '2026-08-01' }),
    plan({ id: 'a', date: '2026-09-28' }),
    plan({ id: 'b', date: '2026-09-30' }),
    plan({ id: 'done', date: '2026-09-30', doneDates: ['2026-09-30'] }),
    plan({ id: 'today', date: '2026-10-01' }),
    plan({ id: 'rep', date: '2026-09-01', repeat: { freq: 'daily' } }),
  ];
  assert.deepEqual(unfinishedPlans(plans, '2026-10-01').map((p) => p.id), ['b', 'a']);
});

test('categoryStats summarises the last four weeks', () => {
  const plans = [
    plan({ id: 'a', categoryId: 'c', date: '2026-09-28', doneDates: ['2026-09-28'] }),
    plan({ id: 'b', categoryId: 'c', date: '2026-09-29' }),
    plan({ id: 'u', categoryId: 'c', date: '2026-10-05' }),
    plan({ id: 'r', categoryId: 'c', date: '2026-10-01', repeat: { freq: 'weekly', weekdays: [4] } }),
    plan({ id: 'x', categoryId: 'other', date: '2026-09-29' }),
  ];
  const s = categoryStats(plans, 'c', '2026-10-01');
  assert.equal(s.thisWeek.start, '2026-09-28');
  assert.deepEqual([s.thisWeek.done, s.thisWeek.total], [1, 3]);
  assert.equal(s.rate, 33);
  assert.equal(s.upcoming, 1);
  assert.equal(s.repeating, 1);
});

test('tabs: pin keeps pinned tabs left; close others / to the right; reopen; duplicate', () => {
  let s = base();
  s = run(s, { type: 'tab/open', path: 'calendar' }, { type: 'tab/open', path: 'history' });
  const [a, b, c] = s.session.tabs.map((t) => t.id);
  s = run(s, { type: 'tab/pin', id: c, pinned: true });
  assert.deepEqual(s.session.tabs.map((t) => t.id), [c, a, b]);
  // A pinned tab can't be dragged among unpinned ones.
  s = run(s, { type: 'tab/move', id: c, toIndex: 2 });
  assert.equal(s.session.tabs[0].id, c);
  s = run(s, { type: 'tab/closeOthers', id: a });
  assert.deepEqual(s.session.tabs.map((t) => t.id), [c, a]);
  s = run(s, { type: 'tab/reopen' });
  assert.deepEqual(s.session.tabs.map((t) => t.id), [c, a, b]);
  s = run(s, { type: 'tab/closeRight', id: c });
  assert.deepEqual(s.session.tabs.map((t) => t.id), [c]);
  s = run(s, { type: 'tab/duplicate', id: c });
  assert.equal(s.session.tabs.length, 2);
  assert.equal(s.session.tabs[1].history[0], s.session.tabs[0].history[0]);
  // Unpinning works and persists through normalizeData.
  s = run(s, { type: 'tab/pin', id: c, pinned: false });
  assert.equal(normalizeData(s).session.tabs.some((t) => t.pinned), false);
});

test('plans/moveToDate moves one-off plans and keeps repeating ones', () => {
  let s = run(
    base(),
    { type: 'plan/add', plan: { id: 'a', title: 'a', date: '2026-09-28' } },
    { type: 'plan/add', plan: { id: 'r', title: 'r', date: '2026-09-28', repeat: { freq: 'daily' } } },
    { type: 'plans/moveToDate', ids: ['a', 'r'], date: '2026-10-01' },
  );
  assert.deepEqual(s.plans.map((p) => p.date), ['2026-10-01', '2026-09-28']);
});

test('categories keep an icon, a description and any hex color', () => {
  let s = run(base(), { type: 'category/add', id: 'c', name: 'Study' });
  s = run(s, { type: 'category/update', id: 'c', icon: '📚', description: 'Uni', color: '#ff8800' });
  s = run(s, { type: 'category/update', id: 'c', color: 'red' }); // invalid colors are ignored
  assert.deepEqual(normalizeData(s).categories[0], { id: 'c', name: 'Study', color: '#ff8800', icon: '📚', description: 'Uni' });
});

test('undo and redo restore plans but leave tabs and settings alone', () => {
  let h = initHistory(base());
  h = historyReducer(h, { type: 'plan/add', plan: { id: 'a', title: 'Gym', date: '2026-10-01' } });
  h = historyReducer(h, { type: 'plan/setDone', id: 'a', date: '2026-10-01', done: true });
  h = historyReducer(h, { type: 'tab/open', path: 'calendar' });
  h = historyReducer(h, { type: 'history/undo' });
  assert.deepEqual(h.data.plans[0].doneDates, []);
  assert.equal(h.data.session.tabs.length, 2); // the new tab stays
  h = historyReducer(h, { type: 'history/redo' });
  assert.deepEqual(h.data.plans[0].doneDates, ['2026-10-01']);
  h = historyReducer(h, { type: 'plan/delete', id: 'a' });
  h = historyReducer(h, { type: 'history/undo' });
  assert.equal(h.data.plans.length, 1);
  // A new change clears the redo list.
  h = historyReducer(h, { type: 'day/setDone', date: '2026-10-01', done: true });
  assert.equal(h.future.length, 0);
});

test('importing a backup replaces data but keeps the open tabs', () => {
  const s = run(base(), { type: 'tab/open', path: 'history' }, { type: 'data/replace', data: { plans: [{ id: 'x', title: 'From backup', date: '2026-10-01' }] } });
  assert.equal(s.plans[0].title, 'From backup');
  assert.equal(s.session.tabs.length, 2);
});
