import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { reducer, createInitialData, normalizeData, normalizeReminders, DATA_VERSION } from '../../src/lib/store.js';
import { dueReminders, inQuietHours, categoryReminder } from '../../src/lib/reminders.js';
import { buildSearchItems, searchItems } from '../../src/lib/search.js';
import { homeworkFor } from '../../src/lib/recurrence.js';
import { historyReducer, initHistory } from '../../src/lib/history.js';

const require = createRequire(import.meta.url);
const T = '2026-10-05'; // a Monday
const at = (h, m = 0, date = T) => {
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, h, m);
};
const run = (state, ...actions) => actions.reduce(reducer, state);
const base = () => ({ ...createInitialData(), categories: [{ id: 'okul', name: 'Okul', icon: '🏫', color: '#4f9d7e' }, { id: 'gym', name: 'Gym', color: '#d0715b' }], plans: [] });
const R = (changes = {}) => normalizeReminders({ ...changes });

test('version 5 data moves to version 6 with the new settings', () => {
  const s = normalizeData({ version: 5, settings: { theme: 'dark', reminders: { enabled: true, minutes: 15, lessons: true } } });
  assert.equal(s.version, DATA_VERSION);
  assert.equal(DATA_VERSION, 6);
  assert.deepEqual(s.settings.reminders, {
    enabled: true,
    minutes: 15,
    lessons: true,
    sound: 'chime',
    volume: 0.7,
    quiet: { enabled: false, from: '23:00', to: '07:00' },
    perCategory: {},
  });
  assert.deepEqual(s.settings.updates, { auto: true });
  assert.deepEqual(s.settings.background, { tray: false, keepRunning: false, startOnLogin: false, menuLauncher: true });
});

test('notification settings are cleaned up: bad values fall back, removed categories are dropped', () => {
  const r = normalizeReminders(
    {
      sound: '../evil.mp3',
      volume: 3,
      quiet: { enabled: true, from: '25:00', to: '06:30' },
      perCategory: { okul: { enabled: false, sound: 'file:ding.mp3', minutes: 5 }, gone: { enabled: true }, gym: { sound: 'nope', minutes: 999 } },
    },
    new Set(['okul', 'gym']),
  );
  assert.equal(r.sound, 'chime');
  assert.equal(r.volume, 0.7);
  assert.deepEqual(r.quiet, { enabled: true, from: '23:00', to: '06:30' });
  assert.deepEqual(r.perCategory, { okul: { enabled: false, sound: 'file:ding.mp3', minutes: 5 }, gym: { enabled: true, sound: null, minutes: null } });
});

test('quiet hours, including a range past midnight', () => {
  const quiet = { enabled: true, from: '23:00', to: '07:00' };
  assert.equal(inQuietHours(quiet, at(23, 30)), true);
  assert.equal(inQuietHours(quiet, at(3)), true);
  assert.equal(inQuietHours(quiet, at(7)), false);
  assert.equal(inQuietHours(quiet, at(12)), false);
  assert.equal(inQuietHours({ enabled: true, from: '13:00', to: '14:00' }, at(13, 59)), true);
  assert.equal(inQuietHours({ ...quiet, enabled: false }, at(3)), false);
});

test('a category can have its own sound and lead time, or be muted', () => {
  const r = R({ perCategory: { okul: { enabled: true, sound: 'bell', minutes: 5 }, gym: { enabled: false, sound: null, minutes: null } } });
  assert.deepEqual(categoryReminder(r, 'okul'), { enabled: true, sound: 'bell', minutes: 5 });
  assert.deepEqual(categoryReminder(r, 'gym'), { enabled: false, sound: 'chime', minutes: 10 });
  assert.deepEqual(categoryReminder(r, null), { enabled: true, sound: 'chime', minutes: 10 });
});

test('due reminders show the category and plan, and respect per-category choices and quiet hours', () => {
  const s = run(
    base(),
    { type: 'plan/add', plan: { id: 'a', title: 'Math class prep', date: T, hour: 10, minute: 0, categoryId: 'okul' } },
    { type: 'plan/add', plan: { id: 'b', title: 'Leg day', date: T, hour: 10, minute: 5, categoryId: 'gym' } },
    { type: 'plan/add', plan: { id: 'c', title: 'Call', date: T, hour: 10, minute: 8, duration: 30 } },
    { type: 'deadline/add', deadline: { id: 'd', title: 'Essay', due: '2026-10-06', categoryId: 'okul', hour: 23, minute: 59 } },
  );
  const reminders = R({ perCategory: { okul: { enabled: true, sound: 'pop', minutes: 15 }, gym: { enabled: false } } });
  const due = dueReminders({ ...s, reminders, now: at(9, 50) });
  assert.deepEqual(
    due.map((r) => [r.title, r.body, r.sound]),
    [
      ['Math class prep', '🏫 Okul · 10:00 · starts in 10 min', 'pop'],
      ['Essay', '🏫 Okul · Due tomorrow at 23:59', 'pop'],
    ],
  );
  // 10 minutes before "Call" (no category, default lead time); gym stays silent.
  assert.deepEqual(
    dueReminders({ ...s, reminders, now: at(9, 58) }).map((r) => r.body),
    ['🏫 Okul · 10:00 · starts in 2 min', '10:08–10:38 · starts in 10 min', '🏫 Okul · Due tomorrow at 23:59'],
  );
  assert.deepEqual(dueReminders({ ...s, reminders: { ...reminders, quiet: { enabled: true, from: '09:00', to: '11:00' } }, now: at(9, 58) }), []);
  assert.deepEqual(dueReminders({ ...s, reminders: { ...reminders, enabled: false }, now: at(9, 58) }), []);
});

