import React, { useState } from 'react';
import { useApp } from '../context.js';
import { newId } from '../lib/store.js';
import { daysLeftLabel, deadlinesDueOn, dueLabel, daysUntil, openDeadlines } from '../lib/recurrence.js';
import { formatMedium, formatTime, isDateKey, parseTime } from '../lib/dates.js';
import { Modal } from './Dialogs.jsx';
import Check from './Check.jsx';
import { EditIcon, FlagIcon, TrashIcon } from './Icons.jsx';

// Create / edit a deadline. Resolves with the values, or null when cancelled.
function DeadlineDialog({ initial, categories, onClose }) {
  const editing = Boolean(initial.id);
  const [title, setTitle] = useState(initial.title ?? '');
  const [due, setDue] = useState(initial.due);
  const [time, setTime] = useState(initial.hour !== null && initial.hour !== undefined ? formatTime(initial.hour, initial.minute) : '');
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [error, setError] = useState('');

  const submit = () => {
    if (!title.trim()) return setError('Please give the deadline a title.');
    if (!isDateKey(due)) return setError('Please pick the due date.');
    const t = parseTime(time);
    if (time && t === null) return setError('Please enter a valid time, or leave it empty.');
    onClose({
      title: title.trim(),
      due,
      hour: t === null ? null : Math.floor(t / 60),
      minute: t === null ? 0 : t % 60,
      categoryId: categoryId || null,
      notes,
    });
  };

  return (
    <Modal
      title={editing ? 'Edit deadline' : 'New deadline'}
      onClose={() => onClose(null)}
      onSubmit={submit}
      footer={
        <>
          <button type="button" onClick={() => onClose(null)}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {editing ? 'Save' : 'Add deadline'}
          </button>
        </>
      }
    >
      <p className="hint">Something to finish by a date, like homework or a project. It shows up on every day until it's due.</p>
      <label className="field">
        <span>Title</span>
        <input data-autofocus aria-label="Deadline title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Physics report" />
      </label>
      <div className="field-row">
        <label className="field">
          <span>Due date</span>
          <input type="date" aria-label="Due date" value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        <label className="field">
          <span>Time (optional)</span>
          <input type="time" aria-label="Due time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label className="field">
          <span>Category</span>
          <select aria-label="Deadline category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        <span>Notes</span>
        <textarea rows={2} aria-label="Deadline notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional details" />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

export function useDeadlineActions() {
  const { state, dispatch, dialogs, today, menu } = useApp();
  const actions = {
    async create(defaults = {}) {
      const values = await dialogs.open((close) => (
        <DeadlineDialog initial={{ due: today, hour: null, ...defaults }} categories={state.categories} onClose={close} />
      ));
      if (values) dispatch({ type: 'deadline/add', deadline: { ...values, id: newId() } });
    },
    async edit(deadline) {
      const values = await dialogs.open((close) => <DeadlineDialog initial={deadline} categories={state.categories} onClose={close} />);
      if (values) dispatch({ type: 'deadline/update', id: deadline.id, changes: values });
    },
    toggle(deadline) {
      dispatch({ type: 'deadline/update', id: deadline.id, changes: { done: !deadline.done } });
    },
    async remove(deadline) {
      const ok = await dialogs.confirm({
        title: 'Delete deadline',
        message: `Delete "${deadline.title}" (due ${formatMedium(deadline.due)})?`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) dispatch({ type: 'deadline/delete', id: deadline.id });
    },
    openMenu(e, deadline) {
      menu.open(e, [
        { label: deadline.done ? 'Mark as not done' : 'Mark as done', onSelect: () => actions.toggle(deadline) },
        { label: 'Edit…', onSelect: () => actions.edit(deadline) },
        null,
        {
          label: 'Category',
          children: [
            { label: 'No category', checked: !deadline.categoryId, onSelect: () => dispatch({ type: 'deadline/update', id: deadline.id, changes: { categoryId: null } }) },
            ...state.categories.map((c) => ({
              label: c.name,
              checked: deadline.categoryId === c.id,
              onSelect: () => dispatch({ type: 'deadline/update', id: deadline.id, changes: { categoryId: c.id } }),
            })),
          ],
        },
        null,
        { label: 'Delete…', danger: true, onSelect: () => actions.remove(deadline) },
        { label: 'Undo', shortcut: 'Ctrl+Z', onSelect: () => dispatch({ type: 'history/undo' }) },
      ]);
    },
  };
  return actions;
}

// One deadline with its check mark, countdown and edit/delete buttons.
export function DeadlineItem({ deadline, compact = false }) {
  const { state, today } = useApp();
  const actions = useDeadlineActions();
  const n = daysUntil(deadline.due, today);
  const urgency = deadline.done ? 'done' : n < 0 ? 'overdue' : n <= 1 ? 'soon' : n <= 3 ? 'near' : '';
  const category = state.categories.find((c) => c.id === deadline.categoryId);
  return (
    <div
      className={`deadline ${urgency} ${compact ? 'compact' : ''}`}
      data-testid="deadline"
      style={{ '--cat': category?.color ?? 'var(--muted-line)' }}
      onDoubleClick={(e) => !e.target.closest('button') && actions.edit(deadline)}
      onContextMenu={(e) => actions.openMenu(e, deadline)}
    >
      <Check size={compact ? 'small' : 'normal'} checked={deadline.done} label={`Mark deadline "${deadline.title}" done`} onChange={() => actions.toggle(deadline)} />
      <span className="deadline-flag" aria-hidden>
        <FlagIcon size={compact ? 14 : 16} />
      </span>
      <div className="deadline-main">
        <span className="deadline-title" title={`${deadline.title} · ${dueLabel(deadline.due, today)}`}>
          {deadline.title}
        </span>
        {!compact && (
          <span className="deadline-due">
            Due {formatMedium(deadline.due)}
            {deadline.hour !== null && ` · ${formatTime(deadline.hour, deadline.minute)}`}
            {category && (
              <span className="chip">
                <span className="dot" style={{ background: category.color }} />
                {category.name}
              </span>
            )}
          </span>
        )}
      </div>
      <span className="days-left" data-testid="days-left">
        {deadline.done ? 'Done' : daysLeftLabel(deadline.due, today, compact)}
        {compact && !deadline.done && deadline.hour !== null && ` · ${formatTime(deadline.hour, deadline.minute)}`}
      </span>
      {!compact && (
        <div className="plan-actions">
          <button className="icon-button action-icon" aria-label={`Edit deadline "${deadline.title}"`} title="Edit" onClick={() => actions.edit(deadline)}>
            <EditIcon />
          </button>
          <button className="icon-button action-icon danger-icon" aria-label={`Delete deadline "${deadline.title}"`} title="Delete" onClick={() => actions.remove(deadline)}>
            <TrashIcon />
          </button>
        </div>
      )}
    </div>
  );
}

// Slim bar at the top of the Day Planner: deadlines still ahead of this day (and overdue ones today).
// Deadlines due on the day itself are listed in the day's All day section instead.
export function DueSoonBar({ date }) {
  const { state, today } = useApp();
  const list = openDeadlines(state.deadlines, date, today).filter((d) => d.due !== date);
  if (!list.length) return null;
  const shown = list.slice(0, 6);
  return (
    <section className="due-soon" aria-label="Deadlines" data-testid="due-soon">
      <span className="section-label">
        <FlagIcon size={13} /> Due soon
      </span>
      <div className="due-soon-list">
        {shown.map((d) => (
          <DeadlineItem key={d.id} deadline={d} compact />
        ))}
        {list.length > shown.length && <span className="subtle">+{list.length - shown.length} more on the Dashboard</span>}
      </div>
    </section>
  );
}

// The small flag on a day in the Calendar, Week view and week strip: red while a deadline due that
// day is unfinished, green with a check once they're all done. The tooltip lists them with days left.
export function DayFlag({ date, className = 'cell-flag', size = 13 }) {
  const { state, today } = useApp();
  const list = deadlinesDueOn(state.deadlines, date);
  if (!list.length) return null;
  const open = list.filter((d) => !d.done).length;
  const title = list.map((d) => `${d.title} — ${d.done ? 'done' : daysLeftLabel(d.due, today)}`).join('\n');
  return (
    <span className={`${className} ${open ? '' : 'done'}`} title={title} data-testid={open ? className : `${className}-done`}>
      <FlagIcon size={size} />
      {open > 1 && <span className="flag-count">{open}</span>}
      {!open && <span className="flag-check">✓</span>}
    </span>
  );
}
