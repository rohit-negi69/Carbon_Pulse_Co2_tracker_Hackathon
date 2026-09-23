import { useEffect, useRef, useState } from 'react';
import { Icon, LiveDot, Toast } from '../ui/index.jsx';
import NudgeCenter from '../../features/nudges/NudgeCenter.jsx';
import PresencePill from '../../features/realtime/PresencePill.jsx';
import AuroraField from './AuroraField.jsx';
import { useTheme } from '../../lib/useTheme.js';
import { channelLabel, isChannelHealthy } from '../../lib/liveStatus.js';

// The header mirrors the architecture's frontend tiles:
// Dashboard · Log Activity · Charts & Insights · Set Targets · History & Filters,
// plus Alerts & Nudges, Live Ops and the copilot entry point.

const TABS = [
  { id: 'dashboard', label: 'Dashboard', short: 'Home', icon: 'dashboard' },
  { id: 'log', label: 'Log Activity', short: 'Log', icon: 'plus' },
  { id: 'insights', label: 'Charts & Insights', short: 'Insights', icon: 'trend' },
  { id: 'intelligence', label: 'AI Intelligence', short: 'AI Lab', icon: 'cpu' },
  { id: 'tracker', label: 'Trip Tracker', short: 'Tracker', icon: 'route' },
  { id: 'target', label: 'Weekly Target', short: 'Target', icon: 'target' },
  { id: 'history', label: 'History', short: 'History', icon: 'history' },
  { id: 'live', label: 'Live Ops', short: 'Live', icon: 'pulse' },
];

// The dock is icon-first and horizontally scrollable, so it can carry every tab
// without compressing labels into unreadable widths on a 360px phone.
const MOBILE_TABS = TABS.filter((t) => t.id !== 'live');

