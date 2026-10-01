import React from 'react';
import { useApp } from '../context.js';
import { newId } from '../lib/store.js';
import { isDone } from '../lib/recurrence.js';
import { addDays, formatMedium, formatTimeRange, weekStart } from '../lib/dates.js';
import PlanDialog from './PlanDialog.jsx';
import { DatePromptDialog } from './Dialogs.jsx';

// Shared add / edit / move / delete / complete behavior for plans, used by every page.
// For repeating plans, the user is asked whether a change applies to one day or the whole series.
export function usePlanActions() {
  const { state, dispatch, dialogs, today, menu } = useApp();

  const askScope = (plan, verb, date) =>
    dialogs.choose({
      title: `${verb} repeating plan`,
      message: `"${plan.title}" repeats. ${verb} only ${formatMedium(date)}, or every occurrence?`,
      choices: [
        { value: 'one', label: 'Only this day' },
        { value: 'all', label: 'All occurrences', primary: true },
      ],
    });

  const actions = {
    toggle(plan, date) {
      dispatch({ type: 'plan/setDone', id: plan.id, date, done: !isDone(plan, date) });
    },

    async create(defaults = {}) {
      // Ignore unset defaults so they can't override the fallbacks (e.g. an undefined date).
      const given = Object.fromEntries(Object.entries(defaults).filter(([, v]) => v !== undefined));
      const result = await dialogs.open((close) => (
        <PlanDialog
          categories={state.categories}
          initial={{ date: today, hour: null, categoryId: null, repeat: null, ...given }}
          onClose={close}
        />
      ));
      if (result) dispatch({ type: 'plan/add', plan: { ...result.values, id: newId() } });
    },

    async edit(plan, date) {
      const result = await dialogs.open((close) => (
        <PlanDialog categories={state.categories} initial={plan} occurrenceDate={date} onClose={close} />
      ));
      if (!result) return;
      if (result.scope === 'one') {
        dispatch({ type: 'plan/detach', id: plan.id, date, changes: result.values });
      } else {
        dispatch({ type: 'plan/update', id: plan.id, changes: result.values });
      }
    },

    // Moves a plan's occurrence on `date` to another date and/or hour (hour null = all day).
    async move(plan, date, to) {
      if (to.date === date && to.hour === plan.hour) return;
      // Moving between hour rows keeps the minutes; moving to "All day" drops the time.
      if (to.hour === null) Object.assign(to, { minute: 0, duration: null });
      if (!plan.repeat) {
        dispatch({ type: 'plan/update', id: plan.id, changes: to });
        return;
      }
      const scope = to.date === date ? await askScope(plan, 'Move', date) : 'one';
      if (scope === 'one') dispatch({ type: 'plan/detach', id: plan.id, date, changes: to });
      else if (scope === 'all') {
        const { date: _ignored, ...time } = to;
        dispatch({ type: 'plan/update', id: plan.id, changes: time });
      }
    },

    async remove(plan, date) {
      if (plan.repeat) {
        const scope = await dialogs.choose({
          title: 'Delete repeating plan',
          message: `"${plan.title}" repeats. Delete only ${formatMedium(date)}, or the whole series (including its history)?`,
          choices: [
            { value: 'one', label: 'Only this day' },
            { value: 'all', label: 'Whole series', primary: true, danger: true },
          ],
        });
        if (scope === 'one') dispatch({ type: 'plan/skip', id: plan.id, date });
        else if (scope === 'all') dispatch({ type: 'plan/delete', id: plan.id });
        return;
      }
      const when = plan.hour === null ? formatMedium(plan.date) : `${formatMedium(plan.date)}, ${formatTimeRange(plan)}`;
      const ok = await dialogs.confirm({
        title: 'Delete plan',
        message: `Delete "${plan.title}" (${when})?`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok) dispatch({ type: 'plan/delete', id: plan.id });
    },

    setCategory(plan, categoryId) {
      dispatch({ type: 'plan/update', id: plan.id, changes: { categoryId } });
    },

    copy(plan, dates) {
      if (dates.length) dispatch({ type: 'plan/copy', id: plan.id, dates });
    },

    // Right-click menu for one occurrence (`date`) of a plan.
    openMenu(e, plan, date) {
      const done = isDone(plan, date);
      const tomorrow = addDays(today, 1);
      const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart(date), i)).filter((d) => d !== date);
      menu.open(e, [
        { label: done ? 'Mark as not done' : 'Mark as done', onSelect: () => actions.toggle(plan, date) },
        { label: 'Edit…', onSelect: () => actions.edit(plan, date) },
        null,
        { label: 'Duplicate', onSelect: () => actions.copy(plan, [date]) },
        { label: 'Copy to tomorrow', onSelect: () => actions.copy(plan, [addDays(date, 1)]) },
        {
          label: 'Copy to date…',
          onSelect: async () => {
            const target = await dialogs.open((close) => (
              <DatePromptDialog title={`Copy "${plan.title}"`} label="Copy to" initial={addDays(date, 1)} confirmLabel="Copy" onClose={close} />
            ));
            if (target) actions.copy(plan, [target]);
          },
        },
        { label: 'Copy to every day this week', onSelect: () => actions.copy(plan, week) },
        null,
        { label: 'Move to today', disabled: date === today, onSelect: () => actions.move(plan, date, { date: today, hour: plan.hour }) },
        { label: 'Move to tomorrow', disabled: date === tomorrow, onSelect: () => actions.move(plan, date, { date: tomorrow, hour: plan.hour }) },
        {
          label: 'Category',
          children: [
            { label: 'No category', checked: !plan.categoryId, onSelect: () => actions.setCategory(plan, null) },
            ...state.categories.map((c) => ({ label: c.name, checked: plan.categoryId === c.id, onSelect: () => actions.setCategory(plan, c.id) })),
          ],
        },
        null,
        { label: 'Delete…', danger: true, onSelect: () => actions.remove(plan, date) },
        { label: 'Undo', shortcut: 'Ctrl+Z', onSelect: () => dispatch({ type: 'history/undo' }) },
      ]);
    },
  };
  return actions;
}
