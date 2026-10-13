import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { reducer, createInitialData, normalizeData, normalizeSpecialDay, DATA_VERSION } from '../../src/lib/store.js';
import {
  countdownLabel,
  habitDueOn,
  habitStreak,
  lessonAttended,
  lessonMark,
  nextLessonMark,
  specialDateIn,
  specialDaysOn,
  specialNote,
  upcomingSpecialDays,
} from '../../src/lib/recurrence.js';
import { dueReminders } from '../../src/lib/reminders.js';
import { normalizeReminders } from '../../src/lib/store.js';
import { parseRoute, SCHEME, stripScheme } from '../../src/lib/routes.js';
import { historyReducer, initHistory } from '../../src/lib/history.js';

const require = createRequire(import.meta.url);
const T = '2026-10-13'; // a Tuesday
const at = (h, m = 0, date = T) => {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m);
};
const run = (state, ...actions) => actions.reduce(reducer, state);
const base = () => ({ ...createInitialData(), categories: [{ id: 'fam', name: 'Family', icon: '🏠', color: '#cf6b8f' }], plans: [] });
const mom = normalizeSpecialDay({ id: 'mom', title: "Mom's birthday", kind: 'birthday', month: 10, day: 14, year: 1974, yearly: true });

test('version 6 data moves to version 7 with special days, habits and the new settings', () => {
  const s = normalizeData({
    version: 6,
    habits: [{ id: 'h', title: 'Water', goal: 8 }],
    habitLog: { [T]: { h: 3, gone: 2 }, nope: { h: 1 } },
    specialDays: [{ title: 'Anniversary', kind: 'anniversary', month: 2, day: 30 }],
  });
  assert.equal(s.version, DATA_VERSION);
  assert.equal(DATA_VERSION, 7);
  assert.equal(s.settings.confirmDeletes, true);
  assert.equal(s.settings.habitsCountForDay, false);
  assert.deepEqual(s.habitLog, { [T]: { h: 3 } });
  // Feb 30 isn't a date: the day falls back to 1; type emoji filled in.
  assert.deepEqual([s.specialDays[0].month, s.specialDays[0].day, s.specialDays[0].emoji, s.specialDays[0].yearly], [2, 1, '💍', true]);
});

test('special days: yearly with age, one-time days, Feb 29 in other years', () => {
  assert.equal(specialDateIn(mom, 2026), '2026-10-14');
  assert.equal(specialNote(mom, '2026-10-14'), 'turns 52');
  assert.deepEqual(specialDaysOn([mom], '2026-10-14').map((s) => s.id), ['mom']);
  const leap = normalizeSpecialDay({ title: 'Leap', month: 2, day: 29, yearly: true });
  assert.equal(specialDateIn(leap, 2027), '2027-02-28');
  assert.equal(specialDateIn(leap, 2028), '2028-02-29');
  const once = normalizeSpecialDay({ title: 'Concert', kind: 'other', month: 11, day: 2, year: 2026, yearly: false });
  assert.equal(specialDateIn(once, 2026), '2026-11-02');
  assert.equal(specialDateIn(once, 2027), null);
  const anniversary = normalizeSpecialDay({ title: 'Wedding', kind: 'anniversary', month: 6, day: 1, year: 2016 });
  assert.equal(specialNote(anniversary, '2026-06-01'), '10 years');
  // No year: no age.
  assert.equal(specialNote(normalizeSpecialDay({ title: 'X', kind: 'birthday', month: 1, day: 1 }), '2026-01-01'), '');
});

test('upcoming special days: soonest first, across the new year, with countdown text', () => {
  const nye = normalizeSpecialDay({ id: 'ny', title: 'New year', kind: 'holiday', month: 1, day: 1 });
  const past = normalizeSpecialDay({ id: 'past', title: 'Earlier', month: 10, day: 1 });
  const list = upcomingSpecialDays([nye, mom, past], T, 90);
  assert.deepEqual(list.map((x) => [x.special.id, x.date, x.inDays, x.note]), [
    ['mom', '2026-10-14', 1, 'turns 52'],
    ['ny', '2027-01-01', 80, ''],
  ]);
  assert.deepEqual([countdownLabel(0), countdownLabel(1), countdownLabel(5)], ['Today', 'Tomorrow', 'In 5 days']);
});

