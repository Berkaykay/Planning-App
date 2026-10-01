import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppContext } from './context.js';
import { normalizeData, activeTab, currentPath, DATA_VERSION } from './lib/store.js';
import { historyReducer, initHistory, describeChange } from './lib/history.js';
import { plansOn, isDone, isLesson } from './lib/recurrence.js';
import { formatTimeRange } from './lib/dates.js';
import { loadData, saveData, onAppCommand } from './lib/persistence.js';
import { parseRoute, paths } from './lib/routes.js';
import { todayKey } from './lib/dates.js';
import { DialogHost, useDialogState } from './components/Dialogs.jsx';
import TabBar from './components/TabBar.jsx';
import NavBar from './components/NavBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Calendar from './pages/Calendar.jsx';
import DayPlanner from './pages/DayPlanner.jsx';
import Categories from './pages/Categories.jsx';
import CategoryPage from './pages/CategoryPage.jsx';
import Timetable from './pages/Timetable.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import NotFound from './pages/NotFound.jsx';
import History from './pages/History.jsx';
import Settings from './pages/Settings.jsx';

export default function App() {
  const [initial, setInitial] = useState(null);
  const [error, setError] = useState(null);
  // Data written by a newer version of the app is shown but never overwritten, so an old
  // version can't drop information it doesn't know about.
  const [readOnly, setReadOnly] = useState(false);

  useEffect(() => {
    loadData()
      .then((raw) => {
        setReadOnly(Number(raw?.version) > DATA_VERSION);
        setInitial(normalizeData(raw));
      })
      .catch((err) => setError(err));
  }, []);

  if (error) return <div className="splash">Could not load your planner data: {String(error.message || error)}</div>;
  if (!initial) return <div className="splash">Loading…</div>;
  return <Planner initial={initial} readOnly={readOnly} />;
}

