import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reducer, createInitialData, normalizeData, normalizePlan, DATA_VERSION } from '../../src/lib/store.js';
import { categoryAll, isDone, lessonAttended, nextOccurrence, weekLayout } from '../../src/lib/recurrence.js';
import { historyReducer, initHistory } from '../../src/lib/history.js';

const run = (state, ...actions) => actions.reduce(reducer, state);
const base = () => ({ ...createInitialData(), categories: [], plans: [] });
const D = '2026-10-05';
const add = (id, fields = {}) => ({ type: 'plan/add', plan: { id, title: id, date: D, ...fields } });

test('checking a day checks all its plans, and unchecking unchecks them (lessons untouched)', () => {
  let s = run(base(), add('a'), add('b'), add('lesson', { hour: 8, timetableId: 'tt', timetableKey: 'k' }));
  s = run(s, { type: 'day/setDone', date: D, done: true });
  assert.deepEqual(s.plans.map((p) => isDone(p, D)), [true, true, false]);
  s = run(s, { type: 'day/setDone', date: D, done: false });
  assert.deepEqual(s.plans.map((p) => isDone(p, D)), [false, false, false]);
});

test('checking the last plan checks the day; unchecking a plan unchecks it', () => {
  let s = run(base(), add('a'), add('b'), { type: 'plan/setDone', id: 'a', date: D, done: true });
  assert.equal(s.days[D], undefined);
  s = run(s, { type: 'plan/setDone', id: 'b', date: D, done: true });
  assert.deepEqual(s.days[D], { done: true });
  s = run(s, { type: 'plan/setDone', id: 'a', date: D, done: false });
  assert.equal(s.days[D], undefined);
  // Adding a new unchecked plan to a completed day makes it incomplete again.
  s = run(s, { type: 'plan/setDone', id: 'a', date: D, done: true }, add('c'));
  assert.equal(s.days[D], undefined);
  // An empty day can still be checked by hand.
  s = run(s, { type: 'day/setDone', date: '2026-10-09', done: true });
  assert.deepEqual(s.days['2026-10-09'], { done: true });
});

test('a day check is one undo step', () => {
  let h = initHistory(run(base(), add('a'), add('b')));
  h = historyReducer(h, { type: 'day/setDone', date: D, done: true });
  h = historyReducer(h, { type: 'history/undo' });
  assert.equal(h.data.days[D], undefined);
  assert.deepEqual(h.data.plans.map((p) => isDone(p, D)), [false, false]);
});

test('lessons count as attended once over, unless marked absent', () => {
  const lesson = normalizePlan({ title: 'Math', date: '2026-10-01', hour: 8, minute: 30, duration: 40, repeat: { freq: 'daily' }, timetableId: 'tt' });
  const at = (h, m) => new Date(2026, 9, 5, h, m);
  assert.equal(lessonAttended(lesson, D, at(9, 0)), false); // still running
  assert.equal(lessonAttended(lesson, D, at(9, 10)), true); // ended 09:10
  assert.equal(lessonAttended(lesson, '2026-10-04', at(7, 0)), true); // yesterday
  assert.equal(lessonAttended(lesson, '2026-10-06', at(12, 0)), false); // tomorrow
  const absent = { ...lesson, absentDates: [D] };
  assert.equal(lessonAttended(absent, D, at(12, 0)), false);
  const early = { ...lesson, doneDates: ['2026-10-06'] };
  assert.equal(lessonAttended(early, '2026-10-06', at(7, 0)), true);
  // Without an end time a lesson counts as 45 minutes.
  const open = { ...lesson, duration: null };
  assert.equal(lessonAttended(open, D, at(9, 14)), false);
  assert.equal(lessonAttended(open, D, at(9, 15)), true);
});

test('lesson/setAttended toggles between attended and absent', () => {
  let s = run(base(), add('l', { hour: 8, timetableId: 'tt', timetableKey: 'k' }));
  s = run(s, { type: 'lesson/setAttended', id: 'l', date: D, attended: false });
  assert.deepEqual([s.plans[0].absentDates, s.plans[0].doneDates], [[D], []]);
  s = run(s, { type: 'lesson/setAttended', id: 'l', date: D, attended: true });
  assert.deepEqual([s.plans[0].absentDates, s.plans[0].doneDates], [[], [D]]);
});

