import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, RadialLinearScale, ArcElement, Filler, Legend, Tooltip } from 'chart.js';
import { Line, Bar, Radar } from 'react-chartjs-2';
import { useStocks } from '../../hooks/useStocks';
import { usePredictions, useLivePrediction } from '../../hooks/usePredictions';
import { useMarketStatus, useLiveQuote, useChartData, useFactorAnalysis, useBacktest, useBullBear, useFundamentals, useSentiment } from '../../hooks/useLiveMarket';
import { useAuth } from '../../context/AuthContext';
import TradingChart from './TradingChart';
import LoadingSpinner from '../ui/LoadingSpinner';
import EmptyState from '../ui/EmptyState';
import api from '../../api/client';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, RadialLinearScale, ArcElement, Filler, Legend, Tooltip);

const GRID = '#2e2e33';
const FACTORS = [
  { key: 'sentiment', label: 'News Sentiment' },
  { key: 'momentum', label: 'Technical Momentum' },
  { key: 'valuation', label: 'Valuation' },
  { key: 'volatility', label: 'Volatility / Risk' },
  { key: 'volume', label: 'Volume Trend' },
  { key: 'growth', label: 'Growth / Fundamentals' },
];

const DEFAULT_WEIGHTS = { sentiment: 14, momentum: 22, valuation: 20, volatility: 18, volume: 10, growth: 16 };

const PRESET_STRATEGIES = [
  { id: 'balanced', name: 'Balanced', ds: 'Even weighting across all six signals. A sensible default.', w: { ...DEFAULT_WEIGHTS } },
  { id: 'growth', name: 'Growth / Momentum', ds: 'Emphasises trend, momentum and growth. Higher risk, higher reward.', w: { sentiment: 18, momentum: 38, valuation: 6, volatility: 10, volume: 16, growth: 22 } },
  { id: 'value', name: 'Value', ds: 'Rewards low valuation and strong fundamentals over hype.', w: { sentiment: 10, momentum: 10, valuation: 36, volatility: 16, volume: 6, growth: 30 } },
  { id: 'conservative', name: 'Conservative', ds: 'Prefers low volatility and quality. Capital-preservation tilt.', w: { sentiment: 12, momentum: 8, valuation: 26, volatility: 30, volume: 6, growth: 18 } },
];

const DEFAULT_TIMEFRAME = { label: '1D', interval: '1d', period: '1y' };

function fmtMoney(n) {
  return '$' + Math.round(Number(n) || 0).toLocaleString();
}