test('special days never count as plans and can be added, edited and deleted (undoably)', () => {
  let h = initHistory(run(base(), { type: 'plan/add', plan: { id: 'p', title: 'Cake', date: '2026-10-14' } }));
  h = historyReducer(h, { type: 'special/add', special: { id: 's', title: "Mom's birthday", kind: 'birthday', month: 10, day: 14, year: 1974 } });
  h = historyReducer(h, { type: 'special/update', id: 's', changes: { emoji: '🌷' } });
  assert.equal(h.data.specialDays[0].emoji, '🌷');
  assert.equal(h.data.plans.length, 1);
  h = historyReducer(h, { type: 'special/delete', id: 's' });
  assert.equal(h.data.specialDays.length, 0);
  h = historyReducer(h, { type: 'history/undo' });
  assert.equal(h.data.specialDays.length, 1);
});

test('special-day reminders: a week before, the day before and on the day, each switchable', () => {
  const s = { ...base(), specialDays: [{ ...mom, categoryId: 'fam' }] };
  const reminders = normalizeReminders({});
  const say = (now, specialDays = s.specialDays) => dueReminders({ ...s, specialDays, reminders, now }).map((r) => `${r.title}: ${r.body}`);
  assert.deepEqual(say(at(9, 0, '2026-10-07')), ["🎂 Mom's birthday: 🏠 Family · In a week · turns 52"]);
  assert.deepEqual(say(at(9)), ["🎂 Mom's birthday: 🏠 Family · Tomorrow · turns 52"]);
  assert.deepEqual(say(at(9, 0, '2026-10-14')), ["🎂 Mom's birthday: 🏠 Family · Today · turns 52"]);
  assert.deepEqual(say(at(7, 30)), []); // not before 08:00
  assert.deepEqual(say(at(9), [{ ...mom, remind: { weekBefore: true, dayBefore: false, onDay: true } }]), []);
  assert.deepEqual(dueReminders({ ...s, reminders: { ...reminders, quiet: { enabled: true, from: '08:00', to: '10:00' } }, now: at(9) }), []);
});

