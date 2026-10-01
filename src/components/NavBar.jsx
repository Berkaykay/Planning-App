import React, { useEffect, useState } from 'react';
import { useApp } from '../context.js';
import { activeTab } from '../lib/store.js';
import { SCHEME, HOME } from '../lib/routes.js';
import { usePlanActions } from './planActions.jsx';

export default function NavBar({ addressRef }) {
  const { state, dispatch, navigate, path, route } = useApp();
  const tab = activeTab(state);
  const [address, setAddress] = useState(SCHEME + path);
  const actions = usePlanActions();

  useEffect(() => setAddress(SCHEME + path), [path]);

  const submit = (e) => {
    e.preventDefault();
    const target = address.trim().replace(SCHEME, '').replace(/^\/+|\/+$/g, '') || HOME;
    navigate(target);
    setAddress(SCHEME + target);
    addressRef.current?.blur();
  };

  // "New plan" pre-fills the date/category of the page you are on.
  const newPlan = () =>
    actions.create({
      ...(route.page === 'day' && { date: route.date }),
      ...(route.page === 'category' && { categoryId: route.id }),
    });

  return (
    <div className="navbar">
      <button
        className="nav-button"
        aria-label="Back"
        title="Back (Alt+←)"
        disabled={tab.index === 0}
        onClick={() => dispatch({ type: 'tab/back' })}
      >
        ←
      </button>
      <button
        className="nav-button"
        aria-label="Forward"
        title="Forward (Alt+→)"
        disabled={tab.index >= tab.history.length - 1}
        onClick={() => dispatch({ type: 'tab/forward' })}
      >
        →
      </button>
      <button className="nav-button" aria-label="Home" title="Dashboard (Ctrl+1)" onClick={() => navigate(HOME)}>
        ⌂
      </button>
      <form className="address" onSubmit={submit}>
        <input
          ref={addressRef}
          aria-label="Address"
          value={address}
          spellCheck={false}
          onChange={(e) => setAddress(e.target.value)}
          onFocus={(e) => e.target.select()}
          onBlur={() => setAddress(SCHEME + path)}
          onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        />
      </form>
      <button className="primary new-plan" onClick={newPlan}>
        + New plan
      </button>
    </div>
  );
}
