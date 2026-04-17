import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

// Pages & Shell
import Login from './pages/Login';
import MobileShell from './components/mobile/MobileShell';
import MobileDashboard from './pages/mobile/MobileDashboard';
import MobileClients from './pages/mobile/MobileClients';
import MobileTasks from './pages/mobile/MobileTasks';

// Global styles
import './styles/mobile.css';

// ── Mobile detection hook ──────────────────
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = e => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isMobile;
}

// ── App ────────────────────────────────────
export default function App() {
  const [authState, setAuthState] = useState({ loading: true, user: null });
  const [data, setData] = useState({ clients: [], tasks: [], revenue: '0', pendingInvoices: '0' });
  const isMobile = useIsMobile();

  useEffect(() => {
    const initApp = async () => {
      try {
        const authRes = await fetch('/api/auth/status');
        const authData = await authRes.json();
        
        if (authData.loggedIn) {
          setAuthState({ loading: false, user: authData });
          // Fetch operational data
          const [cRes, tRes, rRes] = await Promise.all([
            fetch('/api/crm/clients'),
            fetch('/api/tasks'),
            fetch('/api/revenue/stats')
          ]);
          setData({
            clients: await cRes.json(),
            tasks: await tRes.json(),
            ...(await rRes.json())
          });
        } else {
          setAuthState({ loading: false, user: null });
        }
      } catch (err) {
        setAuthState({ loading: false, user: null });
      }
    };
    initApp();
  }, []);

  if (authState.loading) {
    return <div style={{ height: '100dvh', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6366f1', fontSize: '24px', fontWeight: 'bold' }}>Agency Hub...</div>;
  }

  const RequireAuth = ({ children }) => {
    return authState.user ? children : <Navigate to="/login" replace />;
  };

  const SmartRoute = ({ mobilePage, desktopPage }) => {
    if (isMobile) {
      return (
        <MobileShell>
          {mobilePage}
        </MobileShell>
      );
    }
    return <div className="desktop-only">{desktopPage}</div>;
  };

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={authState.user ? <Navigate to="/dashboard" /> : <Login />} />

        <Route path="/dashboard" element={
          <RequireAuth>
            <SmartRoute 
              mobilePage={<MobileDashboard stats={{
                clients: data.clients.length,
                active: data.clients.filter(c => c.status === 'active').length,
                pending: data.tasks.filter(t => t.status !== 'done').length,
                totalRevenue: '$' + (data.totalRevenue || 0),
                pendingInvoices: '$' + (data.pendingInvoices || 0),
                projected: '$0',
                totalClients: data.clients.length
              }} />} 
              desktopPage={<div>Desktop Dashboard Works</div>} 
            />
          </RequireAuth>
        } />

        <Route path="/clients" element={
          <RequireAuth>
            <SmartRoute 
              mobilePage={<MobileClients clients={data.clients} />} 
              desktopPage={<div>Desktop Clients Works</div>} 
            />
          </RequireAuth>
        } />

        <Route path="/tasks" element={
          <RequireAuth>
            <SmartRoute 
              mobilePage={<MobileTasks tasks={data.tasks} />} 
              desktopPage={<div>Desktop Tasks Works</div>} 
            />
          </RequireAuth>
        } />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
