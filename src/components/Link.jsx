import React from 'react';
import { useApp } from '../context.js';
import { SCHEME } from '../lib/routes.js';

// Navigates inside the app. Ctrl/Cmd+click or middle-click opens the page in a new tab.
export default function Link({ to, children, className = '', title, ...rest }) {
  const { navigate } = useApp();
  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigate(to, { newTab: e.ctrlKey || e.metaKey, background: e.ctrlKey || e.metaKey });
  };
  const onAuxClick = (e) => {
    if (e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    navigate(to, { newTab: true, background: true });
  };
  return (
    <a href={`#${to}`} className={`link ${className}`} title={title ?? `${SCHEME}${to}`} onClick={onClick} onAuxClick={onAuxClick} {...rest}>
      {children}
    </a>
  );
}
