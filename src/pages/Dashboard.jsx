import React, { useState } from 'react';
import { useApp } from '../context.js';
import {
  tasksOn,
  isDone,
  dayProgress,
  isLesson,
  unfinishedPlans,
  categoryStats,
  lessonsOn,
  dashboardDeadlines,
  currentStreak,
  rangeStats,
  upNext,
} from '../lib/recurrence.js';
import { addDays, formatLong, formatTime, formatTimeRange, formatWeekday, fromKey, relativeDayLabel, weekStart } from '../lib/dates.js';
import { DayFlag, DeadlineItem, useDeadlineActions } from '../components/deadlineActions.jsx';
import { useNow } from '../components/LessonStrip.jsx';
import { DayStamp } from '../components/Check.jsx';
import { paths } from '../lib/routes.js';
import { newId } from '../lib/store.js';
import PlanItem from '../components/PlanItem.jsx';
import Check from '../components/Check.jsx';
import Link from '../components/Link.jsx';
import RepeatTracker from '../components/RepeatTracker.jsx';
import LessonStrip from '../components/LessonStrip.jsx';
import { Progress, QuickAdd } from './DayPlanner.jsx';

const MAX_UNFINISHED = 5;

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Dashboard() {
  const { state, dispatch, today } = useApp();
  const todays = tasksOn(state.plans, today);
  const done = todays.filter((p) => isDone(p, today)).length;
  const dayDone = Boolean(state.days[today]?.done);
  const routines = state.plans.filter(
    (p) => p.repeat && !isLesson(p) && (!p.repeat.until || p.repeat.until >= today) && p.date <= today,
  );
  const upcoming = Array.from({ length: 7 }, (_, i) => addDays(today, i + 1));

  return (
    <div className="dashboard">
      <header className="page-header">
        <h1>{greeting()}</h1>
        <div className="subtle">{formatLong(today)}</div>
      </header>

      <WeekStrip />

      <div className="cards">
        <section className={`card today-card ${dayDone ? 'day-done' : ''}`}>
          <div className="card-head">
            <Check checked={dayDone} onChange={(v) => dispatch({ type: 'day/setDone', date: today, done: v })} label="Mark today complete" />
            <h2 className="day-heading">Today</h2>
            <span className="subtle">
              {done}/{todays.length} done
            </span>
            <Link to={paths.day(today)} className="card-link">
              Open planner →
            </Link>
          </div>
          <Progress done={done} total={todays.length} />
          <div className="plan-list">
            {todays.length === 0 && <p className="empty">Nothing planned for today yet.</p>}
            {todays.map((p) => (
              <PlanItem key={p.id} plan={p} date={today} />
            ))}
          </div>
          <QuickAdd
            placeholder="Add a plan for today"
            onAdd={(title) => dispatch({ type: 'plan/add', plan: { id: newId(), title, date: today, hour: null } })}
          />
          <LessonStrip date={today} compact />
        </section>

        <div className="dashboard-side">
          <UpNext />
          <Deadlines />
          <Unfinished />

          <section className="card">
            <div className="card-head">
              <h2>Next 7 days</h2>
              <Link to={paths.calendar()} className="card-link">
                Calendar →
              </Link>
            </div>
            <ul className="upcoming">
              {upcoming.map((date) => {
                const { total, done: d } = dayProgress(state.plans, date);
                const titles = tasksOn(state.plans, date).map((p) => p.title);
                const lessons = lessonsOn(state.plans, date).length;
                return (
                  <li key={date} className={state.days[date]?.done ? 'day-done' : ''}>
                    <Link to={paths.day(date)} className="upcoming-day">
                      <span className="day-heading">{relativeDayLabel(date, today)}</span>
                      <span className="subtle ellipsis">
                        {titles.length ? titles.join(', ') : 'Free'}
                        {lessons > 0 && <span className="lesson-note"> · {lessons} lessons</span>}
                      </span>
                      {total > 0 && (
                        <span className="count">
                          {d}/{total}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        <Stats />

        {routines.length > 0 && (
          <section className="card wide">
            <div className="card-head">
              <h2>Routines</h2>
            </div>
            {routines.map((p) => (
              <RepeatTracker key={p.id} plan={p} />
            ))}
          </section>
        )}

        <section className="card wide">
          <div className="card-head">
            <h2>Categories</h2>
            <Link to={paths.categories()} className="card-link">
              Manage →
            </Link>
          </div>
          <div className="category-tiles">
            {state.categories.map((c) => (
              <CategoryTile key={c.id} category={c} todays={todays} />
            ))}
            {state.categories.length === 0 && <p className="empty">No categories yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function CategoryTile({ category, todays }) {
  const { state, today } = useApp();
  const stats = categoryStats(state.plans, category.id, today);
  const todayCount = todays.filter((p) => p.categoryId === category.id).length;
  const lessonCount = lessonsOn(state.plans, today).filter((p) => p.categoryId === category.id).length;
  const week = stats.thisWeek;
  return (
    <Link to={paths.category(category.id)} className="category-tile" style={{ '--cat': category.color }} title={category.description || category.name}>
      <span className="tile-icon" aria-hidden>
        {category.icon || category.name.slice(0, 1).toUpperCase()}
      </span>
      <span className="tile-body">
        <span className="tile-name">{category.name}</span>
        <span className="subtle">
          {todayCount ? `${todayCount} today` : lessonCount ? '' : 'Nothing today'}
          {lessonCount > 0 && `${todayCount ? ' · ' : ''}${lessonCount} lesson${lessonCount === 1 ? '' : 's'} today`}
          {week.total > 0 && ` · ${week.done}/${week.total} this week`}
        </span>
        <span className="tile-bar">
          <span style={{ width: `${week.total ? (week.done / week.total) * 100 : 0}%` }} />
        </span>
      </span>
    </Link>
  );
}

// Plans from recent days that were never finished, with a quick way to bring them to today.
function Unfinished() {
  const { state, dispatch, today } = useApp();
  const list = unfinishedPlans(state.plans, today);
  if (!list.length) return null;
  return (
    <section className="card unfinished" data-testid="unfinished">
      <div className="card-head">
        <h2>Unfinished</h2>
        <span className="subtle">{list.length} from past days</span>
        <button className="link-button card-link" onClick={() => dispatch({ type: 'plans/moveToDate', ids: list.map((p) => p.id), date: today })}>
          Move all to today
        </button>
      </div>
      <div className="plan-list">
        {list.slice(0, MAX_UNFINISHED).map((p) => (
          <div key={p.id} className="unfinished-row">
            <PlanItem plan={p} date={p.date} showDate showTime={false} />
            <button className="small-button" onClick={() => dispatch({ type: 'plans/moveToDate', ids: [p.id], date: today })}>
              Move to today
            </button>
          </div>
        ))}
      </div>
      {list.length > MAX_UNFINISHED && (
        <Link to={paths.history()} className="card-link more-link">
          See all in History →
        </Link>
      )}
    </section>
  );
}

// Mon-Sun of the current week: progress per day, stamps on completed days, deadline flags.
function WeekStrip() {
  const { state, today, navigate } = useApp();
  const start = weekStart(today);
  return (
    <section className="week-strip" aria-label="This week" data-testid="week-strip">
      {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((date) => {
        const { total, done } = dayProgress(state.plans, date);
        const dayDone = Boolean(state.days[date]?.done);
        return (
          <button
            key={date}
            className={`strip-day ${date === today ? 'today' : ''} ${date < today ? 'past' : ''} ${dayDone ? 'day-done' : ''}`}
            onClick={(e) => navigate(paths.day(date), { newTab: e.ctrlKey || e.metaKey })}
            title={`Open ${formatLong(date)}`}
          >
            <span className="strip-weekday">{formatWeekday(date)}</span>
            <span className="strip-date">{fromKey(date).getDate()}</span>
            <span className="strip-progress">
              <span style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
            </span>
            <span className="strip-count">
              {total ? `${done}/${total}` : '–'}
              <DayFlag date={date} className="strip-flag" size={11} />
            </span>
            {dayDone && <DayStamp />}
          </button>
        );
      })}
    </section>
  );
}

// What's next today: the next lesson and the next timed plan, with a countdown.
function UpNext() {
  const { state, today } = useApp();
  const now = useNow();
  const { lesson, plan, minutes } = upNext(state.plans, today, now);
  if (!lesson && !plan) return null;
  const inText = (p) => {
    const diff = p.hour * 60 + p.minute - minutes;
    if (diff < 60) return `in ${diff} min`;
    return `at ${formatTime(p.hour, p.minute)}`;
  };
  return (
    <section className="card up-next" data-testid="up-next">
      <h2>Up next</h2>
      {lesson && (
        <div className="up-next-row">
          <span className="up-next-kind">Lesson</span>
          <span className="up-next-title">{lesson.title}</span>
          <span className="up-next-when">{inText(lesson)}</span>
          <span className="subtle">{formatTimeRange(lesson)}</span>
        </div>
      )}
      {plan && (
        <div className="up-next-row">
          <span className="up-next-kind plan">Plan</span>
          <span className="up-next-title">{plan.title}</span>
          <span className="up-next-when">{inText(plan)}</span>
          <span className="subtle">{formatTimeRange(plan)}</span>
        </div>
      )}
    </section>
  );
}

function Deadlines() {
  const { state, today } = useApp();
  const actions = useDeadlineActions();
  const [showPast, setShowPast] = useState(false);
  // Checked deadlines stay where they are (crossed out) until their day is over, so a misclick is
  // one click to undo; older finished ones are folded away at the bottom.
  const { current, past } = dashboardDeadlines(state.deadlines, today);
  const open = current.filter((d) => !d.done).length;
  return (
    <section className="card deadlines-card" data-testid="deadlines">
      <div className="card-head">
        <h2>Deadlines</h2>
        <span className="subtle">{open ? `${open} open` : ''}</span>
        <button className="small-button card-link" onClick={() => actions.create({ due: addDays(today, 7) })}>
          + Add deadline
        </button>
      </div>
      {current.length === 0 ? (
        <p className="empty">No deadlines. Add one here, or right-click a day in the calendar.</p>
      ) : (
        <div className="plan-list">
          {current.map((d) => (
            <DeadlineItem key={d.id} deadline={d} />
          ))}
        </div>
      )}
      {past.length > 0 && (
        <div className="done-fold">
          <button className="link-button section-toggle" aria-expanded={showPast} onClick={() => setShowPast(!showPast)}>
            {showPast ? '▾' : '▸'} Done ({past.length})
          </button>
          {showPast && (
            <div className="plan-list">
              {past.map((d) => (
                <DeadlineItem key={d.id} deadline={d} compact />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function Stats() {
  const { state, today } = useApp();
  const now = useNow();
  const week = rangeStats(state.plans, weekStart(today), addDays(weekStart(today), 6), today, now);
  const month = rangeStats(state.plans, `${today.slice(0, 7)}-01`, today, today, now);
  const streak = currentStreak(state.days, today);
  const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '–');
  return (
    <section className="card wide stats-card" data-testid="stats">
      <h2>Your progress</h2>
      <div className="stat-tiles">
        <div className="stat">
          <span className="stat-value">
            {streak}
            <small> day{streak === 1 ? '' : 's'}</small>
          </span>
          <span className="stat-label">streak of completed days</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {week.done}
            <small>/{week.total}</small>
          </span>
          <span className="stat-label">plans done this week · {pct(week.done, week.total)}</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {month.done}
            <small>/{month.total}</small>
          </span>
          <span className="stat-label">plans done this month · {pct(month.done, month.total)}</span>
        </div>
        <div className="stat">
          <span className="stat-value">
            {week.lessons}
            <small>/{week.lessonsTotal}</small>
          </span>
          <span className="stat-label">lessons attended this week</span>
        </div>
      </div>
    </section>
  );
}
