import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AppContext } from './context.js';
import { reducer, normalizeData, activeTab, currentPath } from './lib/store.js';
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
import NotFound from './pages/NotFound.jsx';

export default function App() {
  const [initial, setInitial] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData()
      .then((raw) => setInitial(normalizeData(raw)))
      .catch((err) => setError(err));
  }, []);

  if (error) return <div className="splash">Could not load your planner data: {String(error.message || error)}</div>;
  if (!initial) return <div className="splash">Loading…</div>;
  return <Planner initial={initial} />;
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

function Planner({ initial }) {
  const [state, dispatch] = useReducer(reducer, initial);
  const [saveError, setSaveError] = useState(null);
  const today = useToday();
  const dialogs = useDialogState();
  const addressRef = useRef(null);

  // Save every change. Saves are processed in order by the main process.
  useEffect(() => {
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
      else if (mod && !e.shiftKey && !e.altKey) {
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
            {page}
          </main>
        </div>
        {saveError && <div className="save-error">Could not save your changes: {saveError}</div>}
      </div>
      <DialogHost dialogs={dialogs} />
    </AppContext.Provider>
  );
}
