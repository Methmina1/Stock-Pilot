import React from 'react';

/**
 * Live market index strip (S&P 500, Nasdaq, Dow, VIX).
 * Shared by every role dashboard.
 */
export default function MarketIndices({ indices = [] }) {
  if (!indices.length) return null;

  return (
    <div className="dash-indices">
      {indices.map((idx) => (
        <div key={idx.name} className="dash-idx">
          <span className="dash-idx-name">{idx.name}</span>
          <span className="dash-idx-val mono">{idx.value.toLocaleString()}</span>
          <span className={`dash-idx-chg mono ${idx.change >= 0 ? 'up' : 'down'}`}>
            {idx.change >= 0 ? '+' : ''}{idx.change.toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
}
