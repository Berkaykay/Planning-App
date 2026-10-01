import React, { useState } from 'react';
import { Modal } from './Dialogs.jsx';
import { formatHour, formatMedium, isDateKey, weekday, WEEKDAY_NAMES, WEEKDAY_ORDER } from '../lib/dates.js';
import { describeRepeat } from '../lib/recurrence.js';

const HOURS = Array.from({ length: 24 }, (_, h) => h);

// Create or edit a plan. Resolves with { values, scope } where scope is 'all' or 'one'
// ('one' = only the occurrence on `occurrenceDate` of a repeating plan).
export default function PlanDialog({ categories, initial, occurrenceDate, onClose }) {
  const editing = Boolean(initial.id);
  const isSeries = editing && Boolean(initial.repeat);
  const [scope, setScope] = useState('all');
  const [title, setTitle] = useState(initial.title ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [date, setDate] = useState(isSeries && scope === 'one' ? occurrenceDate : initial.date);
  const [hour, setHour] = useState(initial.hour ?? null);
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? '');
  const [freq, setFreq] = useState(initial.repeat?.freq ?? 'none');
  const [weekdays, setWeekdays] = useState(initial.repeat?.weekdays?.length ? initial.repeat.weekdays : [weekday(initial.date)]);
  const [until, setUntil] = useState(initial.repeat?.until ?? '');
  const [error, setError] = useState('');

  const onlyThisDay = isSeries && scope === 'one';
  const changeScope = (next) => {
    setScope(next);
    setDate(next === 'one' ? occurrenceDate : initial.date);
  };

  const toggleWeekday = (d) =>
    setWeekdays((list) => (list.includes(d) ? list.filter((x) => x !== d) : [...list, d]));

  const submit = () => {
    if (!title.trim()) return setError('Please give the plan a title.');
    if (!isDateKey(date)) return setError('Please pick a valid date.');
    let repeat = null;
    if (!onlyThisDay && freq !== 'none') {
      if (freq === 'weekly' && !weekdays.length) return setError('Pick at least one weekday.');
      if (until && until < date) return setError('The end date must be after the start date.');
      repeat = { freq, weekdays: freq === 'weekly' ? weekdays : undefined, until: until || null };
    }
    const values = { title: title.trim(), notes, date, hour, categoryId: categoryId || null };
    if (!onlyThisDay) values.repeat = repeat;
    onClose({ values, scope });
  };

  const repeating = !onlyThisDay && freq !== 'none';
  const preview = repeating
    ? describeRepeat({ date, repeat: { freq, weekdays, until: until || null } })
    : null;

  return (
    <Modal
      title={editing ? 'Edit plan' : 'New plan'}
      onClose={() => onClose(null)}
      onSubmit={submit}
      footer={
        <>
          <button type="button" onClick={() => onClose(null)}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {editing ? 'Save' : 'Add plan'}
          </button>
        </>
      }
    >
      {isSeries && (
        <fieldset className="field scope">
          <legend>This plan repeats. Apply changes to</legend>
          <label>
            <input type="radio" name="scope" checked={scope === 'all'} onChange={() => changeScope('all')} />
            All occurrences
          </label>
          <label>
            <input type="radio" name="scope" checked={scope === 'one'} onChange={() => changeScope('one')} />
            Only {formatMedium(occurrenceDate)}
          </label>
        </fieldset>
      )}
      <label className="field">
        <span>Title</span>
        <input data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do you want to do?" aria-label="Title" />
      </label>
      <div className="field-row">
        <label className="field">
          <span>{repeating ? 'Starts on' : 'Date'}</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" required />
        </label>
        <label className="field">
          <span>Time</span>
          <select aria-label="Time" value={hour ?? ''} onChange={(e) => setHour(e.target.value === '' ? null : Number(e.target.value))}>
            <option value="">All day</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {formatHour(h)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Category</span>
          <select aria-label="Category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!onlyThisDay && (
        <div className="repeat-box">
          <div className="field-row">
            <label className="field">
              <span>Repeat</span>
              <select aria-label="Repeat" value={freq} onChange={(e) => setFreq(e.target.value)}>
                <option value="none">Does not repeat</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </label>
            {repeating && (
              <label className="field">
                <span>Ends (optional)</span>
                <input type="date" aria-label="Repeat until" value={until} min={date} onChange={(e) => setUntil(e.target.value)} />
              </label>
            )}
          </div>
          {freq === 'weekly' && (
            <div className="weekday-picker" role="group" aria-label="Repeat on">
              {WEEKDAY_ORDER.map((d) => (
                <button
                  type="button"
                  key={d}
                  className={weekdays.includes(d) ? 'on' : ''}
                  aria-pressed={weekdays.includes(d)}
                  onClick={() => toggleWeekday(d)}
                >
                  {WEEKDAY_NAMES[d]}
                </button>
              ))}
            </div>
          )}
          {repeating && (
            <p className="hint">
              ↻ {preview}. Each day gets its own check mark, which starts fresh every time the plan comes around, and
              past check marks are kept as history.
            </p>
          )}
        </div>
      )}
      <label className="field">
        <span>Notes</span>
        <textarea rows={3} aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional details" />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
