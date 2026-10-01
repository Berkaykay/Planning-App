import React, { useState } from 'react';
import { useApp } from '../context.js';
import { CATEGORY_COLORS } from '../lib/store.js';
import { paths } from '../lib/routes.js';
import Link from '../components/Link.jsx';
import { useCategoryActions, CategoryNameInput } from '../components/categoryActions.jsx';

export function ColorPicker({ value, onChange }) {
  return (
    <div className="color-picker" role="radiogroup" aria-label="Color">
      {CATEGORY_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={`Color ${color}`}
          className={`swatch ${value === color ? 'on' : ''}`}
          style={{ background: color }}
          onClick={() => onChange(color)}
        />
      ))}
    </div>
  );
}

export default function Categories() {
  const { state, today } = useApp();
  const actions = useCategoryActions();
  const [name, setName] = useState('');
  const [color, setColor] = useState(CATEGORY_COLORS[state.categories.length % CATEGORY_COLORS.length]);
  const [error, setError] = useState('');
  const [renamingId, setRenamingId] = useState(null);

  const create = (e) => {
    e.preventDefault();
    const problem = actions.validate(name);
    if (problem) return setError(problem);
    actions.add(name, color);
    setName('');
    setError('');
    setColor(CATEGORY_COLORS[(state.categories.length + 1) % CATEGORY_COLORS.length]);
  };

  return (
    <div className="categories-page">
      <header className="page-header">
        <h1>Categories</h1>
        <div className="subtle">Group your plans. Assign a category when creating or editing a plan, or drag a plan onto a category in the sidebar.</div>
      </header>

      <form className="card new-category" onSubmit={create}>
        <h2>New category</h2>
        <div className="field-row">
          <input
            aria-label="New category name"
            placeholder="e.g. Study, Family, Side project"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
          />
          <ColorPicker value={color} onChange={setColor} />
          <button type="submit" className="primary">
            Create
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>

      <div className="category-cards">
        {state.categories.length === 0 && <p className="empty">No categories yet.</p>}
        {state.categories.map((c) => {
          const plans = state.plans.filter((p) => p.categoryId === c.id);
          const upcoming = plans.filter((p) => !p.repeat && p.date >= today).length;
          const repeating = plans.filter((p) => p.repeat).length;
          return (
            <div key={c.id} className="card category-card" style={{ '--cat': c.color }} data-testid="category-card">
              {renamingId === c.id ? (
                <CategoryNameInput
                  initial={c.name}
                  excludeId={c.id}
                  onSubmit={(value) => actions.rename(c.id, value) && setRenamingId(null)}
                  onCancel={() => setRenamingId(null)}
                />
              ) : (
                <h2>
                  <Link to={paths.category(c.id)}>{c.name}</Link>
                </h2>
              )}
              <div className="subtle">
                {plans.length} plan{plans.length === 1 ? '' : 's'} · {upcoming} upcoming · {repeating} repeating
              </div>
              <ColorPicker value={c.color} onChange={(value) => actions.recolor(c.id, value)} />
              <div className="card-actions">
                <Link to={paths.category(c.id)} className="button">
                  Open
                </Link>
                <button onClick={() => setRenamingId(c.id)}>Rename</button>
                <button className="danger" onClick={() => actions.remove(c)}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
