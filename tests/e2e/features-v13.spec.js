import { test, expect } from '@playwright/test';
import { launchApp, tempDataDir, readData, writeData } from './helpers.js';
import { addDays, todayKey, weekday } from '../../src/lib/dates.js';
import { normalizeData, reducer } from '../../src/lib/store.js';

let app;
let page;
let dataDir;

test.afterEach(async () => {
  await app?.close();
});

const today = todayKey();
const P = (o) => ({ notes: '', categoryId: null, hour: null, repeat: null, doneDates: [], skipDates: [], ...o });
const plan = (title) => page.getByTestId('plan').filter({ hasText: title });
const check = (title) => page.getByRole('checkbox', { name: `Mark "${title}" complete` });
const dialog = () => page.getByRole('dialog');
const sidebar = () => page.getByRole('navigation', { name: 'Sidebar' });
const menuItem = (name) => page.getByRole('menuitem', { name });

async function start(data) {
  dataDir = tempDataDir();
  if (data) writeData(dataDir, data);
  ({ app, page } = await launchApp(dataDir));
}

async function goTo(address) {
  await page.getByLabel('Address').fill(address);
  await page.getByLabel('Address').press('Enter');
}

const center = async (locator) => {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

test('day planner scrolls as one page, and you can scroll with the wheel while dragging a plan', async () => {
  await start(normalizeData({ plans: [P({ id: 'a', title: 'Night owl', date: today, hour: 1 })] }));
  await goTo(`planner://day/${today}`);
  // The hours are part of the page, not a separate scroll box.
  const grid = page.locator('.hour-grid');
  expect(await grid.evaluate((el) => el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  await page.locator('.page').evaluate((el) => (el.scrollTop = 0));

  const from = await center(plan('Night owl'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 10, from.y + 10, { steps: 3 });
  await expect(page.getByTestId('drag-ghost')).toHaveText('Night owl');
  // Scroll the page with the mouse wheel while still holding the plan.
  await page.mouse.wheel(0, 3000);
  await expect.poll(() => page.locator('.page').evaluate((el) => el.scrollTop)).toBeGreaterThan(500);
  const target = await center(page.getByTestId('hour-22'));
  await page.mouse.move(target.x, target.y, { steps: 6 });
  await expect(page.getByTestId('hour-22')).toHaveClass(/drop-target/);
  await page.mouse.up();
  await expect(page.getByTestId('hour-22').getByTestId('plan')).toContainText('Night owl');
  // The check mark still works right after a drop.
  await check('Night owl').click();
  await expect(check('Night owl')).toHaveAttribute('aria-checked', 'true');
});

test('drag a plan onto another day in the calendar', async () => {
  await start(normalizeData({ plans: [P({ id: 'a', title: 'Laundry', date: today })] }));
  await sidebar().getByRole('link', { name: 'Calendar' }).click();
  const other = addDays(today, 7);
  const from = await center(page.getByTestId('selected-day').getByTestId('plan'));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const to = await center(page.getByTestId(`cell-${other}`));
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => readData(dataDir).plans[0].date).toBe(other);
});

test('right-click menus for plans, calendar days, categories and lessons', async () => {
  await start(normalizeData({ categories: [{ id: 'w', name: 'Work', color: '#4f9d7e' }], plans: [P({ id: 'a', title: 'Report', date: today })] }));
  await sidebar().getByRole('link', { name: 'Day Planner' }).click();

  await plan('Report').click({ button: 'right' });
  await menuItem('Duplicate').click();
  await expect(plan('Report')).toHaveCount(2);
  await plan('Report').first().click({ button: 'right' });
  await menuItem('Copy to tomorrow').click();
  await expect.poll(() => readData(dataDir).plans.filter((p) => p.date === addDays(today, 1)).length).toBe(1);

  // Category submenu.
  await plan('Report').first().click({ button: 'right' });
  await menuItem('Category').click();
  await menuItem('Work').click();
  await expect(plan('Report').first()).toContainText('Work');

  // Delete through the menu, then undo through the menu.
  await plan('Report').first().click({ button: 'right' });
  await menuItem('Delete…').click();
  await dialog().getByRole('button', { name: 'Delete' }).click();
  await expect(plan('Report')).toHaveCount(1);
  await plan('Report').click({ button: 'right' });
  await menuItem(/Undo/).click();
  await expect(plan('Report')).toHaveCount(2);

  // Calendar day menu.
  await sidebar().getByRole('link', { name: 'Calendar' }).click();
  await page.getByTestId(`cell-${today}`).click({ button: 'right' });
  await menuItem('Mark day complete').click();
  await expect(page.getByTestId(`cell-${today}`).locator('.day-stamp')).toBeVisible();
  // ... which also checked its plans.
  await expect.poll(() => readData(dataDir).plans.filter((p) => p.date === today).every((p) => p.doneDates.includes(today))).toBe(true);
  await page.getByTestId(`cell-${today}`).click({ button: 'right' });
  await menuItem('Add plan…').click();
  await expect(dialog().getByLabel('Date')).toHaveValue(today);
  await dialog().getByRole('button', { name: 'Cancel' }).click();

  // Category menu.
  await sidebar().getByRole('link', { name: /Work/ }).click({ button: 'right' });
  await menuItem('Open in new tab').click();
  await expect(page.getByTestId('tab')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
});

test('lessons check themselves once they are over; click to mark absent', async () => {
  let data = normalizeData({ categories: [{ id: 's', name: 'Okul', color: '#4f9d7e' }] });
  const wd = weekday(today);
  data = reducer(data, {
    type: 'timetable/save',
    timetable: {
      id: 'tt',
      name: 'Okul',
      categoryId: 's',
      weekdays: [wd],
      periods: [
        { id: 'early', start: '00:00', end: '00:01' },
        { id: 'late', start: '23:58', end: '23:59' },
      ],
      cells: { [`${wd}:early`]: 'Matematik', [`${wd}:late`]: 'Fizik' },
      startDate: today,
    },
  });
  await start(data);
  const lessons = page.getByTestId('lessons');
  const lesson = (name) => lessons.getByRole('checkbox', { name: new RegExp(`^${name} `) });
  await expect(lesson('Matematik')).toHaveAttribute('aria-checked', 'true'); // already over
  await expect(lesson('Fizik')).toHaveAttribute('aria-checked', 'false'); // not yet
  await lesson('Matematik').click();
  await expect(lesson('Matematik')).toHaveAttribute('aria-checked', 'false');
  await expect(lesson('Matematik')).toHaveClass(/absent/);
  await lesson('Matematik').click();
  await expect(lesson('Matematik')).toHaveAttribute('aria-checked', 'true');

  // The category shows its lessons in the sidebar count and on its dashboard tile.
  await expect(sidebar().getByRole('link', { name: /Okul/ }).locator('.count')).toHaveText('2');
  await expect(page.locator('.category-tile').filter({ hasText: 'Okul' })).toContainText('2 lessons today');
});

test('week view: blocks by time, add from a slot, drag to another day', async () => {
  await start(normalizeData({ plans: [P({ id: 'a', title: 'Study', date: today, hour: 10, minute: 0, duration: 90 })] }));
  await sidebar().getByRole('link', { name: 'Week' }).click();
  const block = page.getByTestId('week-plan').filter({ hasText: 'Study' });
  await expect(block).toContainText('10:00–11:30');
  await expect(page.getByTestId(`week-${today}`).getByTestId('week-plan')).toHaveCount(1);

  // Click an empty slot to add a plan there.
  await page.getByTestId(`slot-${today}-14`).click();
  await expect(dialog().getByLabel('Start time')).toHaveValue('14:00');
  await dialog().getByLabel('Title').fill('Call mom');
  await dialog().getByRole('button', { name: 'Add plan' }).click();
  await expect(page.getByTestId('week-plan').filter({ hasText: 'Call mom' })).toBeVisible();

  // Drag "Study" to 16:00 on another day of the same week.
  const days = await page.locator('[data-testid^="week-2"]').evaluateAll((els) => els.map((e) => e.dataset.testid.slice(5)));
  const other = days.find((d) => d !== today);
  const from = await center(block);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const to = await center(page.getByTestId(`slot-${other}-16`));
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await page.mouse.up();
  await expect.poll(() => readData(dataDir).plans.find((p) => p.id === 'a')).toMatchObject({ date: other, hour: 16 });
});

test('checklists inside a plan: ticking every item completes the plan', async () => {
  await start();
  await page.getByRole('button', { name: '+ New plan' }).click();
  await dialog().getByLabel('Title').fill('Exam prep');
  await dialog().getByLabel('Add checklist item').fill('Chapter 1');
  await dialog().getByLabel('Add checklist item').press('Enter');
  await dialog().getByLabel('Add checklist item').fill('Chapter 2');
  await dialog().getByLabel('Add checklist item').press('Enter');
  await dialog().getByRole('button', { name: 'Add plan' }).click();

  const badge = plan('Exam prep').getByRole('button', { name: /Checklist/ });
  await expect(badge).toHaveText('☑ 0/2');
  await badge.click();
  await plan('Exam prep').getByLabel('Chapter 1').check();
  await expect(check('Exam prep')).toHaveAttribute('aria-checked', 'false');
  await plan('Exam prep').getByLabel('Chapter 2').check();
  await expect(check('Exam prep')).toHaveAttribute('aria-checked', 'true');
  await expect(badge).toHaveText('☑ 2/2');
  // It was the day's only plan, so the day is complete too.
  await expect(page.getByRole('checkbox', { name: 'Mark today complete' })).toHaveAttribute('aria-checked', 'true');
});

test('opening tabs never shows a vertical scrollbar in the tab strip', async () => {
  await start();
  const strip = page.locator('.tabbar');
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press('Control+t');
    expect(await strip.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true);
  }
  expect(await strip.evaluate((el) => getComputedStyle(el).overflowY)).toBe('hidden');
});
