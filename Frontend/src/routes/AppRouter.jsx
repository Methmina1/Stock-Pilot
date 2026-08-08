import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Layout from '../components/layout/Layout';
import LoadingSpinner from '../components/ui/LoadingSpinner';

const AuthPage = lazy(() => import('../components/auth/AuthPage'));
// Picks the investor / analyst / admin dashboard based on the signed-in role.
const Dashboard = lazy(() => import('../components/dashboard/RoleDashboard'));
const Advisor = lazy(() => import('../components/advisor/Advisor'));
const Marketplace = lazy(() => import('../components/marketplace/Marketplace'));
const Portfolio = lazy(() => import('../components/portfolio/Portfolio'));
const Journal = lazy(() => import('../components/journal/Journal'));
const Settings = lazy(() => import('../components/settings/Settings'));
const Admin = lazy(() => import('../components/admin/Admin'));

function ProtectedRoute({ children }) {
  const { token, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!token) return <Navigate to="/auth" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, token, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (!token) return <Navigate to="/auth" replace />;
  if (user?.role !== 'admin') return <Navigate to="/" replace />;
  return children;
}

function AuthRoute({ children }) {
  const { token, loading } = useAuth();
  if (loading) return <LoadingSpinner />;
  if (token) return <Navigate to="/" replace />;
  return children;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingSpinner />}>
        <Routes>
          <Route path="/auth" element={<AuthRoute><AuthPage /></AuthRoute>} />
          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/advisor" element={<Advisor />} />
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/portfolio" element={<Portfolio />} />
            <Route path="/journal" element={<Journal />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
