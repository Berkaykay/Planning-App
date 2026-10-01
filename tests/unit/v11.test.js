import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reducer, createInitialData, normalizeData, normalizePlan, DATA_VERSION } from '../../src/lib/store.js';
import { comparePlans, monthStats, plansOn } from '../../src/lib/recurrence.js';
import { formatTimeRange, parseTime } from '../../src/lib/dates.js';

const run = (state, ...actions) => actions.reduce(reducer, state);
const base = () => ({ ...createInitialData(), categories: [], plans: [] });

const timetable = (cells, extra = {}) => ({
  id: 'tt',
  name: 'School',
  categoryId: 'school',
  weekdays: [1, 2, 3, 4, 5],
  periods: [
    { id: 'p1', start: '08:30', end: '09:10' },
    { id: 'p2', start: '09:20', end: '10:00' },
  ],
  cells,
  startDate: '2026-10-01',
  until: null,
  ...extra,
});

test('times: parsing, formatting and sorting by minute', () => {
  assert.equal(parseTime('08:30'), 510);
  assert.equal(parseTime('24:00'), null);
  assert.equal(parseTime(''), null);
  const lesson = normalizePlan({ title: 'Math', date: '2026-10-05', hour: 8, minute: 30, duration: 40 });
  assert.equal(formatTimeRange(lesson), '08:30–09:10');
  assert.equal(formatTimeRange(normalizePlan({ title: 'x', date: '2026-10-05', hour: 9 })), '09:00');
  assert.equal(formatTimeRange(normalizePlan({ title: 'x', date: '2026-10-05' })), 'All day');
  const early = normalizePlan({ title: 'b', date: '2026-10-05', hour: 8, minute: 5 });
  assert.ok(comparePlans(early, lesson) < 0);
});

test('timetable/save creates one weekly plan per filled cell', () => {
  const s = run(base(), { type: 'timetable/save', timetable: timetable({ '1:p1': 'Math', '1:p2': ' Physics ', '3:p1': 'Math', '2:p2': '  ' }) });
  assert.equal(s.timetables.length, 1);
  assert.equal(s.plans.length, 3);
  // Monday 2026-10-05 has Math 08:30-09:10, then Physics.
  const monday = plansOn(s.plans, '2026-10-05');
  assert.deepEqual(monday.map((p) => [p.title, formatTimeRange(p)]), [['Math', '08:30–09:10'], ['Physics', '09:20–10:00']]);
  assert.equal(plansOn(s.plans, '2026-10-06').length, 0); // Tuesday: empty cell ignored
  assert.equal(plansOn(s.plans, '2026-10-07')[0].title, 'Math'); // Wednesday
  assert.ok(s.plans.every((p) => p.categoryId === 'school' && p.timetableId === 'tt'));
});

test('re-saving a timetable keeps check marks, updates changes and removes emptied cells', () => {
  let s = run(base(), { type: 'timetable/save', timetable: timetable({ '1:p1': 'Math', '1:p2': 'Physics' }) });
  const math = s.plans.find((p) => p.title === 'Math');
  s = run(s, { type: 'plan/setDone', id: math.id, date: '2026-10-05', done: true });
  s = run(s, {
    type: 'timetable/save',
    timetable: timetable({ '1:p1': 'Maths', '2:p1': 'Art' }, { periods: [{ id: 'p1', start: '08:00', end: '08:45' }] }),
  });
  assert.equal(s.plans.length, 2);
  const maths = s.plans.find((p) => p.title === 'Maths');
  assert.equal(maths.id, math.id);
  assert.deepEqual(maths.doneDates, ['2026-10-05']);
  assert.equal(formatTimeRange(maths), '08:00–08:45');
  assert.ok(!s.plans.some((p) => p.title === 'Physics'));
});

test('timetable/delete removes the timetable and only its plans', () => {
  let s = run(
    base(),
    { type: 'plan/add', plan: { id: 'own', title: 'Mine', date: '2026-10-05' } },
    { type: 'timetable/save', timetable: timetable({ '1:p1': 'Math' }) },
    { type: 'timetable/delete', id: 'tt' },
  );
  assert.deepEqual(s.timetables, []);
  assert.deepEqual(s.plans.map((p) => p.id), ['own']);
});

test('deleting the timetable category uncategorizes the timetable and its lessons', () => {
  let s = run(base(), { type: 'category/add', id: 'school', name: 'School' }, { type: 'timetable/save', timetable: timetable({ '1:p1': 'Math' }) });
  s = run(s, { type: 'category/delete', id: 'school' });
  assert.equal(s.timetables[0].categoryId, null);
  assert.equal(s.plans[0].categoryId, null);
});

test('detaching one lesson makes it a normal one-off plan', () => {
  let s = run(base(), { type: 'timetable/save', timetable: timetable({ '1:p1': 'Math' }) });
  s = run(s, { type: 'plan/detach', id: s.plans[0].id, date: '2026-10-05', newId: 'single', changes: { hour: 11 } });
  const single = s.plans.find((p) => p.id === 'single');
  assert.equal(single.timetableId, undefined);
  assert.equal(single.repeat, null);
});

test('tab/move reorders tabs', () => {
  let s = base();
  s = run(s, { type: 'tab/open', path: 'calendar' }, { type: 'tab/open', path: 'categories' });
  const ids = s.session.tabs.map((t) => t.id);
  s = run(s, { type: 'tab/move', id: ids[2], toIndex: 0 });
  assert.deepEqual(s.session.tabs.map((t) => t.id), [ids[2], ids[0], ids[1]]);
  s = run(s, { type: 'tab/move', id: ids[2], toIndex: 99 });
  assert.deepEqual(s.session.tabs.map((t) => t.id), [ids[0], ids[1], ids[2]]);
});

test('version 1 data is migrated', () => {
  const s = normalizeData({
    version: 1,
    categories: [{ id: 'c', name: 'Health', color: '#e5484d' }],
    plans: [{ id: 'p', title: 'Run', date: '2026-10-01', hour: 7 }],
  });
  assert.equal(s.version, DATA_VERSION);
  assert.equal(s.categories[0].color, '#d0715b');
  assert.equal(s.plans[0].minute, 0);
  assert.equal(s.plans[0].duration, null);
  assert.deepEqual(s.timetables, []);
  assert.deepEqual(s.settings, { theme: 'system', reminders: { enabled: true, minutes: 10, lessons: false } });
  assert.equal(normalizeData({ settings: { theme: 'dark' } }).settings.theme, 'dark');
  assert.equal(normalizeData({ settings: { theme: 'neon' } }).settings.theme, 'system');
});

test('monthStats counts completed days, plans done up to today, streaks and the busiest day', () => {
  const plans = [
    normalizePlan({ id: 'a', title: 'Daily', date: '2026-10-01', repeat: { freq: 'daily' }, doneDates: ['2026-10-01', '2026-10-02'] }),
    normalizePlan({ id: 'b', title: 'Once', date: '2026-10-02' }),
  ];
  const days = { '2026-10-01': { done: true }, '2026-10-02': { done: true }, '2026-10-04': { done: true } };
  const s = monthStats(plans, days, '2026-10', '2026-10-03');
  assert.equal(s.daysDone, 3);
  assert.equal(s.daysElapsed, 3);
  assert.equal(s.plansTotal, 4); // Oct 1-3 daily (3) + once (1)
  assert.equal(s.plansDone, 2);
  assert.equal(s.bestStreak, 2);
  assert.equal(s.busiest, '2026-10-02');
  assert.equal(s.busiestCount, 2);
});
