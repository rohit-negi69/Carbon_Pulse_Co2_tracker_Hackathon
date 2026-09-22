import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { Icon } from '../../components/ui/index.jsx';

// Alerts & Nudges — the DP1 surface.
// Reads the server-evaluated nudge feed; every message is encouraging and
// actionable, and nothing here can block logging.

const KIND_STYLE = {
  exceeded: { bg: 'bg-rose-soft', fg: 'text-rose', dot: 'rgb(var(--rose))', icon: 'alert' },
  warn: { bg: 'bg-amber-soft', fg: 'text-amber', dot: 'rgb(var(--amber))', icon: 'pulse' },
  insight: { bg: 'bg-primary/8', fg: 'text-primary', dot: 'rgb(var(--primary))', icon: 'trend' },
  info: { bg: 'bg-surface-container-low', fg: 'text-on-surface', dot: 'rgb(var(--outline))', icon: 'spark' },
};

export default function NudgeCenter({ refreshKey, live }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ notifications: [], unread: 0 });
  const wrapRef = useRef(null);

  async function load(evaluate = false) {
    try {
      setData(await api.nudges(evaluate));
    } catch {
      /* keep last known feed */
    }
  }

  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  // Live nudge events arrive over SSE with the activity stream.
  useEffect(() => {
    if (live?.lastEvent?.type === 'nudge' || live?.lastEvent?.type === 'activity') load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.lastEvent?.at]);

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function markAllRead() {
    try {
      setData(await api.markNudgesRead());
    } catch {
      /* ignore */
    }
  }

  return (      <div className="relative" ref={wrapRef}>

      <button
        onClick={() => setOpen((v) => !v)}
        className="btn-icon relative"
        aria-label="Alerts and nudges"
        aria-expanded={open}
      >
        <Icon name="pulse" size={17} className={data.unread > 0 ? 'animate-nudge-bounce text-rose' : ''} />
        {data.unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose px-1 text-[10px] font-bold text-surface shadow-glow-sm">
            {data.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-[60] w-[22rem] animate-scale-in rounded-2xl border border-outline-variant/50 bg-surface-container-lowest p-2 shadow-pop">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-[12px] font-semibold text-on-surface">Alerts &amp; nudges</span>
            {data.unread > 0 && (
              <button onClick={markAllRead} className="text-[11px] font-semibold text-primary hover:underline">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 space-y-1.5 overflow-y-auto">
            {data.notifications.length === 0 && (
              <div className="px-2 py-6 text-center text-[12px] text-on-surface-variant">
                No nudges yet — log an activity and they'll appear here.
              </div>
            )}
            {data.notifications.map((n) => {
              const style = KIND_STYLE[n.kind] || KIND_STYLE.info;
              return (
                <div key={n._id || n.dedupeKey} className={`rounded-lg p-2.5 ${style.bg}`}>
                  <div className="flex items-start gap-2">
                    <Icon name={style.icon} size={15} className={`mt-0.5 flex-shrink-0 ${style.fg}`} />
                    <div>
                      <div className={`text-[12.5px] font-semibold ${style.fg} ${n.read ? 'opacity-70' : ''}`}>{n.title}</div>
                      <div className="mt-0.5 text-[11.5px] leading-snug text-on-surface-variant">{n.body}</div>
                    </div>
                    {!n.read && <span className="ml-auto mt-1 h-2 w-2 flex-shrink-0 rounded-full" style={{ background: style.dot }} />}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-1 border-t border-outline-variant/40 px-2 py-1.5 text-[10.5px] text-outline">
            Nudges encourage, never block — logging stays open at all times.
          </div>
        </div>
      )}
    </div>
  );
}
