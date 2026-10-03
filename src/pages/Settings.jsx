import React, { useEffect, useState } from 'react';
import { useApp } from '../context.js';
import { BUILTIN_SOUNDS, THEMES } from '../lib/store.js';
import { appVersion, dataInfo, exportData, importData, openDataFolder, sounds, updates } from '../lib/persistence.js';
import { playSound, soundLabel } from '../lib/sounds.js';

const REMINDER_MINUTES = [0, 5, 10, 15, 30, 60];
const minutesLabel = (m) => (m === 0 ? 'When it starts' : m === 60 ? '1 hour before' : `${m} minutes before`);

export default function Settings() {
  const { state, dispatch, dialogs } = useApp();
  const { theme, reminders } = state.settings;
  const [info, setInfo] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    dataInfo().then(setInfo, () => setInfo(null));
  }, []);

  const setReminders = (changes) => dispatch({ type: 'settings/update', changes: { reminders: { ...reminders, ...changes } } });
  const setBackground = (changes) => dispatch({ type: 'settings/update', changes: { background: { ...state.settings.background, ...changes } } });

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

      <NotificationsCard reminders={reminders} setReminders={setReminders} categories={state.categories} onMessage={setMessage} />
      <BackgroundCard background={state.settings.background} setBackground={setBackground} />
      <UpdatesCard auto={state.settings.updates.auto} setAuto={(auto) => dispatch({ type: 'settings/update', changes: { updates: { auto } } })} />

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

