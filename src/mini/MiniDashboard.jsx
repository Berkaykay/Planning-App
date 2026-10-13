import React, { useEffect, useState } from 'react';
import { miniBridge } from '../lib/persistence.js';
import {
  countdownLabel,
  daysLeftLabel,
  isDone,
  lessonAttended,
  lessonMark,
  lessonsOn,
  nextLessonMark,
  openDeadlines,
  specialDaysOn,
  specialNote,
  tasksOn,
  upcomingSpecialDays,
  upNext,
} from '../lib/recurrence.js';
import { addDays, formatLong, formatMedium, formatTime, formatTimeRange, toKey } from '../lib/dates.js';
import { newId } from '../lib/store.js';
import { paths } from '../lib/routes.js';
import Check from '../components/Check.jsx';
import AppMark from '../components/AppMark.jsx';

const greeting = (hour) => (hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');

// The current time, refreshed every `ms`.
function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

const mmss = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

// 25-minute focus timer. It runs in the app's main process (see electron/tray.cjs), so it keeps going
// while this popup is closed; at the end the main window shows a notification and plays your sound.
function FocusTimer() {
  const [focus, setFocus] = useState(null);
  const [, tick] = useState(0);
  useEffect(() => {
    const off = miniBridge?.onFocus(setFocus);
    // Ask for the timer's current state (it may already be running).
    miniBridge?.focus({ type: 'get' });
    return off;
  }, []);
  useEffect(() => {
    if (!focus?.endsAt) return undefined;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [focus?.endsAt]);
  if (!focus) return null;
  const running = Boolean(focus.endsAt);
  const left = running ? Math.max(0, (focus.endsAt - Date.now()) / 1000) : focus.remaining;
  const total = Math.max(focus.duration, left);
  const act = (type, extra) => miniBridge?.focus({ type, ...extra });
  return (
    <section className={`mini-card mini-focus ${running ? 'running' : ''} ${focus.done ? 'finished' : ''}`} aria-label="Focus timer">
      <span className="mini-label">Focus timer</span>
      <div className="focus-row">
        <span className="focus-time" data-testid="focus-time">
          {focus.done ? 'Done! 🎉' : mmss(Math.ceil(left))}
        </span>
        <div className="focus-buttons">
          <button className={running ? '' : 'primary'} onClick={() => act(running ? 'pause' : 'start')}>
            {running ? 'Pause' : left < focus.duration && !focus.done ? 'Resume' : 'Start'}
          </button>
          <button onClick={() => act('add', { minutes: 5 })} title="5 more minutes">
            +5
          </button>
          <button onClick={() => act('reset')} title="Back to 25:00" aria-label="Reset timer">
            ↺
          </button>
        </div>
      </div>
      <div className="focus-bar" aria-hidden>
        <span style={{ width: `${focus.done ? 100 : (1 - left / total) * 100}%` }} />
      </div>
    </section>
  );
}

// The "today" popup that comes out of the tray icon. It shows what the main window last saved and
// sends every change back to it (see electron/tray.cjs), so the two always agree.
export default function MiniDashboard() {
  const [data, setData] = useState(null);
  // Bumped each time the popup opens, to replay the slide-out animation from the panel's side.
  const [shown, setShown] = useState({ n: 0, side: 'bottom' });
  const now = useNow();
  useEffect(() => {
    const off = miniBridge?.onState(setData);
    const offShown = miniBridge?.onShown?.(({ side }) => setShown((s) => ({ n: s.n + 1, side })));
    miniBridge?.ready();
    return () => {
      off?.();
      offShown?.();
    };
  }, []);
  useEffect(() => {
    if (data) document.documentElement.dataset.theme = data.settings.theme;
  }, [data?.settings.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  const topBar = (
    <header className="mini-top">
      <button className="mini-open" onClick={() => miniBridge?.command(`open:${paths.dashboard()}`)} title="Open the Cadence window">
        <AppMark size={18} /> Open Cadence
      </button>
      <button className="mini-close" aria-label="Close" title="Close" onClick={() => miniBridge?.hide()}>
        ✕
      </button>
    </header>
  );
  if (!data) {
    return (
      <div className="mini-shell">
        {topBar}
        <div className="mini mini-loading">Loading…</div>
      </div>
    );
  }

  const today = toKey(now);
  const tomorrow = addDays(today, 1);
  const dispatch = (action) => miniBridge?.dispatch(action);
  const command = (c) => miniBridge?.command(c);
  const plans = tasksOn(data.plans, today);
  const done = plans.filter((p) => isDone(p, today)).length;
  const lessons = lessonsOn(data.plans, today);
  const deadlines = openDeadlines(data.deadlines, today, today).slice(0, 3);
  const specials = upcomingSpecialDays(data.specialDays ?? [], today, 30).slice(0, 3);
  const next = upNext(data.plans, today, now);
  const nextItem = next.lesson && (!next.plan || next.lesson.hour * 60 + next.lesson.minute <= next.plan.hour * 60 + next.plan.minute) ? next.lesson : next.plan;
  const colors = Object.fromEntries(data.categories.map((c) => [c.id, c.color]));
  const allDone = plans.length > 0 && done === plans.length;
  const pct = plans.length ? done / plans.length : 0;
  const tomorrowPlans = tasksOn(data.plans, tomorrow);
  const tomorrowLessons = lessonsOn(data.plans, tomorrow).length;
  const tomorrowSpecials = specialDaysOn(data.specialDays ?? [], tomorrow);

  return (
    <div className="mini-shell">
      {topBar}
      <div key={shown.n} className={`mini slide-from-${shown.side} ${allDone ? 'all-done' : ''}`} data-testid="mini-dashboard">
        <section className="mini-hello">
          <div className="mini-greeting">
            {greeting(now.getHours())} {allDone ? '🎉' : '☀'}
          </div>
          <div className="mini-date">{formatLong(today)}</div>
        </section>

        <section className="mini-progress" aria-label="Today's progress">
          <svg viewBox="0 0 44 44" className="mini-ring" aria-hidden>
            <circle cx="22" cy="22" r="18" className="ring-track" />
            <circle cx="22" cy="22" r="18" className="ring-fill" style={{ strokeDasharray: `${pct * 113.1} 113.1` }} />
          </svg>
          <div>
            <strong data-testid="mini-count">
              {done}/{plans.length} done
            </strong>
            <div className="mini-sub">{allDone ? 'All done today. Nice!' : plans.length ? `${plans.length - done} to go` : 'Nothing planned yet'}</div>
          </div>
        </section>

        {nextItem && (
          <section className="mini-card mini-next" style={{ '--cat': colors[nextItem.categoryId] ?? 'var(--accent)' }}>
            <span className="mini-label">Up next</span>
            <span className="mini-next-title">{nextItem.title}</span>
            <span className="mini-next-when">
              {(() => {
                const diff = nextItem.hour * 60 + nextItem.minute - next.minutes;
                return diff < 60 ? `in ${diff} min` : `at ${formatTime(nextItem.hour, nextItem.minute)}`;
              })()}
            </span>
          </section>
        )}

        <section className="mini-card" aria-label="Today's plans">
          <span className="mini-label">Today</span>
          {plans.length === 0 && <p className="mini-empty">A free day ✿</p>}
          <ul className="mini-plans">
            {plans.map((p) => {
              const checked = isDone(p, today);
              return (
                <li key={p.id} className={checked ? 'done' : ''} style={{ '--cat': colors[p.categoryId] ?? 'var(--muted-line)' }}>
                  <Check checked={checked} label={`Mark "${p.title}" complete`} onChange={(v) => dispatch({ type: 'plan/setDone', id: p.id, date: today, done: v })} />
                  <span className="mini-plan-title">{p.title}</span>
                  {p.hour !== null && <span className="mini-time">{formatTime(p.hour, p.minute)}</span>}
                </li>
              );
            })}
          </ul>
          <form
            className="mini-add"
            onSubmit={(e) => {
              e.preventDefault();
              const input = e.currentTarget.elements.title;
              const title = input.value.trim();
              if (!title) return;
              dispatch({ type: 'plan/add', plan: { id: newId(), title, date: today, hour: null } });
              input.value = '';
            }}
          >
            <input name="title" aria-label="Add a plan for today" placeholder="+ Add a plan for today" autoComplete="off" />
          </form>
          <button className="mini-add-deadline" onClick={() => command('new-deadline')}>
            ⚑ Add deadline
          </button>
        </section>

        {lessons.length > 0 && (
          <section className="mini-lessons" aria-label="Lessons">
            {lessons.map((l) => {
              const mark = lessonMark(l, today);
              return (
                <button
                  key={l.id}
                  className={`mini-lesson ${lessonAttended(l, today, now) ? 'done' : ''} ${mark === 'absent' ? 'absent' : ''}`}
                  title={`${formatTimeRange(l)} · click to ${mark ? 'go back to automatic' : 'mark'}`}
                  onClick={() => dispatch({ type: 'lesson/setAttended', id: l.id, date: today, attended: nextLessonMark(l, today, now) })}
                >
                  {l.title}
                </button>
              );
            })}
          </section>
        )}

        {deadlines.length > 0 && (
          <section className="mini-card" aria-label="Deadlines">
            <span className="mini-label">Deadlines</span>
            <ul className="mini-deadlines">
              {deadlines.map((d) => {
                const label = daysLeftLabel(d.due, today);
                return (
                  <li key={d.id}>
                    <Check checked={d.done} size="small" label={`Mark deadline "${d.title}" done`} onChange={(v) => dispatch({ type: 'deadline/update', id: d.id, changes: { done: v } })} />
                    <span className="mini-plan-title">{d.title}</span>
                    <span className={`mini-pill ${/late/.test(label) ? 'late' : label === 'Today' || label === 'Tomorrow' ? 'soon' : ''}`}>{label}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {specials.length > 0 && (
          <section className="mini-card" aria-label="Coming up" data-testid="mini-coming-up">
            <span className="mini-label">Coming up</span>
            <ul className="mini-deadlines">
              {specials.map(({ special, date, inDays, note }) => (
                <li key={special.id}>
                  <span className="mini-special-emoji" aria-hidden>
                    {special.emoji}
                  </span>
                  <span className="mini-plan-title">
                    {special.title}
                    {note && <span className="mini-time"> · {note}</span>}
                  </span>
                  <span className={`mini-pill ${inDays <= 1 ? 'soon' : ''}`} title={formatMedium(date)}>
                    {countdownLabel(inDays)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mini-card mini-tomorrow" aria-label="Tomorrow" data-testid="mini-tomorrow">
          <span className="mini-label">Tomorrow · {formatMedium(tomorrow)}</span>
          {tomorrowSpecials.map((s) => (
            <span key={s.id} className="mini-tomorrow-special">
              {s.emoji} {s.title}
              {specialNote(s, tomorrow) && ` · ${specialNote(s, tomorrow)}`}
            </span>
          ))}
          {tomorrowPlans.length === 0 && !tomorrowLessons ? (
            <p className="mini-empty">Nothing planned yet.</p>
          ) : (
            <ul className="mini-tomorrow-list">
              {tomorrowPlans.slice(0, 4).map((p) => (
                <li key={p.id}>
                  <span className="dot" style={{ background: colors[p.categoryId] ?? 'var(--muted)' }} />
                  <span className="mini-plan-title">{p.title}</span>
                  {p.hour !== null && <span className="mini-time">{formatTime(p.hour, p.minute)}</span>}
                </li>
              ))}
              {tomorrowPlans.length > 4 && <li className="mini-time">+{tomorrowPlans.length - 4} more</li>}
              {tomorrowLessons > 0 && (
                <li className="mini-time">
                  {tomorrowLessons} lesson{tomorrowLessons === 1 ? '' : 's'}
                </li>
              )}
            </ul>
          )}
        </section>

        <FocusTimer />
      </div>
    </div>
  );
}
