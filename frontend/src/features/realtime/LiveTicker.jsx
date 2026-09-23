import { isChannelHealthy } from '../../lib/liveStatus.js';
import { Icon, CATEGORY_META } from '../../components/ui/index.jsx';

// The live ticker: every event that lands on the real-time channel (WebSocket
// or its SSE fallback), newest first.

const TYPE_STYLE = {
  activity: { icon: 'plus', label: 'Logged', tone: 'text-primary' },
  deleted: { icon: 'trash', label: 'Removed', tone: 'text-rose' },
  target: { icon: 'target', label: 'Target changed', tone: 'text-tertiary' },
  nudge: { icon: 'pulse', label: 'Nudge', tone: 'text-amber' },
  presence: { icon: 'globe', label: 'Session', tone: 'text-on-surface-variant' },
  connected: { icon: 'verified', label: 'Connected', tone: 'text-primary' },
  poll: { icon: 'reset', label: 'Sync', tone: 'text-on-surface-variant' },
};

function timeOf(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '—';
  }
}

export default function LiveTicker({ live, limit = 8 }) {
  const entries = live.log.filter((e) => e.type !== 'poll').slice(0, limit);

  return (
    <div className="card animate-fade-up p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="font-headline text-[15px] font-semibold text-on-surface">Live event stream</h2>
          <span
            className={`pill ${
              isChannelHealthy(live) ? 'bg-emerald-soft text-emerald' : 'bg-surface-container-high text-on-surface-variant'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${isChannelHealthy(live) ? 'animate-pulse bg-primary' : 'bg-amber'}`}
            />
            {isChannelHealthy(live) ? (live.transport === 'polling' ? 'polling' : 'streaming') : live.status}
          </span>
        </div>
        <span className="text-[11px] font-medium text-outline">
          {live.latencyMs != null ? `${Math.max(live.latencyMs, 0)} ms` : '—'}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-on-surface-variant">
          Waiting for ledger events — anything logged by you or another session appears here instantly.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((e, i) => {
            const style = TYPE_STYLE[e.type] || TYPE_STYLE.poll;
            const meta = e.activity ? CATEGORY_META[e.activity.type] : null;
            const text =
              e.type === 'activity'
                ? `${e.label || meta?.label || 'Activity'} · ${e.activity?.quantity ?? ''} ${meta?.unit || ''} · ${e.co2 ?? e.activity?.co2} kg CO₂`
                : e.type === 'deleted'
                  ? `Entry removed (${e.activity?.co2 ?? '—'} kg CO₂)`
                  : e.type === 'target'
                    ? `Weekly target set to ${e.weeklyTarget} kg CO₂`
                    : e.type === 'nudge'
                      ? e.title
                      : e.type === 'presence'
                        ? `${e.clients} session${e.clients === 1 ? '' : 's'} connected${e.joined ? ' · new tab joined' : e.left ? ' · tab closed' : ''}`
                        : e.type === 'connected'
                          ? 'Live channel established'
                          : e.type;

            return (
              <li
                key={`${e.at}-${i}`}
                className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[12px] ${i === 0 ? 'bg-surface-container-low' : ''}`}
              >
                <Icon name={style.icon} size={14} className={`flex-shrink-0 ${style.tone}`} />
                <span className="flex-1 truncate text-on-surface">{text}</span>
                <span className="tabular flex-shrink-0 text-[10.5px] text-outline">{timeOf(e.at)}</span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3 flex items-center justify-between border-t border-outline-variant/40 pt-2.5 text-[11px] text-on-surface-variant">
        <span>
          {live.telemetry?.eventsTotal != null
            ? `${live.telemetry.eventsTotal} events · ${live.telemetry.eventsLastMinute}/min`
            : 'event rate unknown'}
        </span>
        <span>{live.reconnects ? `${live.reconnects} reconnect(s) · resumed` : 'sequence replay armed'}</span>
      </div>
    </div>
  );
}
