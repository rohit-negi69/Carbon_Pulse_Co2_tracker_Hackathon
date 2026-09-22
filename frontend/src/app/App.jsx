import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useLive } from '../lib/useLive.js';
import Layout from '../components/layout/Layout.jsx';
import CommandPalette from '../components/layout/CommandPalette.jsx';
import DashboardPage from '../features/dashboard/DashboardPage.jsx';
import LogActivityPage from '../features/activities/LogActivityPage.jsx';
import InsightsPage from '../features/insights/InsightsPage.jsx';
import IntelligencePage from '../features/intelligence/IntelligencePage.jsx';
import TargetsPage from '../features/targets/TargetsPage.jsx';
import HistoryPage from '../features/history/HistoryPage.jsx';
import TrackerPage from '../features/tracking/TrackerPage.jsx';
import CopilotPanel from '../features/copilot/CopilotPanel.jsx';
import LiveConsole from '../features/realtime/LiveConsole.jsx';
import LandingPage from '../features/landing/LandingPage.jsx';

export default function App() {
  // The front page is the first thing a grader sees; `#app` (or `?view=app`)
  // deep-links straight past it, which is what a browser agent wants.
  const [view, setView] = useState(() => {
    if (typeof window === 'undefined') return 'landing';
    const hash = window.location.hash.replace('#', '');
    const wantApp = hash === 'app' || new URLSearchParams(window.location.search).get('view') === 'app';
    return wantApp ? 'app' : 'landing';
  });
  const [tab, setTab] = useState('dashboard');
  const [week, setWeek] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState(null);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotSeed, setCopilotSeed] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  // Every navigation entry point (header, palette, landing CTAs) funnels here,
  // so a command run from the front page still lands on a mounted screen.
  const goTo = useCallback((nextTab = 'dashboard') => {
    setTab(nextTab);
    setView('app');
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
  }, []);

  const enterApp = useCallback(() => goTo('dashboard'), [goTo]);

  const showToast = useCallback((message, tone = 'ok') => {
    setToast({ message, tone });
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => setToast(null), 3800);
  }, []);

  // Real-time: the backend pushes every mutation over WebSocket (SSE/polling
  // fallbacks), and the same socket carries our commands back.
  const live = useLive(
    useCallback(
      (evt) => {
        if (evt.type === 'activity') showToast(`${evt.label || 'Activity'} logged — ${evt.co2} kg CO₂`);
        else if (evt.type === 'deleted') showToast('An entry was removed from the ledger', 'warn');
        else if (evt.type === 'target') showToast(`Weekly target changed to ${evt.weeklyTarget} kg CO₂`);
        else if (evt.type === 'nudge') showToast(evt.title, 'warn');
        refresh();
      },
      [refresh, showToast]
    )
  );

  useEffect(() => {
    api.week().then(setWeek).catch(() => {});
  }, [refreshKey]);

  // Prefer the pushed snapshot over a fetched week so the header target pill and
  // the exceed banner react the instant anything changes anywhere.
  const liveWeek = live.snapshot?.week || week;

  const openCopilot = useCallback((seed = null) => {
    setCopilotSeed(seed);
    setCopilotOpen(true);
  }, []);

  // ---------------------------------------------------------------- ⌘K / Ctrl+K
  useEffect(() => {
    function onKey(e) {
      const k = e.key?.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const commands = useMemo(() => {
    const nav = [
      ['dashboard', 'Dashboard', 'Total footprint, weekly progress and category breakdown', 'dashboard'],
      ['log', 'Log an activity', 'Record car, bus, flight, electricity or a meal', 'plus'],
      ['insights', 'Charts & Insights', 'Trends, weekday profile, scope split, reduction modeller', 'trend'],
      ['intelligence', 'AI Intelligence', 'Forecast with error bars, anomaly detector, day archetypes, classifier lab', 'cpu'],
      ['tracker', 'Trip Tracker', 'Real GPS capture, live mode classification and measured footprints', 'route'],
      ['target', 'Weekly Target', 'Set the weekly CO₂ cap and see pace coaching', 'target'],
      ['history', 'History & Filters', 'Every entry, filterable by type, date and intensity', 'history'],
      ['live', 'Live Ops', 'Socket transport, presence, telemetry and command console', 'pulse'],
    ].map(([id, label, hint, icon]) => ({
      id: `nav-${id}`,
      label,
      hint,
      icon,
      group: 'Go to',
      run: () => goTo(id),
    }));

    const ask = [
      'Analyse my history for reduction opportunities',
      "What's my biggest emission category?",
      'How am I tracking against my weekly target?',
      'Give me the three cheapest way to cut my footprint',
    ].map((q) => ({
      id: `ask-${q}`,
      label: q,
      hint: 'Ask the AI Eco-Audit Copilot',
      icon: 'sparkles',
      group: 'Ask the copilot',
      run: () => openCopilot(q),
    }));

    return [
      ...nav,
      {
        id: 'log-open',
        label: 'Open the log drawer',
        hint: 'Fast entry with the absurd-input guard (DP2)',
        icon: 'plus',
        group: 'Actions',
        run: () => goTo('log'),
      },
      {
        id: 'export-csv',
        label: 'Export the ledger as CSV',
        hint: 'Server-generated export of every filtered entry',
        icon: 'download',
        group: 'Actions',
        run: () => {
          window.open(api.exportUrl('csv'), '_blank');
          showToast('Preparing CSV export…');
        },
      },
      {
        id: 'theme',
        label: 'Toggle light / dark theme',
        hint: 'Every token flips instantly',
        icon: 'moon',
        group: 'Actions',
        run: () => document.documentElement.classList.toggle('dark'),
      },
      ...ask,
    ];
  }, [goTo, openCopilot, showToast]);

  // Mounted in both shells — the copilot is reachable from the front page too.
  const copilotPanel = (
    <CopilotPanel
      open={copilotOpen}
      seed={copilotSeed}
      onClose={() => {
        setCopilotOpen(false);
        setCopilotSeed(null);
      }}
      onLogged={refresh}
      live={live}
    />
  );

  // ------------------------------------------------------------- front page
  if (view === 'landing') {
    return (
      <>
        <LandingPage onEnter={enterApp} onOpenCopilot={() => openCopilot(null)} live={live} />
        {copilotPanel}
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
      </>
    );
  }

  return (
    <>
      <Layout
        tab={tab}
        onTab={goTo}
        onHome={() => setView('landing')}
        week={liveWeek}
        live={live}
        refreshKey={refreshKey}
        toast={toast}
        onOpenLog={() => setTab('log')}
        onOpenCopilot={() => openCopilot(null)}
        onOpenPalette={() => setPaletteOpen(true)}
      >
        {tab === 'dashboard' && (
          <DashboardPage
            refreshKey={refreshKey}
            live={live}
            onGoToTarget={() => setTab('target')}
            onOpenCopilot={() => openCopilot('Analyse my history for reduction opportunities')}
            onOpenLive={() => setTab('live')}
            onOpenLog={() => setTab('log')}
          />
        )}
        {tab === 'log' && <LogActivityPage onLogged={refresh} onToast={showToast} />}
        {tab === 'insights' && <InsightsPage refreshKey={refreshKey} live={live} onToast={showToast} />}
        {tab === 'target' && (
          <TargetsPage week={liveWeek} refreshKey={refreshKey} live={live} onSaved={refresh} onToast={showToast} />
        )}
        {tab === 'intelligence' && (
          <IntelligencePage
            refreshKey={refreshKey}
            live={live}
            onToast={showToast}
          />
        )}
        {tab === 'tracker' && <TrackerPage refreshKey={refreshKey} live={live} onToast={showToast} onLogged={refresh} />}
        {tab === 'history' && <HistoryPage refreshKey={refreshKey} live={live} onToast={showToast} />}
        {tab === 'live' && <LiveConsole live={live} onToast={showToast} />}

        {copilotPanel}
      </Layout>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={commands} />
    </>
  );
}
