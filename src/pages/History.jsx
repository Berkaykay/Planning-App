import React, { useMemo, useState } from 'react';
import { useApp } from '../context.js';
import { historyDays, isDone } from '../lib/recurrence.js';
import { formatMedium, formatMonth, formatTimeRange, monthOf } from '../lib/dates.js';
import { paths } from '../lib/routes.js';
import Link from '../components/Link.jsx';
import Check from '../components/Check.jsx';

const PAGE = 30;
const FILTERS = [
  { id: 'all', label: 'All days' },
  { id: 'missed', label: 'With missed plans' },
  { id: 'perfect', label: 'All done' },
];

// A compact record of past days: one line per day, expandable to see what was done and missed.
export default function History() {
  const { state, today } = useApp();
  const [count, setCount] = useState(PAGE);
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(() => new Set());

  const { entries, next } = useMemo(() => historyDays(state.plans, state.days, today, count), [state.plans, state.days, today, count]);
  const shown = entries.filter((e) =>
    filter === 'missed' ? e.missed.length > 0 : filter === 'perfect' ? e.missed.length === 0 && e.done.length > 0 : true,
  );
  const totals = entries.reduce((t, e) => ({ done: t.done + e.done.length, missed: t.missed + e.missed.length }), { done: 0, missed: 0 });

  const toggle = (date) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(date)) n.delete(date);
      else n.add(date);
      return n;
    });

  let lastMonth = null;
  return (
    <div className="history-page">
      <header className="page-header">
        <h1>History</h1>
        <div className="subtle">
          Your past days: what you finished and what was left undone. Lessons aren't included. Click a day to see its plans.
        </div>
      </header>

      <div className="history-toolbar">
        <div className="segmented" role="radiogroup" aria-label="Filter days">
          {FILTERS.map((f) => (
            <button key={f.id} role="radio" aria-checked={filter === f.id} className={filter === f.id ? 'on' : ''} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <span className="subtle">
          Last {entries.length} active days: <strong className="ok">✓ {totals.done}</strong> done · <strong className="bad">✗ {totals.missed}</strong> missed
        </span>
      </div>

      {shown.length === 0 && <p className="empty">{entries.length ? 'No days match this filter.' : 'Nothing here yet. Past days will show up here.'}</p>}

      <ul className="history-list">
        {shown.map((e) => {
          const month = monthOf(e.date);
          const heading = month !== lastMonth ? <li className="history-month">{formatMonth(month)}</li> : null;
          lastMonth = month;
          const total = e.done.length + e.missed.length;
          const expanded = open.has(e.date);
          return (
            <React.Fragment key={e.date}>
              {heading}
              <li className={`history-day ${expanded ? 'open' : ''}`} data-testid={`history-${e.date}`}>
                <button className="history-row" aria-expanded={expanded} onClick={() => toggle(e.date)}>
                  <span className="history-chevron" aria-hidden>
                    {expanded ? '▾' : '▸'}
                  </span>
                  <span className="history-date">{formatMedium(e.date)}</span>
                  {e.dayDone && (
                    <span className="mini-stamp" title="Day completed">
                      ✓
                    </span>
                  )}
                  <span className="history-bar" aria-hidden>
                    <span style={{ width: `${total ? (e.done.length / total) * 100 : 0}%` }} />
                  </span>
                  <span className="history-counts">
                    <span className="ok">✓ {e.done.length}</span>
                    <span className={e.missed.length ? 'bad' : 'muted'}>✗ {e.missed.length}</span>
                  </span>
                </button>
                {expanded && <DayDetails entry={e} />}
              </li>
            </React.Fragment>
          );
        })}
      </ul>

      {next && (
        <button className="load-more" onClick={() => setCount((c) => c + PAGE)}>
          Load older days
        </button>
      )}
    </div>
  );
}

function DayDetails({ entry }) {
  const { state, dispatch } = useApp();
  const category = (id) => state.categories.find((c) => c.id === id);
  const row = (p) => {
    const done = isDone(p, entry.date);
    const c = category(p.categoryId);
    return (
      <li key={p.id} className={`history-plan ${done ? 'done' : 'missed'}`}>
        <Check size="small" checked={done} label={`Mark "${p.title}" complete`} onChange={(v) => dispatch({ type: 'plan/setDone', id: p.id, date: entry.date, done: v })} />
        <span className="history-plan-title">{p.title}</span>
        <span className="subtle">{formatTimeRange(p)}</span>
        {c && (
          <span className="chip">
            <span className="dot" style={{ background: c.color }} />
            {c.name}
          </span>
        )}
      </li>
    );
  };
  return (
    <div className="history-details">
      {entry.missed.length > 0 && (
        <>
          <div className="section-label">Not done · {entry.missed.length}</div>
          <ul>{entry.missed.map(row)}</ul>
        </>
      )}
      {entry.done.length > 0 && (
        <>
          <div className="section-label">Done · {entry.done.length}</div>
          <ul>{entry.done.map(row)}</ul>
        </>
      )}
      <Link to={paths.day(entry.date)} className="card-link">
        Open this day →
      </Link>
    </div>
  );
}
