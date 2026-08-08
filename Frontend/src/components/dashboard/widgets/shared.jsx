/**
 * Shared dashboard primitives.
 *
 * Every role-specific dashboard imports its common pieces from here so the
 * markup and formatting stay identical across roles.
 */
import React from 'react';

export const GRID = '#2e2e33';
export const chartFont = { family: "'IBM Plex Mono', monospace", size: 10 };

const svg = (paths) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
       strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
);

export const ICONS = {
  wallet:   svg(<><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M16 12h.01" /><path d="M3 9h18" /></>),
  activity: svg(<path d="M3 12h4l3 8 4-16 3 8h4" />),
  trending: svg(<><path d="M3 17l6-6 4 4 8-8" /><path d="M17 7h4v4" /></>),
  layers:   svg(<><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>),
  spark:    svg(<><path d="M12 3l1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3z" /></>),
  store:    svg(<><path d="M3 9h18l-1.5 11H4.5z" /><path d="M8 9V6a4 4 0 0 1 8 0v3" /></>),
  star:     svg(<path d="M12 3l2.6 5.6 6 .8-4.4 4.2 1.1 6L12 16.8 6.7 19.6l1.1-6L3.4 9.4l6-.8z" />),
  users:    svg(<><circle cx="9" cy="8" r="3.2" /><path d="M2.5 19a6.5 6.5 0 0 1 13 0" /><path d="M17 8.2a3 3 0 0 1 0 5.6" /><path d="M18.5 19a5.5 5.5 0 0 0-2-4" /></>),
  check:    svg(<><circle cx="12" cy="12" r="9" /><path d="m8.5 12 2.4 2.4 4.6-4.8" /></>),
  clock:    svg(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 1.9" /></>),
};

export function fmtMoney(n, decimals = 0) {
  const v = Number(n) || 0;
  return (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString(undefined, {
    minimumFractionDigits: decimals, maximumFractionDigits: decimals,
  });
}

export function getSignalColor(signal) {
  if (!signal) return '#a1a1aa';
  const s = signal.toUpperCase();
  if (s === 'BUY') return '#22c55e';
  if (s === 'SELL') return '#ef4444';
  return '#a1a1aa';
}

/** A single statistic tile. `hero` highlights the primary metric of a dashboard. */
export function StatCard({ label, value, sub, icon, hero = false, index = 0, tone }) {
  const toneClass = tone === 'up' ? ' up' : tone === 'down' ? ' down' : '';
  return (
    <div className={`stat${hero ? ' stat-hero' : ''}`} style={{ '--i': index }}>
      <div className="stat-top">
        <div className="k">{label}</div>
        {icon && <span className="stat-ico">{icon}</span>}
      </div>
      <div className={`v mono${toneClass}`}>{value}</div>
      {sub != null && <div className="s">{sub}</div>}
    </div>
  );
}

/** Percentage sub-line with a direction arrow, used under P/L tiles. */
export function TrendSub({ positive, children }) {
  return (
    <>
      <span className={`trend ${positive ? 'up' : 'down'}`}>{positive ? '▲' : '▼'}</span>
      {children}
    </>
  );
}

/** Standard page header used by every dashboard. */
export function DashboardHeader({ eyebrow, title, lede }) {
  return (
    <>
      <div className="eyebrow">{eyebrow}</div>
      <h1 className="page">{title}</h1>
      <p className="lede">{lede}</p>
    </>
  );
}
