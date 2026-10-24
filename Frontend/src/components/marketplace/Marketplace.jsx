import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMarketplace } from '../../hooks/useMarketplace';
import { useAuth } from '../../context/AuthContext';
import api from '../../api/client';
import LoadingSpinner from '../ui/LoadingSpinner';
import EmptyState from '../ui/EmptyState';

const FACTORS = ['Sentiment', 'Momentum', 'Valuation', 'Volatility', 'Volume', 'Growth'];
const SORT_OPTIONS = [
  { value: 'rating', label: 'Top rated' },
  { value: 'return', label: 'Best return' },
  { value: 'sharpe', label: 'Best Sharpe' },
  { value: 'price_low', label: 'Price: low to high' },
  { value: 'newest', label: 'Newest' },
];

const DEFAULT_THRESHOLDS = {
  min_trades: 100, min_winrate: 0.65, min_sharpe: 1.0, max_drawdown: 0.15, min_profit_factor: 1.5,
};

const THRESHOLD_META = [
  { key: 'trades', op: '≥', label: 'Min. trades', fmt: (t) => `${t.min_trades}`, icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3v18h18"/><path d="M7 16l4-8 4 4 6-6"/>
    </svg>
  )},
  { key: 'winrate', op: '≥', label: 'Win rate', fmt: (t) => `${(t.min_winrate * 100).toFixed(0)}%`, icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>
    </svg>
  )},
  { key: 'sharpe', op: '≥', label: 'Sharpe ratio', fmt: (t) => t.min_sharpe.toFixed(1), icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    </svg>
  )},
  { key: 'drawdown', op: '≤', label: 'Max drawdown', fmt: (t) => `${(t.max_drawdown * 100).toFixed(0)}%`, icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M2 12h20"/><path d="M2 7h5M17 7h5M2 17h5M17 17h5"/>
    </svg>
  )},
  { key: 'profit', op: '≥', label: 'Profit factor', fmt: (t) => t.min_profit_factor.toFixed(1), icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
    </svg>
  )},
];

