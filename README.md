# Planning-App

A desktop planning app made by AI to help me plan things. It navigates like a browser, with tabs, back/forward buttons and an address bar, but it only moves between its own pages. It never loads websites.

Built with **Electron + React** (bundled by Vite). All data is saved locally in a single JSON file.

![Dashboard](docs/dashboard.png)

## Download and install

1. Open the **[Releases page](https://github.com/Berkaykay/Planning-App/releases/latest)**. On the repository's main page it's under **Releases** on the right.
2. Under **Assets**, download the file for your computer:

| Your computer | File to download |
| --- | --- |
| Windows | `Planner-Setup-<version>.exe` (installs the app), or `Planner-Portable-<version>.exe` (runs without installing) |
| Mac with Apple Silicon (M1/M2/M3/M4) | `Planner-<version>-mac-arm64.dmg` |
| Mac with Intel processor | `Planner-<version>-mac-x64.dmg` |
| Linux | `Planner-<version>-linux.AppImage` |

3. Open it:
   - **Windows:** double-click the Setup file. It installs in a few seconds and adds a **Planner** shortcut to your desktop and Start menu. The app isn't code-signed, so Windows may show *"Windows protected your PC"*: click **More info** → **Run anyway**.
   - **macOS:** open the `.dmg` and drag **Planner** into **Applications**. The first time you open it, macOS will say it can't verify the developer. Click **Done**, then go to **System Settings → Privacy & Security** and click **Open Anyway**. If macOS says the app *"is damaged"*, run `xattr -cr /Applications/Planner.app` in Terminal and open it again.
   - **Linux:** make the file executable (`chmod +x Planner-*.AppImage`) and run it. On Ubuntu 22.04 and newer, if it doesn't start, install FUSE (`sudo apt install libfuse2t64`, or `libfuse2` on 22.04) or start it with `--no-sandbox`.

Your plans are kept when you update: installing a newer version replaces the app but not your data (see [Where your data is stored](#where-your-data-is-stored)).

### Run from source (for developers)

Requirements: [Node.js](https://nodejs.org/) 20 or newer (includes `npm`).

```bash
npm install     # first time only; downloads Electron
npm start       # builds the UI and opens the app window
npm run dev     # same, with instant reload of UI changes
npm run dist    # builds an installer for your OS into release/
```

### How releases are made

The [Build installers](.github/workflows/build.yml) GitHub Action builds and tests the Windows, macOS and Linux versions on every push. On pushes to `main`, it also publishes them on the Releases page as version `v<version>` from `package.json`. To publish a new version, raise `"version"` in `package.json` (for example `1.0.0` → `1.1.0`) and push to `main`. If you push without changing the version, the files in the existing release are replaced.

## Features

**Browser-style navigation**
- Tabs: `+` or **Ctrl+T** opens a tab, **Ctrl+W** or middle-click closes one, and **Ctrl+Tab** / **Ctrl+Shift+Tab** switches between them. Drag a tab to change the order.
- Each tab has its own back/forward history. Use the ← → buttons, **Alt+←/→** (on macOS **Cmd+[ / ]**), or the mouse side buttons.
- The address bar shows the page you're on, such as `planner://day/2026-10-01`, and you can type an address to go there. Addresses: `planner://dashboard`, `planner://calendar/2026-10`, `planner://day/today`, `planner://timetable`, `planner://categories`.
- **Ctrl+click** or middle-click any link or calendar day to open it in a background tab.
- **Ctrl+1–4** jump to Dashboard, Calendar, today's Day Planner and Categories. **Ctrl+L** focuses the address bar.
- Your open tabs, their order and their history are restored when you reopen the app.

**Pages**
- **Dashboard**: today's plans and progress, the next 7 days, a 14-day history for each repeating plan, and categories.
- **Calendar**: a compact month grid. Each day shows one dot per plan (in its category color) and a done/total count. Click a day to see it in the panel beside the calendar, where you can check off plans, add plans and complete the whole day without leaving the page. Double-click a day to open it in the Day Planner. A **This month** panel shows days completed, the share of plans done, your longest streak of completed days and your busiest day.
- **Day Planner**: an *All day* section plus 24 hourly slots. Click a slot (or **+ New plan**) to schedule something at that hour. Drag plans between hours or into *All day* to move them.
- **Timetable**: your weekly school (or work) schedule, set up once. See [Timetable](#timetable) below.
- **Categories**: create, rename, recolor and delete categories, each with its own page listing its plans.

**Categories sidebar**: create (`+`), rename (✎ or double-click), delete (🗑), and select (click) categories. Assign a plan to a category in the plan dialog, or drag a plan onto a category in the sidebar. Deleting a category keeps its plans; they just have no category any more.

**Plans**: each plan has a title, date, a start and optional end time such as 08:30–09:10 (or *All day*), a category, notes and an optional repeat. Edit with ✎ (or double-click), delete with 🗑, and move by dragging or by changing the date and time in the edit dialog.

**Check marks**
- Each plan has a round check button. A completed plan is crossed out, and clicking again undoes it.
- Each whole day also has its own check button: the big circle next to the date in the Day Planner, on the Dashboard's *Today* card, or in the Calendar's day panel. A completed day's heading is crossed out and highlighted. The day check is independent of the plans in that day.

**Repeating plans**: set *Repeat* to Daily, Weekly (on chosen weekdays) or Monthly (same date; a plan on the 31st falls on the last day of shorter months), with an optional end date.
- A repeating plan is never removed when you finish it. Each occurrence has its own check mark, so when the day (or week, or month) comes around again it starts unchecked.
- Past check marks are kept as history. The Dashboard and category pages show a two-week tracker and your current streak.
- When editing, moving or deleting a repeating plan, you choose between *only this day* and *all occurrences*.

### Timetable

For school lessons (or any fixed weekly schedule), open **Timetable** in the sidebar:

1. Check the **lesson times** on the left. Five 40-minute lessons from 08:30 are filled in to start with. Change the times, **+ Add lesson time** (it continues from the last lesson), or remove a row with ✕.
2. Type each subject into the **Mon–Fri grid**. Press **Enter** to jump to the cell below, and subjects you've typed before are suggested. The ⧉ button next to a day copies the previous day's lessons. Tick **Include Saturday** if you have Saturday lessons.
3. Optionally set when the term **ends**, then click **Save timetable**.

Each filled cell becomes a weekly repeating plan in the *School* category, created automatically. It shows up in the Day Planner, Calendar and Dashboard with its time, such as 08:30–09:10, and gets a fresh check mark every week. You can come back and change the timetable at any time: saving again updates your lessons but keeps the check marks you already made. **Delete timetable** removes all its lessons.

**Theme**: the switch at the bottom of the sidebar chooses **Light**, **Dark** or **System** (follows your computer's setting).

## Where your data is stored

Everything is saved immediately after each change to `planner-data.json` in the app's data folder:

| OS      | Location                                        |
| ------- | ----------------------------------------------- |
| Windows | `%APPDATA%\Planner\planner-data.json`           |
| macOS   | `~/Library/Application Support/Planner/planner-data.json` |
| Linux   | `~/.config/Planner/planner-data.json`           |

Writes are atomic: the app writes a temporary file and renames it, so a crash can't corrupt the file. To use a different folder, set the `PLANNER_DATA_DIR` environment variable. To back up your plans, copy that file.

## Tests

```bash
npm test             # unit tests + end-to-end tests
npm run test:unit    # date/recurrence/state logic (node:test)
npm run test:e2e     # drives the real Electron app with Playwright
```

The end-to-end tests launch the actual app with a temporary data folder and cover:
- creating, renaming, selecting and deleting categories;
- adding, completing, undoing, editing, dragging, moving and deleting daily and hourly plans;
- whole-day completion and undo;
- the Timetable: entering lessons, weekly repeats, editing without losing check marks, and deleting;
- the Calendar's day panel and month stats;
- the **+ New plan** button on every page;
- repeating plans: a fresh check mark each day, history, and one-day edits and deletes;
- tabs (including drag-to-reorder), back/forward, the address bar and keyboard shortcuts;
- persistence across closing and reopening the app, including the theme and tab order.

On a Linux machine without a display (for example CI), run them under a virtual display: `xvfb-run -a npm run test:e2e`.

## Project layout

```
electron/        main process: window, menu/shortcuts, JSON storage (storage.cjs), preload bridge
src/lib/         pure logic: dates, recurrence rules, routes, state reducer
src/components/  tabs, nav bar, sidebar, plan item, dialogs, shared plan/category actions
src/pages/       Dashboard, Calendar, DayPlanner, Timetable, Categories, CategoryPage, NotFound
tests/unit/      node:test unit tests
tests/e2e/       Playwright tests against the Electron app
```

![Calendar](docs/calendar.png)
![Timetable](docs/timetable.png)
![Day Planner](docs/day-planner.png)
