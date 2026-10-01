import React, { useRef, useState } from 'react';
import { useApp } from '../context.js';

export function useCategoryActions() {
  const { state, dispatch, dialogs, route, navigate } = useApp();

  const validate = (name, excludeId) => {
    const clean = name.trim();
    if (!clean) return 'Name cannot be empty.';
    if (state.categories.some((c) => c.id !== excludeId && c.name.toLowerCase() === clean.toLowerCase())) {
      return `A category named "${clean}" already exists.`;
    }
    return null;
  };

  return {
    validate,
    add(name, color) {
      if (validate(name)) return false;
      dispatch({ type: 'category/add', name, color });
      return true;
    },
    rename(id, name) {
      if (validate(name, id)) return false;
      dispatch({ type: 'category/update', id, name });
      return true;
    },
    recolor(id, color) {
      dispatch({ type: 'category/update', id, color });
    },
    async remove(category) {
      const count = state.plans.filter((p) => p.categoryId === category.id).length;
      const ok = await dialogs.confirm({
        title: 'Delete category',
        message:
          count > 0
            ? `Delete "${category.name}"? Its ${count} plan${count === 1 ? '' : 's'} will be kept, without a category.`
            : `Delete "${category.name}"?`,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (!ok) return;
      dispatch({ type: 'category/delete', id: category.id });
      if (route.page === 'category' && route.id === category.id) navigate('categories');
    },
  };
}

// Inline text field for naming a category. Enter saves, Escape cancels.
export function CategoryNameInput({ initial = '', placeholder, excludeId, onSubmit, onCancel }) {
  const { validate } = useCategoryActions();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState('');
  const finished = useRef(false); // guards against Enter and blur both submitting
  const submit = () => {
    if (finished.current) return;
    const problem = validate(value, excludeId);
    if (problem) return setError(problem);
    finished.current = true;
    onSubmit(value);
  };
  const cancel = () => {
    if (finished.current) return;
    finished.current = true;
    onCancel();
  };
  return (
    <div className="category-input">
      <input
        autoFocus
        aria-label="Category name"
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
          setError('');
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
          if (e.key === 'Escape') cancel();
        }}
        onBlur={() => (value.trim() && value.trim() !== initial ? submit() : cancel())}
      />
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
