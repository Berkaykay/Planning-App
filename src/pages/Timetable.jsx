import React, { useMemo, useState } from 'react';
import { useApp } from '../context.js';
import { newId, normalizeTimetable } from '../lib/store.js';
import { minutesToTime, parseTime, WEEKDAY_NAMES } from '../lib/dates.js';
import { paths } from '../lib/routes.js';
import Link from '../components/Link.jsx';

const NEW_CATEGORY = '__new__';
const WEEK = [1, 2, 3, 4, 5];
const WEEK_WITH_SATURDAY = [1, 2, 3, 4, 5, 6];

// Five 40-minute lessons with 10-minute breaks, as a starting point to edit.
function defaultPeriods() {
  return Array.from({ length: 5 }, (_, i) => {
    const start = 8 * 60 + 30 + i * 50;
    return { id: newId(), start: minutesToTime(start), end: minutesToTime(start + 40) };
  });
}

function draftFrom(timetable, categories, today) {
  if (timetable) return { ...timetable, until: timetable.until ?? '', categoryId: timetable.categoryId ?? '' };
  const school = categories.find((c) => c.name.toLowerCase() === 'school');
  return {
    id: newId(),
    name: 'School',
    categoryId: school ? school.id : NEW_CATEGORY,
    weekdays: WEEK,
    periods: defaultPeriods(),
    cells: {},
    startDate: today,
    until: '',
  };
}

const cellKey = (weekday, periodId) => `${weekday}:${periodId}`;

// Comparable form of a timetable, ignoring empty cells and key order.
function signature(t) {
  const n = normalizeTimetable({ ...t, until: t.until || null, categoryId: t.categoryId || null });
  return JSON.stringify({ ...n, cells: Object.entries(n.cells).sort() });
}

