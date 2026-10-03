import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { launchApp, tempDataDir, readData, writeData, pointerDrag } from './helpers.js';
import { addDays, todayKey, weekday } from '../../src/lib/dates.js';
import { normalizeData, reducer } from '../../src/lib/store.js';

let app;
let page;
let dataDir;

test.afterEach(async () => {
  await app?.close();
});

const plan = (title) => page.getByTestId('plan').filter({ hasText: title });
const check = (title) => page.getByRole('checkbox', { name: `Mark "${title}" complete` });
const dialog = () => page.getByRole('dialog');
const sidebar = () => page.getByRole('navigation', { name: 'Sidebar' });
const tabTitles = () => page.getByTestId('tab').locator('.tab-title').allTextContents();
const today = todayKey();
const P = (o) => ({ notes: '', categoryId: null, hour: null, repeat: null, doneDates: [], skipDates: [], ...o });

async function start(data, env) {
  dataDir = tempDataDir();
  if (data) writeData(dataDir, data);
  ({ app, page } = await launchApp(dataDir, env));
}

async function goTo(address) {
  await page.getByLabel('Address').fill(address);
  await page.getByLabel('Address').press('Enter');
}

test('lessons are shown separately and never count as plans', async () => {
  let monday = today;
  while (weekday(monday) !== 1) monday = addDays(monday, 1);
  let data = normalizeData({ categories: [{ id: 'school', name: 'Okul', color: '#4f9d7e' }] });
  data = reducer(data, {
    type: 'timetable/save',
    timetable: {
      id: 'tt',
      name: 'Okul',
      categoryId: 'school',
      periods: [{ id: 'a', start: '08:30', end: '09:10' }, { id: 'b', start: '09:20', end: '10:00' }],
      cells: { '1:a': 'Matematik', '1:b': 'Fizik' },
      startDate: today,
    },
  });
  data = reducer(data, { type: 'plan/add', plan: { id: 'hw', title: 'Homework', date: monday, categoryId: 'school' } });
  await start(data);

  await goTo(`planner://day/${monday}`);
  const lessons = page.getByTestId('lessons');
  await expect(lessons.getByRole('checkbox')).toHaveCount(2);
  await expect(page.getByTestId('plan')).toHaveCount(1);
  await expect(page.getByText('0 of 1 plans done')).toBeVisible();
  // Attending a lesson doesn't change plan progress.
  await lessons.getByRole('checkbox', { name: /^Matematik/ }).click();
  await expect(lessons).toContainText('1/2 attended');
  await expect(page.getByText('0 of 1 plans done')).toBeVisible();

  // The calendar counts only the plan too, and shows lessons in the day panel.
  await sidebar().getByRole('link', { name: 'Calendar' }).click();
  if (monday.slice(0, 7) !== today.slice(0, 7)) await page.getByRole('link', { name: 'Next month' }).click();
  await expect(page.getByTestId(`cell-${monday}`).locator('.cell-count')).toHaveText('0/1');
  await page.getByTestId(`cell-${monday}`).click();
  await expect(page.getByTestId('selected-day').getByTestId('lessons')).toBeVisible();
  // The sidebar count for the category includes its lessons (1 plan + 2 lessons).
  await expect(sidebar().getByRole('link', { name: /Okul/ }).locator('.count')).toHaveText('3');
});

