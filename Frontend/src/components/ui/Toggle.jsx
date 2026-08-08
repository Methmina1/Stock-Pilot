import React from 'react';

export default function Toggle({ on, onToggle }) {
  return (
    <div
      className={`toggle${on ? ' on' : ''}`}
      onClick={() => onToggle(!on)}
      role="switch"
      aria-checked={on}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(!on); } }}
    />
  );
}