export default function Marketplace() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { listings, loading, refetch } = useMarketplace();

  // Visibility only — the API independently enforces the same rule.
  const canPublish = user?.role === 'analyst' || user?.role === 'admin';

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('rating');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showPublish, setShowPublish] = useState(false);
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);

  useEffect(() => {
    api.get('/api/v1/marketplace/thresholds')
      .then((r) => setThresholds(r.data))
      .catch(() => {});
  }, []);

  const filtered = useMemo(() => {
    let items = [...listings];
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(l => (l.strategy?.name || '').toLowerCase().includes(q) || (l.strategy?.owner?.full_name || '').toLowerCase().includes(q));
    }
    if (filterStatus === 'verified') items = items.filter(l => l.status === 'verified' || l.status === 'listed');
    if (filterStatus === 'free') items = items.filter(l => !l.price_cents);
    items.sort((a, b) => {
      switch (sortBy) {
        case 'return': return (b.backtest_return || 0) - (a.backtest_return || 0);
        case 'sharpe': return (b.backtest_sharpe || 0) - (a.backtest_sharpe || 0);
        case 'price_low': return (a.price_cents || 0) - (b.price_cents || 0);
        case 'newest': return new Date(b.listed_at || b.created_at || 0) - new Date(a.listed_at || a.created_at || 0);
        default: return (b.avg_rating || 0) - (a.avg_rating || 0);
      }
    });
    return items;
  }, [listings, search, sortBy, filterStatus]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="view-enter">
      <div className="eyebrow">Marketplace</div>
      <h1 className="page">Strategy Marketplace</h1>
      <p className="lede">Factor weight configurations reviewed by administrators. Seeded catalog ratings and results are illustrative demo data; new submissions are backtested against the thresholds below.</p>

      <div className="thresh-grid">
        {THRESHOLD_META.map((t, i) => (
          <div key={i} className="thresh-card">
            <div className="thresh-icon">{t.icon}</div>
            <div className="thresh-val">{t.op} {t.fmt(thresholds)}</div>
            <div className="thresh-label">{t.label}</div>
          </div>
        ))}
      </div>

      {/* Search and filter */}
      <div className="sec-label">Available strategies</div>
      <div className="mkt-toolbar">
        <input className="mkt-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search strategies or analysts..." />
        <select className="mkt-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <div className="mkt-filter-tabs">
          {[['all', 'All'], ['verified', 'Verified'], ['free', 'Free']].map(([v, l]) => (
            <button key={v} className={`mkt-filter-tab${filterStatus === v ? ' active' : ''}`} onClick={() => setFilterStatus(v)}>{l}</button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon="&#x1f3ea;" message={search ? 'No strategies match your search.' : 'No strategies listed yet.'} />
      ) : (
        <div className="strategy-grid">
          {filtered.map((listing) => {
            const strategy = listing.strategy || {};
            const weights = strategy.weights || {};
            const isVerified = listing.status === 'verified' || listing.status === 'listed';
            const stars = Math.round(listing.avg_rating || 0);
            const starsStr = '★'.repeat(stars) + '☆'.repeat(5 - stars);
            const price = listing.price_cents ? `$${(listing.price_cents / 100).toFixed(2)}` : 'Free';

            return (
              <div key={listing.id} className="mkt-card">
                <div className="mkt-top">
                  <div>
                    <h3>{strategy.name || 'Unnamed Strategy'}</h3>
                    <div className="mkt-by mono">by {strategy.owner?.full_name || 'StockPilot'}</div>
                    <div className="mkt-stars">{starsStr}</div>
                  </div>
                  <span className={`mkt-status ${isVerified ? 'ok' : 'review'}`}>
                    {isVerified ? 'Verified' : 'In Review'}
                  </span>
                </div>

                <div className="mkt-weights">
                  {FACTORS.map((f) => {
                    const key = f.toLowerCase();
                    const val = weights[key];
                    return val != null ? <span key={f} className="mkt-chip">{f} {val}%</span> : null;
                  })}
                </div>

                <div className="mkt-stats">
                  {listing.backtest_return != null && (
                    <div><div className="v">{(listing.backtest_return * 100).toFixed(0)}%</div><div className="k">Return</div></div>
                  )}
                  {listing.backtest_sharpe != null && (
                    <div><div className="v">{listing.backtest_sharpe.toFixed(2)}</div><div className="k">Sharpe ratio</div></div>
                  )}
                  <div><div className="v">{listing.sales_count || 0}</div><div className="k">Sales</div></div>
                  <div><div className="v">{listing.rating_count || 0}</div><div className="k">Reviews</div></div>
                </div>

                <div className="mkt-bottom">
                  <span className="mkt-price">{price}</span>
                  {isVerified ? (
                    <button className="btn primary" onClick={() => navigate('/advisor', { state: { weights } })}>Apply in Advisor</button>
                  ) : (
                    <button className="btn" disabled style={{ opacity: .5 }}>Awaiting verification</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Publish CTA — analysts and admins only (enforced server-side too) */}
      <div className="sec-label">For analysts</div>
      {canPublish ? (
        <div className="card pad creator-cta">
          <div>
            <div className="ctitle"><span className="dot" />Request to publish a strategy</div>
            <div className="csub" style={{ marginBottom: 0 }}>Design and save a strategy in the Advisor, then run a backtest and request administrator review here.</div>
          </div>
          <button className="btn gold" onClick={() => setShowPublish(true)}>Request Publish</button>
        </div>
      ) : (
        <div className="card pad creator-cta">
          <div>
            <div className="ctitle"><span className="dot" />Publish a strategy</div>
            <div className="csub" style={{ marginBottom: 0 }}>Analysts can design factor weights and submit them for backtesting and review. Contact an administrator to request analyst access.</div>
          </div>
          <button className="btn" disabled style={{ opacity: .5 }}>Analyst role required</button>
        </div>
      )}

      {/* Publish Dialog */}
      {showPublish && (
        <PublishDialog thresholds={thresholds} onClose={() => setShowPublish(false)} onPublished={() => { setShowPublish(false); refetch(); }} />
      )}
    </div>
  );
}


function PublishDialog({ onClose, onPublished, thresholds = DEFAULT_THRESHOLDS }) {
  const [strategies, setStrategies] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [priceDollars, setPriceDollars] = useState('');
  const [backtestTrades, setBacktestTrades] = useState('');
  const [backtestWinrate, setBacktestWinrate] = useState('');
  const [backtestSharpe, setBacktestSharpe] = useState('');
  const [backtestDrawdown, setBacktestDrawdown] = useState('');
  const [backtestProfitFactor, setBacktestProfitFactor] = useState('');
  const [backtestReturn, setBacktestReturn] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [loadingStrats, setLoadingStrats] = useState(true);
  const [ticker, setTicker] = useState('');
  const [running, setRunning] = useState(false);
  const [btError, setBtError] = useState(null);
  const [ran, setRan] = useState(false);

  useEffect(() => {
    api.get('/api/v1/strategies').then(res => {
      const owned = (res.data || []).filter(s => !s.is_preset && !s.is_published);
      setStrategies(owned);
      if (owned.length > 0) setSelectedId(owned[0].id);
    }).catch(() => {}).finally(() => setLoadingStrats(false));
  }, []);

  const selectedStrategy = strategies.find(s => s.id === selectedId);

  const runBacktest = async () => {
    if (!selectedStrategy || !ticker.trim()) return;
    setRunning(true);
    setBtError(null);
    try {
      const w = selectedStrategy.weights || {};
      const { data } = await api.get(`/api/v1/analysis/${ticker.trim().toUpperCase()}/backtest`, {
        params: {
          period: '1y', risk: 'Moderate', horizon: 'Medium',
          w_sentiment: w.sentiment, w_momentum: w.momentum, w_valuation: w.valuation,
          w_volatility: w.volatility, w_volume: w.volume, w_growth: w.growth,
        },
      });
      setBacktestTrades(String(data.trades ?? ''));
      setBacktestWinrate(data.win_rate != null ? (data.win_rate * 100).toFixed(1) : '');
      setBacktestSharpe(data.sharpe != null ? data.sharpe.toFixed(2) : '');
      setBacktestDrawdown(data.max_drawdown_pct != null ? data.max_drawdown_pct.toFixed(1) : '');
      setBacktestProfitFactor(data.profit_factor != null ? data.profit_factor.toFixed(2) : '');
      setBacktestReturn(data.total_return_pct != null ? data.total_return_pct.toFixed(1) : '');
      setRan(true);
    } catch (err) {
      setBtError(err.response?.data?.detail || 'Backtest failed. Check the ticker symbol and try again.');
    }
    setRunning(false);
  };

  const trades = parseInt(backtestTrades) || 0;
  const winrate = parseFloat(backtestWinrate) / 100 || 0;
  const sharpe = parseFloat(backtestSharpe) || 0;
  const drawdown = parseFloat(backtestDrawdown) / 100 || 0;
  const profitFactor = parseFloat(backtestProfitFactor) || 0;
  const checks = [
    { label: 'Trades', met: trades >= thresholds.min_trades, val: `${trades}`, req: `${thresholds.min_trades}` },
    { label: 'Win Rate', met: winrate >= thresholds.min_winrate, val: `${(winrate * 100).toFixed(0)}%`, req: `${(thresholds.min_winrate * 100).toFixed(0)}%` },
    { label: 'Sharpe', met: sharpe >= thresholds.min_sharpe, val: sharpe.toFixed(2), req: thresholds.min_sharpe.toFixed(1) },
    { label: 'Drawdown', met: drawdown <= thresholds.max_drawdown && drawdown > 0, val: `${(drawdown * 100).toFixed(0)}%`, req: `≤${(thresholds.max_drawdown * 100).toFixed(0)}%` },
    { label: 'Profit Factor', met: profitFactor >= thresholds.min_profit_factor, val: profitFactor.toFixed(2), req: thresholds.min_profit_factor.toFixed(1) },
  ];
  const allMet = ran && checks.every(c => c.met);

  const handleSubmit = async () => {
    if (!selectedId || !allMet) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/v1/strategies/${selectedId}/publish`, {
        price_cents: Math.round((parseFloat(priceDollars) || 0) * 100),
        ticker: ticker.trim().toUpperCase(),
      });
      onPublished();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit strategy');
    }
    setSubmitting(false);
  };

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content" style={{ maxWidth: 540 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ margin: 0, fontSize: 20 }}>Publish Strategy</h2>
          <button className="btn" onClick={onClose} style={{ padding: '4px 12px', fontSize: 18, lineHeight: 1 }}>&times;</button>
        </div>

        {loadingStrats ? (
          <div style={{ textAlign: 'center', padding: 40 }}><div className="spinner" /></div>
        ) : strategies.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>&#x1f4cb;</div>
            <div>No unpublished strategies found. Create a strategy in the Advisor first.</div>
          </div>
        ) : (
          <>
            <div className="publish-field">
              <label>Strategy</label>
              <select value={selectedId} onChange={(e) => { setSelectedId(e.target.value); setRan(false); }} className="publish-select">
                {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            {selectedStrategy?.weights && (
              <div className="publish-weights-preview">
                {['sentiment', 'momentum', 'valuation', 'volatility', 'volume', 'growth'].map((k) => (
                  selectedStrategy.weights[k] != null
                    ? <span key={k} className="sw-chip">{k.charAt(0).toUpperCase() + k.slice(1)} {selectedStrategy.weights[k]}%</span>
                    : null
                ))}
              </div>
            )}

            <div className="publish-field">
              <label>Price (USD) — leave empty for free</label>
              <input type="number" min="0" step="0.01" value={priceDollars} onChange={(e) => setPriceDollars(e.target.value)} placeholder="0.00" className="publish-input" />
            </div>

            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--muted)', fontWeight: 500, marginTop: 20, marginBottom: 10 }}>
              Run Backtest
            </div>
            <div className="publish-bt-runner">
              <input
                className="publish-input"
                value={ticker}
                onChange={(e) => { setTicker(e.target.value.toUpperCase()); setRan(false); }}
                onKeyDown={(e) => { if (e.key === 'Enter') runBacktest(); }}
                placeholder="Ticker to test (e.g. AAPL)"
              />
              <button className="btn gold" onClick={runBacktest} disabled={!ticker.trim() || running}>
                {running ? 'Running…' : 'Run Backtest'}
              </button>
            </div>
            <div className="publish-bt-hint">
              Runs the backtest with this strategy's weights. The server reruns it when you submit for review.
            </div>
            {btError && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', color: 'var(--bear)', fontSize: 13 }}>
                {btError}
              </div>
            )}

            <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--muted)', fontWeight: 500, marginTop: 20, marginBottom: 10 }}>
              Backtest Results {ran && <span style={{ color: 'var(--bull)', textTransform: 'none', letterSpacing: 0 }}>· auto-filled for {ticker}</span>}
            </div>
            <div className="publish-bt-grid">
              <div className="publish-field">
                <label>Total Trades</label>
                <input type="number" value={backtestTrades} readOnly className="publish-input" />
              </div>
              <div className="publish-field">
                <label>Win Rate (%)</label>
                <input type="number" value={backtestWinrate} readOnly className="publish-input" />
              </div>
              <div className="publish-field">
                <label>Sharpe Ratio</label>
                <input type="number" value={backtestSharpe} readOnly className="publish-input" />
              </div>
              <div className="publish-field">
                <label>Max Drawdown (%)</label>
                <input type="number" value={backtestDrawdown} readOnly className="publish-input" />
              </div>
              <div className="publish-field">
                <label>Profit Factor</label>
                <input type="number" value={backtestProfitFactor} readOnly className="publish-input" />
              </div>
              <div className="publish-field">
                <label>Return (%)</label>
                <input type="number" value={backtestReturn} readOnly className="publish-input" />
              </div>
            </div>

            {/* Threshold checks */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              {checks.map((c) => (
                <div key={c.label} style={{
                  padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                  background: c.met ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)',
                  border: `1px solid ${c.met ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}`,
                  color: c.met ? 'var(--bull)' : 'var(--bear)',
                }}>
                  {c.met ? '✓' : '✗'} {c.label}: {c.val} / {c.req}
                </div>
              ))}
            </div>

            {error && (
              <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 6, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', color: 'var(--bear)', fontSize: 13 }}>
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <button className="btn" onClick={onClose}>Cancel</button>
              <button className="btn gold" onClick={handleSubmit} disabled={!allMet || submitting}>
                {submitting ? 'Submitting...' : allMet ? 'Submit for Review' : 'Thresholds not met'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