test('calendar day panel keeps plans in time order, and stamps completed days', async () => {
  await start(
    normalizeData({
      plans: [
        P({ id: 'a', title: 'Laundry', date: today, hour: 9 }),
        P({ id: 'b', title: 'Bills', date: today, hour: 8, doneDates: [today] }),
        P({ id: 'c', title: 'Gym', date: today, hour: 18 }),
      ],
    }),
  );
  await sidebar().getByRole('link', { name: 'Calendar' }).click();
  const panel = page.getByTestId('selected-day');
  const titles = () => panel.getByTestId('plan').locator('.plan-title').allTextContents();
  expect(await titles()).toEqual(['Bills', 'Laundry', 'Gym']);
  // Checking a plan crosses it out in place: nothing moves.
  await panel.getByRole('checkbox', { name: 'Mark "Laundry" complete' }).click();
  await expect(panel.getByTestId('plan').filter({ hasText: 'Laundry' })).toHaveClass(/done/);
  expect(await titles()).toEqual(['Bills', 'Laundry', 'Gym']);
  await panel.getByRole('checkbox', { name: 'Mark "Gym" complete' }).click();
  // All plans done: the day is stamped automatically.
  await expect(page.getByTestId(`cell-${today}`).locator('.day-stamp')).toBeVisible();
  // The month stats stay pinned at the bottom of the window.
  const stats = await page.getByTestId('month-stats').boundingBox();
  const viewport = page.viewportSize() ?? (await page.evaluate(() => ({ height: window.innerHeight })));
  expect(stats.y + stats.height).toBeLessThanOrEqual(viewport.height);
});

test('history shows past days, and unfinished plans can be moved to today (with undo)', async () => {
  const y = addDays(today, -1);
  const y2 = addDays(today, -2);
  await start(
    normalizeData({
      plans: [
        P({ id: 'a', title: 'Call the bank', date: y }),
        P({ id: 'b', title: 'Clean room', date: y2, doneDates: [y2] }),
        P({ id: 'c', title: 'Read chapter 4', date: y2 }),
      ],
      days: { [y2]: { done: true } },
    }),
  );

  const unfinished = page.getByTestId('unfinished');
  await expect(unfinished).toContainText('Call the bank');
  await expect(unfinished).toContainText('Read chapter 4');
  await unfinished.getByTestId('plan').filter({ hasText: 'Call the bank' }).locator('..').getByRole('button', { name: 'Move to today' }).click();
  await expect(page.locator('.today-card')).toContainText('Call the bank');
  await expect(page.getByTestId('toast')).toHaveCount(0); // no pop-ups
  await page.locator('body').click({ position: { x: 700, y: 120 } });
  await page.keyboard.press('Control+z');
  await expect(page.locator('.today-card')).not.toContainText('Call the bank');
  await expect(unfinished).toContainText('Call the bank');

  await sidebar().getByRole('link', { name: 'History' }).click();
  const day2 = page.getByTestId(`history-${y2}`);
  await expect(day2).toContainText('✓ 1');
  await expect(day2).toContainText('✗ 1');
  await day2.getByRole('button').first().click();
  await expect(day2).toContainText('Not done · 1');
  await expect(day2).toContainText('Read chapter 4');
  await page.getByRole('radio', { name: 'With missed plans' }).click();
  await expect(page.getByTestId(`history-${y}`)).toBeVisible();
  await page.getByRole('radio', { name: 'All done' }).click();
  await expect(page.getByTestId(`history-${y}`)).toHaveCount(0);

  await sidebar().getByRole('link', { name: 'Dashboard' }).click();
  await page.getByRole('button', { name: 'Move all to today' }).click();
  await expect(page.getByTestId('unfinished')).toHaveCount(0);
});

