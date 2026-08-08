import React, { useState, useEffect, useCallback } from 'react';
import api from '../../api/client';

const FACTORS = [
  { key: 'sentiment', label: 'Sentiment' },
  { key: 'momentum', label: 'Momentum' },
  { key: 'valuation', label: 'Valuation' },
  { key: 'volatility', label: 'Volatility' },
  { key: 'volume', label: 'Volume' },
  { key: 'growth', label: 'Growth' },
];

const ROLES = ['investor', 'analyst', 'admin'];

const THRESHOLDS = {
  win_rate: 0.65,
  sharpe: 1.0,
};

export default function Admin() {
  const [tab, setTab] = useState('revenue');
  const [stats, setStats] = useState(null);
  const [revenue, setRevenue] = useState(null);
  const [pending, setPending] = useState([]);
  const [allListings, setAllListings] = useState([]);
  const [allStrategies, setAllStrategies] = useState([]);
  const [users, setUsers] = useState([]);
  const [thresholds, setThresholds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, revenueRes, pendingRes, listingsRes, strategiesRes, usersRes, thresholdsRes] = await Promise.all([
        api.get('/api/v1/admin/stats'),
        api.get('/api/v1/admin/revenue'),
        api.get('/api/v1/admin/pending'),
        api.get('/api/v1/admin/listings'),
        api.get('/api/v1/admin/strategies'),
        api.get('/api/v1/admin/users'),
        api.get('/api/v1/admin/thresholds'),
      ]);
      setStats(statsRes.data);
      setRevenue(revenueRes.data);
      setPending(pendingRes.data);
      setAllListings(listingsRes.data);
      setAllStrategies(strategiesRes.data);
      setUsers(usersRes.data);
      setThresholds(thresholdsRes.data);
    } catch (err) {
      console.error('Admin fetch error:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const doAction = async (label, fn) => {
    setActionLoading(label);
    try {
      await fn();
      await fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || `Failed: ${label}`);
    }
    setActionLoading(null);
    setConfirmAction(null);
  };

  const handleApprove = (id) => doAction(id, () => api.post(`/api/v1/admin/listings/${id}/approve`));
  const handleReject = (id) => doAction(id, () => api.post(`/api/v1/admin/listings/${id}/reject`));
  const handleRemoveListing = (id) => doAction(id, () => api.post(`/api/v1/admin/listings/${id}/remove`));
  const handleDeleteListing = (id) => doAction(`del-l-${id}`, () => api.delete(`/api/v1/admin/listings/${id}`));
  const handleDeleteStrategy = (id) => doAction(`del-s-${id}`, () => api.delete(`/api/v1/admin/strategies/${id}`));
  const handleRoleChange = (userId, role) => doAction(`role-${userId}`, () => api.patch(`/api/v1/admin/users/${userId}/role?role=${role}`));
  const handleToggleStatus = (id) => doAction(`status-${id}`, () => api.patch(`/api/v1/admin/users/${id}/status`));
  const handleDeleteUser = (id) => doAction(`del-u-${id}`, () => api.delete(`/api/v1/admin/users/${id}`));

  const requestConfirm = (key, label, fn) => {
    setConfirmAction({ key, label, fn });
  };

  if (loading) {
    return (
      <div className="view-enter">
        <div className="eyebrow">Administration</div>
        <h1 className="page">Admin Dashboard</h1>
        <div style={{ display: 'flex', justifyContent: 'center', padding: 80 }}>
          <div className="spinner" />
        </div>
      </div>
    );
  }

  const fmt = (cents) => {
    if (cents >= 100000) return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
    return `$${(cents / 100).toFixed(2)}`;
  };

  return (
    <div className="view-enter">
      <div className="eyebrow">Administration</div>
      <h1 className="page">Admin Dashboard</h1>
      <p className="lede">Full control over revenue, strategies, listings, and users.</p>

      {/* Stats cards */}
      <div className="stat-grid">
        <div className="stat" style={{ borderColor: 'var(--bull)' }}>
          <div className="k" style={{ color: 'var(--bull)' }}>Total Revenue</div>
          <div className="v" style={{ color: 'var(--bull)' }}>{fmt(stats?.total_revenue_cents || 0)}</div>
        </div>
        <div className="stat">
          <div className="k">Total Sales</div>
          <div className="v">{stats?.total_sales || 0}</div>
        </div>
        <div className="stat" style={{ borderColor: 'var(--accent)' }}>
          <div className="k" style={{ color: 'var(--accent)' }}>Pending Reviews</div>
          <div className="v" style={{ color: 'var(--accent)' }}>{stats?.pending_reviews || 0}</div>
        </div>
        <div className="stat">
          <div className="k">Verified Listings</div>
          <div className="v">{stats?.verified_listings || 0}</div>
        </div>
        <div className="stat">
          <div className="k">Total Users</div>
          <div className="v">{stats?.total_users || 0}</div>
        </div>
        <div className="stat">
          <div className="k">Total Strategies</div>
          <div className="v">{stats?.total_strategies || 0}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="admin-tabs" style={{ marginTop: 32 }}>
        {[
          { key: 'revenue', label: 'Revenue' },
          { key: 'pending', label: 'Pending Reviews', count: pending.length },
          { key: 'listings', label: 'Listings' },
          { key: 'strategies', label: 'Strategies' },
          { key: 'users', label: 'Users' },
          { key: 'thresholds', label: 'Thresholds' },
        ].map((t) => (
          <button
            key={t.key}
            className={`admin-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.count > 0 && <span className="admin-tab-badge">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Revenue Tab */}
      {tab === 'revenue' && (
        <div style={{ marginTop: 24 }}>
          <div className="card pad revenue-total-card">
            <div style={{ fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>
              Total Revenue
            </div>
            <div style={{ fontSize: 36, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--bull)' }}>
              {fmt(revenue?.total_revenue_cents || 0)}
            </div>
            <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
              from {revenue?.total_sales || 0} total sales
            </div>
          </div>

          {revenue?.top_strategies?.length > 0 ? (
            <div className="card" style={{ marginTop: 16, overflow: 'auto' }}>
              <div style={{ padding: '16px 16px 8px', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--muted)', fontWeight: 500 }}>
                Top Earning Strategies
              </div>
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Strategy</th>
                    <th>Creator</th>
                    <th>Price</th>
                    <th>Sales</th>
                    <th>Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {revenue.top_strategies.map((s, i) => (
                    <tr key={s.listing_id}>
                      <td style={{ color: 'var(--muted2)' }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{s.strategy_name}</td>
                      <td style={{ color: 'var(--muted)' }}>{s.creator}</td>
                      <td className="mono">{fmt(s.price_cents)}</td>
                      <td className="mono">{s.sales_count}</td>
                      <td className="mono bull">{fmt(s.revenue_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card pad" style={{ textAlign: 'center', padding: '60px 20px', marginTop: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>$</div>
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>No sales yet. Revenue will appear here once strategies are sold.</div>
            </div>
          )}
        </div>
      )}

      {/* Pending Reviews */}
      {tab === 'pending' && (
        <div style={{ marginTop: 24 }}>
          {pending.length === 0 ? (
            <div className="card pad" style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>&#10003;</div>
              <div style={{ color: 'var(--muted)', fontSize: 14 }}>No strategies pending review.</div>
            </div>
          ) : (
            <div className="admin-review-list">
              {pending.map((listing) => (
                <StrategyReviewCard
                  key={listing.id}
                  listing={listing}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  onDelete={(id) => requestConfirm(`del-l-${id}`, 'Delete this listing permanently?', () => handleDeleteListing(id))}
                  loading={actionLoading === listing.id}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* All Listings */}
      {tab === 'listings' && (
        <div className="card" style={{ marginTop: 24, overflow: 'auto' }}>
          {allListings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>No listings yet.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Strategy</th>
                  <th>Creator</th>
                  <th>Status</th>
                  <th>Price</th>
                  <th>Sales</th>
                  <th>Revenue</th>
                  <th>Return</th>
                  <th>Sharpe</th>
                  <th>Win Rate</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allListings.map((l) => {
                  const isActive = l.status === 'verified' || l.status === 'listed';
                  const isPending = l.status === 'review';
                  return (
                    <tr key={l.id}>
                      <td style={{ fontWeight: 600 }}>{l.strategy?.name || '—'}</td>
                      <td>{l.strategy?.owner?.full_name || 'System'}</td>
                      <td><span className={`status-pill ${l.status}`}>{l.status}</span></td>
                      <td className="mono">{l.price_cents > 0 ? fmt(l.price_cents) : 'Free'}</td>
                      <td className="mono">{l.sales_count || 0}</td>
                      <td className="mono bull">{l.price_cents > 0 && l.sales_count > 0 ? fmt(l.price_cents * l.sales_count) : '—'}</td>
                      <td className={l.backtest_return > 0 ? 'bull' : l.backtest_return < 0 ? 'bear' : ''}>
                        {l.backtest_return != null ? `${(l.backtest_return * 100).toFixed(1)}%` : '—'}
                      </td>
                      <td>{l.backtest_sharpe != null ? l.backtest_sharpe.toFixed(2) : '—'}</td>
                      <td>{l.backtest_winrate != null ? `${(l.backtest_winrate * 100).toFixed(0)}%` : '—'}</td>
                      <td>
                        <div className="admin-actions">
                          {isPending && (
                            <>
                              <button className="admin-act-btn approve" onClick={() => handleApprove(l.id)} disabled={actionLoading === l.id} title="Approve">&#10003;</button>
                              <button className="admin-act-btn reject" onClick={() => handleReject(l.id)} disabled={actionLoading === l.id} title="Reject">&#10007;</button>
                            </>
                          )}
                          {isActive && (
                            <button className="admin-act-btn warn" onClick={() => handleRemoveListing(l.id)} disabled={actionLoading === l.id} title="Remove from marketplace">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                            </button>
                          )}
                          <button className="admin-act-btn danger" onClick={() => requestConfirm(`del-l-${l.id}`, `Delete listing "${l.strategy?.name}"?`, () => handleDeleteListing(l.id))} disabled={actionLoading === `del-l-${l.id}`} title="Delete permanently">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* All Strategies */}
      {tab === 'strategies' && (
        <div className="card" style={{ marginTop: 24, overflow: 'auto' }}>
          {allStrategies.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--muted)' }}>No strategies yet.</div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Creator</th>
                  <th>Type</th>
                  <th>Published</th>
                  <th>Weights</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {allStrategies.map((s) => (
                  <tr key={s.id}>
                    <td style={{ fontWeight: 600 }}>{s.name}</td>
                    <td style={{ color: 'var(--muted)' }}>{s.owner_name}</td>
                    <td>
                      {s.is_preset ? (
                        <span className="status-pill listed">Preset</span>
                      ) : (
                        <span className="status-pill draft">Custom</span>
                      )}
                    </td>
                    <td>
                      {s.is_published ? (
                        <span style={{ color: 'var(--bull)', fontWeight: 600, fontSize: 12 }}>Published</span>
                      ) : (
                        <span style={{ color: 'var(--muted2)', fontSize: 12 }}>No</span>
                      )}
                    </td>
                    <td style={{ maxWidth: 200 }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {s.weights && Object.entries(s.weights).map(([k, v]) => (
                          <span key={k} style={{ fontSize: 10, padding: '1px 5px', borderRadius: 4, background: 'var(--bg2)', color: 'var(--muted)' }}>
                            {k} {v}%
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                      {s.created_at ? new Date(s.created_at).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <div className="admin-actions">
                        <button
                          className="admin-act-btn danger"
                          onClick={() => requestConfirm(`del-s-${s.id}`, `Delete strategy "${s.name}"? This will also remove its marketplace listing.`, () => handleDeleteStrategy(s.id))}
                          disabled={actionLoading === `del-s-${s.id}`}
                          title="Delete strategy"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* User Management */}
      {tab === 'users' && (
        <div className="card" style={{ marginTop: 24, overflow: 'auto' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.full_name}</td>
                  <td style={{ color: 'var(--muted)' }}>{u.email}</td>
                  <td><span className={`role-pill ${u.role}`}>{u.role}</span></td>
                  <td>
                    <span className={`status-dot ${u.is_active ? 'active' : 'inactive'}`} />
                    {u.is_active ? 'Active' : 'Inactive'}
                  </td>
                  <td style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                  </td>
                  <td>
                    <div className="admin-actions">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        className="role-select"
                      >
                        {ROLES.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      <button
                        className={`admin-act-btn ${u.is_active ? 'warn' : 'approve'}`}
                        onClick={() => handleToggleStatus(u.id)}
                        disabled={actionLoading === `status-${u.id}`}
                        title={u.is_active ? 'Deactivate user' : 'Activate user'}
                      >
                        {u.is_active ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6 9 17l-5-5"/></svg>
                        )}
                      </button>
                      <button
                        className="admin-act-btn danger"
                        onClick={() => requestConfirm(`del-u-${u.id}`, `Delete user "${u.full_name}" permanently?`, () => handleDeleteUser(u.id))}
                        disabled={actionLoading === `del-u-${u.id}`}
                        title="Delete user"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Thresholds Tab */}
      {tab === 'thresholds' && thresholds && (
        <ThresholdsEditor initial={thresholds} onSaved={fetchData} />
      )}

      {/* Confirm dialog */}
      {confirmAction && (
        <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="modal-content" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Confirm Action</h3>
            <p style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.5, margin: '0 0 20px' }}>{confirmAction.label}</p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setConfirmAction(null)}>Cancel</button>
              <button className="btn reject" onClick={confirmAction.fn}>
                {actionLoading ? 'Processing...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


const THRESHOLD_FIELDS = [
  { key: 'min_trades', label: 'Minimum trades', hint: 'Total closed trades in the backtest', unit: '', op: '≥', step: 1, toDisplay: (v) => v, fromDisplay: (v) => parseInt(v) || 0 },
  { key: 'min_winrate', label: 'Minimum win rate', hint: 'Share of winning trades', unit: '%', op: '≥', step: 1, toDisplay: (v) => +(v * 100).toFixed(1), fromDisplay: (v) => (parseFloat(v) || 0) / 100 },
  { key: 'min_sharpe', label: 'Minimum Sharpe ratio', hint: 'Risk-adjusted return', unit: '', op: '≥', step: 0.1, toDisplay: (v) => v, fromDisplay: (v) => parseFloat(v) || 0 },
  { key: 'max_drawdown', label: 'Maximum drawdown', hint: 'Largest peak-to-trough loss (lower is stricter)', unit: '%', op: '≤', step: 1, toDisplay: (v) => +(v * 100).toFixed(1), fromDisplay: (v) => (parseFloat(v) || 0) / 100 },
  { key: 'min_profit_factor', label: 'Minimum profit factor', hint: 'Gross profit ÷ gross loss', unit: '', op: '≥', step: 0.1, toDisplay: (v) => v, fromDisplay: (v) => parseFloat(v) || 0 },
];

function ThresholdsEditor({ initial, onSaved }) {
  const [form, setForm] = useState(() => {
    const f = {};
    THRESHOLD_FIELDS.forEach((fl) => { f[fl.key] = fl.toDisplay(initial[fl.key]); });
    return f;
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const set = (key, val) => { setForm((f) => ({ ...f, [key]: val })); setMsg(null); };

  const save = async () => {
    setSaving(true);
    setMsg(null);
    try {
      const payload = {};
      THRESHOLD_FIELDS.forEach((fl) => { payload[fl.key] = fl.fromDisplay(form[fl.key]); });
      await api.put('/api/v1/admin/thresholds', payload);
      setMsg({ type: 'ok', text: 'Thresholds updated. New submissions are validated against these values.' });
      if (onSaved) await onSaved();
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.detail || 'Failed to update thresholds' });
    }
    setSaving(false);
  };

  const resetDefaults = () => {
    setForm({ min_trades: 100, min_winrate: 65, min_sharpe: 1.0, max_drawdown: 15, min_profit_factor: 1.5 });
    setMsg(null);
  };

  return (
    <div style={{ marginTop: 24, maxWidth: 640 }}>
      <div className="card pad">
        <div className="ctitle"><span className="dot" />Marketplace approval thresholds</div>
        <div className="csub">A strategy can only be submitted for review if its backtest meets every value below. Changes apply immediately to new submissions.</div>

        <div className="thresh-editor">
          {THRESHOLD_FIELDS.map((fl) => (
            <div key={fl.key} className="thresh-editor-row">
              <div className="thresh-editor-label">
                <span className="tel-op mono">{fl.op}</span>
                <div>
                  <div className="tel-name">{fl.label}</div>
                  <div className="tel-hint">{fl.hint}</div>
                </div>
              </div>
              <div className="thresh-editor-input">
                <input
                  type="number" step={fl.step} value={form[fl.key]}
                  onChange={(e) => set(fl.key, e.target.value)}
                  className="publish-input"
                />
                {fl.unit && <span className="tel-unit">{fl.unit}</span>}
              </div>
            </div>
          ))}
        </div>

        {msg && (
          <div style={{
            marginTop: 16, padding: '9px 13px', borderRadius: 8, fontSize: 13,
            background: msg.type === 'ok' ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
            border: `1px solid ${msg.type === 'ok' ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`,
            color: msg.type === 'ok' ? 'var(--bull)' : 'var(--bear)',
          }}>
            {msg.text}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button className="btn" onClick={resetDefaults} disabled={saving}>Reset to defaults</button>
          <button className="btn gold" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save thresholds'}</button>
        </div>
      </div>
    </div>
  );
}


function StrategyReviewCard({ listing, onApprove, onReject, onDelete, loading }) {
  const strat = listing.strategy;
  const weights = strat?.weights || {};

  const checks = [
    { label: 'Total Trades', met: listing.backtest_trades != null && listing.backtest_trades >= 100, val: listing.backtest_trades != null ? `${listing.backtest_trades}` : 'N/A', req: '100', threshold: 100 },
    { label: 'Win Rate', met: listing.backtest_winrate != null && listing.backtest_winrate >= 0.65, val: listing.backtest_winrate != null ? `${(listing.backtest_winrate * 100).toFixed(1)}%` : 'N/A', req: '65%', threshold: 65 },
    { label: 'Sharpe Ratio', met: listing.backtest_sharpe != null && listing.backtest_sharpe >= 1.0, val: listing.backtest_sharpe != null ? listing.backtest_sharpe.toFixed(2) : 'N/A', req: '1.0', threshold: 1.0 },
    { label: 'Max Drawdown', met: listing.backtest_max_drawdown != null && listing.backtest_max_drawdown <= 0.15, val: listing.backtest_max_drawdown != null ? `${(listing.backtest_max_drawdown * 100).toFixed(1)}%` : 'N/A', req: '≤ 15%', threshold: 15, inverted: true },
    { label: 'Profit Factor', met: listing.backtest_profit_factor != null && listing.backtest_profit_factor >= 1.5, val: listing.backtest_profit_factor != null ? listing.backtest_profit_factor.toFixed(2) : 'N/A', req: '1.5', threshold: 1.5 },
    { label: 'Return', met: listing.backtest_return != null && listing.backtest_return > 0, val: listing.backtest_return != null ? `${(listing.backtest_return * 100).toFixed(1)}%` : 'N/A', req: '> 0%' },
  ];

  const allPassed = checks.every(c => c.met);

  return (
    <div className="card pad admin-review-card">
      {/* Header */}
      <div className="review-header">
        <div>
          <h3 style={{ margin: 0, fontSize: 18, color: 'var(--text)' }}>{strat?.name || 'Unknown Strategy'}</h3>
          <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 4 }}>
            by {strat?.owner?.full_name || 'Unknown'} &middot; {strat?.owner?.email || ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="status-pill review">Pending Review</span>
          <span style={{ color: listing.price_cents > 0 ? 'var(--accent)' : 'var(--muted2)', fontWeight: 600, fontFamily: 'var(--mono)' }}>
            {listing.price_cents > 0 ? `$${(listing.price_cents / 100).toFixed(2)}` : 'Free'}
          </span>
        </div>
      </div>

      {strat?.description && (
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: '12px 0 0', lineHeight: 1.5 }}>
          {strat.description}
        </p>
      )}

      {/* Backtest Report */}
      <div className="bt-report">
        <div className="bt-report-header">
          <div className="review-weights-title" style={{ margin: 0 }}>Backtest Report</div>
          <span className={`bt-verdict ${allPassed ? 'pass' : 'fail'}`}>
            {allPassed ? '✓ All Criteria Passed' : '✗ Criteria Not Met'}
          </span>
        </div>

        {/* Big metrics row */}
        <div className="bt-metrics-row">
          <div className="bt-metric">
            <div className="bt-metric-val" style={{ color: listing.backtest_return != null && listing.backtest_return > 0 ? 'var(--bull)' : 'var(--bear)' }}>
              {listing.backtest_return != null ? `${(listing.backtest_return * 100).toFixed(1)}%` : '—'}
            </div>
            <div className="bt-metric-label">Return</div>
          </div>
          <div className="bt-metric">
            <div className="bt-metric-val">{listing.backtest_sharpe != null ? listing.backtest_sharpe.toFixed(2) : '—'}</div>
            <div className="bt-metric-label">Sharpe Ratio</div>
          </div>
          <div className="bt-metric">
            <div className="bt-metric-val">{listing.backtest_winrate != null ? `${(listing.backtest_winrate * 100).toFixed(1)}%` : '—'}</div>
            <div className="bt-metric-label">Win Rate</div>
          </div>
          <div className="bt-metric">
            <div className="bt-metric-val">{listing.backtest_trades != null ? listing.backtest_trades : '—'}</div>
            <div className="bt-metric-label">Total Trades</div>
          </div>
          <div className="bt-metric">
            <div className="bt-metric-val" style={{ color: listing.backtest_max_drawdown != null && listing.backtest_max_drawdown > 0.15 ? 'var(--bear)' : 'var(--text)' }}>
              {listing.backtest_max_drawdown != null ? `${(listing.backtest_max_drawdown * 100).toFixed(1)}%` : '—'}
            </div>
            <div className="bt-metric-label">Max Drawdown</div>
          </div>
          <div className="bt-metric">
            <div className="bt-metric-val">{listing.backtest_profit_factor != null ? listing.backtest_profit_factor.toFixed(2) : '—'}</div>
            <div className="bt-metric-label">Profit Factor</div>
          </div>
        </div>

        {/* Threshold checklist */}
        <div className="bt-checks">
          {checks.map((c) => (
            <div key={c.label} className={`bt-check-item ${c.met ? 'pass' : 'fail'}`}>
              <span className="bt-check-icon">{c.met ? '✓' : '✗'}</span>
              <span className="bt-check-label">{c.label}</span>
              <span className="bt-check-val">{c.val}</span>
              <span className="bt-check-req">req: {c.req}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Factor Weights */}
      <div className="review-weights">
        <div className="review-weights-title">Factor Weights</div>
        <div className="review-weights-grid">
          {FACTORS.map((f) => {
            const val = weights[f.key] || 0;
            return (
              <div key={f.key} className="review-weight-row">
                <span className="rw-label">{f.label}</span>
                <div className="rw-track">
                  <div className="rw-fill" style={{ width: `${(val / 50) * 100}%`, background: val >= 30 ? 'var(--accent)' : val >= 20 ? 'var(--bull)' : 'var(--muted2)' }} />
                </div>
                <span className="rw-val">{val}%</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="review-actions">
        <button className="admin-act-btn danger" onClick={() => onDelete(listing.id)} disabled={loading} title="Delete permanently" style={{ marginRight: 'auto' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
        <button className="btn reject" onClick={() => onReject(listing.id)} disabled={loading}>
          {loading ? '...' : 'Reject'}
        </button>
        <button className="btn gold" onClick={() => onApprove(listing.id)} disabled={loading}>
          {loading ? 'Processing...' : 'Approve & Publish'}
        </button>
      </div>
    </div>
  );
}