/** One-line "what just happened" readout for the telemetry ribbon. */
function LastEvent({ live }) {
  const e = live?.lastEvent;
  const stamp = e?.at ? new Date(e.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
  const label =
    e?.type === 'activity'
      ? `${e.label || 'Activity'} +${e.co2} kg`
      : e?.type === 'deleted'
        ? 'entry removed'
        : e?.type === 'target'
          ? `target → ${e.weeklyTarget} kg`
          : e?.type === 'nudge'
            ? 'coach nudge issued'
            : e?.type === 'presence'
              ? `${e.clients} session${e.clients === 1 ? '' : 's'}`
              : null;
  if (!label) return null;
  return (
    <span className="hidden min-w-0 items-center gap-1.5 xl:flex">
      <span className="text-outline">·</span>
      <span className="truncate text-on-surface">
        {e.type === 'activity' ? 'logged' : e.type}: {label}
      </span>
      {stamp && <span className="tabular flex-shrink-0 text-outline">{stamp}</span>}
    </span>
  );
}

function BrandMark() {
  return (
    <div className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-sheen text-on-primary shadow-glow-sm">
      <span className="absolute inset-0 animate-pulse-ring rounded-xl bg-primary/40" />
      <Icon name="leaf" size={20} strokeWidth={2.1} className="relative" />
    </div>
  );
}

export default function Layout({
  tab,
  onTab,
  onHome,
  week,
  live,
  onOpenLog,
  onOpenCopilot,
  onOpenPalette,
  toast,
  refreshKey,
  children,
}) {
  const exceeded = week?.exceeded;
  const { isDark, toggle } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const navRef = useRef(null);
  const [indicator, setIndicator] = useState(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Slide the nav indicator under the active tab instead of restyling each pill.
  // The nav is display:none below `lg`, so the measurement has to be redone
  // whenever it becomes visible or the viewport changes — otherwise the pill
  // keeps whatever geometry it had before the breakpoint flipped.
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;

    const measure = () => {
      const el = nav.querySelector(`[data-tab="${tab}"]`);
      if (!el || !el.offsetWidth) {
        setIndicator(null);
        return;
      }
      setIndicator({ left: el.offsetLeft, width: el.offsetWidth });
    };

    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(nav);
    window.addEventListener('resize', measure);
    // Web fonts land after first paint and change the measured widths.
    document.fonts?.ready.then(measure).catch(() => {});
    const settle = setTimeout(measure, 250);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      clearTimeout(settle);
    };
  }, [tab]);

  const liveStatus = isChannelHealthy(live);
  const liveLabel = channelLabel(live);

  return (
    <div className="relative flex min-h-screen flex-col">
      <AuroraField />

      {/* ------------------------------------------------------------ header */}
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled ? 'glass border-b border-outline-variant/50 shadow-card' : 'border-b border-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 w-full max-w-[1600px] items-center justify-between gap-3 px-4 md:px-7">
          {/* brand — returns to the front page when one is mounted */}
          <button
            onClick={onHome || (() => onTab('dashboard'))}
            className="flex flex-shrink-0 items-center gap-3 text-left"
            title={onHome ? 'Back to the front page' : 'Go to the dashboard'}
          >
            <BrandMark />
            <span className="leading-none">
              <span className="block font-headline text-[17px] font-extrabold tracking-[-0.02em] text-on-surface">
                Carbon<span className="text-gradient">Pulse</span>
              </span>
              <span className="mt-1 hidden text-[10px] font-medium tracking-[0.02em] text-on-surface-variant sm:block">
                Real-time carbon intelligence
              </span>
            </span>
          </button>

          {/* desktop nav */}
          <nav
            ref={navRef}
            className="relative hidden items-center gap-0.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest/70 p-1 shadow-card lg:flex"
          >
            {indicator && (
              <span
                aria-hidden
                className="absolute top-1 h-[calc(100%-8px)] rounded-lg bg-primary shadow-glow-sm transition-all duration-300 ease-spring"
                style={{ left: indicator.left, width: indicator.width }}
              />
            )}
            {TABS.map((t) => (
              <button
                key={t.id}
                data-tab={t.id}
                onClick={() => onTab(t.id)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`relative z-10 flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-2 text-[12.5px] font-medium transition-colors duration-200 ${
                  tab === t.id ? 'font-semibold text-on-primary' : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                <Icon name={t.icon} size={14} className="flex-shrink-0" />
                <span className="hidden 2xl:inline">{t.label}</span>
                <span className="2xl:hidden">{t.short}</span>
              </button>
            ))}
          </nav>

          {/* actions */}
          <div className="flex flex-shrink-0 items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-outline-variant/40 bg-surface-container-lowest/70 px-3 py-1.5 xl:flex">
              <Icon name="target" size={13} className="text-primary" />
              <span className="tabular text-[11.5px] font-semibold text-on-surface-variant">
                {week?.used != null ? `${week.used.toFixed(1)} / ${week.target ?? '—'} kg` : 'Weekly cap —'}
              </span>
              {week?.pct != null && (
                <span className={`tabular text-[11px] font-bold ${exceeded ? 'text-rose' : 'text-primary'}`}>{week.pct}%</span>
              )}
            </div>

            <button
              onClick={onOpenPalette}
              className="hidden items-center gap-2 rounded-xl border border-outline-variant/60 bg-surface-container-lowest px-3 py-2 text-[12.5px] font-medium text-on-surface-variant transition-all hover:border-primary/40 hover:text-on-surface md:flex"
              title="Open the command palette"
            >
              <Icon name="search" size={14} />
              <span className="kbd">⌘K</span>
            </button>

            <div className="hidden md:block">
              <PresencePill live={live} />
            </div>

            <button
              onClick={toggle}
              className="btn-icon"
              aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
              title={isDark ? 'Light theme' : 'Dark theme'}
            >
              <Icon name={isDark ? 'sun' : 'moon'} size={16} />
            </button>

            <NudgeCenter refreshKey={refreshKey} live={live} />

            <button onClick={onOpenCopilot} className="btn-secondary hidden lg:inline-flex" title="Open the AI Eco-Audit Copilot">
              <Icon name="sparkles" size={15} className="text-primary" />
              Copilot
            </button>
            <button onClick={onOpenLog} className="btn-primary">
              <Icon name="plus" size={15} />
              <span className="hidden sm:inline">Log activity</span>
            </button>
          </div>
        </div>

        {/* telemetry ribbon — the "always alive" line under the header */}
        <div className="hidden border-t border-outline-variant/30 bg-surface-container-lowest/40 md:block">
          <div className="mx-auto flex h-8 w-full max-w-[1600px] items-center gap-3 px-4 text-[10.5px] font-medium text-on-surface-variant md:px-7">
            <span className="flex items-center gap-1.5">
              <LiveDot tone={liveStatus ? 'primary' : 'amber'} size={6} />
              <span className={liveStatus ? 'font-semibold text-primary' : 'font-semibold text-amber'}>
                {liveLabel}
              </span>
            </span>
            <span className="text-outline">·</span>
            <span>{live?.clients ?? 1} session{(live?.clients ?? 1) === 1 ? '' : 's'}</span>
            {live?.latencyMs != null && (
              <>
                <span className="text-outline">·</span>
                <span className="tabular">{live.latencyMs} ms rtt</span>
              </>
            )}
            {live?.lastEventId != null && (
              <>
                <span className="text-outline">·</span>
                <span className="tabular">seq {live.lastEventId}</span>
              </>
            )}
            <LastEvent live={live} />
            <span className="ml-auto flex items-center gap-1.5">
              <Icon name="shield" size={12} className="text-primary" />
              Zero-auth demo mode · every feature open to graders
            </span>
          </div>
        </div>

      </header>

      {/* ------------------------------------------------- DP1: the nudge */}
      {exceeded && (
        <div className="animate-fade-in border-b border-amber/25 bg-amber-soft/80 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1600px] items-start gap-2.5 px-4 py-2.5 text-[12.5px] text-amber md:px-7">
            <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-amber/20">
              <Icon name="pulse" size={12} />
            </span>
            <span className="leading-relaxed">
              You&apos;ve passed this week&apos;s CO₂ target — that&apos;s okay, awareness is the win. Check{' '}
              <button onClick={() => onTab('target')} className="font-semibold underline underline-offset-2">
                Weekly Target
              </button>{' '}
              for one easy swap, and open the nudge centre for pacing coach notes. Logging stays fully open.
            </span>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ content */}
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 pb-28 pt-4 md:px-7 md:pb-16 md:pt-6">{children}</main>

      {/* ------------------------------------------------------------- footer */}
      <footer className="mt-auto border-t border-outline-variant/40 md:pb-0">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center justify-between gap-2 px-4 py-4 text-[11px] text-on-surface-variant md:px-7">
          <span>CarbonPulse · Climate Tech track · fixed emission factors per brief · weeks run Monday → Sunday</span>
          <span className="flex items-center gap-3">
            <span className="hidden items-center gap-1.5 sm:flex">
              <Icon name="verified" size={13} className="text-primary" />
              No account required
            </span>
            {onHome && (
              <button
                onClick={onHome}
                className="flex items-center gap-1.5 font-semibold text-primary transition-opacity hover:opacity-80"
              >
                <Icon name="arrowRight" size={13} className="rotate-180" />
                Front page
              </button>
            )}
            <span className="flex items-center gap-1.5">
              <Icon name="command" size={13} className="text-primary" />
              <span className="kbd">⌘K</span> for the command bar
            </span>
          </span>
        </div>
      </footer>

      {/* --------------------------------------------------- mobile dock */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-outline-variant/50 pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="flex items-stretch overflow-x-auto ">
          {MOBILE_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onTab(t.id)}
              className={`flex min-w-[58px] flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold transition-colors ${
                tab === t.id ? 'text-primary' : 'text-on-surface-variant'
              }`}
            >
              <span className={`flex h-8 w-11 items-center justify-center rounded-lg transition-all ${tab === t.id ? 'bg-primary/12' : ''}`}>
                <Icon name={t.icon} size={17} />
              </span>
              {t.short}
            </button>
          ))}
          <button
            onClick={onOpenCopilot}
            className="flex min-w-[58px] flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-semibold text-primary"
          >
            <span className="flex h-8 w-11 items-center justify-center rounded-lg bg-primary/12">
              <Icon name="sparkles" size={17} />
            </span>
            Copilot
          </button>
        </div>
      </nav>

      {/* ------------------------------------------------------------ toasts */}
      {toast && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-[70] -translate-x-1/2 lg:bottom-6">
          <Toast message={typeof toast === 'string' ? toast : toast.message} tone={toast.tone} />
        </div>
      )}
    </div>
  );
}

export { TABS };
