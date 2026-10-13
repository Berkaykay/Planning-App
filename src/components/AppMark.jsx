import React from 'react';

// Cadence's mark without the blue tile: the calendar and its check, drawn in the theme's colors.
export default function AppMark({ size = 20, className = '' }) {
  return (
    <svg className={`app-mark ${className}`} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Cadence">
      <rect x="3" y="5" width="18" height="16" rx="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3 9.6h18" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.6 15.2l2.4 2.4 4.6-5" fill="none" stroke="var(--success)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
