import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../context.js';
import { buildSearchItems, searchItems } from '../lib/search.js';

const KIND_LABEL = { page: 'Page', action: 'Action', category: 'Category', plan: 'Plan', deadline: 'Deadline' };

// Ctrl+K: type to find any page, category, plan or deadline and jump to it.
// ↑/↓ move, Enter opens, Ctrl+Enter opens in a new tab, Esc closes.
export default function CommandPalette({ onClose, onCommand }) {
  const { state, today, navigate } = useApp();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef(null);
  const items = useMemo(() => buildSearchItems(state, today), [state, today]);
  const results = useMemo(() => searchItems(items, query), [items, query]);

  useEffect(() => setActive(0), [query]);
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const open = (item, newTab = false) => {
    if (!item) return;
    onClose();
    if (item.command) onCommand(item.command);
    else navigate(item.path, { newTab });
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      open(results[active], e.ctrlKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="Quick search">
        <div className="palette-input">
          <span aria-hidden>⌕</span>
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results[active] ? `palette-${active}` : undefined}
            aria-label="Search pages, plans and deadlines"
            placeholder="Search pages, plans, deadlines… or type a date"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd>Esc</kbd>
        </div>
        <ul className="palette-results" id="palette-results" role="listbox" ref={listRef} aria-label="Results">
          {results.map((item, i) => (
            <li
              key={item.id}
              id={`palette-${i}`}
              role="option"
              aria-selected={i === active}
              className={`palette-item ${item.done ? 'done' : ''}`}
              onMouseMove={() => setActive(i)}
              onClick={(e) => open(item, e.ctrlKey)}
            >
              <span className="palette-icon" style={item.color ? { color: item.color } : undefined} aria-hidden>
                {item.icon}
              </span>
              <span className="palette-label">{item.label}</span>
              {item.detail && <span className="palette-detail">{item.detail}</span>}
              <span className="palette-kind">{KIND_LABEL[item.kind]}</span>
            </li>
          ))}
          {results.length === 0 && <li className="palette-empty">Nothing found for “{query}”.</li>}
        </ul>
        <div className="palette-hints" aria-hidden>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>Enter</kbd> open
          </span>
          <span>
            <kbd>Ctrl</kbd>+<kbd>Enter</kbd> new tab
          </span>
        </div>
      </div>
    </div>
  );
}
