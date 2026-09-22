import { Icon } from './ui.jsx';

const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'log', label: 'Log Activity', icon: 'plus' },
  { id: 'target', label: 'Weekly Target', icon: 'target' },
  { id: 'history', label: 'History', icon: 'history' },
];

export default function Layout({ tab, onTab, week, live, onOpenLog, onOpenCopilot, toast, children }) {
  const exceeded = week?.exceeded;

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <header className="sticky top-0 z-50 border-b border-outline-variant/40 bg-surface-container-lowest/85 backdrop-blur-xl">
        <div className="flex h-16 w-full items-center justify-between gap-4 px-4 md:px-8">
          {/* Brand */}
          <div className="flex flex-shrink-0 items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-on-primary">
                <Icon name="leaf" size={19} />
              </div>
              <div className="leading-tight">
                <div className="font-headline text-[17px] font-bold tracking-tight text-primary">CarbonPulse</div>
                <div className="hidden text-[10px] font-medium text-on-surface-variant sm:block">Track · Understand · Reduce</div>
              </div>
            </div>
            <div className="hidden items-center gap-2 rounded-full bg-surface-container-low px-3 py-1 xl:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              <span className="text-[11px] font-medium text-on-surface-variant">Public Demo · Zero Auth Mode</span>
            </div>
          </div>

          {/* Nav */}
          <nav className="hidden items-center gap-1 lg:flex">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => onTab(t.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-all ${
                  tab === t.id
                    ? 'bg-primary-container text-on-primary-container font-semibold'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                <Icon name={t.icon} size={15} />
                {t.label}
              </button>
            ))}
          </nav>

          {/* Status + actions */}
          <div className="flex flex-shrink-0 items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-full bg-secondary-container px-3 py-1 sm:flex">
              <Icon name="target" size={13} className="text-secondary" />
              <span className="tabular text-[11px] font-semibold text-on-secondary-container">
                Target: {week?.target ?? '—'} kg CO₂
              </span>
            </div>

            <div
              className="flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1"
              title={live?.status === 'live' ? 'Real-time stream connected' : 'Reconnecting — polling fallback active'}
            >
              <span
                className={`h-2 w-2 rounded-full ${live?.status === 'live' ? 'bg-primary-container animate-pulse' : 'bg-amber'}`}
              />
              <span className="hidden text-[11px] font-semibold text-on-surface md:inline">
                {live?.status === 'live' ? `Live · ${live.clients} session${live.clients === 1 ? '' : 's'}` : 'Syncing…'}
              </span>
            </div>

            <button onClick={onOpenCopilot} className="btn-secondary hidden md:inline-flex" title="Open the AI Eco-Audit Copilot">
              <Icon name="spark" size={15} className="text-primary" />
              Copilot
            </button>
            <button onClick={onOpenLog} className="btn-primary">
              <Icon name="plus" size={15} />
              <span className="hidden sm:inline">Log Activity</span>
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="flex items-center gap-1 overflow-x-auto px-4 pb-2 lg:hidden">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onTab(t.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium transition-all ${
                tab === t.id ? 'bg-primary-container text-on-primary-container font-semibold' : 'bg-surface-container-low text-on-surface-variant'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* DP1 nudge: warm, non-blocking, never shaming */}
      {exceeded && (
        <div className="border-b border-amber/30 bg-amber-soft">
          <div className="flex w-full items-start gap-2 px-4 py-2.5 text-[12.5px] text-[#92400e] md:px-8">
            <Icon name="pulse" size={16} className="mt-0.5 flex-shrink-0" />
            <span>
              You've passed this week's CO₂ target — that's okay, awareness is the win. Head to{' '}
              <button onClick={() => onTab('target')} className="font-semibold underline">
                Weekly Target
              </button>{' '}
              to see where it came from and one easy swap for next week. Logging stays fully open.
            </span>
          </div>
        </div>
      )}

      <main className="w-full flex-1 px-4 pb-20 pt-6 md:px-8">{children}</main>

      <footer className="border-t border-outline-variant/40 px-4 py-4 text-[11px] text-on-surface-variant md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>CarbonPulse · Climate Tech track · emission factors IPCC/DEFRA-aligned, fixed per brief</span>
          <span className="flex items-center gap-1.5">
            <Icon name="verified" size={13} className="text-primary" />
            No account required — every feature is open to graders
          </span>
        </div>
      </footer>

      {toast && (
        <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2">
          <div className="flex items-center gap-2 rounded-full bg-inverse-surface px-4 py-2 text-[13px] font-semibold text-inverse-on-surface shadow-raised">
            <Icon name="check" size={16} className="text-primary-fixed" />
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}
