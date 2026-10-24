import React, { useMemo, useState, useEffect } from 'react';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Filler, Legend, Tooltip,
} from 'chart.js';
import { Line, Doughnut } from 'react-chartjs-2';
import { usePortfolio } from '../../hooks/usePortfolio';
import { useWatchlist } from '../../hooks/useWatchlist';
import { useTrades } from '../../hooks/useTrades';
import { usePredictions } from '../../hooks/usePredictions';
import { useMarketplace } from '../../hooks/useMarketplace';
import api from '../../api/client';
import LoadingSpinner from '../ui/LoadingSpinner';
import EmptyState from '../ui/EmptyState';
import MarketIndices from './widgets/MarketIndices';
import WatchlistPanel from './widgets/WatchlistPanel';
import FeaturedStrategy from './widgets/FeaturedStrategy';
import {
  GRID, chartFont, ICONS, fmtMoney, StatCard, TrendSub, DashboardHeader,
} from './widgets/shared';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Legend, Tooltip);

/**
 * Dashboard for the `investor` role: portfolio value, positions, allocation
 * and journal activity, plus the widgets shared by every role.
 */
export default function InvestorDashboard() {
  const { holdings, loading: holdingsLoading } = usePortfolio();
  const { watchlist } = useWatchlist();
  const { trades } = useTrades();
  const { predictions } = usePredictions();
  const { listings } = useMarketplace();

  const [marketIndices, setMarketIndices] = useState([]);
  const [sectorBreakdown, setSectorBreakdown] = useState([]);
  const [portfolioHistory, setPortfolioHistory] = useState({ portfolio: [] });

  useEffect(() => {
    api.get('/api/v1/dashboard/batch').then((r) => {
      setMarketIndices(r.data.market_indices || []);
      setSectorBreakdown(r.data.sector_breakdown || []);
      setPortfolioHistory(r.data.portfolio_history || { portfolio: [] });
    }).catch(() => {});
  }, []);

  const getPrediction = (ticker) => predictions.find((p) => p.ticker === ticker);

  const totalMV = holdings.reduce((a, h) => a + (h.quantity || 0) * (h.current_price || h.avg_cost || 0), 0);
  const totalCost = holdings.reduce((a, h) => a + (h.quantity || 0) * (h.avg_cost || 0), 0);
  const unrealisedPL = totalMV - totalCost;
  const buyCount = holdings.filter((h) => getPrediction(h.ticker)?.signal === 'BUY').length;

  const recentTrades = useMemo(
    () => [...trades].sort((a, b) => new Date(b.closed_at || 0) - new Date(a.closed_at || 0)).slice(0, 5),
    [trades],
  );

  if (holdingsLoading) return <LoadingSpinner />;

  return (
    <div className="view-enter">
      <DashboardHeader
        eyebrow="Overview"
        title="Dashboard"
        lede="A snapshot of your holdings, active AI verdicts, and recent activity."
      />

      <MarketIndices indices={marketIndices} />

      <div className="stat-grid">
        <StatCard hero index={0} label="Total value" icon={ICONS.wallet}
                  value={fmtMoney(totalMV)} sub={`${holdings.length} positions`} />
        <StatCard index={1} label="Closed trades" icon={ICONS.activity}
                  value={trades.length} sub="Recorded in your journal" />
        <StatCard index={2} label="Unrealised Profit / Loss" icon={ICONS.trending}
                  tone={unrealisedPL >= 0 ? 'up' : 'down'}
                  value={`${unrealisedPL >= 0 ? '+' : ''}${fmtMoney(unrealisedPL)}`}
                  sub={<TrendSub positive={unrealisedPL >= 0}>
                    {totalCost > 0 ? Math.abs((unrealisedPL / totalCost) * 100).toFixed(1) : '0'}% on cost
                  </TrendSub>} />
        <StatCard index={3} label="Open positions" icon={ICONS.layers}
                  value={holdings.length} sub={`${watchlist.length} on watchlist`} />
        <StatCard index={4} label="AI says BUY" icon={ICONS.spark} tone="up"
                  value={buyCount} sub={`of ${holdings.length} holdings`} />
      </div>

      {portfolioHistory.portfolio?.length > 1 && (
        <div className="card pad" style={{ marginBottom: 18 }}>
          <div className="ctitle"><span className="dot" />Realized trade profit / loss</div>
          <div className="csub">Cumulative result from closed journal trades</div>
          <div className="chart-box" style={{ height: 260 }}>
            <Line
              data={{
                labels: portfolioHistory.portfolio.map((d) => d.date),
                datasets: [
                  {
                    label: 'Realized P/L', data: portfolioHistory.portfolio.map((d) => d.value),
                    borderColor: '#d4a853', backgroundColor: 'rgba(212,168,83,.06)',
                    borderWidth: 2, fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: '#d4a853',
                  },
                ],
              }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'top', align: 'end', labels: { boxWidth: 12, color: '#a1a1aa', font: chartFont } } },
                scales: {
                  x: { grid: { color: GRID }, border: { display: false }, ticks: { color: '#71717a', font: chartFont } },
                  y: { grid: { color: GRID }, border: { display: false }, ticks: { callback: (v) => '$' + (v / 1000).toFixed(0) + 'k', color: '#71717a', font: chartFont } },
                },
              }}
            />
          </div>
        </div>
      )}

      <div className="dash-cols">
        <div className="dash-main">
          <WatchlistPanel watchlist={watchlist} holdings={holdings} predictions={predictions} />

          {holdings.length > 0 && (
            <div className="card pad">
              <div className="ctitle"><span className="dot" />Allocation</div>
              <div className="csub">By market value</div>
              <div className="chart-box" style={{ height: 210 }}>
                <Doughnut
                  data={{
                    labels: holdings.map((h) => h.ticker),
                    datasets: [{
                      data: holdings.map((h) => (h.quantity || 0) * (h.current_price || h.avg_cost || 0)),
                      backgroundColor: ['#d4a853', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899'],
                      borderWidth: 0,
                    }],
                  }}
                  options={{
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 11, color: '#71717a', font: chartFont } } },
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="dash-side">
          {sectorBreakdown.length > 0 && (
            <div className="card pad">
              <div className="ctitle"><span className="dot" />Sector breakdown</div>
              <div className="csub">Exposure by industry</div>
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
          )}

          <FeaturedStrategy listings={listings} />

          <div className="card pad">
            <div className="ctitle"><span className="dot" />Recent activity</div>
            <div className="csub">Latest journal entries</div>
            {recentTrades.length === 0 ? (
              <EmptyState icon="📝" message="No trades logged yet. Start journaling in the Journal tab." />
            ) : (
              <div className="activity-list">
                {recentTrades.map((t) => {
                  const pnl = t.exit_price && t.entry_price && t.quantity
                    ? ((t.side === 'buy' ? 1 : -1) * (t.exit_price - t.entry_price) * t.quantity) : 0;
                  const isWin = pnl > 0;
                  return (
                    <div key={t.id} className="activity-row">
                      <span className="a-dot" style={{ background: isWin ? '#22c55e' : pnl < 0 ? '#ef4444' : '#a1a1aa' }} />
                      <div>
                        Closed <b>{t.ticker}</b> {t.side} &middot; {isWin ? 'profit' : pnl < 0 ? 'loss' : 'breakeven'} {fmtMoney(Math.abs(pnl))}
                        <span className="a-time">{t.closed_at ? new Date(t.closed_at).toLocaleDateString() : ''}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
