import React, { useEffect } from 'react';
import { HashRouter  as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { ThemeProvider } from './contexts/ThemeContext';
import Layout from './components/Layout/Layout';
import LoadingSpinner from './components/Common/LoadingSpinner';
import RouteErrorBoundary from './components/Common/RouteErrorBoundary';
import Login from './components/Auth/Login';
import LeagueSelector from './components/Auth/LeagueSelector';
import OAuthCallback from './components/Auth/OAuthCallback';
// Route-based code splitting for major features
const Dashboard = React.lazy(() => import(/* webpackChunkName: "dashboard" */ './components/Dashboard/Dashboard'));
const Standings = React.lazy(() => import(/* webpackChunkName: "standings" */ './components/Standings/Standings'));
const Market = React.lazy(() => import(/* webpackChunkName: "market" */ './components/Market/Market'));
const Teams = React.lazy(() => import(/* webpackChunkName: "teams" */ './components/Teams/Teams'));
const Matches = React.lazy(() => import(/* webpackChunkName: "matches" */ './components/Matches/Matches'));
const Players = React.lazy(() => import(/* webpackChunkName: "players" */ './components/Players/Players'));
const Clauses = React.lazy(() => import(/* webpackChunkName: "clauses" */ './components/Clauses/Clauses'));
const Activity = React.lazy(() => import(/* webpackChunkName: "activity" */ './components/Activity/Activity'));
const Lineup = React.lazy(() => import(/* webpackChunkName: "lineup" */ './components/Teams/Lineup'));
const LineupEditor = React.lazy(() => import(/* webpackChunkName: "lineup-editor" */ './components/Teams/LineupEditor'));
const TeamPlayers = React.lazy(() => import(/* webpackChunkName: "team-players" */ './components/Teams/TeamPlayers'));
const LaLigaTeams = React.lazy(() => import(/* webpackChunkName: "laliga-teams" */ './components/Teams/LaLigaTeams'));
const MarketTrends = React.lazy(() => import(/* webpackChunkName: "market-trends" */ './components/Market/MarketTrends'));
const AlertManager = React.lazy(() => import(/* webpackChunkName: "alerts" */ './components/Alerts/AlertManager'));
const Settings = React.lazy(() => import(/* webpackChunkName: "settings" */ './components/Settings/Settings'));
const OncesProbles = React.lazy(() => import(/* webpackChunkName: "onces" */ './components/OncesProbles/OncesProbles'));

function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth);

  useEffect(() => {
    // Initialize auth from localStorage if available
    initializeAuth();
  }, [initializeAuth]);

  return (
    <ThemeProvider>
      <Router>
        <Routes>
          {/* OAuth callback routes - always accessible */}
          <Route path="/oauth/callback" element={<OAuthCallback />} />
          <Route path="/callback" element={<OAuthCallback />} />
          <Route path="/auth/callback" element={<OAuthCallback />} />

          {/* Main application */}
          <Route path="/*" element={<AppRoutes />} />
        </Routes>
      </Router>
    </ThemeProvider>
  );
}

// Separate component for authenticated routes
function AppRoutes() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const hasSelectedLeague = useAuthStore((state) => state.hasSelectedLeague);
  const location = useLocation();

  // Si no está autenticado, mostrar login
  if (!isAuthenticated) {
    return <Login />;
  }

  // Si está autenticado pero no ha seleccionado liga, mostrar selector
  if (!hasSelectedLeague) {
    return <LeagueSelector />;
  }

  return (
    <Layout>
      <RouteErrorBoundary resetKey={location.pathname}>
      <React.Suspense fallback={
        <div className="min-h-[calc(100vh-64px)] flex justify-center pt-8" style={{
          // Electron-specific positioning fix
          position: typeof window !== 'undefined' && window.electronAPI ? 'relative' : 'static',
          top: typeof window !== 'undefined' && window.electronAPI ? 0 : 'auto',
          transform: typeof window !== 'undefined' && window.electronAPI ? 'translateY(0)' : 'none'
        }}>
          <div className="flex items-center">
            <LoadingSpinner />
            <p className="ml-4 text-gray-600 dark:text-gray-400">Cargando módulo...</p>
          </div>
        </div>
      }>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/standings" element={<Standings />} />
        <Route path="/market" element={<Market />} />
        <Route path="/market/trends" element={<MarketTrends />} />
        <Route path="/market/ofertas" element={<Market />} />
        <Route path="/teams" element={<Teams />} />
        <Route path="/teams/:teamId" element={<Teams />} />
        <Route path="/teams/:teamId/lineup" element={<Lineup />} />
        <Route path="/teams/:teamId/players" element={<TeamPlayers />} />
        <Route path="/laliga-teams" element={<LaLigaTeams />} />
        <Route path="/lineup" element={<Lineup />} />
        <Route path="/lineup/:teamId" element={<Lineup />} />
        <Route path="/lineup-editor" element={<LineupEditor />} />
        <Route path="/my-lineup" element={<LineupEditor />} />
        <Route path="/matches" element={<Matches />} />
        <Route path="/players" element={<Players />} />
        <Route path="/clauses" element={<Clauses />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/alerts" element={<AlertManager />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/onces-probables" element={<OncesProbles />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
      </React.Suspense>
      </RouteErrorBoundary>
    </Layout>
  );
}

export default App;
