import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useLive } from '../lib/useLive.js';
import Layout from '../components/layout/Layout.jsx';
import DashboardPage from '../features/dashboard/DashboardPage.jsx';
import LogActivityPage from '../features/activities/LogActivityPage.jsx';
import InsightsPage from '../features/insights/InsightsPage.jsx';
import TargetsPage from '../features/targets/TargetsPage.jsx';
import HistoryPage from '../features/history/HistoryPage.jsx';
import CopilotPanel from '../features/copilot/CopilotPanel.jsx';

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [week, setWeek] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotSeed, setCopilotSeed] = useState(null);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  function showToast(message) {
    setToast(message);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToast(null), 3600);
  }

  // Real-time: the backend broadcasts every mutation over SSE.
  const live = useLive(
    useCallback(
      (evt) => {
        if (evt.type === 'activity') showToast(`${evt.label || 'Activity'} logged — ${evt.co2} kg CO₂`);
        else if (evt.type === 'deleted') showToast('An entry was removed from the ledger');
        else if (evt.type === 'target') showToast(`Weekly target changed to ${evt.weeklyTarget} kg CO₂`);
        refresh();
      },
      [refresh]
    )
  );

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
      refreshKey={refreshKey}
      toast={toast}
      onOpenLog={() => setTab('log')}
      onOpenCopilot={() => openCopilot(null)}
    >
      {tab === 'dashboard' && (
        <DashboardPage
          refreshKey={refreshKey}
          live={live}
          onGoToTarget={() => setTab('target')}
          onOpenCopilot={() => openCopilot('Analyse my history for reduction opportunities')}
        />
      )}
      {tab === 'log' && <LogActivityPage onLogged={refresh} onToast={showToast} />}
      {tab === 'insights' && <InsightsPage refreshKey={refreshKey} live={live} onToast={showToast} />}
      {tab === 'target' && <TargetsPage week={week} refreshKey={refreshKey} onSaved={refresh} onToast={showToast} />}
      {tab === 'history' && <HistoryPage refreshKey={refreshKey} live={live} onToast={showToast} />}

      <CopilotPanel
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
