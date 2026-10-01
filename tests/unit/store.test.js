import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reducer, createInitialData, normalizeData, activeTab, currentPath } from '../../src/lib/store.js';
import { parseRoute } from '../../src/lib/routes.js';

const run = (state, ...actions) => actions.reduce(reducer, state);
const base = () => ({ ...createInitialData(), categories: [], plans: [] });

test('categories can be created, renamed and deleted; deleted category plans become uncategorized', () => {
  let s = run(base(), { type: 'category/add', id: 'c1', name: ' Work ' });
  assert.equal(s.categories[0].name, 'Work');
  s = run(s, { type: 'category/update', id: 'c1', name: 'Job' }, { type: 'plan/add', plan: { id: 'p1', title: 'x', date: '2026-10-01', categoryId: 'c1' } });
  assert.equal(s.categories[0].name, 'Job');
  s = run(s, { type: 'category/delete', id: 'c1' });
  assert.equal(s.categories.length, 0);
  assert.equal(s.plans[0].categoryId, null);
});

test('completing a plan can be undone', () => {
  let s = run(base(), { type: 'plan/add', plan: { id: 'p1', title: 'x', date: '2026-10-01', hour: 9 } });
  s = run(s, { type: 'plan/setDone', id: 'p1', date: '2026-10-01', done: true });
  assert.deepEqual(s.plans[0].doneDates, ['2026-10-01']);
  s = run(s, { type: 'plan/setDone', id: 'p1', date: '2026-10-01', done: false });
  assert.deepEqual(s.plans[0].doneDates, []);
});

test('moving a completed one-off plan keeps it completed on the new date', () => {
  let s = run(
    base(),
    { type: 'plan/add', plan: { id: 'p1', title: 'x', date: '2026-10-01', hour: 9 } },
    { type: 'plan/setDone', id: 'p1', date: '2026-10-01', done: true },
    { type: 'plan/update', id: 'p1', changes: { date: '2026-10-03', hour: 14 } },
  );
  assert.equal(s.plans[0].date, '2026-10-03');
  assert.equal(s.plans[0].hour, 14);
  assert.deepEqual(s.plans[0].doneDates, ['2026-10-03']);
});

test('detaching one occurrence of a repeating plan', () => {
  let s = run(
    base(),
    { type: 'plan/add', plan: { id: 'p1', title: 'Run', date: '2026-10-01', hour: 7, repeat: { freq: 'daily' } } },
    { type: 'plan/setDone', id: 'p1', date: '2026-10-02', done: true },
    { type: 'plan/detach', id: 'p1', date: '2026-10-02', newId: 'p2', changes: { hour: 18 } },
  );
  const [series, single] = s.plans;
  assert.deepEqual(series.skipDates, ['2026-10-02']);
  assert.deepEqual(series.doneDates, []);
  assert.equal(single.id, 'p2');
  assert.equal(single.repeat, null);
  assert.equal(single.date, '2026-10-02');
  assert.equal(single.hour, 18);
  assert.deepEqual(single.doneDates, ['2026-10-02']);
});

test('whole-day completion is independent and can be undone', () => {
  let s = run(base(), { type: 'day/setDone', date: '2026-10-01', done: true });
  assert.deepEqual(s.days, { '2026-10-01': { done: true } });
  s = run(s, { type: 'day/setDone', date: '2026-10-01', done: false });
  assert.deepEqual(s.days, {});
});

test('tabs keep their own back/forward history', () => {
  let s = base();
  const first = s.session.activeTabId;
  s = run(s, { type: 'tab/navigate', path: 'calendar' }, { type: 'tab/navigate', path: 'categories' }, { type: 'tab/back' });
  assert.equal(currentPath(activeTab(s)), 'calendar');
  s = run(s, { type: 'tab/open', path: 'day/2026-10-01' });
  assert.notEqual(s.session.activeTabId, first);
  assert.equal(activeTab(s).history.length, 1);
  s = run(s, { type: 'tab/activate', id: first }, { type: 'tab/forward' });
  assert.equal(currentPath(activeTab(s)), 'categories');
  // Navigating after going back drops the forward history.
  s = run(s, { type: 'tab/back' }, { type: 'tab/navigate', path: 'dashboard' });
  assert.deepEqual(activeTab(s).history, ['dashboard', 'calendar', 'dashboard']);
  // Closing the last tab leaves a fresh dashboard tab.
  for (const t of s.session.tabs) s = run(s, { type: 'tab/close', id: t.id });
  assert.equal(s.session.tabs.length, 1);
  assert.equal(currentPath(activeTab(s)), 'dashboard');
});

test('normalizeData repairs missing or malformed data', () => {
  const s = normalizeData({ plans: [{ title: 'ok', date: '2026-10-01', categoryId: 'gone' }, { title: 'bad date', date: 'nope' }] });
  assert.equal(s.plans.length, 1);
  assert.equal(s.plans[0].categoryId, null);
  assert.equal(s.session.tabs.length, 1);
  assert.equal(normalizeData(null).categories.length, 3);
});

test('routes parse addresses', () => {
  assert.deepEqual(parseRoute('planner://day/2026-10-01'), { page: 'day', date: '2026-10-01' });
  assert.deepEqual(parseRoute('calendar/2026-02'), { page: 'calendar', month: '2026-02' });
  assert.equal(parseRoute('day/2026-13-01').page, 'notfound');
  assert.equal(parseRoute('https://example.com').page, 'notfound');
  assert.equal(parseRoute('').page, 'dashboard');
});
