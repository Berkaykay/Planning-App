import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occursOn, plansOn, describeRepeat, streak } from '../../src/lib/recurrence.js';
import { addDays, monthGrid, isDateKey, addMonths } from '../../src/lib/dates.js';
import { normalizePlan } from '../../src/lib/store.js';

const plan = (fields) => normalizePlan({ title: 'P', date: '2026-10-01', ...fields });

test('one-off plans only occur on their date', () => {
  const p = plan({});
  assert.equal(occursOn(p, '2026-10-01'), true);
  assert.equal(occursOn(p, '2026-10-02'), false);
});

test('daily plans occur from the start date until the end date, except skipped days', () => {
  const p = plan({ repeat: { freq: 'daily', until: '2026-10-05' }, skipDates: ['2026-10-03'] });
  assert.equal(occursOn(p, '2026-09-30'), false);
  assert.equal(occursOn(p, '2026-10-01'), true);
  assert.equal(occursOn(p, '2026-10-03'), false);
  assert.equal(occursOn(p, '2026-10-05'), true);
  assert.equal(occursOn(p, '2026-10-06'), false);
});

test('weekly plans occur on the chosen weekdays', () => {
  // 2026-10-01 is a Thursday.
  const p = plan({ repeat: { freq: 'weekly', weekdays: [1, 3] } });
  assert.equal(occursOn(p, '2026-10-05'), true); // Monday
  assert.equal(occursOn(p, '2026-10-07'), true); // Wednesday
  assert.equal(occursOn(p, '2026-10-08'), false); // Thursday
  assert.equal(describeRepeat(p), 'Every Mon, Wed');
});

test('monthly plans on the 31st fall back to the last day of short months', () => {
  const p = plan({ date: '2026-01-31', repeat: { freq: 'monthly' } });
  assert.equal(occursOn(p, '2026-02-28'), true);
  assert.equal(occursOn(p, '2026-03-31'), true);
  assert.equal(occursOn(p, '2026-04-30'), true);
  assert.equal(occursOn(p, '2026-04-29'), false);
});

test('plansOn sorts all-day plans first, then by hour', () => {
  const list = plansOn(
    [plan({ title: 'b', hour: 14 }), plan({ title: 'a', hour: 9 }), plan({ title: 'all day' })],
    '2026-10-01',
  );
  assert.deepEqual(list.map((p) => p.title), ['all day', 'a', 'b']);
});

test('streak counts consecutive completed occurrences', () => {
  const p = plan({ date: '2026-09-25', repeat: { freq: 'daily' }, doneDates: ['2026-09-28', '2026-09-29', '2026-09-30'] });
  // Today (10-01) not done yet does not break the streak.
  assert.equal(streak(p, '2026-10-01'), 3);
  p.doneDates.push('2026-10-01');
  assert.equal(streak(p, '2026-10-01'), 4);
});

test('date helpers handle month and DST boundaries', () => {
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-29', 1), '2026-03-30');
  assert.equal(addMonths('2026-12', 1), '2027-01');
  assert.equal(isDateKey('2026-02-30'), false);
  const grid = monthGrid('2026-10');
  assert.equal(grid.length, 42);
  assert.equal(grid[0], '2026-09-28'); // Monday before Oct 1
});