// Re-renders when the calendar day changes, so "Today" stays correct past midnight.
function useToday() {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    const timer = setInterval(() => setToday(todayKey()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return today;
}

// Shows a desktop notification shortly before timed plans (and optionally lessons) start.
function useReminders(plans, reminders) {
  const notified = useRef(new Set());
  useEffect(() => {
    if (!reminders.enabled || typeof Notification === 'undefined') return undefined;
    const check = () => {
      const now = new Date();
      const date = todayKey();
      const minutesNow = now.getHours() * 60 + now.getMinutes();
      for (const p of plansOn(plans, date)) {
        if (p.hour === null || isDone(p, date) || (isLesson(p) && !reminders.lessons)) continue;
        const lead = p.hour * 60 + p.minute - minutesNow;
        const key = `${p.id}:${date}`;
        if (lead < 0 || lead > reminders.minutes || notified.current.has(key)) continue;
        notified.current.add(key);
        new Notification(p.title, {
          body: `${lead === 0 ? 'Starts now' : `Starts in ${lead} min`} · ${formatTimeRange(p)}`,
        });
      }
    };
    check();
    const timer = setInterval(check, 20_000);
    return () => clearInterval(timer);
  }, [plans, reminders]);
}

// "Completed … · Undo" message at the bottom of the window.
function Toast({ toast, onUndo, onClose }) {
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);
  if (!toast) return null;
  return (
    <div className="toast" role="status" data-testid="toast" key={toast.id}>
      <span>{toast.message}</span>
      {toast.canUndo && (
        <button className="link-button" onClick={onUndo}>
          Undo
        </button>
      )}
      <button className="icon-button" aria-label="Dismiss" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}

const isEditable = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

function Planner({ initial, readOnly }) {
  const [history, dispatch] = useReducer(historyReducer, initial, initHistory);
  const state = history.data;
  const [saveError, setSaveError] = useState(null);
  const [toast, setToast] = useState(null);
  const closeToast = useCallback(() => setToast(null), []);
  const today = useToday();
  const dialogs = useDialogState();
  const addressRef = useRef(null);

  // Light / dark / follow-the-system theme (see the [data-theme] rules in styles.css).
  useEffect(() => {
    document.documentElement.dataset.theme = state.settings.theme;
  }, [state.settings.theme]);

  useReminders(state.plans, state.settings.reminders);

  // Offer "Undo" after deleting, completing or moving things.
  useEffect(() => {
    const message = describeChange(history.last);
    if (message) setToast({ id: history.seq, message, canUndo: !history.last.type.startsWith('history/') });
  }, [history.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save every change. Saves are processed in order by the main process.
  useEffect(() => {
    if (readOnly) return;
    saveData(state).then(
      () => setSaveError(null),
      (err) => setSaveError(String(err.message || err)),
    );
  }, [state]);

  const tab = activeTab(state);
  const path = currentPath(tab);
  const route = useMemo(() => parseRoute(path), [path, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = useCallback((to, { newTab = false, background = false } = {}) => {
    if (newTab) dispatch({ type: 'tab/open', path: to, background });
    else dispatch({ type: 'tab/navigate', path: to });
  }, []);

  const runCommand = useCallback(
    (command) => {
      switch (command) {
        case 'new-tab':
          dispatch({ type: 'tab/open', path: paths.dashboard() });
          break;
        case 'close-tab':
          dispatch({ type: 'tab/close', id: state.session.activeTabId });
          break;
        case 'reopen-tab':
          dispatch({ type: 'tab/reopen' });
          break;
        case 'undo':
          dispatch({ type: 'history/undo' });
          break;
        case 'redo':
          dispatch({ type: 'history/redo' });
          break;
        case 'back':
          dispatch({ type: 'tab/back' });
          break;
        case 'forward':
          dispatch({ type: 'tab/forward' });
          break;
        case 'next-tab':
          dispatch({ type: 'tab/cycle', step: 1 });
          break;
        case 'prev-tab':
          dispatch({ type: 'tab/cycle', step: -1 });
          break;
        case 'go-dashboard':
          navigate(paths.dashboard());
          break;
        case 'go-calendar':
          navigate(paths.calendar());
          break;
        case 'go-today':
          navigate(paths.day(todayKey()));
          break;
        case 'go-categories':
          navigate(paths.categories());
          break;
        case 'focus-address':
          addressRef.current?.focus();
          addressRef.current?.select();
          break;
        default:
      }
    },
    [state.session.activeTabId, navigate],
  );

  useEffect(() => onAppCommand(runCommand), [runCommand]);

  // Keyboard and mouse shortcuts. Handling them here (and preventing the default) means the
  // shortcuts also work when the native menu is hidden.
  useEffect(() => {
    const isMac = navigator.platform.toLowerCase().includes('mac');
    const onKey = (e) => {
      if (dialogs.isOpen) return;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      let command = null;
      const key = e.key.toLowerCase();
      if (e.ctrlKey && key === 'tab') command = e.shiftKey ? 'prev-tab' : 'next-tab';
      else if (mod && e.shiftKey && key === 't') command = 'reopen-tab';
      else if (mod && !e.altKey && (key === 'z' || key === 'y') && !isEditable(e.target)) {
        // Inside text fields Ctrl+Z keeps undoing typing as usual.
        command = key === 'y' || e.shiftKey ? 'redo' : 'undo';
      } else if (mod && !e.shiftKey && !e.altKey) {
        command = { t: 'new-tab', w: 'close-tab', l: 'focus-address', 1: 'go-dashboard', 2: 'go-calendar', 3: 'go-today', 4: 'go-categories', '[': 'back', ']': 'forward' }[key] ?? null;
      } else if (e.altKey && !mod && !e.shiftKey) {
        command = { arrowleft: 'back', arrowright: 'forward' }[key] ?? null;
      }
      if (command) {
        e.preventDefault();
        runCommand(command);
      }
    };
    // Mouse back/forward side buttons.
    const onMouse = (e) => {
      if (e.button === 3 || e.button === 4) {
        e.preventDefault();
        runCommand(e.button === 3 ? 'back' : 'forward');
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mouseup', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mouseup', onMouse);
    };
  }, [runCommand, dialogs.isOpen]);

  const ctx = useMemo(
    () => ({ state, dispatch, navigate, route, path, today, dialogs }),
    [state, navigate, route, path, today, dialogs],
  );

  let page;
  switch (route.page) {
    case 'dashboard':
      page = <Dashboard />;
      break;
    case 'calendar':
      page = <Calendar month={route.month} />;
      break;
    case 'day':
      page = <DayPlanner date={route.date} />;
      break;
    case 'categories':
      page = <Categories />;
      break;
    case 'timetable':
      page = <Timetable />;
      break;
    case 'history':
      page = <History />;
      break;
    case 'settings':
      page = <Settings />;
      break;
    case 'category':
      page = <CategoryPage id={route.id} />;
      break;
    default:
      page = <NotFound path={route.path} />;
  }

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        <TabBar />
        <NavBar addressRef={addressRef} />
        <div className="workspace">
          <Sidebar />
          {/* Keyed by tab + history position so each page starts fresh, like a browser load. */}
          <main className="page" key={`${tab.id}:${tab.index}:${path}`} data-testid="page">
            <ErrorBoundary
              resetKey={path}
              onBack={tab.index > 0 ? () => dispatch({ type: 'tab/back' }) : null}
              onHome={() => navigate(paths.dashboard())}
            >
              {page}
            </ErrorBoundary>
          </main>
        </div>
        {saveError && <div className="save-error">Could not save your changes: {saveError}</div>}
        {readOnly && (
          <div className="save-error">
            Your data was saved by a newer version of Planner, so this older version won't change it. Install the latest
            version to keep planning.
          </div>
        )}
        <Toast toast={toast} onClose={closeToast} onUndo={() => dispatch({ type: 'history/undo' })} />
      </div>
      <ErrorBoundary
        resetKey={dialogs.current}
        renderFallback={(error) => (
          <div className="modal-backdrop">
            <div className="modal modal-small" role="alertdialog" aria-label="Something went wrong">
              <div className="modal-body">
                <h2>Something went wrong</h2>
                <p className="subtle">{String(error.message || error)}</p>
              </div>
              <footer className="modal-footer">
                <button className="primary" onClick={() => dialogs.current?.close(null)}>
                  Close
                </button>
              </footer>
            </div>
          </div>
        )}
      >
        <DialogHost dialogs={dialogs} />
      </ErrorBoundary>
    </AppContext.Provider>
  );
}
