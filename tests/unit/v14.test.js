import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reducer, createInitialData, normalizeData, DATA_VERSION } from '../../src/lib/store.js';
import { currentStreak, dashboardDeadlines, daysLeftLabel, daysUntil, deadlinesDueOn, dueLabel, openDeadlines, rangeStats, upNext } from '../../src/lib/recurrence.js';
import { historyReducer, initHistory } from '../../src/lib/history.js';
import { parseRoute } from '../../src/lib/routes.js';

const run = (state, ...actions) => actions.reduce(reducer, state);
const base = () => ({ ...createInitialData(), categories: [{ id: 'c', name: 'School', color: '#4f9d7e' }], plans: [] });
const T = '2026-10-05'; // a Monday
const at = (date, h, m = 0) => {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m);
};

test('deadlines: add, update, delete, and they are cleaned up with their category', () => {
  let s = run(base(), { type: 'deadline/add', deadline: { id: 'd', title: '  Essay ', due: '2026-10-12', categoryId: 'c' } });
  assert.equal(s.deadlines.length, 1);
  assert.deepEqual(
    { title: s.deadlines[0].title, due: s.deadlines[0].due, hour: s.deadlines[0].hour, done: s.deadlines[0].done },
    { title: 'Essay', due: '2026-10-12', hour: null, done: false },
  );
  s = run(s, { type: 'deadline/update', id: 'd', changes: { due: '2026-10-14', hour: 17, minute: 30, done: true } });
  assert.deepEqual([s.deadlines[0].due, s.deadlines[0].hour, s.deadlines[0].minute, s.deadlines[0].done], ['2026-10-14', 17, 30, true]);
  s = run(s, { type: 'category/delete', id: 'c' });
  assert.equal(s.deadlines[0].categoryId, null);
  s = run(s, { type: 'deadline/delete', id: 'd' });
  assert.equal(s.deadlines.length, 0);
});

test('deadline changes can be undone', () => {
  let h = initHistory(base());
  h = historyReducer(h, { type: 'deadline/add', deadline: { id: 'd', title: 'Essay', due: T } });
  h = historyReducer(h, { type: 'deadline/update', id: 'd', changes: { done: true } });
  h = historyReducer(h, { type: 'history/undo' });
  assert.equal(h.data.deadlines[0].done, false);
  h = historyReducer(h, { type: 'history/undo' });
  assert.equal(h.data.deadlines.length, 0);
});

test('version 4 data gains an empty deadline list; bad deadlines are dropped', () => {
  const v4 = normalizeData({ version: 4, categories: [], plans: [], days: {} });
  assert.equal(v4.version, DATA_VERSION);
  assert.deepEqual(v4.deadlines, []);
  const s = normalizeData({
    deadlines: [{ id: 'a', title: 'Ok', due: T, categoryId: 'gone' }, { id: 'b', title: 'Bad', due: 'someday' }, null],
  });
  assert.deepEqual(s.deadlines.map((d) => [d.id, d.categoryId]), [['a', null]]);
});

test('due labels count down to the deadline', () => {
  assert.equal(daysUntil('2026-10-08', T), 3);
  assert.equal(daysUntil('2026-10-04', T), -1);
  assert.equal(dueLabel('2026-10-03', T), 'Overdue by 2 days');
  assert.equal(dueLabel('2026-10-04', T), 'Overdue by 1 day');
  assert.equal(dueLabel(T, T), 'Due today');
  assert.equal(dueLabel('2026-10-06', T), 'Due tomorrow');
  assert.equal(dueLabel('2026-10-19', T), 'Due in 14 days');
  assert.match(dueLabel('2026-11-20', T), /^Due \D+ 20/);
  // Across a daylight-saving change it still counts whole days.
  assert.equal(daysUntil('2026-11-02', '2026-10-24'), 9);
});

test('open deadlines: still ahead on a date, overdue ones only on today, soonest first', () => {
  const ds = [
    { id: 'late', due: '2026-10-01', hour: null, minute: 0, done: false },
    { id: 'later', due: '2026-10-09', hour: null, minute: 0, done: false },
    { id: 'soon-pm', due: '2026-10-07', hour: 15, minute: 0, done: false },
    { id: 'soon-am', due: '2026-10-07', hour: 9, minute: 0, done: false },
    { id: 'finished', due: '2026-10-08', hour: null, minute: 0, done: true },
  ];
  assert.deepEqual(openDeadlines(ds, T, T).map((d) => d.id), ['late', 'soon-am', 'soon-pm', 'later']);
  assert.deepEqual(openDeadlines(ds, '2026-10-08', T).map((d) => d.id), ['later']);
  assert.deepEqual(deadlinesDueOn(ds, '2026-10-07').map((d) => d.id), ['soon-am', 'soon-pm']);
});