// A small on/off switch with its label (a real checkbox underneath, for keyboard and tests).
function Toggle({ label, checked, onChange, disabled, hint }) {
  return (
    <label className={`setting-row toggle-row ${disabled ? 'disabled' : ''}`}>
      <span>
        {label}
        {hint && <small className="setting-hint">{hint}</small>}
      </span>
      <input type="checkbox" className="switch" aria-label={label} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function SoundSelect({ value, onChange, files, label, allowDefault = false, disabled }) {
  return (
    <select aria-label={label} value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value || null)}>
      {allowDefault && <option value="">Default sound</option>}
      {BUILTIN_SOUNDS.map((s) => (
        <option key={s} value={s}>
          {soundLabel(s)}
        </option>
      ))}
      {files.length > 0 && (
        <optgroup label="My sounds">
          {files.map((f) => (
            <option key={f} value={`file:${f}`}>
              {f}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

// Notifications: the defaults, each category's own choices, quiet hours and your own sounds.
function NotificationsCard({ reminders, setReminders, categories, onMessage }) {
  const [files, setFiles] = useState([]);
  useEffect(() => {
    sounds.list().then(setFiles);
  }, []);
  const off = !reminders.enabled;
  const setCategory = (id, changes) => {
    const current = reminders.perCategory[id] ?? { enabled: true, sound: null, minutes: null };
    setReminders({ perCategory: { ...reminders.perCategory, [id]: { ...current, ...changes } } });
  };
  const setQuiet = (changes) => setReminders({ quiet: { ...reminders.quiet, ...changes } });

  const addSounds = async () => {
    const result = await sounds.import();
    setFiles(result.list);
    if (result.added.length) onMessage(`Added ${result.added.join(', ')}.`);
    else if (result.skipped.length) onMessage(`Couldn't add ${result.skipped.map((s) => `${s.file} (${s.reason})`).join(', ')}.`);
  };
  const removeSound = async (name) => {
    setFiles(await sounds.remove(name));
    // Anything that used the removed sound goes back to the defaults.
    const gone = `file:${name}`;
    const perCategory = Object.fromEntries(Object.entries(reminders.perCategory).map(([id, c]) => [id, c.sound === gone ? { ...c, sound: null } : c]));
    setReminders({ sound: reminders.sound === gone ? 'chime' : reminders.sound, perCategory });
  };
  const test = () => {
    if (typeof Notification !== 'undefined') new Notification('Planner reminder', { body: '🏫 Okul · 14:00–14:40 · starts in 10 min', silent: true });
    playSound(reminders.sound, reminders.volume);
    onMessage('Test notification sent.');
  };

  return (
    <section className="card settings-card" aria-label="Notifications">
      <h2>Notifications</h2>
      <Toggle label="Reminders on" hint="A notification before timed plans start, and for deadlines" checked={reminders.enabled} onChange={(v) => setReminders({ enabled: v })} />
      <label className="setting-row">
        <span>How long before</span>
        <select aria-label="Reminder time" value={reminders.minutes} disabled={off} onChange={(e) => setReminders({ minutes: Number(e.target.value) })}>
          {REMINDER_MINUTES.map((m) => (
            <option key={m} value={m}>
              {minutesLabel(m)}
            </option>
          ))}
        </select>
      </label>
      <Toggle label="Lesson reminders" hint="Also remind me before lessons from the Timetable" checked={reminders.lessons} disabled={off} onChange={(v) => setReminders({ lessons: v })} />
      <div className="setting-row">
        <span>Sound</span>
        <div className="setting-inline">
          <SoundSelect label="Notification sound" value={reminders.sound} files={files} disabled={off} onChange={(v) => setReminders({ sound: v ?? 'chime' })} />
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            aria-label="Volume"
            title={`Volume ${Math.round(reminders.volume * 100)}%`}
            value={reminders.volume}
            disabled={off}
            onChange={(e) => setReminders({ volume: Number(e.target.value) })}
          />
          <button onClick={test} disabled={off}>
            Test
          </button>
        </div>
      </div>

      {categories.length > 0 && (
        <div className="setting-group">
          <h3>Per category</h3>
          <div className="category-reminders">
            {categories.map((c) => {
              const own = reminders.perCategory[c.id] ?? { enabled: true, sound: null, minutes: null };
              return (
                <div key={c.id} className={`category-reminder ${own.enabled ? '' : 'muted'}`} data-testid={`reminder-${c.name}`}>
                  <span className="chip">
                    <span className="dot" style={{ background: c.color }} />
                    {c.icon && `${c.icon} `}
                    {c.name}
                  </span>
                  <input type="checkbox" className="switch" aria-label={`Notifications for ${c.name}`} checked={own.enabled} disabled={off} onChange={(e) => setCategory(c.id, { enabled: e.target.checked })} />
                  <SoundSelect label={`Sound for ${c.name}`} value={own.sound} files={files} allowDefault disabled={off || !own.enabled} onChange={(v) => setCategory(c.id, { sound: v })} />
                  <select
                    aria-label={`Reminder time for ${c.name}`}
                    value={own.minutes ?? ''}
                    disabled={off || !own.enabled}
                    onChange={(e) => setCategory(c.id, { minutes: e.target.value === '' ? null : Number(e.target.value) })}
                  >
                    <option value="">Default time</option>
                    {REMINDER_MINUTES.map((m) => (
                      <option key={m} value={m}>
                        {minutesLabel(m)}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="setting-group">
        <h3>Quiet hours</h3>
        <Toggle label="Quiet hours" hint="No notifications or sounds during these hours" checked={reminders.quiet.enabled} disabled={off} onChange={(v) => setQuiet({ enabled: v })} />
        <div className="setting-row">
          <span>From</span>
          <div className="setting-inline">
            <input type="time" aria-label="Quiet from" value={reminders.quiet.from} disabled={off || !reminders.quiet.enabled} onChange={(e) => e.target.value && setQuiet({ from: e.target.value })} />
            <span>to</span>
            <input type="time" aria-label="Quiet to" value={reminders.quiet.to} disabled={off || !reminders.quiet.enabled} onChange={(e) => e.target.value && setQuiet({ to: e.target.value })} />
          </div>
        </div>
      </div>

      <div className="setting-group">
        <h3>My sounds</h3>
        {files.length === 0 && <p className="subtle">Add your own mp3, wav or ogg files to use them as notification sounds.</p>}
        <ul className="sound-list">
          {files.map((f) => (
            <li key={f}>
              <button className="icon-button" aria-label={`Play ${f}`} title="Play" onClick={() => playSound(`file:${f}`, reminders.volume)}>
                ▶
              </button>
              <span>{f}</span>
              <button className="icon-button danger-icon" aria-label={`Remove ${f}`} title="Remove" onClick={() => removeSound(f)}>
                ✕
              </button>
            </li>
          ))}
        </ul>
        <button onClick={addSounds}>+ Add sounds…</button>
      </div>
    </section>
  );
}

// Tray icon, keep running in the background, start at login, applications menu entry.
function BackgroundCard({ background, setBackground }) {
  const linux = window.planner?.platform === 'linux';
  return (
    <section className="card settings-card" aria-label="Background">
      <h2>Tray and background</h2>
      <Toggle
        label="Show Planner in the system tray"
        hint={linux ? 'Click the tray icon for a little view of today. On GNOME this needs the AppIndicator extension.' : 'Click the tray icon for a little view of today.'}
        checked={background.tray}
        onChange={(v) => setBackground({ tray: v, ...(!v && { keepRunning: false }) })}
      />
      <Toggle
        label="Keep running when the window is closed"
        hint="Reminders and sounds keep working; open Planner again from the tray"
        checked={background.keepRunning}
        disabled={!background.tray}
        onChange={(v) => setBackground({ keepRunning: v })}
      />
      <Toggle label="Start when I log in" hint={background.tray ? 'Starts quietly in the tray' : 'Opens the Planner window'} checked={background.startOnLogin} onChange={(v) => setBackground({ startOnLogin: v })} />
      {linux && (
        <Toggle
          label="Add Planner to my applications menu"
          hint="With the Planner icon, so you can start it and pin it like any app"
          checked={background.menuLauncher}
          onChange={(v) => setBackground({ menuLauncher: v })}
        />
      )}
    </section>
  );
}

function UpdatesCard({ auto, setAuto }) {
  const [status, setStatus] = useState(null);
  useEffect(() => {
    updates.status().then(setStatus);
    return updates.onStatus(setStatus);
  }, []);
  const text = {
    checking: 'Checking…',
    none: "You're up to date.",
    available: `Planner ${status?.version} is available. Use the ↑ button at the top right to update.`,
    downloading: `Downloading the update… ${status?.percent ?? 0}%`,
    ready: 'Restarting into the new version…',
    error: status?.message,
    unsupported: status?.message,
  }[status?.state];
  return (
    <section className="card settings-card" aria-label="Updates">
      <h2>Updates</h2>
      <div className="setting-row">
        <span>
          Version <strong data-testid="app-version">{appVersion()}</strong>
        </span>
        <button onClick={() => updates.check().then(setStatus)} disabled={status?.state === 'checking' || status?.state === 'downloading'}>
          Check now
        </button>
      </div>
      <Toggle label="Check for updates automatically" checked={auto} onChange={setAuto} />
      {text && (
        <p className="subtle" role="status" data-testid="update-status">
          {text}
        </p>
      )}
    </section>
  );
}
