import { useState, useCallback, createContext, useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import useAnalysis from './hooks/useAnalysis';
import { Sidebar, Topbar } from './components/Navbar';
import LandingPage from './pages/LandingPage';
import Dashboard from './pages/Dashboard';
import GraphPage from './pages/GraphPage';
import TransactionsPage from './pages/TransactionsPage';
import RiskAnalysisPage from './pages/RiskAnalysisPage';
import LiveTrackingPage from './pages/LiveTrackingPage';
import Toast from './components/Toast';

export const AppContext = createContext(null);

export function useAppContext() {
  return useContext(AppContext);
}

/* Screens that read analysis results redirect to intake until a run exists. */
function RequireResult({ children }) {
  const { result } = useAppContext();
  if (!result) return <Navigate to="/" replace />;
  return children;
}

function Shell() {
  const { result } = useAppContext();
  const [navOpen, setNavOpen] = useState(false);
  const closeNav = useCallback(() => setNavOpen(false), []);

  return (
    <div className="shell">
      <Sidebar open={navOpen} onClose={closeNav} />
      <div className="main">
        <Topbar onMenu={() => setNavOpen(true)} />
        <Routes>
          <Route path="/" element={result ? <Dashboard /> : <LandingPage />} />
          <Route path="/intake" element={<LandingPage />} />
          <Route path="/dashboard" element={<RequireResult><Dashboard /></RequireResult>} />
          <Route path="/graph" element={<RequireResult><GraphPage /></RequireResult>} />
          <Route path="/transactions" element={<RequireResult><TransactionsPage /></RequireResult>} />
          <Route path="/risk" element={<RequireResult><RiskAnalysisPage /></RequireResult>} />
          <Route path="/live" element={<LiveTrackingPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  const analysis = useAnalysis();
  const [file, setFile] = useState(null);
  const [toast, setToast] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => setToast((t) => (t && t.id === id ? null : t)), 4000);
  }, []);

  const ctx = {
    ...analysis,
    file,
    setFile,
    selectedNode,
    setSelectedNode,
    showToast,
  };

  return (
    <AppContext.Provider value={ctx}>
      <BrowserRouter>
        <Shell />
        <AnimatePresence>
          {toast && <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
        </AnimatePresence>
      </BrowserRouter>
    </AppContext.Provider>
  );
}
