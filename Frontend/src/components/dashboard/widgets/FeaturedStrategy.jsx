import React from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Highest-rated marketplace strategy. Shared by every role dashboard.
 */
export default function FeaturedStrategy({ listings = [] }) {
  const navigate = useNavigate();

  const top = listings.length
    ? [...listings].sort((a, b) => (b.avg_rating || 0) - (a.avg_rating || 0))[0]
    : null;

  if (!top) return null;

  return (
    <div className="card pad">
      <div className="ctitle"><span className="dot" />Featured strategy</div>
      <div className="csub">Top-rated marketplace strategy</div>
      <div className="pick-card">
        <div className="pk-top">
          <span className="pk-name">{top.strategy?.name || 'Strategy'}</span>
          <span className="mkt-status ok">Verified</span>
        </div>
        <div className="pk-stats">
          {top.backtest_return != null && <div><b>{(top.backtest_return * 100).toFixed(0)}%</b>return</div>}
          {top.backtest_sharpe != null && <div><b>{top.backtest_sharpe.toFixed(2)}</b>sharpe</div>}
          <div><b>{top.rating_count || 0}</b>reviews</div>
        </div>
        <button
          className="btn primary"
          style={{ marginTop: 12, width: '100%', textAlign: 'center' }}
          onClick={() => navigate('/marketplace')}
        >
          View in Marketplace
        </button>
      </div>
    </div>
  );
}
