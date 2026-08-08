import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStrategies } from '../../hooks/useStrategies';
import { useMarketplace } from '../../hooks/useMarketplace';
import { useWatchlist } from '../../hooks/useWatchlist';
import { usePredictions } from '../../hooks/usePredictions';
import api from '../../api/client';
import LoadingSpinner from '../ui/LoadingSpinner';
import EmptyState from '../ui/EmptyState';
import MarketIndices from './widgets/MarketIndices';
import WatchlistPanel from './widgets/WatchlistPanel';
import FeaturedStrategy from './widgets/FeaturedStrategy';
import { ICONS, fmtMoney, StatCard, DashboardHeader } from './widgets/shared';

const STATUS_LABEL = {
  review: 'In review', verified: 'Verified', listed: 'Listed',
  removed: 'Removed', draft: 'Draft',
};

/**
 * Dashboard for the `analyst` role: a creator view of the strategies they have
 * authored — publication status, sales, earnings and ratings — plus the widgets
 * shared by every role.
 */
export default function AnalystDashboard() {
  const navigate = useNavigate();
  const { strategies, loading: strategiesLoading } = useStrategies();
  const { listings, loading: listingsLoading } = useMarketplace();
  const { watchlist } = useWatchlist();
  const { predictions } = usePredictions();

  const [marketIndices, setMarketIndices] = useState([]);

  useEffect(() => {
    api.get('/api/v1/dashboard/batch')
      .then((r) => setMarketIndices(r.data.market_indices || []))
      .catch(() => {});
  }, []);

  // Strategies this analyst authored (presets belong to the system, not a user)
  const myStrategies = useMemo(
    () => strategies.filter((s) => !s.is_preset),
    [strategies],
  );

  // Listings whose strategy is one of mine. Matching on strategy_id rather than
  // owner name, which is not unique.
  const myListings = useMemo(() => {
    const mine = new Set(myStrategies.map((s) => s.id));
    return listings.filter((l) => mine.has(l.strategy_id));
  }, [listings, myStrategies]);

  const stats = useMemo(() => {
    const totalSales = myListings.reduce((a, l) => a + (l.sales_count || 0), 0);
    const earnings = myListings.reduce((a, l) => a + ((l.price_cents || 0) / 100) * (l.sales_count || 0), 0);
    const published = myListings.filter((l) => l.status === 'verified' || l.status === 'listed').length;
    const pending = myListings.filter((l) => l.status === 'review').length;

    const rated = myListings.filter((l) => l.avg_rating != null && l.rating_count > 0);
    const totalRatings = rated.reduce((a, l) => a + (l.rating_count || 0), 0);
    const avgRating = totalRatings > 0
      ? rated.reduce((a, l) => a + l.avg_rating * l.rating_count, 0) / totalRatings
      : null;

    return { totalSales, earnings, published, pending, avgRating, totalRatings };
  }, [myListings]);

  if (strategiesLoading || listingsLoading) return <LoadingSpinner />;

  return (
    <div className="view-enter">
      <DashboardHeader
        eyebrow="Analyst"
        title="Creator Dashboard"
        lede="Track the strategies you have authored: publication status, sales, earnings and ratings."
      />

      <MarketIndices indices={marketIndices} />

      <div className="stat-grid">
        <StatCard hero index={0} label="Total earnings" icon={ICONS.wallet}
                  value={fmtMoney(stats.earnings, 2)}
                  sub={`${stats.totalSales} sale${stats.totalSales === 1 ? '' : 's'}`} />
        <StatCard index={1} label="Published" icon={ICONS.check} tone="up"
                  value={stats.published}
                  sub={`of ${myListings.length} submitted`} />
        <StatCard index={2} label="Awaiting review" icon={ICONS.clock}
                  value={stats.pending}
                  sub={stats.pending > 0 ? 'with an administrator' : 'nothing pending'} />
        <StatCard index={3} label="Strategies created" icon={ICONS.layers}
                  value={myStrategies.length}
                  sub={`${myStrategies.length - myListings.length} unpublished`} />
        <StatCard index={4} label="Average rating" icon={ICONS.star}
                  value={stats.avgRating != null ? stats.avgRating.toFixed(2) : '—'}
                  sub={stats.totalRatings > 0 ? `${stats.totalRatings} review${stats.totalRatings === 1 ? '' : 's'}` : 'no reviews yet'} />
      </div>

      <div className="dash-cols">
        <div className="dash-main">
          <div className="card pad">
            <div className="ctitle"><span className="dot" />My strategies</div>
            <div className="csub">Everything you have authored and its marketplace status</div>

            {myStrategies.length === 0 ? (
              <EmptyState
                icon="🧭"
                message="You have not created a strategy yet. Build one in the Advisor, then publish it from the Marketplace."
              />
            ) : (
              <div className="tbl-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Strategy</th><th>Status</th><th>Price</th>
                      <th>Sales</th><th>Revenue</th><th>Rating</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myStrategies.map((s) => {
                      const listing = myListings.find((l) => l.strategy_id === s.id);
                      const status = listing?.status || 'unpublished';
                      const revenue = listing ? ((listing.price_cents || 0) / 100) * (listing.sales_count || 0) : 0;
                      return (
                        <tr key={s.id}>
                          <td style={{ fontWeight: 600 }}>{s.name}</td>
                          <td>
                            <span className={`mkt-status ${status === 'verified' || status === 'listed' ? 'ok' : 'review'}`}>
                              {STATUS_LABEL[status] || 'Unpublished'}
                            </span>
                          </td>
                          <td className="mono">{listing ? (listing.price_cents ? fmtMoney(listing.price_cents / 100, 2) : 'Free') : '—'}</td>
                          <td className="mono">{listing?.sales_count ?? '—'}</td>
                          <td className="mono up">{listing ? fmtMoney(revenue, 2) : '—'}</td>
                          <td className="mono">
                            {listing?.avg_rating != null
                              ? `${listing.avg_rating.toFixed(1)} (${listing.rating_count})`
                              : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
              <button className="btn gold" onClick={() => navigate('/advisor')}>Build a strategy</button>
              <button className="btn" onClick={() => navigate('/marketplace')}>Publish a strategy</button>
            </div>
          </div>

          <WatchlistPanel watchlist={watchlist} predictions={predictions} />
        </div>

        <div className="dash-side">
          <div className="card pad">
            <div className="ctitle"><span className="dot" />Best performer</div>
            <div className="csub">Your highest-earning strategy</div>
            {myListings.length === 0 ? (
              <EmptyState icon="📈" message="Publish a strategy to start earning." />
            ) : (
              (() => {
                const best = [...myListings].sort(
                  (a, b) => ((b.price_cents || 0) * (b.sales_count || 0)) - ((a.price_cents || 0) * (a.sales_count || 0)),
                )[0];
                const strat = myStrategies.find((s) => s.id === best.strategy_id);
                const revenue = ((best.price_cents || 0) / 100) * (best.sales_count || 0);
                return (
                  <div className="pick-card">
                    <div className="pk-top">
                      <span className="pk-name">{strat?.name || 'Strategy'}</span>
                      <span className={`mkt-status ${best.status === 'verified' || best.status === 'listed' ? 'ok' : 'review'}`}>
                        {STATUS_LABEL[best.status] || best.status}
                      </span>
                    </div>
                    <div className="pk-stats">
                      <div><b>{fmtMoney(revenue, 2)}</b>revenue</div>
                      <div><b>{best.sales_count || 0}</b>sales</div>
                      <div><b>{best.rating_count || 0}</b>reviews</div>
                    </div>
                  </div>
                );
              })()
            )}
          </div>

          <FeaturedStrategy listings={listings} />
        </div>
      </div>
    </div>
  );
}