test('category page: customize icon, description and color; sections, search and stats', async () => {
  const cat = { id: 'p', name: 'Personal', color: '#5b7fd6' };
  await start(
    normalizeData({
      categories: [cat],
      plans: [
        P({ id: 'a', title: 'Buy gift', date: addDays(today, 2), categoryId: 'p' }),
        P({ id: 'b', title: 'Book flights', date: addDays(today, 3), categoryId: 'p' }),
        P({ id: 'c', title: 'Renew passport', date: today, categoryId: 'p', doneDates: [today] }),
        P({ id: 'd', title: 'Return library book', date: addDays(today, -3), categoryId: 'p' }),
      ],
    }),
  );
  await sidebar().getByRole('link', { name: /Personal/ }).click();
  const stats = page.getByTestId('category-stats');
  await expect(stats).toContainText('upcoming');

  await page.getByRole('button', { name: 'Customize' }).click();
  await page.getByRole('radio', { name: 'Icon 📚' }).click();
  await expect(sidebar().getByRole('link', { name: /Personal/ })).toContainText('📚');
  await page.getByLabel('Custom color').fill('#ff8800');
  await expect.poll(() => readData(dataDir).categories[0].color).toBe('#ff8800');
  await page.getByLabel('Category description').fill('Life admin');
  await page.getByLabel('Category description').blur();
  await expect.poll(() => readData(dataDir).categories[0].description).toBe('Life admin');

  // Everything is visible at once, grouped into sections.
  const titles = (id) => page.getByTestId(id).getByTestId('plan').locator('.plan-title');
  await expect(page.locator('.category-page').getByRole('tab')).toHaveCount(0);
  await expect(titles('section-overdue')).toHaveText(['Return library book']);
  await expect(titles('section-today')).toHaveText(['Renew passport']);
  await expect(titles('section-upcoming')).toHaveText(['Buy gift', 'Book flights']);
  await expect(page.getByTestId('section-upcoming').locator('.date-group')).toHaveCount(2);
  // Done plans from other days are tucked away in a collapsed section.
  await expect(page.getByTestId('section-done')).toHaveCount(0);
  await check('Return library book').click();
  await expect(page.getByTestId('section-overdue')).toHaveCount(0);
  const doneToggle = page.getByTestId('section-done').getByRole('button', { name: /Done/ });
  await expect(doneToggle).toHaveAttribute('aria-expanded', 'false');
  await doneToggle.click();
  await expect(titles('section-done')).toHaveText(['Return library book']);

  // Search filters every section.
  await page.getByLabel('Search plans').fill('flight');
  await expect(titles('section-upcoming')).toHaveText(['Book flights']);
  await expect(page.getByTestId('section-today')).toHaveCount(0);
  await page.getByLabel('Search plans').fill('zzz');
  await expect(page.getByText('Nothing matches your search.')).toBeVisible();
});

test('undo with Ctrl+Z and the right-click Undo', async () => {
  await start(normalizeData({ plans: [P({ id: 'a', title: 'Water plants', date: today }), P({ id: 'b', title: 'Feed cat', date: today })] }));
  await check('Water plants').click();
  await expect(page.getByTestId('toast')).toHaveCount(0);
  await page.locator('body').click({ position: { x: 600, y: 140 } });
  await page.keyboard.press('Control+z');
  await expect(check('Water plants')).toHaveAttribute('aria-checked', 'false');
  await page.keyboard.press('Control+Shift+z');
  await expect(check('Water plants')).toHaveAttribute('aria-checked', 'true');

  await page.getByRole('button', { name: 'Delete "Water plants"' }).click();
  await dialog().getByRole('button', { name: 'Delete' }).click();
  await expect(plan('Water plants')).toHaveCount(0);
  await plan('Feed cat').click({ button: 'right' });
  await page.getByRole('menuitem', { name: /Undo/ }).click();
  await expect(plan('Water plants')).toBeVisible();
  await expect.poll(() => readData(dataDir).plans.length).toBe(2);
});

test('tabs: pin, close others, reopen closed tab, smooth dragging stays in the strip', async () => {
  await start();
  const tabs = page.getByTestId('tab');
  await page.getByRole('button', { name: 'New tab' }).click();
  await sidebar().getByRole('link', { name: 'Calendar' }).click();
  await page.getByRole('button', { name: 'New tab' }).click();
  await sidebar().getByRole('link', { name: 'History' }).click();
  const month = await tabs.nth(1).locator('.tab-title').innerText();
  expect(await tabTitles()).toEqual(['Dashboard', month, 'History']);

  // Dragging far below the strip still keeps the tab in line. (Wait for the new-tab
  // animation to finish first, so the measured positions are the final ones.)
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
  const b0 = await tabs.nth(0).boundingBox();
  const b2 = await tabs.nth(2).boundingBox();
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2);
  await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2 - 20, b2.y + 200, { steps: 5 });
  const mid = await tabs.nth(2).boundingBox();
  expect(Math.abs(mid.y - b2.y)).toBeLessThan(2);
  await page.mouse.move(b0.x + 10, b2.y + 200, { steps: 8 });
  await page.mouse.up();
  await expect.poll(tabTitles).toEqual(['History', 'Dashboard', month]);

  // Pin from the right-click menu: pinned tabs show only an icon and stay left.
  await tabs.nth(2).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Pin' }).click();
  await expect(tabs.nth(0)).toHaveClass(/pinned/);
  await expect(tabs.nth(0).locator('.tab-title')).toHaveCount(0);

  await tabs.nth(1).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Close other tabs' }).click();
  await expect(tabs).toHaveCount(2); // the pinned tab survives
  await page.keyboard.press('Control+Shift+T');
  await expect(tabs).toHaveCount(3);
  await tabs.nth(1).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(tabs).toHaveCount(4);
});

