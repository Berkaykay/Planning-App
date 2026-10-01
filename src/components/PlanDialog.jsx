import React, { useState } from 'react';
import { Modal } from './Dialogs.jsx';
import { formatMedium, formatTime, isDateKey, minutesToTime, parseTime, weekday, WEEKDAY_NAMES, WEEKDAY_ORDER } from '../lib/dates.js';
import { describeRepeat } from '../lib/recurrence.js';

// Create or edit a plan. Resolves with { values, scope } where scope is 'all' or 'one'
// ('one' = only the occurrence on `occurrenceDate` of a repeating plan).
export default function PlanDialog({ categories, initial, occurrenceDate, onClose }) {
  const editing = Boolean(initial.id);
  const isSeries = editing && Boolean(initial.repeat);
  const [scope, setScope] = useState('all');
  const [title, setTitle] = useState(initial.title ?? '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [checklist, setChecklist] = useState(initial.checklist ?? []);
  const [newItem, setNewItem] = useState('');
  const [date, setDate] = useState(isSeries && scope === 'one' ? occurrenceDate : initial.date);
  const timed = initial.hour !== null && initial.hour !== undefined;
  const startMinutes = timed ? initial.hour * 60 + (initial.minute ?? 0) : null;
  const [allDay, setAllDay] = useState(!timed);
  const [start, setStart] = useState(timed ? formatTime(initial.hour, initial.minute ?? 0) : '09:00');
  const [end, setEnd] = useState(timed && initial.duration ? minutesToTime(startMinutes + initial.duration) : '');
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

  // Changing the start time moves the end time along with it, keeping the length.
  const changeStart = (value) => {
    const [oldStart, oldEnd, next] = [parseTime(start), parseTime(end), parseTime(value)];
    if (oldStart !== null && oldEnd !== null && next !== null && oldEnd > oldStart) {
      setEnd(minutesToTime(Math.min(next + oldEnd - oldStart, 23 * 60 + 59)));
    }
    setStart(value);
  };

  const submit = () => {
    if (!title.trim()) return setError('Please give the plan a title.');
    if (!isDateKey(date)) return setError('Please pick a valid date.');
    let time = { hour: null, minute: 0, duration: null };
    if (!allDay) {
      const s = parseTime(start);
      const e = parseTime(end);
      if (s === null) return setError('Please enter a start time, or tick "All day".');
      if (end && (e === null || e <= s)) return setError('The end time must be after the start time.');
      time = { hour: Math.floor(s / 60), minute: s % 60, duration: e === null ? null : e - s };
    }
    let repeat = null;
    if (!onlyThisDay && freq !== 'none') {
      if (freq === 'weekly' && !weekdays.length) return setError('Pick at least one weekday.');
      if (until && until < date) return setError('The end date must be after the start date.');
      repeat = { freq, weekdays: freq === 'weekly' ? weekdays : undefined, until: until || null };
    }
    const items = newItem.trim() ? [...checklist, { text: newItem.trim() }] : checklist;
    const values = { title: title.trim(), notes, date, ...time, categoryId: categoryId || null, checklist: items };
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
      {initial.timetableId && scope === 'all' && (
        <p className="hint">
          This lesson comes from your Timetable. To change it for every week, edit the Timetable page instead; saving the
          timetable again overwrites changes made here.
        </p>
      )}
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
        <div className="field time-field">
          <span>Time</span>
          <div className="time-inputs">
            <label className="inline-check">
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
              All day
            </label>
            {!allDay && (
              <>
                <input type="time" aria-label="Start time" value={start} onChange={(e) => changeStart(e.target.value)} />
                <span className="subtle">to</span>
                <input type="time" aria-label="End time" value={end} onChange={(e) => setEnd(e.target.value)} />
              </>
            )}
          </div>
        </div>
      </div>
      <div className="field-row">
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
      <div className="field checklist-editor">
        <span>Checklist</span>
        {checklist.length > 0 && (
          <ul>
            {checklist.map((item, i) => (
              <li key={item.id ?? i}>
                <span>☐ {item.text}</span>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove "${item.text}"`}
                  onClick={() => setChecklist(checklist.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <input
          aria-label="Add checklist item"
          placeholder="Add a sub-task and press Enter"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            if (newItem.trim()) setChecklist([...checklist, { text: newItem.trim() }]);
            setNewItem('');
          }}
        />
      </div>
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
