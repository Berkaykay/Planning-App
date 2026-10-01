import React from 'react';

// Round check button used for plans and whole days.
export default function Check({ checked, onChange, label, size = 'normal' }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={checked ? `${label} (click to undo)` : label}
      className={`check check-${size} ${checked ? 'checked' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      <svg viewBox="0 0 16 16" aria-hidden>
        <path d="M3.5 8.5l3 3 6-7" />
      </svg>
    </button>
  );
}
