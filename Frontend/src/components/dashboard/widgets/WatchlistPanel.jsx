import React from 'react';
import { useNavigate } from 'react-router-dom';
import EmptyState from '../../ui/EmptyState';
import { getSignalColor } from './shared';

/**
 * Watchlist with AI verdict badges. Shared by every role dashboard.
 *
 * `holdings` is optional — the investor dashboard also lists owned positions
 * here, while analyst and admin views show the watchlist alone.
 */
export default function WatchlistPanel({ watchlist = [], holdings = [], predictions = [] }) {
  const navigate = useNavigate();
  const getPrediction = (ticker) => predictions.find((p) => p.ticker === ticker);

  const row = (key, ticker, name, price) => {
    const signal = getPrediction(ticker)?.signal || 'HOLD';
    const color = getSignalColor(signal);
    return (
      <div key={key} className="watch-row" onClick={() => navigate('/advisor')}>
        <span className="wt-sym mono">{ticker}</span>
        <span className="wt-name">{name}</span>
        {price != null && <span className="wt-price mono">${price.toFixed(2)}</span>}
        <span className="wt-verdict" style={{ background: color + '22', color, border: `1px solid ${color}55` }}>
          {signal}
        </span>
      </div>
    );
  };

  const isEmpty = watchlist.length === 0 && holdings.length === 0;

  return (
    <div className="card pad">
      <div className="ctitle"><span className="dot" />Watchlist</div>
      <div className="csub">Select a row to open it in Advisor</div>
      {isEmpty ? (
        <EmptyState icon="👀" message="Add stocks to your watchlist or portfolio to see them here." />
      ) : (
        <div className="watch-list">
          {holdings.map((h) =>
            row(h.id || h.ticker, h.ticker, h.name || h.ticker, h.current_price || h.avg_cost || 0))}
          {watchlist.map((w) => {
            const ticker = typeof w === 'string' ? w : w.ticker;
            return row(ticker, ticker, ticker, null);
          })}
        </div>
      )}
    </div>
  );
}