test('streak counts completed days in a row up to today (or yesterday)', () => {
  const days = { '2026-10-02': { done: true }, '2026-10-03': { done: true }, '2026-10-04': { done: true } };
  assert.equal(currentStreak(days, T), 3); // today not done yet
  assert.equal(currentStreak({ ...days, [T]: { done: true } }, T), 4);
  assert.equal(currentStreak({ '2026-10-03': { done: true } }, T), 0);
});

test('range stats count plans and lessons separately, up to today', () => {
  let s = run(
    base(),
    { type: 'plan/add', plan: { id: 'a', title: 'a', date: '2026-10-04' } },
    { type: 'plan/add', plan: { id: 'b', title: 'b', date: T } },
    { type: 'plan/add', plan: { id: 'future', title: 'f', date: '2026-10-08' } },
    { type: 'plan/add', plan: { id: 'l', title: 'Math', date: '2026-10-04', hour: 8, timetableId: 'tt', timetableKey: 'k', repeat: { freq: 'daily' } } },
  );
  s = run(s, { type: 'plan/setDone', id: 'a', date: '2026-10-04', done: true });
  // Lesson at 08:00 on T hasn't ended at 08:10, so 1 of 2 attended.
  assert.deepEqual(rangeStats(s.plans, '2026-10-04', '2026-10-10', T, at(T, 8, 10)), { done: 1, total: 2, lessons: 1, lessonsTotal: 2 });
});

test('up next finds the next lesson and the next unfinished timed plan', () => {
  let s = run(
    base(),
    { type: 'plan/add', plan: { id: 'early', title: 'early', date: T, hour: 7 } },
    { type: 'plan/add', plan: { id: 'gym', title: 'gym', date: T, hour: 18 } },
    { type: 'plan/add', plan: { id: 'call', title: 'call', date: T, hour: 12, minute: 30 } },
    { type: 'plan/add', plan: { id: 'l', title: 'Fizik', date: T, hour: 13, timetableId: 'tt', timetableKey: 'k' } },
  );
  let next = upNext(s.plans, T, at(T, 10));
  assert.deepEqual([next.lesson?.id, next.plan?.id, next.minutes], ['l', 'call', 600]);
  s = run(s, { type: 'plan/setDone', id: 'call', date: T, done: true });
  next = upNext(s.plans, T, at(T, 10));
  assert.equal(next.plan.id, 'gym');
  next = upNext(s.plans, T, at(T, 20));
  assert.deepEqual([next.lesson, next.plan], [null, null]);
});

test('calendar address with a date opens that month with the day selected', () => {
  assert.deepEqual(parseRoute('calendar/2026-03-12'), { page: 'calendar', month: '2026-03', date: '2026-03-12' });
  assert.deepEqual(parseRoute('calendar/2026-03'), { page: 'calendar', month: '2026-03' });
  assert.equal(parseRoute('calendar/2026-13-40').page, 'notfound');
});

test('days-left badge, long and short', () => {
  assert.equal(daysLeftLabel('2026-10-08', T), '3 days left');
  assert.equal(daysLeftLabel('2026-10-08', T, true), '3d');
  assert.equal(daysLeftLabel('2026-10-06', T), 'Tomorrow');
  assert.equal(daysLeftLabel(T, T), 'Today');
  assert.equal(daysLeftLabel('2026-10-04', T), '1 day late');
  assert.equal(daysLeftLabel('2026-10-02', T, true), '3d late');
});

test('dashboard deadlines: checking one leaves it in place; finished past ones are folded away', () => {
  const D = (id, due, done = false) => ({ id, due, hour: null, minute: 0, done });
  const ds = [D('later', '2026-10-09'), D('ticked', '2026-10-07', true), D('late', '2026-10-01'), D('old-done', '2026-10-02', true), D('older-done', '2026-09-20', true), D('today-done', T, true)];
  const { current, past } = dashboardDeadlines(ds, T);
  assert.deepEqual(current.map((d) => d.id), ['late', 'today-done', 'ticked', 'later']);
  assert.deepEqual(past.map((d) => d.id), ['old-done', 'older-done']);
});
