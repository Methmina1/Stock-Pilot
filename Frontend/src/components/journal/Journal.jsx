import React, { useState, useMemo } from 'react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Legend, Tooltip } from 'chart.js';
import { Line, Doughnut, Bar } from 'react-chartjs-2';

const chartFont = { family: "'IBM Plex Mono', monospace", size: 10 };
import { useTrades } from '../../hooks/useTrades';
import LoadingSpinner from '../ui/LoadingSpinner';
import EmptyState from '../ui/EmptyState';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Legend, Tooltip);

const GRID = '#2e2e33';

function fmtMoney(n) {
  const v = Number(n) || 0;
  return (v < 0 ? '-' : '') + '$' + Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDuration(openTime, closeTime) {
  if (!openTime || !closeTime) return '—';
  const start = new Date(openTime), end = new Date(closeTime);
  if (isNaN(start) || isNaN(end)) return '—';
  let mins = Math.max(0, Math.round((end - start) / 60000));
  const d = Math.floor(mins / 1440); mins -= d * 1440;
  const h = Math.floor(mins / 60); mins -= h * 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${mins}m`;
  return `${mins}m`;
}

function calcTrade(t) {
  const entry = Number(t.entry_price) || 0, exit = Number(t.exit_price) || 0;
  const stop = Number(t.stop_loss) || 0, target = Number(t.take_profit) || 0;
  const qty = Number(t.quantity) || 0;
  const buy = (t.side || 'buy').toLowerCase() === 'buy';
  const pnl = buy ? (exit - entry) * qty : (entry - exit) * qty;
  const risk = Math.abs((buy ? entry - stop : stop - entry)) * qty;
  const reward = Math.abs((buy ? target - entry : entry - target)) * qty;
  const rr = risk > 0 ? reward / risk : null;
  const status = pnl > 0 ? 'win' : pnl < 0 ? 'loss' : 'breakeven';
  return { ...t, pnl, risk, reward, rr, status, duration: fmtDuration(t.opened_at, t.closed_at) };
}

export default function Journal() {
  const { trades, loading, createTrade, deleteTrade } = useTrades();
  const [filters, setFilters] = useState({ symbol: '', result: 'all', strategy: '' });
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [expandedTrade, setExpandedTrade] = useState(null);
  const [form, setForm] = useState({
    ticker: '', side: 'buy', entry_price: '', exit_price: '',
    stop_loss: '', take_profit: '', quantity: '', strategy_label: '',
    opened_at: '', closed_at: '', notes: '',
  });

  const calculated = useMemo(() => trades.map(calcTrade), [trades]);

  const filtered = useMemo(() => {
    return calculated
      .filter((t) => !filters.symbol || (t.ticker || '').toLowerCase().includes(filters.symbol.toLowerCase()))
      .filter((t) => filters.result === 'all' || t.status === filters.result)
      .filter((t) => !filters.strategy || (t.strategy_label || '').toLowerCase().includes(filters.strategy.toLowerCase()))
      .sort((a, b) => new Date(b.closed_at || 0) - new Date(a.closed_at || 0));
  }, [calculated, filters]);

  const stats = useMemo(() => {
    const total = calculated.length;
    const wins = calculated.filter((t) => t.status === 'win').length;
    const losses = calculated.filter((t) => t.status === 'loss').length;
    const be = calculated.filter((t) => t.status === 'breakeven').length;
    const net = calculated.reduce((a, t) => a + t.pnl, 0);
    const winRate = total > 0 ? (wins / total) * 100 : 0;
    const grossProfit = calculated.filter((t) => t.pnl > 0).reduce((a, t) => a + t.pnl, 0);
    const grossLoss = Math.abs(calculated.filter((t) => t.pnl < 0).reduce((a, t) => a + t.pnl, 0));
    const pf = grossLoss > 0 ? grossProfit / grossLoss : null;
    const avgWin = wins > 0 ? grossProfit / wins : 0;
    const avgLoss = losses > 0 ? grossLoss / losses : 0;
    const expectancy = total > 0 ? net / total : 0;
    const largestWin = calculated.length > 0 ? Math.max(...calculated.map(t => t.pnl)) : 0;
    const largestLoss = calculated.length > 0 ? Math.min(...calculated.map(t => t.pnl)) : 0;
    return { total, wins, losses, be, net, winRate, pf, avgWin, avgLoss, expectancy, largestWin, largestLoss };
  }, [calculated]);

  const equityData = useMemo(() => {
    const sorted = [...calculated].sort((a, b) => new Date(a.closed_at || 0) - new Date(b.closed_at || 0));
    let eq = 0;
    return sorted.map((t, i) => { eq += t.pnl; return { label: `T${i + 1}`, value: +eq.toFixed(2) }; });
  }, [calculated]);

  const monthlyPnL = useMemo(() => {
    const months = {};
    calculated.forEach((t) => {
      if (!t.closed_at) return;
      const d = new Date(t.closed_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!months[key]) months[key] = 0;
      months[key] += t.pnl;
    });
    const keys = Object.keys(months).sort();
    return { labels: keys, data: keys.map(k => +months[k].toFixed(2)) };
  }, [calculated]);

  const outcomeCounts = useMemo(() => [stats.wins, stats.losses, stats.be], [stats]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.ticker.trim()) { setFormError('Ticker is required'); return; }
    if (!form.entry_price || !form.exit_price) { setFormError('Entry and exit prices are required'); return; }
    if (!form.quantity) { setFormError('Quantity is required'); return; }
    if (!form.opened_at || !form.closed_at) { setFormError('Open and close dates are required'); return; }
    setSubmitting(true);
    try {
      await createTrade({
        ticker: form.ticker.toUpperCase(),
        side: form.side,
        entry_price: parseFloat(form.entry_price),
        exit_price: parseFloat(form.exit_price),
        stop_loss: form.stop_loss ? parseFloat(form.stop_loss) : null,
        take_profit: form.take_profit ? parseFloat(form.take_profit) : null,
        quantity: parseFloat(form.quantity),
        strategy_label: form.strategy_label || null,
        opened_at: form.opened_at || null,
        closed_at: form.closed_at || null,
        notes: form.notes || null,
      });
      setForm({ ticker: '', side: 'buy', entry_price: '', exit_price: '', stop_loss: '', take_profit: '', quantity: '', strategy_label: '', opened_at: '', closed_at: '', notes: '' });
      setShowForm(false);
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to save trade');
    }
    setSubmitting(false);
  };

  const setField = (key, val) => setForm({ ...form, [key]: val });

  const handleDelete = async (id) => {
    try {
      await deleteTrade(id);
      setDeleteConfirm(null);
    } catch { /* silent */ }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="view-enter">
      <div className="eyebrow">Journal</div>
      <h1 className="page">Trading Journal</h1>
      <p className="lede">Log every trade. Profit / Loss, risk-reward multiple, duration, win rate, and equity growth are calculated automatically.</p>

      {/* Stats row */}
      <div className="j-stat-row">
        <div className="j-stat-card accent">
          <div className="j-stat-k">Net Profit / Loss</div>
          <div className={`j-stat-v ${stats.net >= 0 ? 'up' : 'down'}`}>{fmtMoney(stats.net)}</div>
        </div>
        <div className="j-stat-card">
          <div className="j-stat-k">Trades</div>
          <div className="j-stat-v">{stats.total}</div>
          <div className="j-stat-s">{stats.wins} Win / {stats.losses} Loss / {stats.be} Even</div>
        </div>
        <div className="j-stat-card">
          <div className="j-stat-k">Win rate</div>
          <div className="j-stat-v">{stats.winRate.toFixed(1)}%</div>
          <div className="j-stat-bar">
            <div className="j-stat-bar-fill" style={{ width: `${stats.winRate}%` }} />
          </div>
        </div>
        <div className="j-stat-card">
          <div className="j-stat-k">Profit factor</div>
          <div className={`j-stat-v ${stats.pf && stats.pf >= 1 ? 'up' : stats.pf && stats.pf < 1 ? 'down' : ''}`}>
            {stats.pf != null ? stats.pf.toFixed(2) : '—'}
          </div>
        </div>
        <div className="j-stat-card">
          <div className="j-stat-k">Expectancy</div>
          <div className={`j-stat-v ${stats.expectancy >= 0 ? 'up' : 'down'}`}>{fmtMoney(stats.expectancy)}</div>
          <div className="j-stat-s">per trade</div>
        </div>
      </div>

      {/* Charts row */}
      <div className="j-charts-row">
        {/* Equity curve */}
        <div className="card pad j-chart-card">
          <div className="ctitle" style={{ fontSize: 14 }}><span className="dot" />Equity curve</div>
          <div className="csub">Cumulative Profit / Loss over time</div>
          <div className="chart-box" style={{ height: 220 }}>
            {equityData.length > 1 ? (
              <Line
                data={{
                  labels: equityData.map((d) => d.label),
                  datasets: [{
                    label: 'Equity', data: equityData.map((d) => d.value),
                    borderColor: '#d4a853', backgroundColor: 'rgba(212,168,83,.08)',
                    borderWidth: 2, fill: true, tension: .3, pointRadius: 0,
                  }],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { grid: { color: GRID }, border: { display: false }, ticks: { maxTicksLimit: 8, color: '#71717a', font: { family: "'IBM Plex Mono'", size: 10 } } },
                    y: { grid: { color: GRID }, border: { display: false }, ticks: { callback: (v) => '$' + v.toFixed(0), color: '#71717a', font: { family: "'IBM Plex Mono'", size: 10 } } },
                  },
                }}
              />
            ) : (
              <EmptyState message="Log 2+ trades to see your equity curve." />
            )}
          </div>
        </div>

        {/* Monthly P/L */}
        <div className="card pad j-chart-card">
          <div className="ctitle" style={{ fontSize: 14 }}><span className="dot" />Monthly Profit / Loss</div>
          <div className="csub">Profit and loss by calendar month</div>
          <div className="chart-box" style={{ height: 220 }}>
            {monthlyPnL.labels.length > 0 ? (
              <Bar
                data={{
                  labels: monthlyPnL.labels.map(l => l.slice(2)),
                  datasets: [{
                    data: monthlyPnL.data,
                    backgroundColor: monthlyPnL.data.map(v => v >= 0 ? 'rgba(34,197,94,.6)' : 'rgba(239,68,68,.6)'),
                    borderRadius: 4,
                  }],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    x: { grid: { display: false }, border: { display: false }, ticks: { color: '#71717a', font: { family: "'IBM Plex Mono'", size: 10 } } },
                    y: { grid: { color: GRID }, border: { display: false }, ticks: { callback: (v) => '$' + v.toFixed(0), color: '#71717a', font: { family: "'IBM Plex Mono'", size: 10 } } },
                  },
                }}
              />
            ) : (
              <EmptyState message="Log trades to see monthly breakdown." />
            )}
          </div>
        </div>

        {/* Outcome donut */}
        <div className="card pad j-chart-card j-chart-sm">
          <div className="ctitle" style={{ fontSize: 14 }}><span className="dot" />Outcomes</div>
          <div className="csub">Win / loss distribution</div>
          <div className="chart-box" style={{ height: 220 }}>
            {stats.total > 0 ? (
              <Doughnut
                data={{
                  labels: ['Wins', 'Losses', 'Breakeven'],
                  datasets: [{ data: outcomeCounts, backgroundColor: ['#22c55e', '#ef4444', '#a1a1aa'], borderWidth: 0 }],
                }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  cutout: '60%',
                  plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, color: '#71717a', font: { size: 10, family: "'IBM Plex Mono'" } } } },
                }}
              />
            ) : (
              <EmptyState message="No trades yet." />
            )}
          </div>
        </div>
      </div>

      {/* Extended stats */}
      {stats.total > 0 && (
        <div className="j-extended-stats">
          <div className="j-ext-stat">
            <span className="j-ext-k">Average win</span>
            <span className="j-ext-v up">{fmtMoney(stats.avgWin)}</span>
          </div>
          <div className="j-ext-stat">
            <span className="j-ext-k">Average loss</span>
            <span className="j-ext-v down">{fmtMoney(stats.avgLoss)}</span>
          </div>
          <div className="j-ext-stat">
            <span className="j-ext-k">Largest win</span>
            <span className="j-ext-v up">{fmtMoney(stats.largestWin)}</span>
          </div>
          <div className="j-ext-stat">
            <span className="j-ext-k">Largest loss</span>
            <span className="j-ext-v down">{fmtMoney(Math.abs(stats.largestLoss))}</span>
          </div>
          <div className="j-ext-stat">
            <span className="j-ext-k">Win/Loss ratio</span>
            <span className="j-ext-v">{stats.avgLoss > 0 ? (stats.avgWin / stats.avgLoss).toFixed(2) : '—'}</span>
          </div>
          <div className="j-ext-stat">
            <span className="j-ext-k">Total trades</span>
            <span className="j-ext-v">{stats.total}</span>
          </div>
        </div>
      )}

      {/* Strategy breakdown + Drawdown */}
      {stats.total > 0 && (
        <div className="j-charts-row" style={{ marginTop: 18 }}>
          <div className="card pad j-chart-card">
            <div className="ctitle" style={{ fontSize: 14 }}><span className="dot" />By strategy</div>
            <div className="csub">Profit / Loss grouped by strategy label</div>
            <div className="chart-box" style={{ height: 220 }}>
              {(() => {
                const byStrat = {};
                calculated.forEach(t => {
                  const key = t.strategy_label || 'No label';
                  if (!byStrat[key]) byStrat[key] = { pnl: 0, count: 0, wins: 0 };
                  byStrat[key].pnl += t.pnl;
                  byStrat[key].count++;
                  if (t.status === 'win') byStrat[key].wins++;
                });
                const labels = Object.keys(byStrat);
                const data = labels.map(k => +byStrat[k].pnl.toFixed(2));
                return (
                  <Bar
                    data={{
                      labels,
                      datasets: [{
                        data,
                        backgroundColor: data.map(v => v >= 0 ? 'rgba(34,197,94,.6)' : 'rgba(239,68,68,.6)'),
                        borderRadius: 4,
                      }],
                    }}
                    options={{
                      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { grid: { color: GRID }, border: { display: false }, ticks: { callback: v => '$' + v, color: '#71717a', font: chartFont } },
                        y: { grid: { display: false }, border: { display: false }, ticks: { color: '#a1a1aa', font: { ...chartFont, size: 11 } } },
                      },
                    }}
                  />
                );
              })()}
            </div>
          </div>
          <div className="card pad j-chart-card">
            <div className="ctitle" style={{ fontSize: 14 }}><span className="dot" />Drawdown</div>
            <div className="csub">Peak-to-trough equity decline</div>
            <div className="chart-box" style={{ height: 220 }}>
              {(() => {
                const sorted = [...calculated].sort((a, b) => new Date(a.closed_at || 0) - new Date(b.closed_at || 0));
                let eq = 0, peak = 0;
                const dd = sorted.map((t, i) => {
                  eq += t.pnl;
                  if (eq > peak) peak = eq;
                  return { label: `T${i + 1}`, value: peak > 0 ? +((eq - peak) / peak * 100).toFixed(2) : 0 };
                });
                return (
                  <Line
                    data={{
                      labels: dd.map(d => d.label),
                      datasets: [{
                        label: 'Drawdown %', data: dd.map(d => d.value),
                        borderColor: '#ef4444', backgroundColor: 'rgba(239,68,68,.08)',
                        borderWidth: 1.5, fill: true, tension: .3, pointRadius: 0,
                      }],
                    }}
                    options={{
                      responsive: true, maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: {
                        x: { grid: { color: GRID }, border: { display: false }, ticks: { maxTicksLimit: 8, color: '#71717a', font: chartFont } },
                        y: { grid: { color: GRID }, border: { display: false }, ticks: { callback: v => v + '%', color: '#71717a', font: chartFont }, max: 0 },
                      },
                    }}
                  />
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Trade history */}
      <div className="card pad" style={{ marginTop: 18 }}>
        <div className="port-card-head">
          <div>
            <div className="ctitle"><span className="dot" />Trade history</div>
            <div className="csub">All logged trades with filters</div>
          </div>
          <button className="btn gold" onClick={() => setShowForm(!showForm)}>
            {showForm ? '✕ Cancel' : '+ Log trade'}
          </button>
        </div>

        {/* New trade form */}
        {showForm && (
          <div className="j-trade-form-wrap">
            {formError && <div className="port-add-error">{formError}</div>}
            <form className="j-trade-form" onSubmit={handleSubmit}>
              <div className="j-form-row">
                <div className="field">
                  <label>Symbol</label>
                  <input value={form.ticker} onChange={(e) => setField('ticker', e.target.value)} placeholder="TSLA" />
                </div>
                <div className="field">
                  <label>Side</label>
                  <select value={form.side} onChange={(e) => setField('side', e.target.value)}>
                    <option value="buy">Buy (Long)</option>
                    <option value="sell">Sell (Short)</option>
                  </select>
                </div>
                <div className="field">
                  <label>Quantity</label>
                  <input type="number" step="0.01" min="0.01" value={form.quantity} onChange={(e) => setField('quantity', e.target.value)} placeholder="10" />
                </div>
                <div className="field">
                  <label>Strategy</label>
                  <input value={form.strategy_label} onChange={(e) => setField('strategy_label', e.target.value)} placeholder="Momentum" />
                </div>
              </div>
              <div className="j-form-row">
                <div className="field">
                  <label>Entry price</label>
                  <input type="number" step="0.01" value={form.entry_price} onChange={(e) => setField('entry_price', e.target.value)} placeholder="150.00" />
                </div>
                <div className="field">
                  <label>Exit price</label>
                  <input type="number" step="0.01" value={form.exit_price} onChange={(e) => setField('exit_price', e.target.value)} placeholder="165.00" />
                </div>
                <div className="field">
                  <label>Stop loss</label>
                  <input type="number" step="0.01" value={form.stop_loss} onChange={(e) => setField('stop_loss', e.target.value)} placeholder="145.00" />
                </div>
                <div className="field">
                  <label>Take profit</label>
                  <input type="number" step="0.01" value={form.take_profit} onChange={(e) => setField('take_profit', e.target.value)} placeholder="170.00" />
                </div>
              </div>
              <div className="j-form-row">
                <div className="field">
                  <label>Opened at</label>
                  <input type="datetime-local" value={form.opened_at} onChange={(e) => setField('opened_at', e.target.value)} />
                </div>
                <div className="field">
                  <label>Closed at</label>
                  <input type="datetime-local" value={form.closed_at} onChange={(e) => setField('closed_at', e.target.value)} />
                </div>
                <div className="field" style={{ gridColumn: 'span 2' }}>
                  <label>Notes</label>
                  <input value={form.notes} onChange={(e) => setField('notes', e.target.value)} placeholder="Trade rationale..." />
                </div>
              </div>
              {/* Live preview */}
              {form.entry_price && form.exit_price && form.quantity && (
                <div className="j-form-preview">
                  {(() => {
                    const t = calcTrade({ ...form, entry_price: +form.entry_price, exit_price: +form.exit_price, quantity: +form.quantity, stop_loss: form.stop_loss ? +form.stop_loss : 0, take_profit: form.take_profit ? +form.take_profit : 0 });
                    return (
                      <>
                        <span className={`j-fp-pnl ${t.pnl >= 0 ? 'up' : 'down'}`}>Profit / Loss: {t.pnl >= 0 ? '+' : ''}{fmtMoney(t.pnl)}</span>
                        <span className={`j-fp-status ${t.status}`}>{t.status.toUpperCase()}</span>
                        {t.rr != null && isFinite(t.rr) && <span className="j-fp-rr">Risk / Reward 1:{t.rr.toFixed(1)}</span>}
                      </>
                    );
                  })()}
                </div>
              )}
              <div className="j-form-actions">
                <button className="btn primary" type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Save trade'}
                </button>
                <button className="btn" type="button" onClick={() => { setShowForm(false); setFormError(''); }}>Cancel</button>
              </div>
            </form>
          </div>
        )}

        {/* Filters */}
        <div className="j-filters">
          <input
            value={filters.symbol}
            onChange={(e) => setFilters({ ...filters, symbol: e.target.value })}
            placeholder="Filter symbol..."
            className="j-filter-input"
          />
          <select
            value={filters.result}
            onChange={(e) => setFilters({ ...filters, result: e.target.value })}
            className="j-filter-select"
          >
            <option value="all">All results</option>
            <option value="win">Wins</option>
            <option value="loss">Losses</option>
            <option value="breakeven">Breakeven</option>
          </select>
          <input
            value={filters.strategy}
            onChange={(e) => setFilters({ ...filters, strategy: e.target.value })}
            placeholder="Filter strategy..."
            className="j-filter-input"
          />
          {(filters.symbol || filters.result !== 'all' || filters.strategy) && (
            <button className="btn" onClick={() => setFilters({ symbol: '', result: 'all', strategy: '' })}>Clear</button>
          )}
        </div>

        {/* Trade table */}
        {filtered.length === 0 ? (
          <EmptyState icon="📝" message={calculated.length === 0 ? "No trades logged yet. Click '+ Log trade' to start." : 'No trades match your filters.'} />
        ) : (
          <div className="journal-table-wrap">
            <table className="journal-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Quantity</th>
                  <th>Entry</th>
                  <th>Exit</th>
                  <th>Profit / Loss</th>
                  <th>Risk / Reward</th>
                  <th>Result</th>
                  <th>Duration</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => {
                  const cls = t.status === 'win' ? 'win' : t.status === 'loss' ? 'loss' : 'be';
                  const rrStr = t.rr != null && isFinite(t.rr) ? `1:${t.rr.toFixed(1)}` : '—';
                  const isExpanded = expandedTrade === t.id;
                  return (
                    <React.Fragment key={t.id}>
                      <tr className={`j-trade-row${isExpanded ? ' expanded' : ''}`} onClick={() => setExpandedTrade(isExpanded ? null : t.id)}>
                        <td className="mono" style={{ fontSize: 11 }}>
                          {t.closed_at ? new Date(t.closed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '—'}
                        </td>
                        <td><b>{t.ticker}</b></td>
                        <td>
                          <span className={`j-side-badge ${t.side}`}>{t.side.toUpperCase()}</span>
                        </td>
                        <td className="mono">{t.quantity}</td>
                        <td className="mono">${Number(t.entry_price).toFixed(2)}</td>
                        <td className="mono">${Number(t.exit_price).toFixed(2)}</td>
                        <td className={`mono ${t.pnl >= 0 ? 'up' : 'down'}`}>
                          <b>{t.pnl >= 0 ? '+' : ''}{fmtMoney(t.pnl)}</b>
                        </td>
                        <td className="mono">{rrStr}</td>
                        <td><span className={`pill ${cls}`}>{t.status.toUpperCase()}</span></td>
                        <td className="mono" style={{ fontSize: 11, color: 'var(--muted2)' }}>{t.duration}</td>
                        <td>
                          {deleteConfirm === t.id ? (
                            <div className="port-del-confirm" onClick={(e) => e.stopPropagation()}>
                              <button className="btn danger" onClick={() => handleDelete(t.id)}>Yes</button>
                              <button className="btn" onClick={() => setDeleteConfirm(null)}>No</button>
                            </div>
                          ) : (
                            <button
                              className="port-del-btn"
                              onClick={(e) => { e.stopPropagation(); setDeleteConfirm(t.id); }}
                              title="Delete trade"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="j-expanded-row">
                          <td colSpan="11">
                            <div className="j-expanded-content">
                              <div className="j-exp-grid">
                                <div><span className="j-exp-k">Strategy</span><span className="j-exp-v">{t.strategy_label || '—'}</span></div>
                                <div><span className="j-exp-k">Stop loss</span><span className="j-exp-v bear-text">{t.stop_loss ? '$' + Number(t.stop_loss).toFixed(2) : '—'}</span></div>
                                <div><span className="j-exp-k">Take profit</span><span className="j-exp-v bull-text">{t.take_profit ? '$' + Number(t.take_profit).toFixed(2) : '—'}</span></div>
                                <div><span className="j-exp-k">Opened</span><span className="j-exp-v">{t.opened_at ? new Date(t.opened_at).toLocaleString() : '—'}</span></div>
                                <div><span className="j-exp-k">Closed</span><span className="j-exp-v">{t.closed_at ? new Date(t.closed_at).toLocaleString() : '—'}</span></div>
                                <div><span className="j-exp-k">Duration</span><span className="j-exp-v">{t.duration}</span></div>
                              </div>
                              {t.notes && <div className="j-exp-notes"><span className="j-exp-k">Notes</span><p>{t.notes}</p></div>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="j-table-footer">
            Showing {filtered.length} of {calculated.length} trade{calculated.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
}
