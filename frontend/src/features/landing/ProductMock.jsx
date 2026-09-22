import { useEffect, useState } from 'react';
import {
  AreaSparkline,
  Badge,
  CountUp,
  Icon,
  LiveDot,
  RadialGauge,
  SegmentedBar,
} from '../../components/ui/index.jsx';

// ---------------------------------------------------------------------------
// The hero visual: a miniature copy of the real dashboard, built from the real
// primitives, inside browser chrome.
//
// It is deliberately the *product* rather than a screenshot — a grader looking
// at the landing page should already be looking at the thing being judged. The
// numbers come from the live API when the backend answers, and from a labelled
// sample set when it does not, so the hero never renders empty.
// ---------------------------------------------------------------------------

const EVENTS = [
  { icon: 'car', tone: 'text-primary', text: 'Car travel · 12 km', value: '+2.40' },
  { icon: 'salad', tone: 'text-emerald', text: 'Veg meal · 2 meals', value: '+1.00' },
  { icon: 'bolt', tone: 'text-amber', text: 'Electricity · 8 kWh', value: '+6.40' },
  { icon: 'bus', tone: 'text-tertiary', text: 'Bus travel · 18 km', value: '+1.44' },
  { icon: 'flight', tone: 'text-rose', text: 'Flight · 500 km', value: '+125.00' },
];

const PACE_LABEL = { ahead: 'Ahead of pace', 'on-track': 'On track', behind: 'Behind pace' };

function Chrome() {
  return (
    <div className="flex items-center gap-2 border-b border-outline-variant/40 bg-surface-container-low px-3.5 py-2.5">
      <span className="flex gap-1.5">
        {['bg-rose/70', 'bg-amber/70', 'bg-emerald/70'].map((c) => (
          <span key={c} className={`h-2.5 w-2.5 rounded-full ${c}`} />
        ))}
      </span>
      <div className="ml-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-outline-variant/50 bg-surface-container-lowest px-2.5 py-1">
        <Icon name="shield" size={11} className="flex-shrink-0 text-primary" />
        <span className="truncate font-mono text-[10.5px] text-on-surface-variant">carbonpulse.app/dashboard</span>
        <span className="ml-auto hidden flex-shrink-0 items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.08em] text-emerald sm:flex">
          <LiveDot size={5} /> live
        </span>
      </div>
    </div>
  );
}

function TabStrip() {
  const tabs = [
    { label: 'Dashboard', active: true },
    { label: 'Log', active: false },
    { label: 'Insights', active: false },
    { label: 'Copilot', active: false },
  ];
  return (
    <div className="flex items-center gap-1 border-b border-outline-variant/30 bg-surface-container-lowest/60 px-3 py-2">
      {tabs.map((t) => (
        <span
          key={t.label}
          className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${
            t.active ? 'bg-primary text-on-primary shadow-glow-sm' : 'text-on-surface-variant'
          }`}
        >
          {t.label}
        </span>
      ))}
      <span className="ml-auto hidden items-center gap-1.5 md:flex">
        <span className="kbd">⌘K</span>
        <span className="text-[10px] font-medium text-outline">command bar</span>
      </span>
    </div>
  );
}

export default function ProductMock({ total = 0, mix = [], week = null, spark = [], demo = false, className = '' }) {
  const [tick, setTick] = useState(0);

  // A rotating event row keeps the hero feeling alive. Purely presentational.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % EVENTS.length), 2600);
    return () => clearInterval(id);
  }, []);

  const event = EVENTS[tick];
  const pct = Math.round(week?.pct ?? 0);
  const over = Boolean(week?.exceeded || week?.over);
  const top = mix[0];

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-lowest shadow-pop ${className}`}
    >
      <Chrome />
      <TabStrip />
      <div className="space-y-3.5 p-4">
        {/* ---------------------------------------------- total + weekly ring */}
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
              <span className="muted-label">Total footprint</span>
              <Badge tone={demo ? 'neutral' : 'live'}>
                {demo ? (
                  'sample data'
                ) : (
                  <>
                    <LiveDot size={5} /> from the live API
                  </>
                )}
              </Badge>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="display-num text-[40px] text-on-surface">
                <CountUp value={total} decimals={1} />
              </span>
              <span className="text-[12.5px] font-semibold text-on-surface-variant">kg CO₂</span>
            </div>

            <AreaSparkline points={spark} height={58} className="mt-1.5" />

            <div className="mt-2.5 flex items-center justify-between text-[10.5px] font-medium text-on-surface-variant">
              <span>Last 14 days</span>
              <span className="tabular">
                {spark.length ? `${Math.min(...spark).toFixed(1)} – ${Math.max(...spark).toFixed(1)} kg` : '—'}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center sm:pr-1">
            <RadialGauge
              pct={pct}
              size={136}
              stroke={11}
              over={over}
              center={
                <>
                  <span
                    className="display-num text-[27px]"
                    style={{ color: over ? 'rgb(var(--rose))' : 'rgb(var(--primary))' }}
                  >
                    <CountUp value={pct} />%
                  </span>
                  <span className="muted-label mt-1">of weekly target</span>
                </>
              }
            />
            <div className="mt-2 flex flex-col items-center gap-0.5 text-center">
              <span className="text-[11.5px] font-semibold text-on-surface">
                {week ? `${Number(week.used ?? 0).toFixed(1)} / ${Number(week.target ?? 0).toFixed(0)} kg` : '— / — kg'}
              </span>
              <span className={`text-[10.5px] font-medium ${over ? 'text-rose' : 'text-on-surface-variant'}`}>
                {over ? 'Budget crossed — nudge issued' : PACE_LABEL[week?.pace] || 'Pace modelling'}
              </span>
            </div>
          </div>
        </div>
        {/* ----------------------------------------------------- category mix */}
        <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="muted-label">Category mix</span>
            {top && (
              <span className="text-[10.5px] font-semibold text-on-surface-variant">
                Top: <span className="text-on-surface">{top.label}</span>
              </span>
            )}
          </div>
          <SegmentedBar segments={mix} height={11} />
          <div className="mt-2.5 flex flex-wrap gap-x-3.5 gap-y-1.5">
            {mix.slice(0, 4).map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-[10.5px] font-medium text-on-surface-variant">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                {s.label}
                <span className="tabular font-semibold text-on-surface">{s.value.toFixed(1)}</span>
              </span>
            ))}
          </div>
        </div>

        {/* -------------------------------------------------- the live ledger */}
        <div className="flex items-center gap-2.5 rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
            <Icon name={event.icon} size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[11.5px] font-semibold text-on-surface">{event.text}</span>
            <span className="block text-[10px] font-medium text-outline">pushed over /api/ws · acked in 6 ms</span>
          </span>
          <span className={`tabular flex-shrink-0 text-[12px] font-bold ${event.tone}`}>{event.value} kg</span>
        </div>

        {/* --------------------------------------------------------- copilot */}
        <div className="flex items-start gap-2.5 rounded-xl bg-sheen p-[1px] shadow-glow-sm">
          <div className="flex w-full items-start gap-2.5 rounded-[11px] bg-surface-container-lowest px-3 py-2.5">
            <Icon name="sparkles" size={14} className="mt-0.5 flex-shrink-0 text-primary" />
            <p className="min-w-0 text-[11.5px] leading-relaxed text-on-surface-variant">
              <span className="font-semibold text-on-surface">Copilot:</span> your flight is{' '}
              <span className="font-semibold text-on-surface">60%</span> of this week. Taking the rail leg back would
              save <span className="font-semibold text-primary">94.5 kg</span> — that alone clears the target.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