test('a weekly deadline checked off brings in next week’s, once, and undo removes it', () => {
  let h = initHistory(run(base(), { type: 'deadline/add', deadline: { id: 'hw', title: 'Fizik homework', due: T, repeat: 'weekly' } }));
  h = historyReducer(h, { type: 'deadline/update', id: 'hw', changes: { done: true } });
  assert.deepEqual(h.data.deadlines.map((d) => [d.due, d.done, d.repeat]), [
    [T, true, 'weekly'],
    ['2026-10-12', false, 'weekly'],
  ]);
  // Unchecking and checking again doesn't add a second copy.
  h = historyReducer(h, { type: 'deadline/update', id: 'hw', changes: { done: false } });
  h = historyReducer(h, { type: 'deadline/update', id: 'hw', changes: { done: true } });
  assert.equal(h.data.deadlines.length, 2);
  h = historyReducer(h, { type: 'history/undo' });
  h = historyReducer(h, { type: 'history/undo' });
  h = historyReducer(h, { type: 'history/undo' });
  assert.deepEqual(h.data.deadlines.map((d) => [d.due, d.done]), [[T, false]]);
  // One-off deadlines never repeat.
  const s = run(base(), { type: 'deadline/add', deadline: { id: 'x', title: 'Once', due: T } }, { type: 'deadline/update', id: 'x', changes: { done: true } });
  assert.equal(s.deadlines.length, 1);
});

test('homework is due at the next lesson of the same subject', () => {
  let s = base();
  s = reducer(s, {
    type: 'timetable/save',
    timetable: {
      id: 'tt',
      name: 'Okul',
      categoryId: 'okul',
      weekdays: [1, 2, 3, 4, 5],
      periods: [
        { id: 'p1', start: '08:30', end: '09:10' },
        { id: 'p2', start: '09:20', end: '10:00' },
      ],
      // Fizik on Monday 1st period and Thursday 2nd period.
      cells: { '1:p1': 'Fizik', '4:p2': 'Fizik', '2:p1': 'Kimya' },
      startDate: '2026-09-01',
    },
  });
  const mondayFizik = s.plans.find((p) => p.title === 'Fizik' && p.hour === 8);
  assert.deepEqual(homeworkFor(s.plans, mondayFizik, T), { title: 'Fizik homework', due: '2026-10-08', hour: 9, minute: 20, categoryId: 'okul' });
  const kimya = s.plans.find((p) => p.title === 'Kimya');
  assert.equal(homeworkFor(s.plans, kimya, '2026-10-06').due, '2026-10-13');
});

test('quick search finds pages, plans, categories and deadlines, best matches first', () => {
  const s = run(
    base(),
    { type: 'plan/add', plan: { id: 'a', title: 'Physics revision', date: T, hour: 14, categoryId: 'okul' } },
    { type: 'plan/add', plan: { id: 'b', title: 'Buy physio tape', date: '2026-10-07' } },
    { type: 'deadline/add', deadline: { id: 'd', title: 'Physics report', due: '2026-10-09' } },
  );
  const items = buildSearchItems(s, T);
  const labels = (q) => searchItems(items, q).map((i) => `${i.kind}:${i.label}`);
  assert.deepEqual(labels('physics'), ['plan:Physics revision', 'deadline:Physics report']);
  assert.deepEqual(labels('phys').slice(0, 3), ['plan:Physics revision', 'deadline:Physics report', 'plan:Buy physio tape']);
  assert.equal(labels('settings')[0], 'page:Settings');
  assert.equal(labels('okul')[0], 'category:Okul');
  // Keywords: "sound" finds Settings; an empty query lists pages and actions.
  assert.ok(labels('sound').includes('page:Settings'));
  assert.ok(searchItems(items, '').every((i) => i.kind === 'page' || i.kind === 'action'));
  // A date opens that day.
  const date = searchItems(items, '2026-10-12')[0];
  assert.equal(date.path, 'day/2026-10-12');
  assert.equal(searchItems(items, 'physics')[0].path, `day/${T}`);
  assert.equal(searchItems(items, 'report')[0].path, 'calendar/2026-10-09');
});

test('imported sounds: copied in, listed, served only by exact name, removed', () => {
  const { createSounds } = require('../../electron/sounds.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-sounds-'));
  const src = fs.mkdtempSync(path.join(os.tmpdir(), 'planner-src-'));
  fs.writeFileSync(path.join(src, 'ding.mp3'), 'x');
  fs.writeFileSync(path.join(src, 'notes.txt'), 'x');
  const sounds = createSounds(dir);
  const first = sounds.importFiles([path.join(src, 'ding.mp3'), path.join(src, 'notes.txt')]);
  assert.deepEqual(first.added, ['ding.mp3']);
  assert.equal(first.skipped[0].reason, 'not a sound file');
  assert.deepEqual(sounds.importFiles([path.join(src, 'ding.mp3')]).added, ['ding (2).mp3']);
  assert.deepEqual(sounds.list(), ['ding (2).mp3', 'ding.mp3']);
  assert.equal(sounds.fileFor('ding.mp3'), path.join(dir, 'sounds', 'ding.mp3'));
  assert.equal(sounds.fileFor('../planner-data.json'), null);
  assert.equal(sounds.fileFor('missing.mp3'), null);
  assert.deepEqual(sounds.remove('ding.mp3'), ['ding (2).mp3']);
});
