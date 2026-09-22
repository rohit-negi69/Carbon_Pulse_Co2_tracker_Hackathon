import { useState } from 'react';
import { Icon, LiveDot } from '../../components/ui/index.jsx';

// Presence: how many sessions are connected, how long they've been open, and
// how healthy the live channel is.

const TRANSPORT_LABEL = { websocket: 'WS', sse: 'SSE', polling: 'Poll', none: '—' };

export default function PresencePill({ live }) {
  const [open, setOpen] = useState(false);
  const live_ = live.status === 'live';
  const count = live.clients || 1;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 text-[11.5px] font-semibold transition-all duration-200 ${
          live_
            ? 'border-primary/25 bg-primary/8 text-primary hover:border-primary/50'
            : 'border-amber/30 bg-amber-soft text-amber'
        }`}
        title={live_ ? 'Live channel connected' : `Live channel ${live.status}`}
      >
        <LiveDot tone={live_ ? 'primary' : 'amber'} size={6} />
        <span className="tabular">
          {live_ ? `${TRANSPORT_LABEL[live.transport] || 'Live'} · ${count}` : live.status === 'polling' ? 'Sync' : 'Reconnecting'}
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-[60] w-72 animate-scale-in rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-3.5 shadow-pop">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-on-surface">Live connection</span>
            <span className="text-[10.5px] text-outline">{live.latencyMs != null ? `${Math.max(live.latencyMs, 0)} ms` : '—'}</span>
          </div>

          <dl className="space-y-1.5 text-[11.5px]">
            {[
              ['Transport', live.transport === 'websocket' ? 'WebSocket (bidirectional)' : live.transport === 'sse' ? 'Server-Sent Events' : 'Polling fallback'],
              ['Status', live.status],
              ['Sequence', live.lastEventId != null ? `#${live.lastEventId}` : '—'],
              ['Queued commands', live.queueSize || 0],
              ['Sessions', count],
              ['Events total', live.telemetry?.eventsTotal ?? '—'],
              ['Rate', live.telemetry?.eventsLastMinute != null ? `${live.telemetry.eventsLastMinute}/min` : '—'],
              ['Reconnects', live.reconnects],
              ['Replay buffer', live.telemetry?.replayBuffer != null ? `${live.telemetry.replayBuffer} frames` : '—'],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <dt className="text-on-surface-variant">{k}</dt>
                <dd className="tabular font-medium capitalize text-on-surface">{String(v)}</dd>
              </div>
            ))}
          </dl>

          {live.presence?.length > 0 && (
            <div className="mt-3 border-t border-outline-variant/40 pt-2">
              <div className="muted-label mb-1">Connected sessions</div>
              <ul className="space-y-1">
                {live.presence.slice(0, 5).map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 truncate text-on-surface-variant">
                      <Icon name="globe" size={12} className="flex-shrink-0 text-primary" />
                      {p.page}
                      <span className="text-outline">· {TRANSPORT_LABEL[p.transport] || p.transport}</span>
                      {p.typing && <span className="text-secondary">typing…</span>}
                    </span>
                    <span className="tabular text-outline">{p.connectedSeconds}s</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="mt-2 border-t border-outline-variant/40 pt-2 text-[10.5px] leading-snug text-outline">
            Mutations are published with sequence ids; a dropped connection resumes from the last id it saw, and every command
            travels back over the same socket.
          </p>
        </div>
      )}
    </div>
  );
}
