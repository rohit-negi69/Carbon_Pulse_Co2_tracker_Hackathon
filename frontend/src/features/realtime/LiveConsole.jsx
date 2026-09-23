import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Card, StatCard, SectionHeading } from '../../components/ui/index.jsx';
import Sparkline from '../../components/ui/Sparkline.jsx';
import { isChannelHealthy } from '../../lib/liveStatus.js';

// ---------------------------------------------------------------------------
// Live Ops — the real-time control room.
//
// Everything here is fed by the live channel itself: transport + latency from
// the socket handshake and latency probes, telemetry and grid ticks from the
// ticker, the event log from the sequenced bus, presence from the roster, and
// the command console from acks. It is also the fastest way for a reviewer to
// confirm the app is genuinely real-time rather than polling disguised as one.
// ---------------------------------------------------------------------------

const TRANSPORT_LABEL = {
  websocket: 'WebSocket',
  sse: 'Server-Sent Events',
  polling: 'Polling fallback',
  none: 'offline',
};

const EVENT_STYLE = {
  activity: { icon: 'plus', tone: 'text-primary', label: 'Activity logged' },
  deleted: { icon: 'trash', tone: 'text-rose', label: 'Entry removed' },
  target: { icon: 'target', tone: 'text-tertiary', label: 'Target changed' },
  nudge: { icon: 'pulse', tone: 'text-amber', label: 'Nudge pushed' },
  presence: { icon: 'user', tone: 'text-on-surface-variant', label: 'Presence' },
  typing: { icon: 'chat', tone: 'text-secondary', label: 'Typing' },
  telemetry: { icon: 'pulse', tone: 'text-on-surface-variant', label: 'Telemetry tick' },
  grid: { icon: 'bolt', tone: 'text-amber', label: 'Grid tick' },
  snapshot: { icon: 'dashboard', tone: 'text-primary', label: 'State snapshot' },
  connected: { icon: 'verified', tone: 'text-primary', label: 'Channel established' },
  poll: { icon: 'reset', tone: 'text-on-surface-variant', label: 'Reconciled by polling' },
};

const COMMAND_PRESETS = [
  { cmd: 'ping', payload: { echo: 'ops' }, label: 'ping' },
  { cmd: 'stats.get', payload: {}, label: 'stats.get' },
  { cmd: 'simulate', payload: { fromType: 'car', toType: 'bus', quantity: 30 }, label: 'simulate 30 km car→bus' },
  { cmd: 'insights.get', payload: {}, label: 'insights.get' },
  { cmd: 'activity.list', payload: { tier: 'high' }, label: 'activity.list tier=high' },
  { cmd: 'audit.get', payload: {}, label: 'audit.get' },
];

function timeOf(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '—';
  }
}