// Export the full backtest — summary + every trade — as a CSV the user can download.
function downloadBacktestLog(bt, ticker, period, profile) {
  if (!bt) return;
  const csv = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = [];
  rows.push(['StockPilot Backtest Log']);
  rows.push(['Ticker', ticker]);
  rows.push(['Period', period]);
  rows.push(['Risk tolerance', profile?.risk || '']);
  rows.push(['Time horizon', profile?.horizon || '']);
  rows.push(['Generated', new Date().toISOString()]);
  rows.push([]);
  rows.push(['Summary']);
  rows.push(['Strategy return %', bt.total_return_pct]);
  rows.push(['Buy & hold return %', bt.buy_hold_return_pct]);
  rows.push(['Edge vs hold %', bt.edge_vs_hold_pct]);
  rows.push(['Win rate %', (bt.win_rate * 100).toFixed(2)]);
  rows.push(['Sharpe ratio', bt.sharpe]);
  rows.push(['Max drawdown %', bt.max_drawdown_pct]);
  rows.push(['Profit factor', bt.profit_factor]);
  rows.push(['Total trades', bt.trades]);
  rows.push([]);
  rows.push(['Trade Ledger']);
  rows.push(['#', 'Entry date', 'Entry price', 'Exit date', 'Exit price', 'Size', 'PnL', 'Return %', 'Status']);
  (bt.trades_log || []).forEach((t, i) => {
    rows.push([i + 1, t.entry_date, t.entry_price, t.exit_date, t.exit_price, t.size, t.pnl, t.return_pct, t.status]);
  });
  const content = rows.map((r) => r.map(csv).join(',')).join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backtest_${ticker}_${period}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function fmtBigNum(n) {
  if (!n) return '—';
  if (n >= 1e12) return '$' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  return '$' + n.toLocaleString();
}

function factorColor(score) {
  if (score >= 60) return '#22c55e';
  if (score <= 40) return '#ef4444';
  return '#a1a1aa';
}

export default function Advisor() {
  const navigate = useNavigate();
  const location = useLocation();
  const { stocks } = useStocks();
  const { predictions } = usePredictions();
  const { user } = useAuth();
  const marketStatus = useMarketStatus();
  const [ticker, setTicker] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [strategyId, setStrategyId] = useState('balanced');
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS });
  useEffect(() => {
    const incoming = location.state?.weights;
    if (incoming && FACTORS.every(({ key }) => Number.isFinite(Number(incoming[key])))) {
      setWeights(Object.fromEntries(FACTORS.map(({ key }) => [key, Number(incoming[key])])));
      setStrategyId(null);
    }
  }, [location.key, location.state]);
  const [profile, setProfile] = useState({ risk: 'Moderate', horizon: 'Medium', amount: 10000 });
  const [chartTimeframe, setChartTimeframe] = useState(DEFAULT_TIMEFRAME);
  const [backtestPeriod, setBacktestPeriod] = useState('1y');
  const [savedStrategies, setSavedStrategies] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchSavedStrategies = useCallback(async () => {
    try {
      const { data } = await api.get('/api/v1/strategies');
      setSavedStrategies(data.filter(s => !s.is_preset));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchSavedStrategies(); }, [fetchSavedStrategies]);

  const handleSaveStrategy = async () => {
    if (!saveName.trim()) return;
    setSaving(true);
    try {
      await api.post('/api/v1/strategies', { name: saveName.trim(), description: 'Custom strategy', weights });
      await fetchSavedStrategies();
      setShowSaveDialog(false);
      setSaveName('');
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleDeleteStrategy = async (id) => {
    try {
      await api.delete(`/api/v1/strategies/${id}`);
      setSavedStrategies(prev => prev.filter(s => s.id !== id));
      if (strategyId === id) { setStrategyId('balanced'); setWeights({ ...DEFAULT_WEIGHTS }); }
    } catch { /* ignore */ }
  };

  const isAnalystOrAdmin = user?.role === 'analyst' || user?.role === 'admin';

  const applySaved = (s) => {
    const w = s.weights || {};
    setWeights({
      sentiment: w.sentiment ?? 18,
      momentum: w.momentum ?? 24,
      valuation: w.valuation ?? 20,
      volatility: w.volatility ?? 16,
      volume: w.volume ?? 10,
      growth: w.growth ?? 12,
    });
    setStrategyId(s.id);
  };

  const isCustom = !strategyId || (!PRESET_STRATEGIES.some(p => p.id === strategyId) && !savedStrategies.some(s => s.id === strategyId));

  const live = marketStatus.is_open;
  const { quote, loading: quoteLoading } = useLiveQuote(ticker, live ? 2000 : 60000);
  const { data: chartData, loading: chartLoading } = useChartData(ticker, chartTimeframe.period, chartTimeframe.interval, live);
  const { analysis, loading: factorsLoading } = useFactorAnalysis(ticker, weights, live ? 60000 : 0);
  const { backtest, loading: btLoading, refetch: runBacktest } = useBacktest(ticker, backtestPeriod, weights, profile.risk, profile.horizon, 0);
  const { data: bullBear, loading: bbLoading } = useBullBear(ticker, live ? 120000 : 0);
  const { fundamentals, loading: fundLoading } = useFundamentals(ticker, live ? 120000 : 0);
  const { sentiment, loading: sentLoading } = useSentiment(ticker, live ? 120000 : 0);

  useEffect(() => {
    if (stocks.length > 0 && !ticker) {
      setTicker(stocks[0].ticker);
      setSearchInput(stocks[0].ticker);
    }
  }, [stocks, ticker]);

  const currentStock = stocks.find((s) => s.ticker === ticker);
  const storedPrediction = predictions.find((p) => p.ticker === ticker);

  // Live XGBoost signal for the selected ticker (drives the hero verdict below).
  const { prediction: livePrediction, loading: liveLoading } = useLivePrediction(ticker, !!ticker);

  // Prefer the freshly computed XGBoost signal; fall back to the stored row
  // while it loads or if the model is unavailable.
  const prediction = livePrediction || storedPrediction;

  const price = quote?.price || 0;
  const change = quote?.change || 0;
  const changePct = quote?.change_pct || 0;
  const hi52 = quote?.week52_high || price;
  const lo52 = quote?.week52_low || price;

  const signal = prediction?.signal || 'HOLD';
  const confidence = prediction?.confidence || 50;
  const probUp = prediction?.probability_up || 50;
  const probDown = prediction?.probability_down || 50;

  const signalColor = signal === 'BUY' ? '#22c55e' : signal === 'SELL' ? '#ef4444' : '#a1a1aa';
  const signalCls = signal === 'BUY' ? 'v-buy' : signal === 'SELL' ? 'v-sell' : 'v-hold';

  const rangePos = hi52 > lo52 ? ((price - lo52) / (hi52 - lo52)) * 100 : 50;

  const applyPreset = (id) => {
    const preset = PRESET_STRATEGIES.find((s) => s.id === id);
    if (preset) {
      setWeights({ ...preset.w });
      setStrategyId(id);
    }
  };

  const handleTickerSubmit = () => {
    const v = searchInput.trim().toUpperCase();
    if (stocks.some((s) => s.ticker === v)) {
      setTicker(v);
    }
  };

  const H = { Short: { stop: 1.5, tgt: 2.5, entry: .4 }, Medium: { stop: 2.5, tgt: 4.5, entry: .6 }, Long: { stop: 4, tgt: 7.5, entry: .8 } }[profile.horizon] || { stop: 2.5, tgt: 4.5, entry: .6 };
  const maxSingle = { Conservative: .08, Moderate: .18, Aggressive: .32 }[profile.risk] || .18;
  const vol = 0.03;
  const entryLo = price * (1 - H.entry * vol);
  const stop = price * (1 - H.stop * vol);
  const target = price * (1 + H.tgt * vol);
  const allocPct = signal === 'BUY' ? maxSingle * (confidence / 100) : signal === 'HOLD' ? maxSingle * .35 * (confidence / 100) : 0;
  const dollars = profile.amount * allocPct;
  const shares = price > 0 ? Math.floor(dollars / price) : 0;
  const rr = price > stop ? ((target - price) / (price - stop)) : 0;

  const compositeScore = analysis?.composite_score || 50;

  return (
    <div className="view-enter">
      <div className="eyebrow">Analysis</div>
      <h1 className="page">Stock Analysis</h1>
      <p className="lede">Select a stock and a strategy to generate an explained Buy, Hold or Sell verdict with an action plan matched to your investor profile.</p>

      {/* Global market sessions */}
      <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {marketStatus.sessions?.length > 0 ? (
          marketStatus.sessions.map((s) => (
            <div key={s.name} className={`market-session ${s.is_open ? 'open' : 'closed'}`} title={s.next_event}>
              <span className="session-flag">{s.flag}</span>
              <span className="session-name">{s.name}</span>
              <span className={`session-dot ${s.is_open ? 'on' : ''}`} />
            </div>
          ))
        ) : (
          <div className={`market-status ${marketStatus.is_open ? 'open' : 'closed'}`}>
            <div className="pulse" />
            <span>{marketStatus.status}</span>
          </div>
        )}
        {marketStatus.is_open && <span className="live-badge"><span className="lb-dot" />LIVE</span>}
      </div>

      {/* Ticker selector */}
      <div className="search-row">
        <div className="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#71717a" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4-4" /></svg>
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') handleTickerSubmit(); }}
            placeholder="Type a ticker... TSLA, AAPL, NVDA"
          />
        </div>
        <div className="chips">
          {stocks.slice(0, 8).map((s) => {
            const pred = predictions.find((p) => p.ticker === s.ticker);
            const c = pred?.signal === 'BUY' ? '#22c55e' : pred?.signal === 'SELL' ? '#ef4444' : '#a1a1aa';
            return (
              <button key={s.ticker} className={`chip${ticker === s.ticker ? ' on' : ''}`} onClick={() => { setTicker(s.ticker); setSearchInput(s.ticker); }}>
                <span className="vd" style={{ background: c }} />
                {s.ticker}
              </button>
            );
          })}
        </div>
      </div>

      {stocks.length === 0 ? (
        <EmptyState icon="📈" message="No stocks available. Connect the backend to see stock data." />
      ) : (
        <>
          {/* Strategy controls */}
          <div className="card pad">
            <div className="control-head">
              <div>
                <div className="ctitle"><span className="dot" />Analysis configuration</div>
                <div className="csub">Select a strategy or customise weights &middot; profile defines the action</div>
              </div>
            </div>

            {/* Preset strategy cards */}
            <div className="strat-grid">
              {PRESET_STRATEGIES.map((s) => (
                <button key={s.id} className={`strat${strategyId === s.id ? ' on' : ''}`} onClick={() => applyPreset(s.id)}>
                  <div className="nm">{s.name}</div>
                  <div className="ds">{s.ds}</div>
                  <div className="strat-weights">
                    {FACTORS.map((f) => (
                      <div key={f.key} className="sw-row">
                        <span className="sw-label">{f.label.split(' ')[0]}</span>
                        <div className="sw-track"><div className="sw-fill" style={{ width: `${(s.w[f.key] / 40) * 100}%` }} /></div>
                        <span className="sw-pct">{s.w[f.key]}%</span>
                      </div>
                    ))}
                  </div>
                </button>
              ))}
            </div>

            {/* Saved strategies */}
            {savedStrategies.length > 0 && (
              <>
                <div className="csub" style={{ marginTop: 18, marginBottom: 10 }}>Your saved strategies</div>
                <div className="strat-grid saved">
                  {savedStrategies.map((s) => (
                    <button key={s.id} className={`strat${strategyId === s.id ? ' on' : ''}`} onClick={() => applySaved(s)}>
                      <div className="strat-head">
                        <div className="nm">{s.name}</div>
                        <span className="strat-del" title="Delete" onClick={(e) => { e.stopPropagation(); handleDeleteStrategy(s.id); }}>×</span>
                      </div>
                      <div className="strat-weights">
                        {FACTORS.map((f) => (
                          <div key={f.key} className="sw-row">
                            <span className="sw-label">{f.label.split(' ')[0]}</span>
                            <div className="sw-track"><div className="sw-fill" style={{ width: `${((s.weights?.[f.key] || 0) / 40) * 100}%` }} /></div>
                            <span className="sw-pct">{s.weights?.[f.key] || 0}%</span>
                          </div>
                        ))}
                      </div>
                      {isAnalystOrAdmin && !s.is_published && (
                        <div className="strat-publish" onClick={(e) => { e.stopPropagation(); navigate('/marketplace'); }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                          Request to publish
                        </div>
                      )}
                      {s.is_published && (
                        <div className="strat-status published">Published</div>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Weight sliders — always visible */}
            <div className="tuner-section">
              <div className="tuner-header">
                <div className="csub">Factor weights {!isCustom && <span className="tuner-badge">preset</span>}{isCustom && <span className="tuner-badge custom">custom</span>}</div>
                <div className="tuner-actions">
                  {isCustom && (
                    <button className="btn gold" onClick={() => setShowSaveDialog(true)}>Save strategy</button>
                  )}
                  <button className="btn" onClick={() => applyPreset('balanced')}>↺ Reset</button>
                </div>
              </div>
              <div className="tuner">
                {FACTORS.map((f) => (
                  <div key={f.key} className="slider">
                    <div className="row">
                      <span className="nm">{f.label}</span>
                      <span className="val">{weights[f.key]}%</span>
                    </div>
                    <input
                      type="range" min="0" max="40" value={weights[f.key]}
                      onChange={(e) => { setWeights({ ...weights, [f.key]: +e.target.value }); setStrategyId(null); }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Save dialog */}
            {showSaveDialog && (
              <div className="save-dialog">
                <div className="save-dialog-inner">
                  <div className="save-title">Save custom strategy</div>
                  <input
                    className="save-input"
                    placeholder="Strategy name..."
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveStrategy(); }}
                    autoFocus
                  />
                  <div className="save-weights-preview">
                    {FACTORS.map((f) => (
                      <span key={f.key} className="sw-chip">{f.label.split(' ')[0]} {weights[f.key]}%</span>
                    ))}
                  </div>
                  <div className="save-actions">
                    <button className="btn" onClick={() => { setShowSaveDialog(false); setSaveName(''); }}>Cancel</button>
                    <button className="btn gold" onClick={handleSaveStrategy} disabled={saving || !saveName.trim()}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="profile">
              <div className="prof-item">
                <label>Risk tolerance</label>
                <div className="seg">
                  {['Conservative', 'Moderate', 'Aggressive'].map((v) => (
                    <button key={v} className={profile.risk === v ? 'on' : ''} onClick={() => setProfile({ ...profile, risk: v })}>{v}</button>
                  ))}
                </div>
              </div>
              <div className="prof-item">
                <label>Time horizon</label>
                <div className="seg">
                  {['Short', 'Medium', 'Long'].map((v) => (
                    <button key={v} className={profile.horizon === v ? 'on' : ''} onClick={() => setProfile({ ...profile, horizon: v })}>{v}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Hero verdict */}
          <div className="hero card pad">
            <div className="hero-glow" style={{ background: `radial-gradient(440px 240px at 12% 0%, ${signalColor}, transparent 70%)` }} />
            <div className="hero-grid">
              <div className="hero-verdict">
                <div className={`verdict-pill ${signalCls}`}>{signal}</div>
                <div className="hero-meta">
                  <div className="conf-label"><span>Conviction</span><span className="mono">{confidence.toFixed(0)}%</span></div>
                  <div className="conf-track"><div className="conf-fill" style={{ width: `${confidence}%`, background: signalColor }} /></div>
                  <div className="conf-label" style={{ marginTop: 11 }}>
                    <span>Probability</span>
                    <span className="mono">{probUp.toFixed(0)}% up / {probDown.toFixed(0)}% down</span>
                  </div>
                </div>
              </div>
              <div className="hero-explain">
                <b>{signal}</b> with <b>{confidence.toFixed(0)}%</b> conviction for <b>{ticker}</b>.
                {signal === 'BUY' && ' The model sees upside potential based on current indicators.'}
                {signal === 'SELL' && ' The model detects downside risk from current conditions.'}
                {signal === 'HOLD' && ' The model finds no strong directional signal at this time.'}
                {' Composite score: '}<b>{compositeScore.toFixed(0)}/100</b>.
                {' Model version: '}<b>{prediction?.model_version || 'xgboost_v1'}</b>.
                {liveLoading && <span style={{ marginLeft: 6, opacity: .7 }}>· running model…</span>}
                {!liveLoading && livePrediction && (
                  <span style={{ marginLeft: 6 }} className="live-badge" title="Generated just now by the XGBoost model">
                    <span className="lb-dot" />MODEL LIVE
                  </span>
                )}
                {marketStatus.is_open && <span style={{ marginLeft: 6 }} className="live-badge"><span className="lb-dot" />LIVE</span>}
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="stat-grid">
            <div className="stat">
              <div className="k">Price</div>
              <div className="v mono">${price.toFixed(2)}</div>
              <div className="s">{currentStock?.name || ticker}</div>
            </div>
            <div className="stat">
              <div className="k">Today</div>
              <div className={`v mono ${changePct >= 0 ? 'up' : 'down'}`}>{changePct >= 0 ? '+' : ''}{changePct.toFixed(2)}%</div>
              <div className="s">{change >= 0 ? '▲' : '▼'} ${Math.abs(change).toFixed(2)}</div>
            </div>
            <div className="stat">
              <div className="k">Volume</div>
              <div className="v mono" style={{ fontSize: 20 }}>{(quote?.volume || 0).toLocaleString()}</div>
              <div className="s">avg {(quote?.avg_volume || 0).toLocaleString()}</div>
            </div>
            <div className="stat">
              <div className="k">Strategy</div>
              <div className="v mono" style={{ fontSize: 20 }}>{strategyId ? (PRESET_STRATEGIES.find((s) => s.id === strategyId)?.name || savedStrategies.find((s) => s.id === strategyId)?.name || 'Custom') : 'Custom'}</div>
              <div className="s">active configuration</div>
            </div>
          </div>

          {/* 52-week range */}
          <div className="card pad range-card">
            <div className="ctitle" style={{ fontSize: 14 }}><span className="dot" />52-week range</div>
            <div className="csub">Current price against the trailing range</div>
            <div className="range-row">
              <div className="range-bar"><div className="range-mark" style={{ left: `${Math.max(0, Math.min(100, rangePos))}%` }} /></div>
              <div className="mono" style={{ fontSize: 13 }}>{rangePos.toFixed(0)}% of range</div>
            </div>
            <div className="range-ends"><span>${lo52.toFixed(2)} low</span><span>high ${hi52.toFixed(2)}</span></div>
          </div>

          {/* Action plan */}
          <div className="card pad ap-card" style={{ marginTop: 18 }}>
            <div className="ap-head">
              <div>
                <div className="ctitle"><span className="dot" />Action plan</div>
                <div className="csub">Sized by your risk tolerance, horizon and capital</div>
              </div>
              <div className="amount-inline">
                <label>Capital</label>
                <div className="amount">
                  <span>$</span>
                  <input type="number" min="0" step="500" value={profile.amount} onChange={(e) => setProfile({ ...profile, amount: Math.max(0, +e.target.value || 0) })} />
                </div>
              </div>
            </div>

            {/* Hero action */}
            <div className={`ap-action ${signalCls}`}>
              <div className="ap-action-left">
                <div className="ap-action-label">Suggested action</div>
                <div className="ap-action-value">{signal === 'BUY' ? 'Accumulate' : signal === 'HOLD' ? 'Hold / wait' : 'Reduce / avoid'}</div>
                <div className="ap-action-sub">{signal} · {confidence.toFixed(0)}% conviction · {profile.horizon.toLowerCase()}-term</div>
              </div>
              <div className="ap-action-right">
                <div className="ap-alloc-value">{allocPct > 0 ? fmtMoney(dollars) : '$0'}</div>
                <div className="ap-alloc-sub">{allocPct > 0 ? `${(allocPct * 100).toFixed(1)}% · ~${shares} shares` : 'no position'}</div>
              </div>
            </div>

            {/* Price levels bar */}
            {signal !== 'SELL' && (
              <div className="ap-levels">
                <div className="ap-levels-title">Price levels</div>
                <div className="ap-bar-wrap">
                  <div className="ap-bar">
                    {(() => {
                      const lo = stop * 0.99;
                      const hi = target * 1.01;
                      const range = hi - lo || 1;
                      const stopPos = ((stop - lo) / range) * 100;
                      const entryLoPos = ((entryLo - lo) / range) * 100;
                      const pricePos = ((price - lo) / range) * 100;
                      const targetPos = ((target - lo) / range) * 100;
                      return (
                        <>
                          <div className="ap-zone ap-zone-risk" style={{ left: 0, width: `${stopPos}%` }} />
                          <div className="ap-zone ap-zone-entry" style={{ left: `${entryLoPos}%`, width: `${pricePos - entryLoPos}%` }} />
                          <div className="ap-zone ap-zone-target" style={{ left: `${pricePos}%`, width: `${targetPos - pricePos}%` }} />
                          <div className="ap-marker ap-marker-stop" style={{ left: `${stopPos}%` }} title="Stop-loss"><span>{fmtMoney(stop)}</span></div>
                          <div className="ap-marker ap-marker-price" style={{ left: `${pricePos}%` }} title="Current"><span>${price.toFixed(0)}</span></div>
                          <div className="ap-marker ap-marker-target" style={{ left: `${targetPos}%` }} title="Target"><span>{fmtMoney(target)}</span></div>
                        </>
                      );
                    })()}
                  </div>
                  <div className="ap-bar-labels">
                    <span className="bear-text">Stop-loss</span>
                    <span>Entry zone</span>
                    <span className="bull-text">Target</span>
                  </div>
                </div>
              </div>
            )}

            {/* Metrics row */}
            <div className="ap-metrics">
              <div className="ap-metric">
                <div className="ap-metric-k">Entry zone</div>
                <div className="ap-metric-v">{signal === 'SELL' ? '—' : `${fmtMoney(entryLo)} – ${fmtMoney(price)}`}</div>
              </div>
              <div className="ap-metric">
                <div className="ap-metric-k">Stop-loss</div>
                <div className="ap-metric-v bear-text">{signal === 'SELL' ? '—' : fmtMoney(stop)}</div>
              </div>
              <div className="ap-metric">
                <div className="ap-metric-k">Price target</div>
                <div className="ap-metric-v bull-text">{signal === 'SELL' ? '—' : fmtMoney(target)}</div>
              </div>
              <div className="ap-metric">
                <div className="ap-metric-k">Risk / reward</div>
                <div className="ap-metric-v">{signal === 'SELL' || !isFinite(rr) || rr <= 0 ? '—' : `1 : ${rr.toFixed(1)}`}</div>
              </div>
            </div>
          </div>

          {/* TradingView-style price chart */}
          <TradingChart
            data={chartData}
            ticker={ticker}
            isMarketOpen={marketStatus.is_open}
            activeTimeframe={chartTimeframe}
            onTimeframeChange={setChartTimeframe}
            livePrice={quote?.price}
          />

          {/* Factor contribution analysis */}
          <div className="two" style={{ marginTop: 18 }}>
            <div className="card pad">
              <div className="ctitle"><span className="dot" />Factor contribution</div>
              <div className="csub">Weighted signal scores from live market data</div>
              {factorsLoading && !analysis ? (
                <div style={{ padding: 40, textAlign: 'center' }}><LoadingSpinner /></div>
              ) : analysis?.factors ? (
                <div className="factor-bars">
                  {analysis.factors.map((f) => (
                    <div key={f.key} className="factor-row">
                      <span className="f-label">{f.label}</span>
                      <div className="f-track">
                        <div className="f-fill" style={{ width: `${f.score}%`, background: factorColor(f.score) }} />
                      </div>
                      <span className="f-val" style={{ color: factorColor(f.score) }}>{f.score.toFixed(0)}</span>
                      <span className="f-signal" style={{ color: factorColor(f.score) }}>{f.signal}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 14, padding: '12px 14px', background: 'var(--bg2)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--muted)' }}>Composite Score</span>
                    <span style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 22, color: factorColor(compositeScore) }}>{compositeScore.toFixed(0)}<span style={{ fontSize: 13, color: 'var(--muted)' }}>/100</span></span>
                  </div>
                </div>
              ) : (
                <EmptyState icon="⚡" message="Loading factor analysis..." />
              )}
            </div>

            {/* Radar chart */}
            <div className="card pad">
              <div className="ctitle"><span className="dot" />Factor radar</div>
              <div className="csub">Visual profile of the six scoring dimensions</div>
              {analysis?.factors ? (
                <div style={{ height: 280 }}>
                  <Radar
                    data={{
                      labels: analysis.factors.map((f) => f.label),
                      datasets: [{
                        label: ticker,
                        data: analysis.factors.map((f) => f.score),
                        backgroundColor: 'rgba(212,168,83,.12)',
                        borderColor: '#d4a853',
                        borderWidth: 2,
                        pointBackgroundColor: analysis.factors.map((f) => factorColor(f.score)),
                        pointBorderColor: analysis.factors.map((f) => factorColor(f.score)),
                        pointRadius: 5,
                      }],
                    }}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        r: {
                          beginAtZero: true, max: 100,
                          grid: { color: GRID },
                          angleLines: { color: GRID },
                          ticks: { display: false, stepSize: 25 },
                          pointLabels: { color: '#a1a1aa', font: { family: "'IBM Plex Mono'", size: 10 } },
                        },
                      },
                    }}
                  />
                </div>
              ) : (
                <div style={{ height: 280, display: 'grid', placeItems: 'center' }}><LoadingSpinner /></div>
              )}
            </div>
          </div>

          {/* Bull / Bear cases */}
          <div className="two" style={{ marginTop: 18 }}>
            <div className="card pad case bull">
              <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg> Bull case</h4>
              {bbLoading && !bullBear ? (
                <LoadingSpinner />
              ) : bullBear?.bull_cases?.length ? (
                <ul>
                  {bullBear.bull_cases.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              ) : (
                <p className="empty">No strong bullish signals identified</p>
              )}
            </div>
            <div className="card pad case bear">
              <h4><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" /></svg> Bear case</h4>
              {bbLoading && !bullBear ? (
                <LoadingSpinner />
              ) : bullBear?.bear_cases?.length ? (
                <ul>
                  {bullBear.bear_cases.map((c, i) => <li key={i}>{c}</li>)}
                </ul>
              ) : (
                <p className="empty">No major bearish risks detected</p>
              )}
            </div>
          </div>

          {/* News Sentiment (FinBERT) */}
          <div className="card pad" style={{ marginTop: 18 }}>
            <div className="ctitle"><span className="dot" />News sentiment <span className="sent-badge">FinBERT</span></div>
            <div className="csub">AI-powered headline analysis using the ProsusAI/finbert transformer model</div>
            {sentLoading && !sentiment ? (
              <div style={{ padding: 40, textAlign: 'center' }}><LoadingSpinner /></div>
            ) : sentiment && sentiment.headline_count > 0 ? (
              <>
                <div className="sent-overview">
                  <div className="sent-score-ring">
                    <svg viewBox="0 0 80 80" className="sent-ring-svg">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="var(--border)" strokeWidth="6" />
                      <circle cx="40" cy="40" r="34" fill="none"
                        stroke={sentiment.overall_score >= 62 ? 'var(--bull)' : sentiment.overall_score <= 38 ? 'var(--bear)' : 'var(--accent)'}
                        strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={`${(sentiment.overall_score / 100) * 213.6} 213.6`}
                        transform="rotate(-90 40 40)"
                      />
                    </svg>
                    <div className="sent-score-value">{sentiment.overall_score.toFixed(0)}</div>
                    <div className="sent-score-label">{sentiment.overall_label}</div>
                  </div>
                  <div className="sent-counts">
                    <div className="sent-count">
                      <span className="sent-count-dot" style={{ background: 'var(--bull)' }} />
                      <span className="sent-count-num">{sentiment.positive_count}</span>
                      <span className="sent-count-label">positive</span>
                    </div>
                    <div className="sent-count">
                      <span className="sent-count-dot" style={{ background: 'var(--muted)' }} />
                      <span className="sent-count-num">{sentiment.neutral_count}</span>
                      <span className="sent-count-label">neutral</span>
                    </div>
                    <div className="sent-count">
                      <span className="sent-count-dot" style={{ background: 'var(--bear)' }} />
                      <span className="sent-count-num">{sentiment.negative_count}</span>
                      <span className="sent-count-label">negative</span>
                    </div>
                    <div className="sent-count">
                      <span className="sent-count-dot" style={{ background: 'var(--accent)' }} />
                      <span className="sent-count-num">{sentiment.headline_count}</span>
                      <span className="sent-count-label">headlines</span>
                    </div>
                  </div>
                </div>
                <div className="sent-headlines">
                  {sentiment.headlines.map((h, i) => (
                    <div key={i} className="sent-hl">
                      <div className="sent-hl-bar">
                        <div className="sent-hl-fill" style={{
                          width: `${h.score}%`,
                          background: h.label === 'positive' ? 'var(--bull)' : h.label === 'negative' ? 'var(--bear)' : 'var(--muted2)',
                        }} />
                      </div>
                      <div className="sent-hl-score" style={{
                        color: h.label === 'positive' ? 'var(--bull)' : h.label === 'negative' ? 'var(--bear)' : 'var(--muted)',
                      }}>{h.score.toFixed(0)}</div>
                      <div className="sent-hl-text">{h.headline}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState icon="📰" message="No recent news headlines available for sentiment analysis" />
            )}
          </div>

          {/* Backtest performance */}
          <div className="card pad" style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 4 }}>
              <div>
                <div className="ctitle"><span className="dot" />Backtest performance</div>
                <div className="csub">How this strategy performed historically on {ticker}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="period-tabs">
                  {['6mo', '1y', '2y', '5y'].map((p) => (
                    <button key={p} className={`period-tab${backtestPeriod === p ? ' on' : ''}`} onClick={() => setBacktestPeriod(p)}>
                      {p}
                    </button>
                  ))}
                </div>
                {backtest && !btLoading && (
                  <button className="btn" onClick={() => downloadBacktestLog(backtest, ticker, backtestPeriod, profile)} title="Download the full trade ledger as CSV">
                    ↓ Download log
                  </button>
                )}
                <button className="btn gold run-bt" onClick={() => runBacktest()} disabled={btLoading || !ticker}>
                  {btLoading ? '⟳ Running...' : '▶ Run Backtest'}
                </button>
              </div>
            </div>
            {btLoading ? (
              <div style={{ padding: 40, textAlign: 'center' }}><LoadingSpinner /></div>
            ) : backtest ? (
              <>
                <div className="bt-stats">
                  <div className="bt-stat">
                    <div className="k">Strategy return</div>
                    <div className={`v ${backtest.total_return_pct >= 0 ? 'up' : 'down'}`}>{backtest.total_return_pct >= 0 ? '+' : ''}{backtest.total_return_pct.toFixed(1)}%</div>
                  </div>
                  <div className="bt-stat">
                    <div className="k">Buy & hold</div>
                    <div className={`v ${backtest.buy_hold_return_pct >= 0 ? 'up' : 'down'}`}>{backtest.buy_hold_return_pct >= 0 ? '+' : ''}{backtest.buy_hold_return_pct.toFixed(1)}%</div>
                  </div>
                  <div className="bt-stat">
                    <div className="k">Win rate</div>
                    <div className="v">{(backtest.win_rate * 100).toFixed(1)}%</div>
                  </div>
                  <div className="bt-stat">
                    <div className="k">Sharpe</div>
                    <div className={`v ${backtest.sharpe >= 1 ? 'up' : backtest.sharpe < 0 ? 'down' : ''}`}>{backtest.sharpe.toFixed(2)}</div>
                  </div>
                </div>
                <div className="bt-stats" style={{ marginBottom: 16 }}>
                  <div className="bt-stat">
                    <div className="k">Edge vs hold</div>
                    <div className={`v ${backtest.edge_vs_hold_pct >= 0 ? 'up' : 'down'}`}>{backtest.edge_vs_hold_pct >= 0 ? '+' : ''}{backtest.edge_vs_hold_pct.toFixed(1)}%</div>
                  </div>
                  <div className="bt-stat">
                    <div className="k">Max drawdown</div>
                    <div className="v down">-{backtest.max_drawdown_pct.toFixed(1)}%</div>
                  </div>
                  <div className="bt-stat">
                    <div className="k">Profit factor</div>
                    <div className={`v ${backtest.profit_factor >= 1 ? 'up' : 'down'}`}>{backtest.profit_factor.toFixed(2)}</div>
                  </div>
                  <div className="bt-stat">
                    <div className="k">Trades</div>
                    <div className="v">{backtest.trades}</div>
                  </div>
                </div>
                {backtest.equity_curve?.length > 1 && (
                  <div className="chart-box" style={{ height: 220 }}>
                    <Line
                      data={{
                        labels: backtest.dates?.map((d) => d.split(' ')[0].slice(5)) || backtest.equity_curve.map((_, i) => i),
                        datasets: [{
                          label: 'Strategy equity',
                          data: backtest.equity_curve,
                          borderColor: '#d4a853',
                          backgroundColor: 'rgba(212,168,83,.08)',
                          borderWidth: 2, fill: true, tension: .3, pointRadius: 0,
                        }],
                      }}
                      options={{
                        responsive: true, maintainAspectRatio: false,
                        plugins: { legend: { display: false } },
                        scales: {
                          x: { grid: { color: GRID }, border: { display: false }, ticks: { maxTicksLimit: 8, color: '#71717a', font: { family: "'IBM Plex Mono'", size: 10 } } },
                          y: { grid: { color: GRID }, border: { display: false }, ticks: { callback: (v) => (v * 100 - 100).toFixed(0) + '%', color: '#71717a', font: { family: "'IBM Plex Mono'", size: 10 } } },
                        },
                      }}
                    />
                  </div>
                )}
              </>
            ) : (
              <EmptyState icon="📉" message="Backtest data unavailable" />
            )}
          </div>

          {/* Fundamentals */}
          <div className="card pad" style={{ marginTop: 18 }}>
            <div className="ctitle"><span className="dot" />Fundamentals</div>
            {fundamentals?.sector && (
              <div className="fund-tags">
                <span className="fund-tag">{fundamentals.sector}</span>
                {fundamentals.industry && <span className="fund-tag">{fundamentals.industry}</span>}
              </div>
            )}
            {fundLoading && !fundamentals ? (
              <LoadingSpinner />
            ) : fundamentals ? (
              <div className="fund-grid">
                <div className="fund-group">
                  <div className="fund-group-title">Valuation</div>
                  <div className="fund-row">
                    <span className="fund-label">Market Cap</span>
                    <span className="fund-value">{fmtBigNum(fundamentals.market_cap)}</span>
                  </div>
                  <div className="fund-row">
                    <span className="fund-label">Price to Earnings</span>
                    <span className={`fund-value ${fundamentals.pe_ratio && fundamentals.pe_ratio < 25 ? 'val-good' : fundamentals.pe_ratio && fundamentals.pe_ratio > 40 ? 'val-warn' : ''}`}>{fundamentals.pe_ratio?.toFixed(1) || '—'}</span>
                  </div>
                  <div className="fund-row">
                    <span className="fund-label">Forward Price to Earnings</span>
                    <span className="fund-value">{fundamentals.forward_pe?.toFixed(1) || '—'}</span>
                  </div>
                  <div className="fund-row">
                    <span className="fund-label">Price/Earnings to Growth</span>
                    <span className={`fund-value ${fundamentals.peg_ratio && fundamentals.peg_ratio < 1 ? 'val-good' : fundamentals.peg_ratio && fundamentals.peg_ratio > 2 ? 'val-warn' : ''}`}>{fundamentals.peg_ratio?.toFixed(2) || '—'}</span>
                  </div>
                  <div className="fund-row">
                    <span className="fund-label">Price to Book</span>
                    <span className="fund-value">{fundamentals.price_to_book?.toFixed(2) || '—'}</span>
                  </div>
                </div>

                <div className="fund-group">
                  <div className="fund-group-title">Earnings & Income</div>
                  <div className="fund-row">
                    <span className="fund-label">Earnings per Share</span>
                    <span className={`fund-value ${fundamentals.eps && fundamentals.eps > 0 ? 'val-good' : 'val-warn'}`}>{fundamentals.eps ? `$${fundamentals.eps.toFixed(2)}` : '—'}</span>
                  </div>
                  <div className="fund-row">
                    <span className="fund-label">Revenue</span>
                    <span className="fund-value">{fmtBigNum(fundamentals.revenue)}</span>
                  </div>
                  <div className="fund-row">
                    <span className="fund-label">Profit Margin</span>
                    <span className={`fund-value ${fundamentals.profit_margin && fundamentals.profit_margin > 0.2 ? 'val-good' : fundamentals.profit_margin && fundamentals.profit_margin < 0.05 ? 'val-warn' : ''}`}>{fundamentals.profit_margin ? `${(fundamentals.profit_margin * 100).toFixed(1)}%` : '—'}</span>
                  </div>
                  <div className="fund-row">
                    <span className="fund-label">Dividend Yield</span>
                    <span className="fund-value">{fundamentals.dividend_yield ? `${(fundamentals.dividend_yield * 100).toFixed(2)}%` : '—'}</span>
                  </div>
                </div>

                <div className="fund-group">
                  <div className="fund-group-title">Risk & Efficiency</div>
                  <div className="fund-row">
                    <span className="fund-label">Beta</span>
                    <span className={`fund-value ${fundamentals.beta && fundamentals.beta > 1.5 ? 'val-warn' : fundamentals.beta && fundamentals.beta <= 1.2 ? 'val-good' : ''}`}>{fundamentals.beta?.toFixed(2) || '—'}</span>
                  </div>
                  <div className="fund-row">
                    <span className="fund-label">Return on Equity</span>
                    <span className={`fund-value ${fundamentals.roe && fundamentals.roe > 0.15 ? 'val-good' : fundamentals.roe && fundamentals.roe < 0.05 ? 'val-warn' : ''}`}>{fundamentals.roe ? `${(fundamentals.roe * 100).toFixed(1)}%` : '—'}</span>
                  </div>
                  <div className="fund-row">
                    <span className="fund-label">Debt to Equity</span>
                    <span className={`fund-value ${fundamentals.debt_to_equity && fundamentals.debt_to_equity > 200 ? 'val-warn' : fundamentals.debt_to_equity && fundamentals.debt_to_equity < 100 ? 'val-good' : ''}`}>{fundamentals.debt_to_equity ? `${fundamentals.debt_to_equity.toFixed(0)}%` : '—'}</span>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState icon="📋" message="Fundamentals data unavailable" />
            )}
          </div>

          {/* Comparison across all tickers */}
          <div className="card pad" style={{ marginTop: 18 }}>
            <div className="ctitle"><span className="dot" />Signal comparison</div>
            <div className="csub">AI verdict across all tracked stocks</div>
            <div className="cmp-grid">
              {stocks.map((s) => {
                const pred = predictions.find((p) => p.ticker === s.ticker);
                const sig = pred?.signal || 'HOLD';
                const conf = pred?.confidence || 50;
                const c = sig === 'BUY' ? '#22c55e' : sig === 'SELL' ? '#ef4444' : '#a1a1aa';
                return (
                  <div
                    key={s.ticker}
                    className={`cmp-item${ticker === s.ticker ? ' active' : ''}`}
                    onClick={() => { setTicker(s.ticker); setSearchInput(s.ticker); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  >
                    <div className="cmp-sym">{s.ticker}</div>
                    <div className="cmp-sig" style={{ color: c }}>{sig}</div>
                    <div className="cmp-conf">{conf.toFixed(0)}%</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="disclaimer">
            <b>Disclaimer:</b> All verdicts, scores and action plans are generated by a machine-learning model and must not be treated as financial advice. Past performance does not guarantee future results. Always conduct your own research before making investment decisions.
          </div>
        </>
      )}
    </div>
  );
}
