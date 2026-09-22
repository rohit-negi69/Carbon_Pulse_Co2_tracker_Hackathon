import { Badge, CATEGORY_META, CountUp, Icon, LiveDot } from '../../components/ui/index.jsx';
import Photo from '../../components/ui/Photo.jsx';

// ---------------------------------------------------------------------------
// The editorial bands: the real-time story, how it works, the emission-factor
// method sheet, the impact numbers and the closing call to action.
//
// The live band reads the same `useLive()` object the app does, so this page
// quotes the real transport, latency and sequence number instead of inventing
// marketing numbers.
// ---------------------------------------------------------------------------

function Stat({ label, value, unit, decimals = 0 }) {
  const isNum = typeof value === 'number' && Number.isFinite(value);
  return (
    <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest px-3 py-2.5">
      <div className="muted-label">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="display-num text-[20px] text-on-surface">
          {isNum ? <CountUp value={value} decimals={decimals} /> : value}
        </span>
        {unit && <span className="text-[10.5px] font-semibold text-on-surface-variant">{unit}</span>}
      </div>
    </div>
  );
}
export function LiveBand({ live }) {
  const grid = live?.grid;
  const status = live?.status;
  const transport =
    live?.transport === 'websocket'
      ? 'WebSocket'
      : live?.transport === 'sse'
        ? 'SSE stream'
        : live?.transport === 'polling'
          ? 'Polling'
          : 'Connecting';

  return (
    <section id="live" className="scroll-mt-24">
      <div className="card overflow-hidden">
        <div className="grid gap-0 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <div className="flex flex-col justify-center gap-4 p-5 md:p-7">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={status === 'live' ? 'live' : 'warn'}>
                <LiveDot tone={status === 'live' ? 'primary' : 'amber'} size={6} />
                {status === 'live' ? `${transport} live` : 'Reconnecting'}
              </Badge>
              <Badge tone="primary">No polling spinner, ever</Badge>
            </div>

            <h2 className="font-headline text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-on-surface md:text-[32px]">
              Two tabs, one truth — <span className="text-gradient-animated">instantly</span>
            </h2>
            <p className="max-w-xl text-[13px] leading-relaxed text-on-surface-variant">
              Log a trip in one window and the other window already knows. The socket is the app’s spine: it carries
              mutations outward, commands inward, and keeps a sequenced replay buffer so nothing is lost mid-reconnect.
            </p>

            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Transport" value={status === 'live' ? transport : status || '—'} />
              <Stat label="Round trip" value={live?.latencyMs != null ? live.latencyMs : '—'} unit="ms" />
              <Stat label="Sessions" value={live?.clients ?? 1} />
              <Stat label="Last seq" value={live?.lastEventId != null ? live.lastEventId : '—'} />
            </div>

            <div className="space-y-2 rounded-xl border border-outline-variant/40 bg-surface-container-low p-3">
              <div className="muted-label">Try it from a terminal</div>
              <code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-surface-container-lowest px-2.5 py-2 font-mono text-[11px] text-on-surface">
                curl -N http://localhost:3001/api/stream
              </code>
              <code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-surface-container-lowest px-2.5 py-2 font-mono text-[11px] text-on-surface">
                curl http://localhost:3001/api/realtime
              </code>
            </div>
          </div>

          <Photo
            src="/img/wind-turbines.jpg"
            alt="Wind turbines on a ridge at sunrise"
            overlay="full"
            priority
            className="min-h-[340px]"
          >
            <div className="absolute inset-0 flex flex-col justify-between p-5 md:p-7">
              <span className="w-fit rounded-full bg-white/15 px-2.5 py-[3px] text-[11px] font-semibold text-white backdrop-blur-md">
                Always-on ticker
              </span>
              <div className="space-y-3">
                <div className="rounded-2xl border border-white/15 bg-black/35 p-4 backdrop-blur-md">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-white/85">
                      <LiveDot size={6} /> Grid carbon intensity
                    </span>
                    <span className="text-[10.5px] font-medium text-white/70">{grid?.region || '—'}</span>
                  </div>
                  <div className="mt-2 flex items-baseline gap-1.5">
                    <span className="tabular font-headline text-[30px] font-bold leading-none text-white">
                      {grid?.intensity != null ? grid.intensity.toFixed(3) : '—'}
                    </span>
                    <span className="text-[11.5px] font-semibold text-white/80">kg CO₂ / kWh</span>
                  </div>
                  <p className="mt-1.5 text-[10.5px] leading-snug text-white/70">
                    {grid?.trend === 'rising' ? 'rising' : grid?.trend === 'falling' ? 'falling' : 'holding'} right now
                    · the graded 0.80 factor never changes, so a live signal can never move your score.
                  </p>
                </div>
                <p className="text-[11px] font-medium text-white/85">
                  {live?.telemetry?.eventsTotal != null
                    ? `${live.telemetry.eventsTotal} events streamed · ${live.telemetry.eventsLastMinute}/min`
                    : 'Waiting for the first tick of telemetry…'}
                </p>
              </div>
            </div>
          </Photo>
        </div>
      </div>
    </section>
  );
}
export function HowItWorks() {
  const steps = [
    {
      n: '01',
      icon: 'plus',
      title: 'Log it in seconds',
      body: 'Six categories, one drawer. Type the quantity and the projected CO₂ appears before you save — an absurd value asks a second question instead of quietly wrecking your chart.',
      meta: 'DP2 · absurd input guard → HTTP 422',
    },
    {
      n: '02',
      icon: 'cpu',
      title: 'The server prices it',
      body: 'The calculation module applies the brief’s fixed factors, writes the entry, appends the audit row and broadcasts the event to every open socket — all inside the same request.',
      meta: 'POST /api/activities → co2 + audit + broadcast',
    },
    {
      n: '03',
      icon: 'trend',
      title: 'Change the number',
      body: 'The copilot reads your ledger, names the hotspot, projects the week at your current pace and hands you the cheapest swap — the nudge centre keeps you honest afterwards.',
      meta: 'DP1 · nudge on exceed   DP3 · the week',
    },
  ];

  return (
    <section id="how" className="scroll-mt-24">
      <div className="mb-5">
        <span className="muted-label">The loop</span>
        <h2 className="mt-1.5 font-headline text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-on-surface md:text-[32px]">
          Thirty seconds from action to <span className="text-gradient-animated">insight</span>
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-on-surface-variant">
          The whole product is one loop, and every stage of it is visible on screen and on the wire.
        </p>
      </div>

      <div className="stagger grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <article key={s.n} className="card-interactive relative overflow-hidden p-5">
            <span
              aria-hidden
              className="pointer-events-none absolute -right-2 -top-5 font-headline text-[74px] font-extrabold leading-none text-primary/8"
            >
              {s.n}
            </span>
            <div className="relative flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sheen text-on-primary shadow-glow-sm">
                <Icon name={s.icon} size={17} />
              </span>
              <span className="muted-label">Step {s.n}</span>
            </div>
            <h3 className="relative mt-3.5 font-headline text-[17px] font-bold text-on-surface">{s.title}</h3>
            <p className="relative mt-2 text-[12.5px] leading-relaxed text-on-surface-variant">{s.body}</p>
            <div className="relative mt-3.5 border-t border-outline-variant/40 pt-3">
              <span className="font-mono text-[10.5px] text-primary">{s.meta}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
export function FactorsGrid() {
  const factors = Object.entries(CATEGORY_META);

  return (
    <section id="method" className="scroll-mt-24">
      <div className="mb-5">
        <span className="muted-label">Method, not vibes</span>
        <h2 className="mt-1.5 font-headline text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-on-surface md:text-[32px]">
          Six factors, <span className="text-gradient-animated">fixed by the brief</span>
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-on-surface-variant">
          Nothing here is inferred or estimated at runtime. The same table powers the API, the charts and the copilot —
          and the live grid signal never touches the graded arithmetic.
        </p>
      </div>

      <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {factors.map(([key, meta]) => (
          <article key={key} className="card-interactive p-4">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: `${meta.color}22`, color: meta.color }}
            >
              <Icon name={meta.icon} size={16} />
            </span>
            <h3 className="mt-3 font-headline text-[13.5px] font-bold text-on-surface">{meta.label}</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="display-num text-[23px]" style={{ color: meta.color }}>
                {meta.factor.toFixed(2)}
              </span>
              <span className="text-[10px] font-semibold leading-tight text-on-surface-variant">
                kg CO₂
                <br />/ {meta.unit}
              </span>
            </div>
          </article>
        ))}
      </div>
      {/* ---------------------------------------------------- meals editorial */}
      <div className="mt-4 grid overflow-hidden rounded-2xl border border-outline-variant/50 bg-surface-container-lowest xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Photo
          src="/img/salad-bowl.jpg"
          alt="A colourful plant-based bowl"
          overlay="bottom"
          className="min-h-[260px]"
        >
          <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
            <div className="flex items-center gap-3">
              <span className="flex items-baseline gap-1">
                <span className="display-num text-[30px] text-white">0.5</span>
                <span className="text-[11px] font-semibold text-white/80">kg veg</span>
              </span>
              <span className="h-8 w-px bg-white/25" />
              <span className="flex items-baseline gap-1">
                <span className="display-num text-[30px] text-white">2.0</span>
                <span className="text-[11px] font-semibold text-white/80">kg with meat</span>
              </span>
            </div>
          </div>
        </Photo>

        <div className="flex flex-col justify-center gap-4 p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="live">
              <LiveDot size={5} /> Cheapest win available
            </Badge>
            <Badge tone="neutral">4× the impact of a bus ride</Badge>
          </div>
          <h3 className="font-headline text-[20px] font-extrabold leading-snug tracking-[-0.02em] text-on-surface md:text-[23px]">
            A meal swap beats a heroic commute
          </h3>
          <p className="text-[13px] leading-relaxed text-on-surface-variant">
            Four plant-based lunches a week is 6 kg CO₂ avoided — more than most people can realistically take off their
            car usage in the same week. The copilot ranks suggestions by kilos saved per unit of effort, not by how
            virtuous they sound.
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {[
              ['Scopes 1 / 2 / 3', 'GHG-protocol split in the charts'],
              ['Weekly rollups', 'persisted, week-over-week deltas'],
              ['Anomaly detector', 'flags the outlier day for you'],
              ['Classifier lab', 'text → category, in the AI tab'],
            ].map(([k, v]) => (
              <li key={k} className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2">
                <span className="block text-[11.5px] font-bold text-on-surface">{k}</span>
                <span className="block text-[10.5px] leading-snug text-on-surface-variant">{v}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-outline-variant/40 pt-3 font-mono text-[10.5px] leading-relaxed text-outline">
            GET /api/factors · GET /api/insights · POST /api/simulate
          </p>
        </div>
      </div>
    </section>
  );
}
const IMPACT = [
  { value: 6, label: 'Fixed factors', note: 'applied server-side, never on the client' },
  { value: 35, label: 'Backend tests', note: 'API, SSE replay and WebSocket commands' },
  { value: 13, label: 'Socket commands', note: 'a documented bidirectional protocol' },
  { value: 20, suffix: '+', label: 'REST routes', note: 'self-documented at /api/docs' },
];

const DECISIONS = [
  {
    tag: 'DP1',
    title: 'Coach, do not block',
    body: 'Crossing the weekly target raises a nudge and an in-app banner. Logging stays wide open, because the failure mode of a nagging app is an abandoned app.',
  },
  {
    tag: 'DP2',
    title: 'Ask before believing',
    body: 'An implausible quantity returns 422 with a confirm flag. The UI re-asks quietly, and only then writes — so a fat-fingered “3000 km walk” never becomes a dashboard.',
  },
  {
    tag: 'DP3',
    title: 'One definition of “the week”',
    body: 'Monday to Sunday, computed in one shared domain helper and reused by the API, the charts and the copilot. No endpoint gets to invent its own window.',
  },
];
export function ImpactBand() {
  return (
    <section className="scroll-mt-24">
      <Photo
        src="/img/misty-forest.jpg"
        alt="Mist settling over a forested valley"
        overlay="full"
        zoom
        className="rounded-3xl border border-outline-variant/30 shadow-pop"
      >
        <div className="px-5 py-10 md:px-10 md:py-14">
          <span className="muted-label !text-primary-fixed-dim">Built for the Climate Tech track</span>
          <h2 className="mt-2 max-w-2xl font-headline text-[27px] font-extrabold leading-tight tracking-[-0.03em] text-white md:text-[36px]">
            Numbers we can defend on stage
          </h2>
          <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-white/80">
            No mock screenshots in this section — these come from the repository you are looking at.
          </p>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {IMPACT.map((m) => (
              <div key={m.label} className="rounded-2xl border border-white/15 bg-black/25 p-4 backdrop-blur-md">
                <div className="flex items-baseline gap-1">
                  <span className="display-num text-[38px] text-white">
                    <CountUp value={m.value} />
                  </span>
                  {m.suffix && <span className="display-num text-[22px] text-white/80">{m.suffix}</span>}
                </div>
                <div className="mt-1.5 text-[10.5px] font-bold uppercase tracking-[0.11em] text-primary-fixed-dim">
                  {m.label}
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-white/70">{m.note}</p>
              </div>
            ))}
          </div>
        </div>
      </Photo>

      {/* The three graded decision points, straight out of DECISIONS.md. */}
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {DECISIONS.map((d) => (
          <article key={d.tag} className="card-interactive p-5">
            <span className="pill bg-primary/12 font-mono text-primary">{d.tag}</span>
            <h3 className="mt-3 font-headline text-[15.5px] font-bold text-on-surface">{d.title}</h3>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-on-surface-variant">{d.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
export function FinalCTA({ onEnter, onOpenCopilot }) {
  return (
    <section className="scroll-mt-24">
      <Photo
        src="/img/mountain-range.jpg"
        alt="A mountain range at sunrise"
        overlay="full"
        zoom
        className="rounded-3xl border border-outline-variant/30 shadow-pop"
      >
        <div className="flex flex-col items-center px-5 py-14 text-center md:px-10 md:py-20">
          <span className="pill bg-white/15 text-white backdrop-blur-md">
            <LiveDot size={5} /> Live build · every feature already unlocked
          </span>
          <h2 className="mt-4 max-w-3xl font-headline text-[30px] font-extrabold leading-[1.08] tracking-[-0.035em] text-white md:text-[46px]">
            Bring your own data — or just watch it move
          </h2>
          <p className="mt-4 max-w-2xl text-[13.5px] leading-relaxed text-white/85">
            There is no sign-up gate, no API key to paste and no empty state to fight through. Open the dashboard, log a
            trip, and the whole thing answers in under a second.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button onClick={onEnter} className="btn-primary overflow-hidden !px-6 !py-2.5 !text-[14px]">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-y-0 left-0 w-16 animate-shine bg-white/25 blur-md"
              />
              <span className="relative flex items-center gap-2">
                <Icon name="rocket" size={16} />
                Enter the live dashboard
              </span>
            </button>
            <button
              onClick={onOpenCopilot}
              className="btn border border-white/25 bg-white/10 text-white backdrop-blur-md hover:bg-white/20"
            >
              <Icon name="sparkles" size={15} />
              Ask the copilot first
            </button>
          </div>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] font-medium text-white/75">
            <span className="flex items-center gap-1.5">
              <Icon name="verified" size={13} /> Zero-auth demo mode
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="database" size={13} /> In-memory fallback if MongoDB is absent
            </span>
            <span className="flex items-center gap-1.5">
              <Icon name="command" size={13} />
              <span className="kbd border-white/25 bg-white/10 text-white/80">⌘K</span> command bar
            </span>
          </div>
        </div>
      </Photo>
    </section>
  );
}






