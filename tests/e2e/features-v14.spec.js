import { test, expect } from '@playwright/test';
import { launchApp, tempDataDir, readData, writeData, pointerDrag } from './helpers.js';
import { addDays, todayKey } from '../../src/lib/dates.js';
import { normalizeData } from '../../src/lib/store.js';

let app;
let page;
let dataDir;

test.afterEach(async () => {
  await app?.close();
});

const today = todayKey();
const P = (o) => ({ notes: '', categoryId: null, hour: null, repeat: null, doneDates: [], skipDates: [], ...o });
const plan = (title) => page.getByTestId('plan').filter({ hasText: title });
const dialog = () => page.getByRole('dialog');
const sidebar = () => page.getByRole('navigation', { name: 'Sidebar' });
const menuItem = (name) => page.getByRole('menuitem', { name });
const center = async (locator) => {
  const b = await locator.boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

async function start(data) {
  dataDir = tempDataDir();
  if (data) writeData(dataDir, data);
  ({ app, page } = await launchApp(dataDir));
}

async function goTo(address) {
  await page.getByLabel('Address').fill(address);
  await page.getByLabel('Address').press('Enter');
}

test('week view → Month view opens the month of that week with its day selected', async () => {
  await start();
  await goTo('planner://week/2026-03-02');
  await page.getByRole('link', { name: 'Month view' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('March 2026');
  await expect(page.getByTestId('cell-2026-03-05')).toHaveAttribute('aria-selected', 'true');
  // A week across two months opens the month its Thursday is in.
  await goTo('planner://week/2026-03-30');
  await page.getByRole('link', { name: 'Month view' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('April 2026');
  await expect(page.getByTestId('cell-2026-04-02')).toHaveAttribute('aria-selected', 'true');
  // The current week opens today.
  await sidebar().getByRole('link', { name: 'Week' }).click();
  await page.getByRole('link', { name: 'Month view' }).click();
  await expect(page.getByTestId(`cell-${today}`)).toHaveAttribute('aria-selected', 'true');
});

test('the Day Planner opens at the top; "Now" scrolls to the current hour', async () => {
  await start(normalizeData({ plans: [P({ id: 'a', title: 'Late', date: today, hour: 23 })] }));
  await sidebar().getByRole('link', { name: 'Day Planner' }).click();
  await expect(page.getByTestId('day-heading')).toBeInViewport();
  expect(await page.locator('.page').evaluate((el) => el.scrollTop)).toBe(0);
  const hour = new Date().getHours();
  await page.getByRole('button', { name: 'Now' }).click();
  if (hour >= 6) await expect.poll(() => page.locator('.page').evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  await expect(page.getByTestId(`hour-${hour}`)).toBeInViewport();
  // No "Now" button on other days.
  await page.getByRole('link', { name: 'Next day' }).click();
  await expect(page.getByRole('button', { name: 'Now' })).toHaveCount(0);
});

test('plans at the same time sit side by side; 03:05 gets a line of its own', async () => {
  await start(
    normalizeData({
      plans: [
        P({ id: 'a', title: 'Math homework', date: today, hour: 10, minute: 0 }),
        P({ id: 'b', title: 'Read chapter', date: today, hour: 10, minute: 0 }),
        P({ id: 'c', title: 'Walk', date: today, hour: 5, minute: 0 }),
      ],
    }),
  );
  await sidebar().getByRole('link', { name: 'Day Planner' }).click();
  const a = await plan('Math homework').boundingBox();
  const b = await plan('Read chapter').boundingBox();
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);
  expect(a.width).toBeLessThan(600);

  // Add a plan at 03:05: it gets a 03:05 line under 03:00.
  await page.getByRole('button', { name: 'Add plan at 03:00' }).click();
  await dialog().getByLabel('Title').fill('Feed cat');
  await dialog().getByLabel('Start time').fill('03:05');
  await dialog().getByRole('button', { name: 'Add plan' }).click();
  await expect(page.getByTestId('time-03-05').getByTestId('plan')).toContainText('Feed cat');
  await expect(page.getByTestId('hour-3').getByTestId('plan')).toHaveCount(0);
  const hour3 = await page.getByTestId('hour-3').boundingBox();
  const row = await page.getByTestId('time-03-05').boundingBox();
  expect(row.y).toBeGreaterThanOrEqual(hour3.y + hour3.height - 1);

  // Dropping onto the 03:05 line starts the plan at 03:05.
  await pointerDrag(page, await center(plan('Walk')), await center(page.getByTestId('time-03-05').locator('.hour-label')));
  await expect.poll(() => readData(dataDir).plans.find((p) => p.id === 'c')).toMatchObject({ hour: 3, minute: 5 });
  await expect(page.getByTestId('time-03-05').getByTestId('plan')).toHaveCount(2);
});

test('edit and delete buttons are large and always visible', async () => {
  await start(normalizeData({ plans: [P({ id: 'a', title: 'Essay', date: today })] }));
  for (const name of ['Edit "Essay"', 'Delete "Essay"']) {
    const button = page.getByRole('button', { name });
    await expect(button).toBeVisible();
    expect(await button.evaluate((el) => getComputedStyle(el.closest('.plan-actions')).opacity)).toBe('1');
    const box = await button.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(30);
    expect(await button.locator('svg').evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(16);
  }
});

test('deadlines: add from the calendar, see them everywhere until done, edit any time', async () => {
  await start(normalizeData({ categories: [{ id: 's', name: 'School', color: '#4f9d7e' }] }));
  const due = addDays(today, 3);
  await goTo(`planner://calendar/${due}`);
  await page.getByTestId(`cell-${due}`).click({ button: 'right' });
  await menuItem('Add deadline…').click();
  await expect(dialog().getByLabel('Due date')).toHaveValue(due);
  await dialog().getByLabel('Deadline title').fill('Physics report');
  await dialog().getByLabel('Deadline category').selectOption('s');
  await dialog().getByRole('button', { name: 'Add deadline' }).click();
  await expect(page.getByTestId(`cell-${due}`).getByTestId('cell-flag')).toBeVisible();
  await expect(page.getByTestId('selected-day')).toContainText('Physics report');
  await expect.poll(() => readData(dataDir).deadlines).toMatchObject([{ title: 'Physics report', due, categoryId: 's', done: false }]);

  // The Dashboard counts down to it.
  await sidebar().getByRole('link', { name: 'Dashboard' }).click();
  const card = page.getByTestId('deadlines');
  await expect(card).toContainText('Physics report');
  await expect(card.getByTestId('days-left')).toHaveText('3 days left');

  // It shows on every day until it's due, but not after.
  await sidebar().getByRole('link', { name: 'Day Planner' }).click();
  await expect(page.getByTestId('due-soon')).toContainText('Physics report');
  await goTo(`planner://day/${addDays(due, 1)}`);
  await expect(page.getByTestId('due-soon')).toHaveCount(0);

  // And in its category's page.
  await sidebar().getByRole('link', { name: /School/ }).click();
  await expect(page.getByTestId('section-deadlines')).toContainText('Physics report');

  // Edit it: move it to tomorrow.
  await sidebar().getByRole('link', { name: 'Dashboard' }).click();
  await card.getByRole('button', { name: 'Edit deadline "Physics report"' }).click();
  await dialog().getByLabel('Due date').fill(addDays(today, 1));
  await dialog().getByRole('button', { name: 'Save' }).click();
  await expect(card.getByTestId('days-left')).toHaveText('Tomorrow');

  // Done: it stays on the Dashboard, crossed out, so a misclick is one click to undo.
  const doneBox = card.getByRole('checkbox', { name: 'Mark deadline "Physics report" done' });
  await doneBox.click();
  await expect.poll(() => readData(dataDir).deadlines[0].done).toBe(true);
  await expect(card.getByTestId('deadline')).toHaveClass(/done/);
  await expect(card.getByTestId('days-left')).toHaveText('Done');
  await doneBox.click();
  await expect(card.getByTestId('deadline')).not.toHaveClass(/done/);
  await doneBox.click();

  // In the calendar the flag turns green and the day panel lists it under "Finished", not as due.
  const tomorrow = addDays(today, 1);
  await goTo(`planner://calendar/${tomorrow}`);
  await expect(page.getByTestId(`cell-${tomorrow}`).getByTestId('cell-flag')).toHaveCount(0);
  await expect(page.getByTestId(`cell-${tomorrow}`).getByTestId('cell-flag-done')).toBeVisible();
  await expect(page.getByTestId('day-deadlines')).toHaveCount(0);
  await expect(page.getByTestId('finished-deadlines')).toContainText('Physics report');
  // Undo reopens it.
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId(`cell-${tomorrow}`).getByTestId('cell-flag')).toBeVisible();
  await expect(page.getByTestId('day-deadlines')).toContainText('Physics report');

  // On its due day it's listed in the Day Planner's All day section (and not under "Due soon").
  await goTo(`planner://day/${tomorrow}`);
  await expect(page.getByTestId('due-here')).toContainText('Physics report');
  await expect(page.getByTestId('due-soon')).toHaveCount(0);
});

test('dashboard: this-week strip, up next and progress stats', async () => {
  const late = new Date().getHours() >= 23;
  await start(
    normalizeData({
      plans: [
        P({ id: 'a', title: 'Gym', date: today, hour: 23, minute: 59 }),
        P({ id: 'b', title: 'Groceries', date: today, doneDates: [today] }),
      ],
      days: { [addDays(today, -1)]: { done: true }, [addDays(today, -2)]: { done: true } },
    }),
  );
  const strip = page.getByTestId('week-strip');
  await expect(strip.getByRole('button')).toHaveCount(7);
  await expect(strip.locator('.strip-day.today')).toContainText('1/2');
  if (!late) await expect(page.getByTestId('up-next')).toContainText('Gym');
  await expect(page.getByTestId('stats')).toContainText('2 days');
  await strip.locator('.strip-day.today').click();
  await expect(page.getByTestId('day-heading')).toBeVisible();
});

test('week view always shows all 24 hours, even after moving the only early plan away', async () => {
  await start(normalizeData({ plans: [P({ id: 'a', title: 'Early run', date: today, hour: 5, minute: 0, duration: 30 })] }));
  await sidebar().getByRole('link', { name: 'Week' }).click();
  const hours = page.locator('.week-hour-label');
  await expect(hours).toHaveCount(24);
  // It opens scrolled to the earliest plan (05:00), with the day headers still visible.
  await expect(page.getByTestId(`slot-${today}-5`)).toBeInViewport();
  await expect(page.locator('.week-day-head').first()).toBeInViewport();
  const block = page.getByTestId('week-plan').filter({ hasText: 'Early run' });
  await pointerDrag(page, await center(block), await center(page.getByTestId(`slot-${today}-9`)));
  await expect.poll(() => readData(dataDir).plans[0].hour).toBe(9);
  await expect(hours).toHaveCount(24);
  for (const h of [0, 3, 6]) await expect(page.getByTestId(`slot-${today}-${h}`)).toHaveCount(1);
  // Reopening the week starts at 07:00 now that nothing is earlier.
  await goTo('planner://dashboard');
  await sidebar().getByRole('link', { name: 'Week' }).click();
  await expect(page.getByTestId(`slot-${today}-7`)).toBeInViewport();
  await expect(page.getByTestId(`slot-${today}-0`)).not.toBeInViewport();
});

test('browser-style title bar: app icon in the tab strip, no menu bar on Alt, shortcuts still work', async () => {
  await start();
  await expect(page.locator('.titlebar .app-logo')).toBeVisible();
  await expect(page.getByTestId('titlebar-drag')).toHaveCSS('-webkit-app-region', 'drag');
  const win = () => app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows()[0];
    return { menuBar: w.isMenuBarVisible(), autoHide: w.isMenuBarAutoHide() };
  });
  expect(await win()).toEqual({ menuBar: false, autoHide: false });
  await page.keyboard.press('Alt');
  expect((await win()).menuBar).toBe(false);
  // Keyboard shortcuts from the (hidden) menu keep working.
  await page.keyboard.press('Control+t');
  await expect(page.getByTestId('tab')).toHaveCount(2);
  await page.keyboard.press('Control+w');
  await expect(page.getByTestId('tab')).toHaveCount(1);
  // Tabs never slide under the window buttons on the right.
  const bar = await page.locator('.titlebar').boundingBox();
  const area = await page.evaluate(() => navigator.windowControlsOverlay?.getTitlebarAreaRect().width);
  if (area) expect(await page.getByRole('button', { name: 'New tab' }).evaluate((el) => el.getBoundingClientRect().right)).toBeLessThanOrEqual(area);
  expect(bar.height).toBe(40);
});

test('clicking a submenu item that hovering already opened keeps the submenu open', async () => {
  await start(normalizeData({ categories: [{ id: 'w', name: 'Work', color: '#4f9d7e' }], plans: [P({ id: 'a', title: 'Report', date: today })] }));
  await plan('Report').click({ button: 'right' });
  const category = page.getByRole('menuitem', { name: 'Category', exact: true });
  await category.hover();
  await expect(menuItem('Work')).toBeVisible();
  await category.click();
  await expect(menuItem('Work')).toBeVisible();
  await menuItem('Work').click();
  await expect(plan('Report')).toContainText('Work');
});
