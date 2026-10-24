import React, { useState, useMemo, useEffect } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend } from 'chart.js';
import { Doughnut, Line } from 'react-chartjs-2';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useWatchlist } from '../../hooks/useWatchlist';
import { usePredictions } from '../../hooks/usePredictions';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import LoadingSpinner from '../ui/LoadingSpinner';
import EmptyState from '../ui/EmptyState';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Filler, Tooltip, Legend);

const GRID = '#2e2e33';
const chartFont = { family: "'IBM Plex Mono', monospace", size: 10 };

const ALLOC_COLORS = ['#d4a853', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#ef4444', '#a1a1aa', '#6366f1'];

function fmtMoney(n) {
  const v = Number(n) || 0;
  return (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getSignalColor(signal) {
  if (!signal) return '#a1a1aa';
  const s = signal.toUpperCase();
  if (s === 'BUY') return '#22c55e';
  if (s === 'SELL') return '#ef4444';
  return '#a1a1aa';
}

export default function Portfolio() {
  const navigate = useNavigate();
  const { holdings, loading: holdingsLoading, addHolding, deleteHolding } = usePortfolio();
  const { watchlist, addToWatchlist, removeFromWatchlist } = useWatchlist();
  const { predictions } = usePredictions();
  const [watchInput, setWatchInput] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ ticker: '', quantity: '', avg_cost: '' });
  const [addError, setAddError] = useState('');
  const [adding, setAdding] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [sortKey, setSortKey] = useState('ticker');
  const [sortDir, setSortDir] = useState('asc');
  const [portfolioHistory, setPortfolioHistory] = useState([]);
  const [sectorBreakdown, setSectorBreakdown] = useState([]);

  useEffect(() => {
    api.get('/api/v1/dashboard/portfolio-history').then(r => setPortfolioHistory(r.data?.portfolio || [])).catch(() => {});
    api.get('/api/v1/dashboard/sector-breakdown').then(r => setSectorBreakdown(r.data)).catch(() => {});
  }, []);

  const getPrediction = (ticker) => predictions.find((p) => p.ticker === ticker);

  const rows = useMemo(() => holdings.map((h) => {
    const price = h.current_price || h.avg_cost || 0;
    const mv = (h.quantity || 0) * price;
    const cost = (h.quantity || 0) * (h.avg_cost || 0);
    const pl = mv - cost;
    const plPct = cost > 0 ? (pl / cost) * 100 : 0;
    const pred = getPrediction(h.ticker);
    return { ...h, price, mv, cost, pl, plPct, signal: pred?.signal || 'HOLD' };
  }), [holdings, predictions]);

  const sortedRows = useMemo(() => {
    const sorted = [...rows];
    sorted.sort((a, b) => {
      let av, bv;
      switch (sortKey) {
        case 'ticker': av = a.ticker; bv = b.ticker; return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
        case 'mv': av = a.mv; bv = b.mv; break;
        case 'pl': av = a.pl; bv = b.pl; break;
        case 'plPct': av = a.plPct; bv = b.plPct; break;
        default: av = a.ticker; bv = b.ticker; return av.localeCompare(bv);
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return sorted;
  }, [rows, sortKey, sortDir]);

  const totalMV = rows.reduce((a, r) => a + r.mv, 0);
  const totalCost = rows.reduce((a, r) => a + r.cost, 0);
  const totalPL = totalMV - totalCost;
  const totalPLPct = totalCost > 0 ? (totalPL / totalCost) * 100 : 0;
  const bestPerformer = rows.length > 0 ? rows.reduce((best, r) => r.plPct > best.plPct ? r : best, rows[0]) : null;
  const worstPerformer = rows.length > 0 ? rows.reduce((worst, r) => r.plPct < worst.plPct ? r : worst, rows[0]) : null;

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortIcon = (key) => {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  };

  const handleAddHolding = async (e) => {
    e.preventDefault();
    setAddError('');
    const ticker = addForm.ticker.trim().toUpperCase();
    const qty = parseFloat(addForm.quantity);
    const cost = parseFloat(addForm.avg_cost);
    if (!ticker) { setAddError('Enter a ticker symbol'); return; }
    if (!qty || qty <= 0) { setAddError('Quantity must be positive'); return; }
    if (!cost || cost <= 0) { setAddError('Cost must be positive'); return; }
    setAdding(true);
    try {
      await addHolding({ ticker, quantity: qty, avg_cost: cost });
      setAddForm({ ticker: '', quantity: '', avg_cost: '' });
      setShowAddForm(false);
    } catch (err) {
      setAddError(err.response?.data?.detail || 'Failed to add position');
    }
    setAdding(false);
  };

  const handleDelete = async (id) => {
    try {
      await deleteHolding(id);
      setDeleteConfirm(null);
    } catch { /* silent */ }
  };

  const handleAddWatch = async () => {
    const t = watchInput.trim().toUpperCase();
    if (!t) return;
    try {
      await addToWatchlist(t);
      setWatchInput('');
    } catch { /* silent */ }
  };

  if (holdingsLoading) return <LoadingSpinner />;

  return (
    <div className="view-enter">
      <div className="eyebrow">Portfolio</div>
      <h1 className="page">Portfolio</h1>
      <p className="lede">Track every position against the model's verdict. Add holdings, monitor profit and loss, and manage your watchlist.</p>

      {/* Stat cards */}
      <div className="stat-grid">
        <div className="stat">
          <div className="k">Market value</div>
          <div className="v mono">{fmtMoney(totalMV)}</div>
          <div className="s">{rows.length} position{rows.length !== 1 ? 's' : ''}</div>
        </div>
        <div className="stat">
          <div className="k">Cost basis</div>
          <div className="v mono">{fmtMoney(totalCost)}</div>
          <div className="s">average entry weighted</div>
        </div>
        <div className="stat">
          <div className="k">Unrealised Profit / Loss</div>
          <div className={`v mono ${totalPL >= 0 ? 'up' : 'down'}`}>
            {totalPL >= 0 ? '+' : ''}{fmtMoney(totalPL)}
          </div>
          <div className="s">{totalPLPct >= 0 ? '+' : ''}{totalPLPct.toFixed(1)}%</div>
        </div>
        <div className="stat">
          <div className="k">Watchlist</div>
          <div className="v mono">{watchlist.length}</div>
          <div className="s">tickers tracked</div>
        </div>
      </div>

      {/* Best / Worst performers */}
      {rows.length >= 2 && (
        <div className="perf-strip">
          <div className="perf-item">
            <span className="perf-label">Best performer</span>
            <span className="perf-ticker">{bestPerformer.ticker}</span>
            <span className={`perf-pct ${bestPerformer.plPct >= 0 ? 'up' : 'down'}`}>
              {bestPerformer.plPct >= 0 ? '+' : ''}{bestPerformer.plPct.toFixed(1)}%
            </span>
          </div>
          <div className="perf-divider" />
          <div className="perf-item">
            <span className="perf-label">Worst performer</span>
            <span className="perf-ticker">{worstPerformer.ticker}</span>
            <span className={`perf-pct ${worstPerformer.plPct >= 0 ? 'up' : 'down'}`}>
              {worstPerformer.plPct >= 0 ? '+' : ''}{worstPerformer.plPct.toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {/* Holdings + Allocation */}
      <div className="port-masonry">
          {/* Holdings card — full width */}
          <div className="card pad port-full">
            <div className="port-card-head">
              <div>
                <div className="ctitle"><span className="dot" />Holdings</div>
                <div className="csub">Quantity, cost basis and current model verdict for each position</div>
              </div>
              <button className="btn gold" onClick={() => setShowAddForm(!showAddForm)}>
                {showAddForm ? '✕ Cancel' : '+ Add position'}
              </button>
            </div>

            {/* Add form */}
            {showAddForm && (
              <div className="port-add-form">
                {addError && <div className="port-add-error">{addError}</div>}
                <form onSubmit={handleAddHolding} className="port-add-fields">
                  <div className="field">
                    <label>Ticker</label>
                    <input
                      value={addForm.ticker}
                      onChange={(e) => setAddForm({ ...addForm, ticker: e.target.value.toUpperCase() })}
                      placeholder="AAPL"
                      autoFocus
                    />
                  </div>
                  <div className="field">
                    <label>Quantity</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={addForm.quantity}
                      onChange={(e) => setAddForm({ ...addForm, quantity: e.target.value })}
                      placeholder="10"
                    />
                  </div>
                  <div className="field">
                    <label>Average cost</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={addForm.avg_cost}
                      onChange={(e) => setAddForm({ ...addForm, avg_cost: e.target.value })}
                      placeholder="150.00"
                    />
                  </div>
                  <div className="field" style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button className="btn primary" type="submit" disabled={adding} style={{ width: '100%' }}>
                      {adding ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {rows.length === 0 ? (
              <EmptyState icon="💼" message="No holdings yet. Click '+ Add position' above to track your first stock." />
            ) : (
              <div className="journal-table-wrap">
                <table className="journal-table port-table">
                  <thead>
                    <tr>
                      <th className="sortable" onClick={() => handleSort('ticker')}>Symbol{sortIcon('ticker')}</th>
                      <th>Quantity</th>
                      <th>Average Cost</th>
                      <th>Price</th>
                      <th className="sortable" onClick={() => handleSort('mv')}>Market Value{sortIcon('mv')}</th>
                      <th className="sortable" onClick={() => handleSort('pl')}>Profit / Loss{sortIcon('pl')}</th>
                      <th className="sortable" onClick={() => handleSort('plPct')}>%{sortIcon('plPct')}</th>
                      <th>Verdict</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.map((r) => (
                      <tr key={r.id || r.ticker}>
                        <td>
                          <span className="port-sym" onClick={() => navigate('/advisor')}>{r.ticker}</span>
                        </td>
                        <td className="mono">{r.quantity}</td>
                        <td className="mono">${(r.avg_cost || 0).toFixed(2)}</td>
                        <td className="mono">${r.price.toFixed(2)}</td>
                        <td className="mono">{fmtMoney(r.mv)}</td>
                        <td className={`mono ${r.pl >= 0 ? 'up' : 'down'}`}>
                          {r.pl >= 0 ? '+' : ''}{fmtMoney(r.pl)}
                        </td>
                        <td className={`mono ${r.plPct >= 0 ? 'up' : 'down'}`}>
                          {r.plPct >= 0 ? '+' : ''}{r.plPct.toFixed(1)}%
                        </td>
                        <td>
                          <span className={`pill ${r.signal === 'BUY' ? 'win' : r.signal === 'SELL' ? 'loss' : 'be'}`}>
                            {r.signal}
                          </span>
                        </td>
                        <td>
                          {deleteConfirm === r.id ? (
                            <div className="port-del-confirm">
                              <button className="btn danger" onClick={() => handleDelete(r.id)}>Confirm</button>
                              <button className="btn" onClick={() => setDeleteConfirm(null)}>No</button>
                            </div>
                          ) : (
                            <button className="port-del-btn" onClick={() => setDeleteConfirm(r.id)} title="Remove holding">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {rows.length > 1 && (
                    <tfoot>
                      <tr className="port-total-row">
                        <td colSpan="4"><b>Total</b></td>
                        <td className="mono"><b>{fmtMoney(totalMV)}</b></td>
                        <td className={`mono ${totalPL >= 0 ? 'up' : 'down'}`}>
                          <b>{totalPL >= 0 ? '+' : ''}{fmtMoney(totalPL)}</b>
                        </td>
                        <td className={`mono ${totalPLPct >= 0 ? 'up' : 'down'}`}>
                          <b>{totalPLPct >= 0 ? '+' : ''}{totalPLPct.toFixed(1)}%</b>
                        </td>
                        <td colSpan="2" />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </div>

        {/* Left column: Portfolio value */}
        <div className="port-left">
          <div className="card pad">
            <div className="ctitle"><span className="dot" />Realized trade profit / loss</div>
            <div className="csub">Cumulative result from closed journal trades</div>
            <div className="chart-box" style={{ height: 220 }}>
              <Line
                data={{
                  labels: portfolioHistory.map(d => d.date),
                  datasets: [{
                    label: 'Realized P/L', data: portfolioHistory.map(d => d.value),
                    borderColor: '#d4a853', backgroundColor: 'rgba(212,168,83,.06)',
                    borderWidth: 2, fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: '#d4a853',
                  }],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { grid: { color: GRID }, border: { display: false }, ticks: { color: '#71717a', font: chartFont } },
                    y: { grid: { color: GRID }, border: { display: false }, ticks: { callback: v => '$' + Number(v).toLocaleString(), color: '#71717a', font: chartFont } },
                  },
                }}
              />
            </div>
          </div>
          <div className="card pad">
            <div className="ctitle"><span className="dot" />Sector exposure</div>
            <div className="csub">Breakdown by industry</div>
            <div className="dash-sectors">
              {sectorBreakdown.map((s) => (
                <div key={s.sector} className="dash-sector-row">
                  <div className="dash-sector-head">
                    <span className="dash-sector-name">{s.sector}</span>
                    <span className="dash-sector-pct mono">{s.weight.toFixed(1)}%</span>
                  </div>
                  <div className="dash-sector-bar">
                    <div className="dash-sector-fill" style={{ width: `${s.weight}%` }} />
                  </div>
                  <span className="dash-sector-val mono">{fmtMoney(s.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: Allocation + Verdict */}
        <div className="port-right">
          <div className="card pad">
            <div className="ctitle"><span className="dot" />Allocation</div>
            <div className="csub">Market value by position</div>
            {rows.length === 0 ? (
              <EmptyState icon="📊" message="Add positions to see allocation." />
            ) : (
              <>
                <div className="chart-box" style={{ height: 240 }}>
                  <Doughnut
                    data={{
                      labels: rows.map((r) => r.ticker),
                      datasets: [{
                        data: rows.map((r) => r.mv),
                        backgroundColor: rows.map((_, i) => ALLOC_COLORS[i % ALLOC_COLORS.length]),
                        borderWidth: 0,
                        hoverOffset: 6,
                      }],
                    }}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      cutout: '62%',
                      plugins: {
                        legend: { display: false },
                        tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmtMoney(c.raw)} (${totalMV > 0 ? ((c.raw / totalMV) * 100).toFixed(1) : 0}%)` } },
                      },
                    }}
                  />
                </div>
                <div className="alloc-legend">
                  {rows.map((r, i) => {
                    const pct = totalMV > 0 ? ((r.mv / totalMV) * 100).toFixed(1) : 0;
                    return (
                      <div key={r.id || `${r.ticker}-${i}`} className="alloc-item">
                        <span className="alloc-dot" style={{ background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
                        <span className="alloc-sym">{r.ticker}</span>
                        <span className="alloc-pct">{pct}%</span>
                        <span className="alloc-val">{fmtMoney(r.mv)}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {rows.length > 0 && (
            <div className="card pad">
              <div className="ctitle"><span className="dot" />Verdict summary</div>
              <div className="csub">AI signals across your holdings</div>
              <div className="verdict-summary">
                {['BUY', 'HOLD', 'SELL'].map((sig) => {
                  const matched = rows.filter(r => r.signal === sig);
                  const color = getSignalColor(sig);
                  const pct = rows.length > 0 ? (matched.length / rows.length) * 100 : 0;
                  return (
                    <div key={sig} className="vs-row">
                      <div className="vs-label">
                        <span className="vs-dot" style={{ background: color }} />
                        <span>{sig}</span>
                      </div>
                      <div className="vs-track">
                        <div className="vs-fill" style={{ width: `${pct}%`, background: color }} />
                      </div>
                      <span className="vs-count">{matched.length}</span>
                      {matched.length > 0 && (
                        <div className="vs-tickers">
                          {matched.map((r) => (
                            <span key={r.id || r.ticker} className="vs-ticker" style={{ color, borderColor: color + '44' }}>{r.ticker}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Watchlist */}
      <div className="card pad" style={{ marginTop: 18 }}>
        <div className="port-card-head">
          <div>
            <div className="ctitle"><span className="dot" />Watchlist</div>
            <div className="csub">Tickers you're tracking but don't hold. Click to open in Advisor.</div>
          </div>
        </div>
        <div className="watch-add">
          <input
            value={watchInput}
            onChange={(e) => setWatchInput(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddWatch(); }}
            placeholder="Add a ticker... e.g. NVDA"
          />
          <button className="btn primary" onClick={handleAddWatch}>Add</button>
        </div>
        {watchlist.length === 0 ? (
          <EmptyState icon="👀" message="No tickers on your watchlist — add one above." />
        ) : (
          <div className="watch-grid">
            {watchlist.map((w) => {
              const t = typeof w === 'string' ? w : w.ticker;
              const pred = getPrediction(t);
              const signal = pred?.signal || 'HOLD';
              const color = getSignalColor(signal);
              return (
                <div key={t} className="watch-card" onClick={() => navigate('/advisor')}>
                  <div className="wc-top">
                    <span className="wc-ticker">{t}</span>
                    <span className="wc-verdict" style={{ background: color + '18', color, borderColor: color + '44' }}>
                      {signal}
                    </span>
                  </div>
                  <button className="wc-remove" onClick={(e) => { e.stopPropagation(); removeFromWatchlist(t); }} title="Remove">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