test('plan/copy makes unchecked one-off copies with a fresh checklist', () => {
  let s = run(
    base(),
    add('a', { repeat: { freq: 'daily' }, checklist: [{ text: 'step', doneDates: [D] }] }),
    { type: 'plan/setDone', id: 'a', date: D, done: true },
    { type: 'plan/copy', id: 'a', dates: ['2026-10-06', '2026-10-07'], newIds: ['c1', 'c2'] },
  );
  const copies = s.plans.filter((p) => p.id.startsWith('c'));
  assert.deepEqual(copies.map((p) => [p.date, p.repeat, p.doneDates.length, p.checklist[0].doneDates.length]), [
    ['2026-10-06', null, 0, 0],
    ['2026-10-07', null, 0, 0],
  ]);
  assert.notEqual(copies[0].checklist[0].id, s.plans[0].checklist[0].id);
});

test('ticking every checklist item completes the plan (and the day); unticking reopens it', () => {
  let s = run(base(), add('a', { checklist: [{ id: 'i1', text: 'one' }, { id: 'i2', text: 'two' }] }));
  s = run(s, { type: 'plan/checkItem', id: 'a', itemId: 'i1', date: D, done: true });
  assert.equal(isDone(s.plans[0], D), false);
  s = run(s, { type: 'plan/checkItem', id: 'a', itemId: 'i2', date: D, done: true });
  assert.equal(isDone(s.plans[0], D), true);
  assert.deepEqual(s.days[D], { done: true });
  s = run(s, { type: 'plan/checkItem', id: 'a', itemId: 'i1', date: D, done: false });
  assert.equal(isDone(s.plans[0], D), false);
  assert.equal(s.days[D], undefined);
});

test('weekLayout places blocks by time with lanes for overlaps', () => {
  const plans = [
    normalizePlan({ id: 'a', title: 'a', date: D, hour: 9, duration: 60 }),
    normalizePlan({ id: 'b', title: 'b', date: D, hour: 9, minute: 30, duration: 60 }),
    normalizePlan({ id: 'c', title: 'c', date: D, hour: 11 }),
    normalizePlan({ id: 'd', title: 'd', date: '2026-10-07' }),
    normalizePlan({ id: 'e', title: 'e', date: '2026-10-11', hour: 23, duration: 30 }),
  ];
  const { days, fromHour, toHour } = weekLayout(plans, D);
  assert.equal(days.length, 7);
  assert.deepEqual(days[0].blocks.map((b) => [b.plan.id, b.start, b.lane, b.lanes]), [
    ['a', 540, 0, 2],
    ['b', 570, 1, 2],
    ['c', 660, 0, 1],
  ]);
  assert.equal(days[2].allDay[0].id, 'd');
  assert.deepEqual([fromHour, toHour], [7, 24]);
});

test('categoryAll lists every plan of a category in date order', () => {
  const plans = [
    normalizePlan({ id: 'late', title: 'late', date: '2026-10-20', categoryId: 'c' }),
    normalizePlan({ id: 'done', title: 'done', date: '2026-09-01', categoryId: 'c', doneDates: ['2026-09-01'] }),
    normalizePlan({ id: 'rep', title: 'rep', date: '2026-09-01', categoryId: 'c', repeat: { freq: 'weekly', weekdays: [3] } }),
    normalizePlan({ id: 'lesson', title: 'l', date: '2026-09-01', categoryId: 'c', timetableId: 't', hour: 8 }),
    normalizePlan({ id: 'other', title: 'o', date: '2026-10-02', categoryId: 'x' }),
  ];
  const all = categoryAll(plans, 'c', D);
  assert.deepEqual(all.map((e) => [e.plan.id, e.date]), [
    ['done', '2026-09-01'],
    ['rep', '2026-10-07'],
    ['late', '2026-10-20'],
  ]);
  assert.equal(nextOccurrence(plans[2], D), '2026-10-07');
});

test('version 3 data migrates to the current version', () => {
  const s = normalizeData({ version: 3, plans: [{ id: 'p', title: 'x', date: D }] });
  assert.equal(s.version, DATA_VERSION);
  assert.deepEqual([s.plans[0].absentDates, s.plans[0].checklist], [[], []]);
});