// Weekly school timetable: type subjects into a grid once and they repeat every week.
export default function Timetable() {
  const { state, dispatch, dialogs, today } = useApp();
  const saved = state.timetables[0] ?? null;
  const [draft, setDraft] = useState(() => draftFrom(saved, state.categories, today));
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const update = (changes) => {
    setDraft((d) => ({ ...d, ...changes }));
    setError('');
    setMessage('');
  };
  const days = draft.weekdays;
  const subjects = useMemo(() => [...new Set(Object.values(draft.cells).map((v) => v.trim()).filter(Boolean))].sort(), [draft.cells]);
  const lessonCount = draft.periods.reduce(
    (n, p) => n + days.filter((d) => draft.cells[cellKey(d, p.id)]?.trim()).length,
    0,
  );
  const dirty = !saved || signature(saved) !== signature(draft);

  const setCell = (weekday, periodId, value) => update({ cells: { ...draft.cells, [cellKey(weekday, periodId)]: value } });

  const setPeriod = (id, field, value) => {
    update({
      periods: draft.periods.map((p) => {
        if (p.id !== id) return p;
        const next = { ...p, [field]: value };
        // Moving the start time keeps the lesson length.
        const [s, e, v] = [parseTime(p.start), parseTime(p.end), parseTime(value)];
        if (field === 'start' && s !== null && e !== null && v !== null && e > s) next.end = minutesToTime(Math.min(v + e - s, 1439));
        return next;
      }),
    });
  };

  // A new lesson follows the last one, with the same length and break.
  const addPeriod = () => {
    const ps = draft.periods;
    const last = ps[ps.length - 1];
    let start = 8 * 60 + 30;
    let length = 40;
    if (last && parseTime(last.start) !== null) {
      const lastStart = parseTime(last.start);
      const lastEnd = parseTime(last.end) ?? lastStart + 40;
      const prev = ps[ps.length - 2];
      const gap = prev && parseTime(prev.end) !== null ? Math.max(0, lastStart - parseTime(prev.end)) : 10;
      length = Math.max(5, lastEnd - lastStart);
      start = lastEnd + gap;
    }
    start = Math.min(start, 1439 - length);
    update({ periods: [...ps, { id: newId(), start: minutesToTime(start), end: minutesToTime(start + length) }] });
  };

  const removePeriod = (id) => {
    const cells = Object.fromEntries(Object.entries(draft.cells).filter(([key]) => !key.endsWith(`:${id}`)));
    update({ periods: draft.periods.filter((p) => p.id !== id), cells });
  };

  const copyFromPreviousDay = (weekday) => {
    const prev = days[days.indexOf(weekday) - 1];
    const cells = { ...draft.cells };
    for (const p of draft.periods) cells[cellKey(weekday, p.id)] = draft.cells[cellKey(prev, p.id)] ?? '';
    update({ cells });
  };

  const setSaturday = (on) => {
    const cells = on ? draft.cells : Object.fromEntries(Object.entries(draft.cells).filter(([key]) => !key.startsWith('6:')));
    update({ weekdays: on ? WEEK_WITH_SATURDAY : WEEK, cells });
  };

  // Enter moves to the cell below, like a spreadsheet.
  const onCellKey = (e, row, col) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = document.querySelector(`[data-cell="${row + (e.shiftKey ? -1 : 1)}:${col}"]`);
    next?.focus();
  };

  const save = () => {
    for (const [i, p] of draft.periods.entries()) {
      const s = parseTime(p.start);
      const e = parseTime(p.end);
      if (s === null) return setError(`Lesson ${i + 1} needs a start time.`);
      if (p.end && (e === null || e <= s)) return setError(`Lesson ${i + 1} must end after it starts.`);
    }
    if (draft.until && draft.until < draft.startDate) return setError('The end date must be after the start date.');
    let categoryId = draft.categoryId || null;
    if (categoryId === NEW_CATEGORY) {
      const existing = state.categories.find((c) => c.name.toLowerCase() === 'school');
      categoryId = existing?.id ?? newId();
      if (!existing) dispatch({ type: 'category/add', id: categoryId, name: 'School' });
    }
    const timetable = { ...draft, categoryId, until: draft.until || null };
    dispatch({ type: 'timetable/save', timetable });
    setDraft(draftFrom(normalizeTimetable(timetable), state.categories, today));
    setError('');
    setMessage(`Saved. ${lessonCount} lesson${lessonCount === 1 ? '' : 's'} now repeat every week.`);
  };

  const remove = async () => {
    const ok = await dialogs.confirm({
      title: 'Delete timetable',
      message: `Delete "${saved.name}" and all its lessons from your calendar, including their check marks?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    dispatch({ type: 'timetable/delete', id: saved.id });
    setDraft(draftFrom(null, state.categories, today));
    setMessage('Timetable deleted.');
  };

  return (
    <div className="timetable-page">
      <header className="page-header">
        <h1>Timetable</h1>
        <div className="subtle">
          Set your lesson times, then type each subject into the grid once. Every lesson repeats weekly with its own
          check mark. Press Enter to jump to the cell below.
        </div>
      </header>

      <section className="card timetable-settings">
        <label className="field">
          <span>Name</span>
          <input aria-label="Timetable name" value={draft.name} onChange={(e) => update({ name: e.target.value })} />
        </label>
        <label className="field">
          <span>Category</span>
          <select aria-label="Timetable category" value={draft.categoryId ?? ''} onChange={(e) => update({ categoryId: e.target.value })}>
            {!state.categories.some((c) => c.name.toLowerCase() === 'school') && <option value={NEW_CATEGORY}>School (new)</option>}
            <option value="">No category</option>
            {state.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Starts</span>
          <input type="date" aria-label="Timetable starts" value={draft.startDate} onChange={(e) => e.target.value && update({ startDate: e.target.value })} />
        </label>
        <label className="field">
          <span>Ends (term end, optional)</span>
          <input type="date" aria-label="Timetable ends" value={draft.until} min={draft.startDate} onChange={(e) => update({ until: e.target.value })} />
        </label>
        <label className="inline-check saturday">
          <input type="checkbox" checked={days.includes(6)} onChange={(e) => setSaturday(e.target.checked)} />
          Include Saturday
        </label>
      </section>

      <section className="card timetable-card">
        <datalist id="subjects">
          {subjects.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <table className="timetable-grid">
          <thead>
            <tr>
              <th className="period-head">Lesson time</th>
              {days.map((d, col) => (
                <th key={d}>
                  <div className="day-head">
                    <span>{WEEKDAY_NAMES[d]}</span>
                    {col > 0 && (
                      <button
                        className="icon-button"
                        title={`Copy ${WEEKDAY_NAMES[days[col - 1]]} to ${WEEKDAY_NAMES[d]}`}
                        aria-label={`Copy ${WEEKDAY_NAMES[days[col - 1]]} to ${WEEKDAY_NAMES[d]}`}
                        onClick={() => copyFromPreviousDay(d)}
                      >
                        ⧉
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {draft.periods.map((p, row) => (
              <tr key={p.id}>
                <td className="period-cell">
                  <span className="period-number">{row + 1}</span>
                  <input type="time" aria-label={`Lesson ${row + 1} start`} value={p.start} onChange={(e) => setPeriod(p.id, 'start', e.target.value)} />
                  <span className="subtle">–</span>
                  <input type="time" aria-label={`Lesson ${row + 1} end`} value={p.end} onChange={(e) => setPeriod(p.id, 'end', e.target.value)} />
                  <button className="icon-button" aria-label={`Remove lesson ${row + 1}`} title="Remove this lesson time" onClick={() => removePeriod(p.id)}>
                    ✕
                  </button>
                </td>
                {days.map((d, col) => (
                  <td key={d}>
                    <input
                      className="subject-input"
                      list="subjects"
                      aria-label={`${WEEKDAY_NAMES[d]} lesson ${row + 1}`}
                      placeholder="—"
                      data-cell={`${row}:${col}`}
                      value={draft.cells[cellKey(d, p.id)] ?? ''}
                      onChange={(e) => setCell(d, p.id, e.target.value)}
                      onKeyDown={(e) => onCellKey(e, row, col)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <button className="add-lesson" onClick={addPeriod}>
          + Add lesson time
        </button>
      </section>

      <footer className="timetable-actions">
        <span className="subtle">
          {lessonCount} lesson{lessonCount === 1 ? '' : 's'} per week
          {dirty && saved && ' · unsaved changes'}
        </span>
        {message && (
          <span className="badge success" role="status">
            {message} <Link to={paths.calendar()}>See calendar →</Link>
          </span>
        )}
        {error && (
          <span className="form-error" role="alert">
            {error}
          </span>
        )}
        <span className="spacer" />
        {saved && (
          <button className="danger" onClick={remove}>
            Delete timetable
          </button>
        )}
        <button className="primary" onClick={save} disabled={!dirty}>
          Save timetable
        </button>
      </footer>
    </div>
  );
}
