import React, { useEffect, useRef, useState } from 'react';

// Round check button used for plans and whole days. When checked it looks like a green stamp
// (a ring with a check), and it "presses down" with a short animation when you check it.
export default function Check({ checked, onChange, label, size = 'normal' }) {
  const wasChecked = useRef(checked);
  const [stamping, setStamping] = useState(false);

  useEffect(() => {
    if (checked && !wasChecked.current) setStamping(true);
    wasChecked.current = checked;
  }, [checked]);

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      title={checked ? `${label} (click to undo)` : label}
      className={`check check-${size} ${checked ? 'checked' : ''} ${stamping ? 'stamping' : ''}`}
      onAnimationEnd={() => setStamping(false)}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
    >
      <svg viewBox="0 0 16 16" aria-hidden>
        <path d="M4 8.5l2.6 2.6L12 5.4" />
      </svg>
    </button>
  );
}

// Big "approved" stamp shown on completed days in the calendar.
export function DayStamp({ animate }) {
  return (
    <span className={`day-stamp ${animate ? 'stamping' : ''}`} aria-hidden>
      <svg viewBox="0 0 40 40">
        <circle cx="20" cy="20" r="16.5" />
        <circle cx="20" cy="20" r="13" className="inner" />
        <path d="M13 20.5l4.6 4.6L27.5 15" />
      </svg>
    </span>
  );
}
