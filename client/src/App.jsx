import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { useLive } from './hooks/useLive.js';
import Layout from './components/Layout.jsx';
import Dashboard from './components/Dashboard.jsx';
import LogActivity from './components/LogActivity.jsx';
import WeeklyTarget from './components/WeeklyTarget.jsx';
import History from './components/History.jsx';
import Copilot from './components/Copilot.jsx';

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [week, setWeek] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotSeed, setCopilotSeed] = useState(null);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Real-time: every session receives these events over SSE.
  const live = useLive(
    useCallback(
      (evt) => {
        if (evt.type === 'activity') {
          showToast(`${evt.label || 'Activity'} logged — ${evt.co2} kg CO₂`);
        } else if (evt.type === 'deleted') {
          showToast('An entry was removed from the ledger');
        } else if (evt.type === 'target') {
          showToast(`Weekly target changed to ${evt.weeklyTarget} kg CO₂`);
        }
        refresh();
      },
      [refresh]
    )
  );

  function showToast(message) {
    setToast(message);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToast(null), 3600);
  }

  useEffect(() => {
    api.week().then(setWeek).catch(() => {});
  }, [refreshKey]);

  function openCopilot(seed = null) {
    setCopilotSeed(seed);
    setCopilotOpen(true);
  }

  return (
    <Layout
      tab={tab}
      onTab={setTab}
      week={week}
      live={live}
      toast={toast}
      onOpenLog={() => setTab('log')}
      onOpenCopilot={() => openCopilot(null)}
    >
      {tab === 'dashboard' && (
        <Dashboard
          refreshKey={refreshKey}
          live={live}
          onGoToTarget={() => setTab('target')}
          onOpenCopilot={() => openCopilot('Analyse my history for reduction opportunities')}
        />
      )}
      {tab === 'log' && <LogActivity onLogged={refresh} onToast={showToast} />}
      {tab === 'target' && <WeeklyTarget week={week} refreshKey={refreshKey} onSaved={refresh} onToast={showToast} />}
      {tab === 'history' && <History refreshKey={refreshKey} live={live} onToast={showToast} />}

      <Copilot
        open={copilotOpen}
        seed={copilotSeed}
        onClose={() => {
          setCopilotOpen(false);
          setCopilotSeed(null);
        }}
        onLogged={refresh}
      />
    </Layout>
  );
}
