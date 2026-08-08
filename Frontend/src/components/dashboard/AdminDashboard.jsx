import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWatchlist } from '../../hooks/useWatchlist';
import { usePredictions } from '../../hooks/usePredictions';
import { useMarketplace } from '../../hooks/useMarketplace';
import api from '../../api/client';
import LoadingSpinner from '../ui/LoadingSpinner';
import EmptyState from '../ui/EmptyState';
import MarketIndices from './widgets/MarketIndices';
import WatchlistPanel from './widgets/WatchlistPanel';
import FeaturedStrategy from './widgets/FeaturedStrategy';
import { ICONS, fmtMoney, StatCard, DashboardHeader } from './widgets/shared';

/**
 * Dashboard for the `admin` role: a platform-health overview with the pending
 * moderation queue, plus the widgets shared by every role.
 *
 * This is the landing view. The full administration console — user management,
 * listing approval, thresholds — remains at /admin.
 */
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { watchlist } = useWatchlist();
  const { predictions } = usePredictions();
  const { listings } = useMarketplace();

  const [stats, setStats] = useState(null);
  const [pending, setPending] = useState([]);
  const [marketIndices, setMarketIndices] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/api/v1/admin/stats'),
      api.get('/api/v1/admin/pending'),
      api.get('/api/v1/dashboard/batch'),
    ]).then(([statsRes, pendingRes, batchRes]) => {
      setStats(statsRes.data);
      setPending(pendingRes.data || []);
      setMarketIndices(batchRes.data.market_indices || []);
    }).catch((err) => {
      console.error('Admin dashboard fetch failed:', err);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  const pendingCount = stats?.pending_reviews ?? pending.length;

  return (
    <div className="view-enter">
      <DashboardHeader
        eyebrow="Administration"
        title="Platform Overview"
        lede="Platform health at a glance, with anything currently awaiting your review."
      />

      <MarketIndices indices={marketIndices} />

      <div className="stat-grid">
        <StatCard hero index={0} label="Total revenue" icon={ICONS.wallet} tone="up"
                  value={fmtMoney((stats?.total_revenue_cents || 0) / 100, 2)}
                  sub={`${stats?.total_sales || 0} sales`} />
        <StatCard index={1} label="Pending reviews" icon={ICONS.clock}
                  value={pendingCount}
                  sub={pendingCount > 0 ? 'needs attention' : 'queue is clear'} />
        <StatCard index={2} label="Verified listings" icon={ICONS.check} tone="up"
                  value={stats?.verified_listings || 0} sub="live on marketplace" />
        <StatCard index={3} label="Total users" icon={ICONS.users}
                  value={stats?.total_users || 0} sub="registered accounts" />
        <StatCard index={4} label="Strategies" icon={ICONS.layers}
                  value={stats?.total_strategies || 0} sub="created platform-wide" />
      </div>

      <div className="dash-cols">
        <div className="dash-main">
          <div className="card pad">
            <div className="ctitle"><span className="dot" />Awaiting review</div>
            <div className="csub">Strategies submitted for marketplace approval</div>

            {pending.length === 0 ? (
              <EmptyState icon="✅" message="Nothing is waiting for review. The queue is clear." />
            ) : (
              <>
                <div className="tbl-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Strategy</th><th>Author</th><th>Trades</th>
                        <th>Win rate</th><th>Sharpe</th><th>Submitted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pending.slice(0, 6).map((l) => (
                        <tr key={l.id}>
                          <td style={{ fontWeight: 600 }}>{l.strategy?.name || 'Strategy'}</td>
                          <td style={{ color: 'var(--muted)' }}>{l.strategy?.owner?.full_name || 'Unknown'}</td>
                          <td className="mono">{l.backtest_trades ?? '—'}</td>
                          <td className="mono">{l.backtest_winrate != null ? `${(l.backtest_winrate * 100).toFixed(0)}%` : '—'}</td>
                          <td className="mono">{l.backtest_sharpe != null ? l.backtest_sharpe.toFixed(2) : '—'}</td>
                          <td className="mono" style={{ color: 'var(--muted2)' }}>
                            {l.created_at ? new Date(l.created_at).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pending.length > 6 && (
                  <div className="csub" style={{ marginTop: 10, marginBottom: 0 }}>
                    + {pending.length - 6} more awaiting review
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="btn gold" onClick={() => navigate('/admin')}>
                Open admin console
              </button>
              <button className="btn" onClick={() => navigate('/marketplace')}>
                View marketplace
              </button>
            </div>
          </div>

          <WatchlistPanel watchlist={watchlist} predictions={predictions} />
        </div>

        <div className="dash-side">
          <div className="card pad">
            <div className="ctitle"><span className="dot" />Quick actions</div>
            <div className="csub">Jump into the admin console</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <button className="btn" style={{ width: '100%', textAlign: 'left' }} onClick={() => navigate('/admin')}>
                Review pending strategies{pendingCount > 0 ? ` (${pendingCount})` : ''}
              </button>
              <button className="btn" style={{ width: '100%', textAlign: 'left' }} onClick={() => navigate('/admin')}>
                Manage users
              </button>
              <button className="btn" style={{ width: '100%', textAlign: 'left' }} onClick={() => navigate('/admin')}>
                Configure thresholds
              </button>
              <button className="btn" style={{ width: '100%', textAlign: 'left' }} onClick={() => navigate('/admin')}>
                View revenue report
              </button>
            </div>
          </div>

          <FeaturedStrategy listings={listings} />
        </div>
      </div>
    </div>
  );
}
