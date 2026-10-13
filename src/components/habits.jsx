import React, { useState } from 'react';
import { useApp } from '../context.js';
import { newId } from '../lib/store.js';
import { habitCount, habitsOn } from '../lib/recurrence.js';
import { WEEKDAY_NAMES, WEEKDAY_ORDER } from '../lib/dates.js';
import { paths } from '../lib/routes.js';
import { Modal, useConfirmDelete } from './Dialogs.jsx';
import { ColorPicker } from '../pages/Categories.jsx';
import Link from './Link.jsx';

// Create / edit a habit. Resolves with the values or null.
function HabitDialog({ initial, onClose }) {
  const editing = Boolean(initial.id);
  const [title, setTitle] = useState(initial.title ?? '');
  const [emoji, setEmoji] = useState(initial.emoji ?? '');
  const [color, setColor] = useState(initial.color ?? '#5b7fd6');
  const [days, setDays] = useState(initial.days ?? []);
  const [goal, setGoal] = useState(initial.goal ?? 1);
  const [error, setError] = useState('');
  const toggleDay = (d) => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);

  const submit = () => {
    if (!title.trim()) return setError('Please give the habit a name, like "Drink water".');
    onClose({ title: title.trim(), emoji: emoji.trim(), color, days: days.length === 7 ? [] : days, goal: Math.max(1, Math.min(99, Number(goal) || 1)) });
  };

  return (
    <Modal
      title={editing ? 'Edit habit' : 'New habit'}
      onClose={() => onClose(null)}
      onSubmit={submit}
      footer={
        <>
          <button type="button" onClick={() => onClose(null)}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {editing ? 'Save' : 'Add habit'}
          </button>
        </>
      }
    >
      <p className="hint">Small things you want to do regularly. Habits are tracked on their own and aren't plans.</p>
      <div className="field-row">
        <label className="field emoji-field">
          <span>Emoji</span>
          <input aria-label="Habit emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} placeholder="💧" />
        </label>
        <label className="field grow">
          <span>Name</span>
          <input data-autofocus aria-label="Habit name" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Drink water" />
        </label>
      </div>
      <div className="field">
        <span>Days</span>
        <div className="weekday-picker" role="group" aria-label="Habit days">
          {WEEKDAY_ORDER.map((d) => (
            <button type="button" key={d} aria-pressed={days.includes(d)} className={days.includes(d) ? 'on' : ''} onClick={() => toggleDay(d)}>
              {WEEKDAY_NAMES[d]}
            </button>
          ))}
        </div>
        <small className="subtle">{days.length === 0 || days.length === 7 ? 'Every day' : 'Only on the chosen days'}</small>
      </div>
      <label className="field">
        <span>Times per day</span>
        <input type="number" min="1" max="99" aria-label="Times per day" value={goal} onChange={(e) => setGoal(e.target.value)} />
        <small className="subtle">1 = a simple check. More (e.g. 8 glasses of water) lets you count up during the day.</small>
      </label>
      <div className="field">
        <span>Color</span>
        <ColorPicker value={color} onChange={setColor} />
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

export function useHabitActions() {
  const { dispatch, dialogs, state, today } = useApp();
  const confirmDelete = useConfirmDelete();
  const actions = {
    async create() {
      const values = await dialogs.open((close) => <HabitDialog initial={{}} onClose={close} />);
      if (values) dispatch({ type: 'habit/add', habit: { ...values, id: newId(), start: today } });
    },
    async edit(habit) {
      const values = await dialogs.open((close) => <HabitDialog initial={habit} onClose={close} />);
      if (values) dispatch({ type: 'habit/update', id: habit.id, changes: values });
    },
    async remove(habit) {
      const ok = await confirmDelete({ title: 'Delete habit', message: `Delete "${habit.title}" and its history?` });
      if (ok) dispatch({ type: 'habit/delete', id: habit.id });
    },
    set(habit, date, count) {
      dispatch({ type: 'habit/set', id: habit.id, date, count });
    },
    // A click: a simple habit toggles; a counted one goes up by one (and back to 0 after the goal).
    tap(habit, date) {
      const n = habitCount(state.habitLog, date, habit.id);
      actions.set(habit, date, habit.goal === 1 ? (n ? 0 : 1) : n >= habit.goal ? 0 : n + 1);
    },
  };
  return actions;
}

// One habit for a day, as a round tap button: 💧 3/8.
export function HabitButton({ habit, date }) {
  const { state } = useApp();
  const actions = useHabitActions();
  const n = habitCount(state.habitLog, date, habit.id);
  const done = n >= habit.goal;
  const pct = Math.min(1, n / habit.goal);
  return (
    <button
      className={`habit-button ${done ? 'done' : ''}`}
      style={{ '--habit': habit.color, '--fill': `${pct * 100}%` }}
      aria-pressed={done}
      aria-label={`${habit.title} ${n} of ${habit.goal}`}
      title={habit.goal > 1 ? 'Click to count one more; right-click for one less' : done ? 'Done. Click to undo' : 'Click when done'}
      data-testid="habit-button"
      onClick={() => actions.tap(habit, date)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (n > 0) actions.set(habit, date, n - 1);
      }}
    >
      <span className="habit-fill" aria-hidden />
      <span className="habit-emoji" aria-hidden>
        {done ? '✓' : habit.emoji || '•'}
      </span>
      <span className="habit-name">{habit.title}</span>
      {habit.goal > 1 && (
        <span className="habit-count">
          {n}/{habit.goal}
        </span>
      )}
    </button>
  );
}

// The habits due on a day, as tap buttons (Dashboard card and Day Planner strip).
export function HabitsToday({ date, card = false }) {
  const { state } = useApp();
  const actions = useHabitActions();
  const list = habitsOn(state.habits, date);
  if (!card && !list.length) return null;
  const done = list.filter((h) => habitCount(state.habitLog, date, h.id) >= h.goal).length;
  const body = (
    <>
      <div className="card-head">
        {card ? <h2>Habits today</h2> : <span className="section-label">Habits</span>}
        <span className="subtle">{list.length ? `${done}/${list.length} done` : ''}</span>
        <Link to={paths.habits()} className="card-link">
          All habits →
        </Link>
      </div>
      {list.length === 0 ? (
        <p className="empty">
          No habits yet.{' '}
          <button className="link-button" onClick={() => actions.create()}>
            Add one
          </button>
        </p>
      ) : (
        <div className="habit-list">
          {list.map((h) => (
            <HabitButton key={h.id} habit={h} date={date} />
          ))}
        </div>
      )}
    </>
  );
  return card ? (
    <section className="card habits-card" data-testid="habits-today">
      {body}
    </section>
  ) : (
    <section className="habits-strip" data-testid="habits-strip" aria-label="Habits">
      {body}
    </section>
  );
}
