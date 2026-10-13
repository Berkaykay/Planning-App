import React, { useState } from 'react';
import { useApp } from '../context.js';
import { habitCount, habitDueOn, habitStreak } from '../lib/recurrence.js';
import { addMonths, daysInMonth, formatMonth, fromKey, monthOf, pad, WEEKDAY_NAMES, weekday } from '../lib/dates.js';
import { useHabitActions } from '../components/habits.jsx';
import { EditIcon, TrashIcon } from '../components/Icons.jsx';

// All habits with a month grid (tap a day to tick it or count it up), streaks and editing.
export default function Habits() {
  const { state, dispatch, today } = useApp();
  const actions = useHabitActions();
  const [month, setMonth] = useState(monthOf(today));
  const [y, m] = month.split('-').map(Number);
  const dates = Array.from({ length: daysInMonth(y, m - 1) }, (_, i) => `${month}-${pad(i + 1)}`);
  const habits = [...state.habits].sort((a, b) => a.order - b.order);

  return (
    <div className="habits-page">
      <header className="page-header habits-header">
        <div>
          <h1>Habits</h1>
          <p className="subtle">Tick them off each day; counted habits go up one tap at a time (right-click for one less).</p>
        </div>
        <button className="primary" onClick={() => actions.create()}>
          + New habit
        </button>
      </header>

      {habits.length === 0 ? (
        <section className="card empty-card">
          <p className="empty">No habits yet. Add things like "Drink water (8×)", "Read 20 minutes" or "Gym on Mon/Wed/Fri".</p>
        </section>
      ) : (
        <section className="card habit-grid-card">
          <div className="month-nav habit-month-nav">
            <button className="button icon-only" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}>
              ‹
            </button>
            <h2>{formatMonth(month)}</h2>
            <button className="button icon-only" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}>
              ›
            </button>
            {month !== monthOf(today) && (
              <button className="button" onClick={() => setMonth(monthOf(today))}>
                This month
              </button>
            )}
          </div>
          <div className="habit-grid" style={{ '--days': dates.length }} role="grid" aria-label={`Habits in ${formatMonth(month)}`}>
            <div className="habit-grid-corner" />
            {dates.map((d) => (
              <div key={d} className={`habit-grid-day ${d === today ? 'today' : ''} ${weekday(d) === 0 || weekday(d) === 6 ? 'weekend' : ''}`}>
                <span>{WEEKDAY_NAMES[weekday(d)][0]}</span>
                <strong>{fromKey(d).getDate()}</strong>
              </div>
            ))}
            {habits.map((h, index) => {
              const streak = habitStreak(h, state.habitLog, today);
              return (
                <React.Fragment key={h.id}>
                  <div className="habit-row-head" style={{ '--habit': h.color }} data-testid="habit-row">
                    <span className="habit-emoji">{h.emoji || '•'}</span>
                    <div className="habit-row-text">
                      <strong>{h.title}</strong>
                      <span className="subtle">
                        {h.goal > 1 ? `${h.goal}× · ` : ''}
                        {h.days.length ? h.days.map((d) => WEEKDAY_NAMES[d]).join(' ') : 'Every day'}
                      </span>
                      <span className="habit-streak" title={`Best streak: ${streak.best}`} data-testid="habit-streak">
                        {streak.current > 0 ? `🔥 ${streak.current}` : '–'} <small>best {streak.best}</small>
                      </span>
                    </div>
                    <div className="habit-row-actions">
                      <button className="icon-button" aria-label={`Move "${h.title}" up`} disabled={index === 0} onClick={() => dispatch({ type: 'habit/move', id: h.id, step: -1 })}>
                        ↑
                      </button>
                      <button className="icon-button" aria-label={`Move "${h.title}" down`} disabled={index === habits.length - 1} onClick={() => dispatch({ type: 'habit/move', id: h.id, step: 1 })}>
                        ↓
                      </button>
                      <button className="icon-button action-icon" aria-label={`Edit habit "${h.title}"`} onClick={() => actions.edit(h)}>
                        <EditIcon size={15} />
                      </button>
                      <button className="icon-button action-icon danger-icon" aria-label={`Delete habit "${h.title}"`} onClick={() => actions.remove(h)}>
                        <TrashIcon size={15} />
                      </button>
                    </div>
                  </div>
                  {dates.map((d) => {
                    const due = habitDueOn(h, d);
                    const n = habitCount(state.habitLog, d, h.id);
                    const future = d > today;
                    const done = n >= h.goal;
                    return (
                      <button
                        key={d}
                        className={`habit-cell ${due ? 'due' : 'off'} ${done ? 'done' : n ? 'part' : ''} ${d === today ? 'today' : ''}`}
                        style={{ '--habit': h.color, '--fill': `${Math.min(1, n / h.goal) * 100}%` }}
                        disabled={!due || future}
                        aria-label={`${h.title} on ${d}: ${n} of ${h.goal}`}
                        data-testid={`habit-cell-${h.title}-${d}`}
                        onClick={() => actions.tap(h, d)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (due && n > 0) actions.set(h, d, n - 1);
                        }}
                      >
                        {done ? '✓' : n ? n : ''}
                      </button>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </section>
      )}

      <section className="card settings-card">
        <label className="setting-row toggle-row">
          <span>
            Count habits toward a complete day
            <small className="setting-hint">When on, a day only completes itself once that day's habits are done too.</small>
          </span>
          <input
            type="checkbox"
            className="switch"
            aria-label="Count habits toward a complete day"
            checked={state.settings.habitsCountForDay}
            onChange={(e) => dispatch({ type: 'settings/update', changes: { habitsCountForDay: e.target.checked } })}
          />
        </label>
      </section>
    </div>
  );
}
