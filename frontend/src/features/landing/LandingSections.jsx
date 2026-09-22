import { useEffect, useState } from 'react';
import { Badge, Icon, LiveDot, RadialGauge } from '../../components/ui/index.jsx';
import Photo from '../../components/ui/Photo.jsx';

// ---------------------------------------------------------------------------
// The static half of the landing page: the capability marquee and the bento
// grid. Everything reuses the product's own primitives, so the marketing page
// and the app it advertises can never drift apart.
// ---------------------------------------------------------------------------

/** Infinite capability ticker. Duplicated list + `ticker` keyframe = seamless. */
export function ProofMarquee({ items = [], className = '' }) {
  const row = [...items, ...items];
  return (
    <div className={`relative overflow-hidden py-3.5 ${className}`}>
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-surface to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-surface to-transparent" />
      <div className="flex w-max animate-ticker items-center gap-9" style={{ animationDuration: '44s' }}>
        {row.map((it, i) => (
          <span
            key={`${it.label}-${i}`}
            className="flex flex-shrink-0 items-center gap-2 text-[12px] font-semibold text-on-surface-variant"
          >
            <Icon name={it.icon} size={14} className="text-primary" />
            {it.label}
            <span className="ml-7 h-1 w-1 rounded-full bg-outline-variant" />
          </span>
        ))}
      </div>
    </div>
  );
}
/** The real-time card's bespoke visual: transport ladder + sequenced frames. */
function RealTimeVisual() {
  const [seq, setSeq] = useState(1284);
  useEffect(() => {
    const id = setInterval(() => setSeq((s) => s + 1 + Math.floor(Math.random() * 3)), 1400);
    return () => clearInterval(id);
  }, []);

  const ladder = [
    { label: 'WebSocket', primary: true },
    { label: 'SSE', primary: false },
    { label: 'Polling', primary: false },
  ];

  return (
    <div className="relative h-full min-h-[172px] overflow-hidden rounded-xl border border-outline-variant/40 bg-surface-container-low p-3">
      <div aria-hidden className="absolute inset-0 grid-backdrop opacity-40" />
      <div className="relative flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.09em] text-primary">
          <LiveDot size={6} /> ws://…/api/ws
        </span>
        <span className="tabular font-mono text-[10.5px] text-on-surface-variant">seq {seq}</span>
      </div>

      <ul className="relative mt-3 space-y-1.5">
        {['activity.log → ack', 'target.set → ack', 'chat.ask → stream'].map((cmd) => (
          <li
            key={cmd}
            className="flex items-center gap-2 rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-2.5 py-1.5"
          >
            <Icon name="arrowRight" size={11} className="flex-shrink-0 text-primary" />
            <span className="truncate font-mono text-[10.5px] text-on-surface">{cmd}</span>
          </li>
        ))}
      </ul>

      <div className="relative mt-3 flex flex-wrap items-center gap-1.5">
        {ladder.map((l) => (
          <span
            key={l.label}
            className={`pill ${
              l.primary ? 'bg-emerald-soft text-emerald' : 'bg-surface-container-high text-on-surface-variant'
            }`}
          >
            {l.primary && <LiveDot size={5} />}
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Small gauge used by the weekly-target card. */
function TargetVisual() {
  const rows = [
    ['Pace', 'On track'],
    ['Days left', '3'],
    ['Nudge', 'Issued'],
  ];
  return (
    <div className="flex h-full min-h-[172px] items-center justify-center gap-4 rounded-xl border border-outline-variant/40 bg-surface-container-low p-3">
      <RadialGauge pct={69} size={104} stroke={10} />
      <div className="w-full max-w-[128px] space-y-1.5">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between gap-2 rounded-lg bg-surface-container-lowest px-2.5 py-1.5"
          >
            <span className="text-[10.5px] font-medium text-on-surface-variant">{k}</span>
            <span className="text-[11px] font-bold text-on-surface">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
const ACCENTS = {
  primary: 'bg-primary/12 text-primary',
  tertiary: 'bg-tertiary/12 text-tertiary',
  amber: 'bg-amber/12 text-amber',
  rose: 'bg-rose/12 text-rose',
  emerald: 'bg-emerald-soft text-emerald',
};

function FeatureCard({ icon, eyebrow, title, body, footer, media, className = '', accent = 'primary' }) {
  return (
    <article className={`card-interactive flex flex-col overflow-hidden p-4 ${className}`}>
      {media && <div className="mb-3.5">{media}</div>}
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${ACCENTS[accent]}`}>
          <Icon name={icon} size={15} />
        </span>
        <span className="muted-label">{eyebrow}</span>
      </div>
      <h3 className="mt-2.5 font-headline text-[16px] font-bold leading-snug text-on-surface">{title}</h3>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-on-surface-variant">{body}</p>
      {footer && <div className="mt-auto pt-3.5">{footer}</div>}
    </article>
  );
}
/** Six tiles: the brief's five features plus the real-time spine. */
export function FeatureBento({ onEnter }) {
  return (
    <section id="features" className="scroll-mt-24">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="muted-label">What is inside</span>
          <h2 className="mt-1.5 font-headline text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-on-surface md:text-[32px]">
            The brief’s five features, plus the parts that <span className="text-gradient-animated">win demos</span>
          </h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-on-surface-variant">
            Every tile below is a real screen in the app behind this page — same components, same tokens, same data.
          </p>
        </div>
        <button onClick={onEnter} className="btn-secondary">
          Open the app
          <Icon name="arrowRight" size={15} />
        </button>
      </div>

      <div className="stagger grid gap-4 xl:grid-cols-12">
        <FeatureCard
          className="xl:col-span-5"
          icon="wifi"
          eyebrow="Real-time spine"
          title="A bidirectional WebSocket, not a spinner"
          body="The server pushes every new entry, deletion, target change and nudge, and the same socket carries commands back — sequence-numbered and buffered, so a dropped tab replays exactly what it missed."
          media={<RealTimeVisual />}
          footer={
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="live">
                <LiveDot size={5} /> Degrades to SSE, then polling
              </Badge>
              <Badge tone="info">Live grid carbon intensity</Badge>
            </div>
          }
        />

        <FeatureCard
          className="xl:col-span-4"
          icon="bolt"
          accent="amber"
          eyebrow="The calculation"
          title="CO₂ priced server-side, always"
          body="Six fixed factors from the brief are applied by the backend the instant an entry lands — the client never does the arithmetic, so the number cannot drift between tabs."
          media={<Photo src="/img/solar-panels.jpg" alt="Solar array at golden hour" ratio="16 / 10" tone="amber" />}
          footer={
            <div className="flex flex-wrap gap-1.5">
              <span className="pill bg-surface-container-high font-mono text-on-surface-variant">car 0.20</span>
              <span className="pill bg-surface-container-high font-mono text-on-surface-variant">flight 0.25</span>
              <span className="pill bg-surface-container-high font-mono text-on-surface-variant">kWh 0.80</span>
            </div>
          }
        />

        <FeatureCard
          className="xl:col-span-3"
          icon="target"
          eyebrow="Weekly target"
          title="A budget with a pace coach"
          body="Set any weekly kg budget and watch the ring, the verdict and the days remaining. Cross it and the app tells you — it never blocks you."
          media={<TargetVisual />}
          footer={
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="primary">Ahead</Badge>
              <Badge tone="warn">On track</Badge>
              <Badge tone="danger">Behind</Badge>
            </div>
          }
        />
        <FeatureCard
          className="xl:col-span-3"
          icon="route"
          accent="tertiary"
          eyebrow="Log in seconds"
          title="Car, bus, flight, kWh, plate"
          body="Pick a category, type a quantity, and watch the projected CO₂ update as you type. An absurd value asks a second question instead of silently wrecking your chart."
          media={<Photo src="/img/city-road.jpg" alt="City road at dusk" ratio="4 / 3" tone="tertiary" />}
          footer={
            <div className="text-[11px] font-semibold text-on-surface-variant">
              Live projection while you type · nothing is saved until you confirm
            </div>
          }
        />

        <FeatureCard
          className="xl:col-span-4"
          icon="sparkles"
          eyebrow="AI Eco-Audit copilot"
          title="It reads your ledger, then answers"
          body="Ask what your footprint is, where it is worst, or what to change first. It can also log an activity straight from a sentence — “I drove 15 km” becomes a real entry."
          media={
            <Photo
              src="/img/earth-orbit.jpg"
              alt="Earth at night seen from orbit"
              ratio="16 / 10"
              tone="tertiary"
              zoom
              overlay="full"
              priority
            >
              <div className="absolute bottom-0 left-0 right-0 p-3.5">
                <div className="rounded-xl border border-white/15 bg-black/35 px-3 py-2 backdrop-blur-md">
                  <p className="text-[11.5px] font-medium leading-relaxed text-white">
                    <span className="font-bold">You:</span> how do I cut the most, fastest?
                    <br />
                    <span className="font-bold text-primary-fixed">Copilot:</span> swap the return flight for rail —
                    94.5 kg gone in one move.
                  </p>
                </div>
              </div>
            </Photo>
          }
          footer={<Badge tone="primary">Zero API keys needed — set OPENAI_API_KEY to upgrade the replies</Badge>}
        />

        <FeatureCard
          className="xl:col-span-5"
          icon="history"
          eyebrow="History, filters & audit"
          title="A ledger you can actually interrogate"
          body="Type pills, date presets, free-text search, impact bands, sorting, CSV export — and a delete that is itself recorded in the audit trail."
          media={<Photo src="/img/green-leaves.jpg" alt="Sunlight through green leaves" ratio="16 / 10" zoom />}
          footer={
            <div className="flex flex-wrap gap-1.5">
              <span className="chip-off pointer-events-none">Today</span>
              <span className="chip-off pointer-events-none">This week</span>
              <span className="chip-off pointer-events-none">Month to date</span>
              <span className="chip-on pointer-events-none">All</span>
            </div>
          }
        />
      </div>
    </section>
  );
}