test('reminders notify shortly before a timed plan starts', async () => {
  const now = new Date();
  const soon = new Date(now.getTime() + 5 * 60 * 1000);
  test.skip(soon.getDate() !== now.getDate(), 'too close to midnight');
  await start();
  await page.evaluate(() => {
    window.__notes = [];
    window.Notification = class {
      constructor(title, options) {
        window.__notes.push(`${title}: ${options.body}`);
      }
    };
  });
  await page.getByRole('button', { name: '+ New plan' }).click();
  await dialog().getByLabel('Title').fill('Team call');
  await dialog().getByLabel('All day').uncheck();
  const hhmm = `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`;
  await dialog().getByLabel('Start time').fill(hhmm);
  await dialog().getByRole('button', { name: 'Add plan' }).click();
  await expect.poll(() => page.evaluate(() => window.__notes)).toEqual([expect.stringMatching(/^Team call: \d\d:\d\d · starts in [45] min/)]);
});

test('backups: export, import, daily copies, and data from a newer version is protected', async () => {
  const exportPath = path.join(tempDataDir(), 'backup.json');
  await start(normalizeData({ plans: [P({ id: 'a', title: 'Keep me', date: today })] }), {
    PLANNER_TEST_EXPORT_PATH: exportPath,
    PLANNER_TEST_IMPORT_PATH: exportPath,
  });
  // A daily copy was made when the app started.
  expect(fs.readdirSync(path.join(dataDir, 'backups')).some((n) => n.startsWith('planner-data-'))).toBe(true);

  await sidebar().getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Export backup…' }).click();
  await expect(page.locator('.settings-message')).toContainText('Backup saved');
  expect(JSON.parse(fs.readFileSync(exportPath, 'utf8')).plans[0].title).toBe('Keep me');

  await sidebar().getByRole('link', { name: 'Dashboard' }).click();
  await page.getByRole('button', { name: 'Delete "Keep me"' }).click();
  await dialog().getByRole('button', { name: 'Delete' }).click();
  await expect.poll(() => readData(dataDir).plans.length).toBe(0);

  await sidebar().getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Import backup…' }).click();
  await dialog().getByRole('button', { name: 'Import' }).click();
  await expect.poll(() => readData(dataDir).plans.map((p) => p.title)).toEqual(['Keep me']);
  await app.close();

  // Data saved by a future version is shown but never overwritten by this one.
  const future = { ...readData(dataDir), version: 99 };
  writeData(dataDir, future);
  const before = fs.readFileSync(path.join(dataDir, 'planner-data.json'), 'utf8');
  ({ app, page } = await launchApp(dataDir));
  await expect(page.getByText('saved by a newer version')).toBeVisible();
  await sidebar().getByRole('link', { name: 'Dashboard' }).click();
  await page.getByLabel('Add a plan for today').fill('Should not be saved');
  await page.getByLabel('Add a plan for today').press('Enter');
  await page.waitForTimeout(500);
  expect(fs.readFileSync(path.join(dataDir, 'planner-data.json'), 'utf8')).toBe(before);
});

test('dashboard shows categories as tiles and hides empty routines', async () => {
  await start();
  await expect(page.locator('.category-tile')).toHaveCount(3);
  await expect(page.getByText('Repeating plans')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Routines' })).toHaveCount(0);
  await page.locator('.category-tile').first().click();
  await expect(page.getByTestId('page').getByRole('heading', { level: 1 })).toHaveText('Personal');
});
