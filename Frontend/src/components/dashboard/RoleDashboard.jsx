import React, { Suspense, lazy } from 'react';
import { useAuth } from '../../context/AuthContext';
import LoadingSpinner from '../ui/LoadingSpinner';

// Lazily loaded so each user downloads only the dashboard for their own role.
const InvestorDashboard = lazy(() => import('./InvestorDashboard'));
const AnalystDashboard  = lazy(() => import('./AnalystDashboard'));
const AdminDashboard    = lazy(() => import('./AdminDashboard'));

const DASHBOARDS = {
  investor: InvestorDashboard,
  analyst:  AnalystDashboard,
  admin:    AdminDashboard,
};

/**
 * Renders the dashboard belonging to the signed-in user's role.
 *
 * This selection is presentational only — it decides what to show, never what a
 * user is allowed to do. Every privileged action is authorised server-side by
 * the API (`get_current_user` and `require_role`), so a tampered role in the
 * browser cannot grant access to data or operations.
 */
export default function RoleDashboard() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner />;

  // Unknown or missing role falls back to the investor view, which shows only
  // the user's own data.
  const Dashboard = DASHBOARDS[user?.role] || InvestorDashboard;

  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Dashboard />
    </Suspense>
  );
}
