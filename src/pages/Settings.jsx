import React, { useEffect, useState } from 'react';
import { useApp } from '../context.js';
import { THEMES } from '../lib/store.js';
import { dataInfo, exportData, importData, openDataFolder } from '../lib/persistence.js';

const REMINDER_MINUTES = [0, 5, 10, 15, 30, 60];

export default function Settings() {
  const { state, dispatch, dialogs } = useApp();
  const { theme, reminders } = state.settings;
  const [info, setInfo] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    dataInfo().then(setInfo, () => setInfo(null));
  }, []);

  const setReminders = (changes) => dispatch({ type: 'settings/update', changes: { reminders: { ...reminders, ...changes } } });

  const testNotification = () => {
    if (typeof Notification === 'undefined') return setMessage('Notifications are not available.');
    new Notification('Planner reminder', { body: 'This is how reminders will look.' });
    setMessage('Test notification sent.');
  };

  const doExport = async () => {
    const { session: _tabs, ...data } = state;
    const path = await exportData(data);
    setMessage(path ? `Backup saved to ${path}` : 'Export cancelled.');
  };

  const doImport = async () => {
    const result = await importData();
    if (!result) return setMessage('Import cancelled.');
    if (result.error || !Array.isArray(result.data?.plans)) {
      return setMessage(result.error ?? 'That file is not a Planner backup.');
    }
    const ok = await dialogs.confirm({
      title: 'Import backup',
      message: `Replace your current plans, categories and timetable with the backup (${result.data.plans.length} plans)? You can undo this with Ctrl+Z.`,
      confirmLabel: 'Import',
      danger: true,
    });
    if (!ok) return setMessage('Import cancelled.');
    dispatch({ type: 'data/replace', data: result.data });
    setMessage(`Imported ${result.path}`);
  };

  return (
    <div className="settings-page">
      <header className="page-header">
        <h1>Settings</h1>
      </header>

      <section className="card settings-card">
        <h2>Appearance</h2>
        <div className="setting-row">
          <span>Theme</span>
          <div className="segmented" role="radiogroup" aria-label="Theme setting">
            {THEMES.map((t) => (
              <button key={t} role="radio" aria-checked={theme === t} className={theme === t ? 'on' : ''} onClick={() => dispatch({ type: 'settings/update', changes: { theme: t } })}>
                {t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card settings-card">
        <h2>Reminders</h2>
        <label className="setting-row">
          <span>Show a desktop notification before timed plans start</span>
          <input type="checkbox" aria-label="Reminders on" checked={reminders.enabled} onChange={(e) => setReminders({ enabled: e.target.checked })} />
        </label>
        <label className="setting-row">
          <span>How long before</span>
          <select aria-label="Reminder time" value={reminders.minutes} disabled={!reminders.enabled} onChange={(e) => setReminders({ minutes: Number(e.target.value) })}>
            {REMINDER_MINUTES.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? 'When it starts' : `${m} minutes before`}
              </option>
            ))}
          </select>
        </label>
        <label className="setting-row">
          <span>Also remind me about lessons</span>
          <input type="checkbox" aria-label="Lesson reminders" checked={reminders.lessons} disabled={!reminders.enabled} onChange={(e) => setReminders({ lessons: e.target.checked })} />
        </label>
        <div className="setting-row">
          <span className="subtle">Reminders work while Planner is open (it can be minimized).</span>
          <button onClick={testNotification}>Send a test notification</button>
        </div>
      </section>

      <section className="card settings-card">
        <h2>Your data</h2>
        <p className="subtle">
          Everything is saved automatically on this computer, separately from the app itself. When you install a new
          version of Planner it keeps using the same data, so nothing is lost. A copy is also made every day (the last 7
          days are kept).
        </p>
        {info && (
          <dl className="data-info">
            <dt>Data file</dt>
            <dd>
              <code>{info.file}</code>
            </dd>
            <dt>Daily backups</dt>
            <dd>{info.backups.length ? `${info.backups.length} (latest: ${info.backups[0].replace(/^planner-data-|\.json$/g, '')})` : 'None yet (made when the app starts)'}</dd>
          </dl>
        )}
        <div className="setting-actions">
          <button onClick={doExport}>Export backup…</button>
          <button onClick={doImport}>Import backup…</button>
          {info?.dir && <button onClick={() => openDataFolder()}>Open data folder</button>}
        </div>
      </section>

      {message && (
        <p className="settings-message" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