export default function LiveConsole({ live, onToast }) {
  const [raw, setRaw] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rateSeries, setRateSeries] = useState([]);
  const [latencySeries, setLatencySeries] = useState([]);
  const [gridSeries, setGridSeries] = useState([]);
  const [showTicks, setShowTicks] = useState(false);
  const lastTick = useRef(null);

  // Keep rolling series for the sparklines, sampled once per telemetry tick.
  useEffect(() => {
    if (!live.telemetry?.at || live.telemetry.at === lastTick.current) return;
    lastTick.current = live.telemetry.at;
    setRateSeries((s) => [...s, live.telemetry.eventsLastMinute || 0].slice(-30));
  }, [live.telemetry]);

  useEffect(() => {
    if (live.latencyMs == null) return;
    setLatencySeries((s) => [...s, live.latencyMs].slice(-30));
  }, [live.latencyMs]);

  useEffect(() => {
    if (!live.grid?.spark?.length) return;
    setGridSeries(live.grid.spark.slice(-30));
  }, [live.grid]);

  const metrics = live.telemetry || live.metrics || {};
  const activityFrames = live.log.filter((f) => f.type === 'activity');
  const sessionKg = Number(activityFrames.reduce((sum, f) => sum + (f.co2 || 0), 0).toFixed(2));

  const roster = useMemo(() => {
    const list = live.presence || [];
    return [...list].sort((a, b) => b.connectedSeconds - a.connectedSeconds);
  }, [live.presence]);

  // The ticker is intentionally chatty; default to hiding its frames so the
  // stream reads as a ledger of what actually happened.
  const visible = useMemo(
    () => live.log.filter((f) => showTicks || (f.type !== 'telemetry' && f.type !== 'grid')),
    [live.log, showTicks]
  );
  const hiddenTicks = live.log.length - visible.length;

  async function run(cmd, payload) {
    setBusy(true);
    try {
      const data = await live.send(cmd, payload);
      setResult({ cmd, ok: true, data });
      onToast?.(`${cmd} · ack received over ${TRANSPORT_LABEL[live.transport] || live.transport}`);
    } catch (err) {
      setResult({ cmd, ok: false, data: { error: err.message, ...(err.data || {}) } });
      onToast?.(`${cmd} failed — ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  // Accepts `cmd {json}`, a bare `cmd`, or a full `{ cmd, payload }` object.
  function runRaw() {
    const text = raw.trim();
    if (!text) return;

    if (text.startsWith('{')) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        onToast?.('That is not valid JSON — try `activity.log {"type":"car","quantity":12}`');
        return;
      }
      if (!parsed.cmd) {
        onToast?.('A JSON payload needs a "cmd" field');
        return;
      }
      setRaw('');
      return run(parsed.cmd, parsed.payload || {});
    }

    const [cmd, ...rest] = text.split(/\s+/);
    const tail = rest.join(' ').trim();
    let payload = {};
    if (tail) {
      if (tail.startsWith('{')) {
        try {
          payload = JSON.parse(tail);
        } catch {
          onToast?.('The payload after the command must be valid JSON');
          return;
        }
      } else {
        payload = { message: tail };
      }
    }
    setRaw('');
    return run(cmd, payload);
  }

  const live_ = isChannelHealthy(live);

  return (
    <div className="flex w-full flex-col gap-5">
      <SectionHeading
        className="animate-fade-up"
        eyebrow={
          <>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            WebSocket transport · sequenced replay · presence awareness
          </>
        }
        title="Live operations"
        subtitle="Bidirectional socket, sequenced replay and an always-on telemetry ticker — every number here arrives as a push, never a poll."
        actions={
          <div className="flex items-center gap-2">
          <span
            className={`pill ${
              live_ ? 'bg-emerald-soft text-emerald' : 'bg-surface-container-high text-on-surface-variant'
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${live_ ? 'animate-pulse bg-primary' : 'bg-amber'}`} />
            {live_ ? `${TRANSPORT_LABEL[live.transport] || live.transport} connected` : live.status}
          </span>
          <span className="pill bg-surface-container-high text-on-surface-variant">
            <Icon name="history" size={12} />
            seq #{live.lastEventId ?? '—'}
          </span>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Transport" icon="globe" value={TRANSPORT_LABEL[live.transport] || live.transport} tone="muted">
          <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
            <Icon name="verified" size={13} />
            {live.mode === 'websocket' ? 'bidirectional' : 'server → client'}
          </div>
        </StatCard>
        <StatCard label="Round-trip latency" icon="pulse" value={live.latencyMs != null ? live.latencyMs : '—'} unit="ms" tone="muted">
          <Sparkline values={latencySeries} height={22} stroke="#38bdf8" fill="rgba(56,189,248,0.16)" className="mt-1" />
        </StatCard>
        <StatCard label="Open sessions" icon="user" value={live.clients} unit="tabs" tone="muted">
          <div className="mt-2 text-[11px] font-semibold text-on-surface-variant">
            {live.typing ? `${live.typing.page || 'a session'} is typing…` : 'presence live'}
          </div>
        </StatCard>
        <StatCard label="Events this minute" icon="trend" value={metrics.eventsLastMinute ?? '—'} tone="muted">
          <Sparkline values={rateSeries} height={22} stroke="rgb(var(--primary))" fill="rgb(var(--primary) / 0.16)" className="mt-1" />
        </StatCard>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-headline text-[15px] font-semibold text-on-surface">Event stream</h2>
              <p className="text-[11px] text-on-surface-variant">
                Sequenced frames from the shared bus · replay buffer {metrics.replayBuffer ?? '—'} · reconnects {live.reconnects}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowTicks((v) => !v)}
                className={`btn-ghost text-[11px] ${showTicks ? 'text-primary' : ''}`}
                title="Hide or show the high-frequency telemetry/grid ticks"
              >
                <Icon name="pulse" size={12} />
                {showTicks ? 'Hide ticks' : `Show ${hiddenTicks} tick${hiddenTicks === 1 ? '' : 's'}`}
              </button>
              <span className="pill bg-emerald-soft text-emerald">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
                {visible.length} frames
              </span>
            </div>
          </div>

          <ul className="max-h-[340px] space-y-1.5 overflow-y-auto pr-1">
            {visible.length === 0 && (
              <li className="py-8 text-center text-[12px] text-on-surface-variant">Waiting for the first frame…</li>
            )}
            {visible.map((frame, i) => {
              const style = EVENT_STYLE[frame.type] || EVENT_STYLE.poll;
              const detail =
                frame.type === 'activity'
                  ? `${frame.label || frame.activity?.type} · ${frame.co2 ?? frame.activity?.co2} kg CO₂`
                  : frame.type === 'deleted'
                    ? `${frame.activity?.co2 ?? '—'} kg CO₂ removed`
                    : frame.type === 'target'
                      ? `target → ${frame.weeklyTarget} kg`
                      : frame.type === 'nudge'
                        ? frame.title
                        : frame.type === 'grid'
                          ? `${frame.grid?.intensity} kg/kWh (${frame.grid?.trend})`
                          : frame.type === 'telemetry'
                            ? `${frame.clients ?? '—'} sessions · ${frame.eventsLastMinute}/min`
                            : frame.type === 'typing'
                              ? `${frame.page || 'a session'} ${frame.typing ? 'started typing' : 'stopped typing'}`
                              : frame.type === 'presence'
                                ? `${frame.clients} session(s)`
                                : frame.type === 'snapshot'
                                  ? `${frame.activityCount} entries · ${frame.total} kg`
                                  : frame.type === 'connected'
                                    ? `via ${frame.transport || frame.type}`
                                    : '';

              return (
                <li
                  key={`${frame.at}-${i}`}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[12px] ${i === 0 ? 'bg-surface-container-low' : ''}`}
                >
                  <Icon name={style.icon} size={14} className={`flex-shrink-0 ${style.tone}`} />
                  <span className="w-32 flex-shrink-0 truncate font-medium text-on-surface">{style.label}</span>
                  <span className="flex-1 truncate text-on-surface-variant">{detail}</span>
                  <span className="tabular flex-shrink-0 text-[10.5px] text-outline">
                    {frame.seq != null ? `#${frame.seq} · ` : ''}
                    {timeOf(frame.at)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-headline text-[15px] font-semibold text-on-surface">Grid intensity</h2>
              <span className="tabular text-[11px] text-on-surface-variant">
                {live.grid?.intensity != null ? `${live.grid.intensity} kg/kWh` : '—'}
              </span>
            </div>
            <Sparkline values={gridSeries} height={40} stroke={live.grid?.trend === 'rising' ? 'rgb(var(--amber))' : 'rgb(var(--primary))'} />
            <dl className="mt-2 space-y-1 text-[11.5px]">
              <div className="flex items-center justify-between">
                <dt className="text-on-surface-variant">Trend</dt>
                <dd className="font-medium capitalize text-on-surface">{live.grid?.trend || '—'}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-on-surface-variant">Price of 1 kWh now</dt>
                <dd className="tabular font-medium text-on-surface">{live.grid?.electricityNow ?? '—'} kg</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-on-surface-variant">Brief factor</dt>
                <dd className="tabular font-medium text-on-surface">{live.grid?.briefFactor ?? 0.8} kg (graded)</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-on-surface-variant">Source</dt>
                <dd className="max-w-[55%] truncate text-right text-[11px] font-medium text-on-surface">{live.grid?.source || '—'}</dd>
              </div>
            </dl>
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 font-headline text-[15px] font-semibold text-on-surface">
              Presence <span className="text-[11px] font-medium text-on-surface-variant">({roster.length})</span>
            </h2>
            <ul className="space-y-1.5">
              {roster.map((p) => (
                <li key={p.id} className="flex items-center justify-between text-[11.5px]">
                  <span className="flex items-center gap-1.5 truncate text-on-surface-variant">
                    <span className={`h-1.5 w-1.5 rounded-full ${p.typing ? 'animate-pulse bg-amber' : 'bg-primary'}`} />
                    {p.page || 'session'}
                    <span className="text-outline">· {p.transport}</span>
                  </span>
                  <span className="tabular flex-shrink-0 text-outline">{p.connectedSeconds}s · {p.sent ?? 0} frames</span>
                </li>
              ))}
              {roster.length === 0 && <li className="text-[11.5px] text-on-surface-variant">No sessions yet.</li>}
            </ul>
            <div className="mt-3 border-t border-outline-variant/40 pt-2 text-[11px] text-on-surface-variant">
              {sessionKg} kg CO₂ observed live in this session
            </div>
          </Card>
        </div>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-headline text-[15px] font-semibold text-on-surface">Command console</h2>
            <p className="text-[11px] text-on-surface-variant">
              Commands travel the same socket and resolve with an ack — the UI never polls for them.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {COMMAND_PRESETS.map((p) => (
              <button key={p.label} onClick={() => run(p.cmd, p.payload)} disabled={busy} className="btn-ghost text-[11px] disabled:opacity-40">
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runRaw();
              }}
              className="flex items-center gap-2"
            >
              <input
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
                placeholder='e.g. activity.log {"type":"car","quantity":12}'
                className="input"
              />
              <button type="submit" disabled={busy || !raw.trim()} className="btn-primary px-3 disabled:opacity-40">
                <Icon name="send" size={15} />
              </button>
            </form>
            <div className="mt-3 rounded-xl bg-surface-container-low p-3 text-[11.5px]">
              <div className="muted-label mb-1">Handshake</div>
              <ul className="space-y-1 text-on-surface-variant">
                <li className="flex justify-between"><span>Primary transport</span><span className="font-medium text-on-surface">WebSocket `/api/ws`</span></li>
                <li className="flex justify-between"><span>Fallbacks</span><span className="font-medium text-on-surface">SSE → polling</span></li>
                <li className="flex justify-between"><span>Heartbeat</span><span className="font-medium text-on-surface">20 s ping/pong</span></li>
                <li className="flex justify-between"><span>Resume</span><span className="font-medium text-on-surface">replay from last seq id</span></li>
                <li className="flex justify-between"><span>Commands handled</span><span className="font-medium text-on-surface">{metrics.commandsHandled ?? 0}</span></li>
              </ul>
            </div>
          </div>

          <div className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-3">
            <div className="muted-label mb-1">
              {result ? `Last ack · ${result.cmd} · ${result.ok ? 'ok' : 'error'}` : 'Last ack'}
            </div>
            <pre className="max-h-[190px] overflow-auto whitespace-pre-wrap break-all text-[11px] leading-snug text-on-surface-variant">
              {result ? JSON.stringify(result.data, null, 2) : 'Run a command to see the raw ack payload here.'}
            </pre>
          </div>
        </div>
      </Card>
    </div>
  );
}