test('habits: due on chosen weekdays from their start; counts are clamped to the goal; streaks', () => {
  let s = run(base(), { type: 'habit/add', habit: { id: 'w', title: 'Water', emoji: '💧', goal: 8, start: '2026-10-01' } });
  s = run(s, { type: 'habit/add', habit: { id: 'g', title: 'Gym', days: [1, 3, 5], start: '2026-10-01' } });
  const gym = s.habits.find((h) => h.id === 'g');
  assert.equal(habitDueOn(gym, '2026-10-12'), true); // Monday
  assert.equal(habitDueOn(gym, T), false); // Tuesday
  assert.equal(habitDueOn(gym, '2026-09-28'), false); // before it started
  s = run(s, { type: 'habit/set', id: 'w', date: T, count: 12 });
  assert.equal(s.habitLog[T].w, 8);
  s = run(s, { type: 'habit/set', id: 'w', date: T, count: 0 });
  assert.equal(s.habitLog[T], undefined);
  // Gym done Mon 5th, Wed 7th, Fri 9th, Mon 12th: a streak of 4 over its own days (today, Tue, isn't a gym day).
  for (const d of ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12']) s = run(s, { type: 'habit/set', id: 'g', date: d, count: 1 });
  assert.deepEqual(habitStreak(gym, s.habitLog, T), { current: 4, best: 4 });
  // Missing Wednesday the 7th breaks it.
  s = run(s, { type: 'habit/set', id: 'g', date: '2026-10-07', count: 0 });
  assert.deepEqual(habitStreak(gym, s.habitLog, T), { current: 2, best: 2 });
  // Deleting a habit removes its history.
  s = run(s, { type: 'habit/delete', id: 'g' });
  assert.ok(Object.values(s.habitLog).every((day) => !('g' in day)));
});

test('habits only complete a day when that setting is on', () => {
  let s = run(base(), { type: 'plan/add', plan: { id: 'p', title: 'Read', date: T } }, { type: 'habit/add', habit: { id: 'w', title: 'Water', goal: 2, start: T } });
  s = run(s, { type: 'plan/setDone', id: 'p', date: T, done: true });
  assert.equal(s.days[T]?.done, true);
  s = run({ ...s, days: {}, settings: { ...s.settings, habitsCountForDay: true } }, { type: 'plan/setDone', id: 'p', date: T, done: false }, { type: 'plan/setDone', id: 'p', date: T, done: true });
  assert.equal(s.days[T]?.done, undefined);
  s = run(s, { type: 'habit/set', id: 'w', date: T, count: 2 });
  assert.equal(s.days[T]?.done, true);
});

test('lessons: a click toggles between your own mark and automatic; "not set" clears it', () => {
  const lesson = { id: 'l', title: 'Fizik', date: '2026-09-01', hour: 8, minute: 30, duration: 40, timetableId: 'tt', repeat: { freq: 'weekly', weekdays: [2] }, doneDates: [], absentDates: [] };
  // A future lesson (later today): not set → attended.
  assert.equal(nextLessonMark(lesson, T, at(7)), true);
  let s = run({ ...base(), plans: [lesson] }, { type: 'lesson/setAttended', id: 'l', date: T, attended: true });
  let p = s.plans[0];
  assert.equal(lessonMark(p, T), 'attended');
  assert.equal(nextLessonMark(p, T, at(7)), null);
  s = run(s, { type: 'lesson/setAttended', id: 'l', date: T, attended: null });
  p = s.plans[0];
  assert.equal(lessonMark(p, T), null);
  assert.equal(lessonAttended(p, T, at(7)), false);
  // A finished lesson: automatic attended → click marks absent.
  assert.equal(nextLessonMark(p, T, at(10)), false);
  s = run(s, { type: 'lesson/setAttended', id: 'l', date: T, attended: false });
  assert.deepEqual([s.plans[0].doneDates, s.plans[0].absentDates], [[], [T]]);
});

test('addresses: cadence:// is the scheme, old planner:// addresses still open', () => {
  assert.equal(SCHEME, 'cadence://');
  assert.deepEqual(parseRoute('cadence://day/2026-10-13'), { page: 'day', date: '2026-10-13' });
  assert.deepEqual(parseRoute('planner://day/2026-10-13'), { page: 'day', date: '2026-10-13' });
  assert.deepEqual(parseRoute('cadence://habits'), { page: 'habits' });
  assert.equal(stripScheme('  Planner://calendar/ '), 'calendar');
});

test('data from the old "Planner" folder moves to the new one, with backups and sounds', () => {
  const { createStorage, migrateFolder } = require('../../electron/storage.cjs');
  const from = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-old-'));
  const to = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cadence-new-')), 'Cadence');
  fs.writeFileSync(path.join(from, 'planner-data.json'), JSON.stringify({ plans: [{ id: 'keep' }] }));
  fs.mkdirSync(path.join(from, 'backups'));
  fs.writeFileSync(path.join(from, 'backups', 'planner-data-2026-10-10.json'), '{}');
  fs.mkdirSync(path.join(from, 'sounds'));
  fs.writeFileSync(path.join(from, 'sounds', 'ding.mp3'), 'x');
  fs.mkdirSync(path.join(from, 'Cache')); // Electron's own files stay behind
  assert.equal(migrateFolder(from, to), true);
  assert.equal(fs.existsSync(path.join(to, 'Cache')), false);
  const storage = createStorage(to);
  assert.deepEqual(storage.load(), { plans: [{ id: 'keep' }] });
  assert.equal(path.basename(storage.file), 'cadence-data.json');
  storage.backupDaily('2026-10-13');
  assert.deepEqual(storage.listBackups(), ['cadence-data-2026-10-13.json', 'planner-data-2026-10-10.json']);
  assert.ok(fs.existsSync(path.join(to, 'sounds', 'ding.mp3')));
  // The old folder is untouched, and a second start doesn't copy again.
  assert.ok(fs.existsSync(path.join(from, 'planner-data.json')));
  assert.equal(migrateFolder(from, to), false);
});

test('the tray popup opens against the panel, at the tray', () => {
  const { popupPosition } = require('../../electron/popupPosition.cjs');
  const size = { width: 380, height: 640 };
  const screen = { x: 0, y: 0, width: 1920, height: 1080 };
  // KDE panel at the bottom, tray position unknown (Linux): bottom-right corner, just above the panel.
  assert.deepEqual(popupPosition({ bounds: screen, workArea: { x: 0, y: 0, width: 1920, height: 1036 } }, null, size), { x: 1534, y: 390, side: 'bottom' });
  // Panel at the top.
  assert.deepEqual(popupPosition({ bounds: screen, workArea: { x: 0, y: 44, width: 1920, height: 1036 } }, null, size), { x: 1534, y: 50, side: 'top' });
  // Panel on the left.
  assert.equal(popupPosition({ bounds: screen, workArea: { x: 60, y: 0, width: 1860, height: 1080 } }, null, size).side, 'left');
  // Windows: centered on the known tray icon, clamped to the screen.
  assert.deepEqual(popupPosition({ bounds: screen, workArea: { x: 0, y: 0, width: 1920, height: 1032 } }, { x: 1700, y: 1040, width: 24, height: 24 }, size), {
    x: 1522,
    y: 386,
    side: 'bottom',
  });
  assert.equal(popupPosition({ bounds: screen, workArea: { x: 0, y: 0, width: 1920, height: 1032 } }, { x: 10, y: 1040, width: 24, height: 24 }, size).x, 6);
});
