import React, { useState } from 'react';
import { useApp } from '../context.js';
import { newId } from '../lib/store.js';
import { SPECIAL_KINDS, countdownLabel, specialDaysOn, specialNote, upcomingSpecialDays } from '../lib/recurrence.js';
import { formatMedium, isDateKey, pad } from '../lib/dates.js';
import { Modal, useConfirmDelete } from './Dialogs.jsx';
import { EditIcon, TrashIcon } from './Icons.jsx';

// Create / edit a special day (birthday, anniversary, holiday…). Resolves with the values or null.
function SpecialDayDialog({ initial, categories, onClose }) {
  const editing = Boolean(initial.id);
  const [title, setTitle] = useState(initial.title ?? '');
  const [kind, setKind] = useState(initial.kind ?? 'birthday');
  const [emoji, setEmoji] = useState(initial.emoji ?? SPECIAL_KINDS[initial.kind ?? 'birthday'].emoji);
  const [date, setDate] = useState(initial.date);
  const [yearly, setYearly] = useState(initial.yearly ?? true);
  // For yearly days: count years from the date's year (age / "12 years").
  const [countYears, setCountYears] = useState(Boolean(initial.year) || !editing);
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [remind, setRemind] = useState(initial.remind ?? { weekBefore: true, dayBefore: true, onDay: true });
  const [error, setError] = useState('');

  const pickKind = (k) => {
    // Follow the type's emoji unless you picked your own.
    if (emoji === SPECIAL_KINDS[kind].emoji) setEmoji(SPECIAL_KINDS[k].emoji);
    setKind(k);
    if (k === 'birthday' || k === 'anniversary') setYearly(true);
  };

  const submit = () => {
    if (!title.trim()) return setError('Please give it a name, like "Mom\'s birthday".');
    if (!isDateKey(date)) return setError('Please pick the date.');
    const [y, m, d] = date.split('-').map(Number);
    onClose({
      title: title.trim(),
      kind,
      emoji: emoji.trim() || SPECIAL_KINDS[kind].emoji,
      month: m,
      day: d,
      yearly,
      year: !yearly || countYears ? y : null,
      categoryId: categoryId || null,
      notes,
      remind,
    });
  };

  return (
    <Modal
      title={editing ? 'Edit special day' : 'New special day'}
      onClose={() => onClose(null)}
      onSubmit={submit}
      footer={
        <>
          <button type="button" onClick={() => onClose(null)}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {editing ? 'Save' : 'Add special day'}
          </button>
        </>
      }
    >
      <p className="hint">Birthdays, anniversaries and holidays. They show on the calendar and dashboard, but they're not plans to check off.</p>
      <div className="field-row">
        <label className="field emoji-field">
          <span>Emoji</span>
          <input aria-label="Special day emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={8} />
        </label>
        <label className="field grow">
          <span>Name</span>
          <input data-autofocus aria-label="Special day name" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Mom's birthday" />
        </label>
      </div>
      <div className="segmented kind-picker" role="radiogroup" aria-label="Type">
        {Object.entries(SPECIAL_KINDS).map(([k, v]) => (
          <button type="button" key={k} role="radio" aria-checked={kind === k} className={kind === k ? 'on' : ''} onClick={() => pickKind(k)}>
            {v.emoji} {v.label}
          </button>
        ))}
      </div>
      <div className="field-row">
        <label className="field">
          <span>{kind === 'birthday' ? 'Date of birth' : 'Date'}</span>
          <input type="date" aria-label="Special day date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Category</span>
          <select aria-label="Special day category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="check-field">
        <input type="checkbox" aria-label="Every year" checked={yearly} onChange={(e) => setYearly(e.target.checked)} />
        <span>Every year</span>
      </label>
      {yearly && (
        <label className="check-field">
          <input type="checkbox" aria-label="Count the years" checked={countYears} onChange={(e) => setCountYears(e.target.checked)} />
          <span>
            {kind === 'birthday' ? 'Show the age' : 'Count the years'} <small className="subtle">(from the year in the date, e.g. "turns 52")</small>
          </span>
        </label>
      )}
      <fieldset className="remind-field">
        <legend>Remind me</legend>
        {[
          ['weekBefore', 'A week before'],
          ['dayBefore', 'The day before'],
          ['onDay', 'On the day'],
        ].map(([key, label]) => (
          <label key={key} className="check-field">
            <input type="checkbox" aria-label={label} checked={remind[key]} onChange={(e) => setRemind({ ...remind, [key]: e.target.checked })} />
            <span>{label}</span>
          </label>
        ))}
      </fieldset>
      <label className="field">
        <span>Notes</span>
        <textarea rows={2} aria-label="Special day notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Gift ideas, plans…" />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

// The date field's value for an existing special day (its year if it has one).
const dateFor = (s, fallbackYear) => `${s.year ?? fallbackYear}-${pad(s.month)}-${pad(s.day)}`;

export function useSpecialDayActions() {
  const { state, dispatch, dialogs, today, menu } = useApp();
  const confirmDelete = useConfirmDelete();
  const actions = {
    async create(defaults = {}) {
      const values = await dialogs.open((close) => <SpecialDayDialog initial={{ date: today, ...defaults }} categories={state.categories} onClose={close} />);
      if (values) dispatch({ type: 'special/add', special: { ...values, id: newId() } });
    },
    async edit(s) {
      const initial = { ...s, date: dateFor(s, today.slice(0, 4)) };
      const values = await dialogs.open((close) => <SpecialDayDialog initial={initial} categories={state.categories} onClose={close} />);
      if (values) dispatch({ type: 'special/update', id: s.id, changes: values });
    },
    async remove(s) {
      const ok = await confirmDelete({ title: 'Delete special day', message: `Delete "${s.title}"?` });
      if (ok) dispatch({ type: 'special/delete', id: s.id });
    },
    openMenu(e, s) {
      menu.open(e, [
        { label: 'Edit…', onSelect: () => actions.edit(s) },
        null,
        { label: 'Delete…', danger: true, onSelect: () => actions.remove(s) },
        { label: 'Undo', shortcut: 'Ctrl+Z', onSelect: () => dispatch({ type: 'history/undo' }) },
      ]);
    },
  };
  return actions;
}

// One special day: emoji, name, "turns 52", when; edit and delete buttons.
export function SpecialDayItem({ special, date, showWhen = true }) {
  const { today } = useApp();
  const actions = useSpecialDayActions();
  const note = specialNote(special, date);
  const inDays = Math.round((new Date(`${date}T12:00`) - new Date(`${today}T12:00`)) / 86_400_000);
  return (
    <div className="special-item" data-testid="special-day" onContextMenu={(e) => actions.openMenu(e, special)} onDoubleClick={() => actions.edit(special)}>
      <span className="special-emoji" aria-hidden>
        {special.emoji}
      </span>
      <div className="special-main">
        <span className="special-title">{special.title}</span>
        <span className="special-sub">
          {formatMedium(date)}
          {note && ` · ${note}`}
        </span>
      </div>
      {showWhen && <span className={`special-when ${inDays === 0 ? 'today' : ''}`}>{countdownLabel(inDays)}</span>}
      <div className="plan-actions">
        <button className="icon-button action-icon" aria-label={`Edit special day "${special.title}"`} title="Edit" onClick={() => actions.edit(special)}>
          <EditIcon />
        </button>
        <button className="icon-button action-icon danger-icon" aria-label={`Delete special day "${special.title}"`} title="Delete" onClick={() => actions.remove(special)}>
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

// A little ticket stuck on the bottom-right of a calendar day card.
export function SpecialTicket({ date }) {
  const { state } = useApp();
  const list = specialDaysOn(state.specialDays, date);
  if (!list.length) return null;
  const first = list[0];
  return (
    <span className="special-ticket" data-testid="special-ticket" title={list.map((s) => `${s.emoji} ${s.title}${specialNote(s, date) ? ` (${specialNote(s, date)})` : ''}`).join('\n')}>
      <span aria-hidden>{first.emoji}</span>
      <span className="ticket-text">{first.title}</span>
      {list.length > 1 && <span className="ticket-more">+{list.length - 1}</span>}
    </span>
  );
}

// Soft banner at the top of a day: "🎂 Mom's birthday · turns 52".
export function SpecialBanner({ date }) {
  const { state } = useApp();
  const actions = useSpecialDayActions();
  const list = specialDaysOn(state.specialDays, date);
  if (!list.length) return null;
  return (
    <section className="special-banner" data-testid="special-banner" aria-label="Special days">
      {list.map((s) => (
        <button key={s.id} className="special-chip" onClick={() => actions.edit(s)} onContextMenu={(e) => actions.openMenu(e, s)} title="Edit">
          <span aria-hidden>{s.emoji}</span> {s.title}
          {specialNote(s, date) && <span className="subtle"> · {specialNote(s, date)}</span>}
        </button>
      ))}
    </section>
  );
}

// Dashboard: the next special days with a countdown.
export function ComingUpCard() {
  const { state, today } = useApp();
  const actions = useSpecialDayActions();
  const list = upcomingSpecialDays(state.specialDays, today, 90).slice(0, 6);
  return (
    <section className="card coming-up" data-testid="coming-up">
      <div className="card-head">
        <h2>Coming up</h2>
        <button className="small-button card-link" onClick={() => actions.create()}>
          + Special day
        </button>
      </div>
      {list.length === 0 ? (
        <p className="empty">No special days in the next 3 months. Add birthdays and anniversaries so you never miss one.</p>
      ) : (
        <div className="plan-list">
          {list.map(({ special, date }) => (
            <SpecialDayItem key={special.id} special={special} date={date} />
          ))}
        </div>
      )}
    </section>
  );
}
