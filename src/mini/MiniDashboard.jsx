import React, { useEffect, useState } from 'react';
import { miniBridge } from '../lib/persistence.js';
import { daysLeftLabel, isDone, lessonAttended, lessonsOn, openDeadlines, tasksOn, upNext } from '../lib/recurrence.js';
import { formatLong, formatTime, formatTimeRange, toKey } from '../lib/dates.js';
import { newId } from '../lib/store.js';
import { paths } from '../lib/routes.js';
import Check from '../components/Check.jsx';

const greeting = (hour) => (hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

// The little "today" popup opened from the tray icon. It shows what the main window last saved
// and sends every change back to it (see electron/tray.cjs), so the two always agree.
export default function MiniDashboard() {
  const [data, setData] = useState(null);
  const now = useNow();
  useEffect(() => {
    const off = miniBridge?.onState(setData);
    miniBridge?.ready();
    return off;
  }, []);
  useEffect(() => {
    if (data) document.documentElement.dataset.theme = data.settings.theme;
  }, [data?.settings.theme]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div className="mini mini-loading">Loading…</div>;

  const today = toKey(now);
  const dispatch = (action) => miniBridge?.dispatch(action);
  const command = (c) => miniBridge?.command(c);
  const plans = tasksOn(data.plans, today);
  const done = plans.filter((p) => isDone(p, today)).length;
  const lessons = lessonsOn(data.plans, today);
  const deadlines = openDeadlines(data.deadlines, today, today).slice(0, 3);
  const next = upNext(data.plans, today, now);
  const nextItem = next.lesson && (!next.plan || next.lesson.hour * 60 + next.lesson.minute <= next.plan.hour * 60 + next.plan.minute) ? next.lesson : next.plan;
  const colors = Object.fromEntries(data.categories.map((c) => [c.id, c.color]));
  const allDone = plans.length > 0 && done === plans.length;
  const pct = plans.length ? done / plans.length : 0;

  return (
    <div className={`mini ${allDone ? 'all-done' : ''}`} data-testid="mini-dashboard">
      <header className="mini-head">
        <div>
          <div className="mini-greeting">
            {greeting(now.getHours())} {allDone ? '🎉' : '☀'}
          </div>
          <div className="mini-date">{formatLong(today)}</div>
        </div>
        <button className="mini-close" aria-label="Close" title="Close" onClick={() => miniBridge?.hide()}>
          ✕
        </button>
      </header>

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
      </section>

      {lessons.length > 0 && (
        <section className="mini-lessons" aria-label="Lessons">
          {lessons.map((l) => (
            <span key={l.id} className={`mini-lesson ${lessonAttended(l, today, now) ? 'done' : ''}`} title={formatTimeRange(l)}>
              {l.title}
            </span>
          ))}
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

      <footer className="mini-foot">
        <button className="primary" onClick={() => command(`open:${paths.dashboard()}`)}>
          Open Planner
        </button>
        <button onClick={() => command('new-deadline')}>⚑ Add deadline</button>
      </footer>
    </div>
  );
}
