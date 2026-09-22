import { Icon } from '../../components/ui/index.jsx';
import Sparkline from '../../components/ui/Sparkline.jsx';

// ---------------------------------------------------------------------------
// Grid pulse — the always-on real-time signal.
//
// The backend ticker pushes grid carbon intensity (kg CO₂ per kWh) every few
// seconds over the live channel. Electricity entries in the brief are priced at
// the fixed 0.8 kg/kWh factor, so this widget shows the live grid number beside
// the graded factor instead of replacing it. It also shows the burn rate of
// this session: how much CO₂ has been logged in front of your eyes.
// ---------------------------------------------------------------------------

export default function GridPulse({ live, onOpenLive }) {
  const grid = live.grid;
  const status = live.status;
  const live_ = status === 'live';

  const activityFrames = live.log.filter((f) => f.type === 'activity');
  const sessionKg = Number(activityFrames.reduce((sum, f) => sum + (f.co2 || 0), 0).toFixed(2));

  const intensity = grid?.intensity;
  const trend = grid?.trend || 'flat';
  const trendIcon = trend === 'rising' ? 'trend' : trend === 'falling' ? 'trend' : 'pulse';
  const trendTone = trend === 'rising' ? 'text-amber' : trend === 'falling' ? 'text-primary' : 'text-on-surface-variant';

  return (
    <div className="card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-headline text-[15px] font-semibold text-on-surface">Grid pulse</h2>
          <p className="text-[11px] text-on-surface-variant">Live carbon intensity feeding the electricity factor</p>
        </div>
        <button onClick={onOpenLive} className="btn-ghost text-[11px]">
          <Icon name="pulse" size={13} />
          Live ops
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-baseline gap-1.5">
            <span className="tabular font-headline text-[26px] font-bold leading-none text-on-surface">
              {intensity != null ? intensity.toFixed(3) : '—'}
            </span>
            <span className="text-[11px] font-medium text-on-surface-variant">kg CO₂/kWh</span>
          </div>
          <div className={`mt-1.5 flex items-center gap-1 text-[11px] font-medium ${trendTone}`}>
            <Icon name={trendIcon} size={13} />
            {trend === 'flat' ? 'holding steady' : `${trend} right now`}
            {grid?.region ? <span className="text-outline">· {grid.region}</span> : null}
          </div>
          <Sparkline
            values={grid?.spark || []}
            stroke={trend === 'rising' ? 'rgb(var(--amber))' : 'rgb(var(--primary))'}
            fill={trend === 'rising' ? 'rgba(217,119,6,0.12)' : 'rgba(0,105,72,0.12)'}
            className="mt-2"
            height={30}
          />
        </div>

        <div className="rounded-xl bg-surface-container-low p-3">
          <div className="muted-label mb-1">This session</div>
          <div className="flex items-baseline gap-1">
            <span className="tabular font-headline text-[22px] font-bold leading-none text-primary">{sessionKg}</span>
            <span className="text-[11px] font-medium text-on-surface-variant">kg CO₂ logged live</span>
          </div>
          <ul className="mt-2 space-y-1 text-[11px] text-on-surface-variant">
            <li className="flex items-center justify-between">
              <span>Channel</span>
              <span className="font-semibold capitalize text-on-surface">
                {live_ ? `${live.transport}` : status}
              </span>
            </li>
            <li className="flex items-center justify-between">
              <span>Latency</span>
              <span className="tabular font-semibold text-on-surface">{live.latencyMs != null ? `${live.latencyMs} ms` : '—'}</span>
            </li>
            <li className="flex items-center justify-between">
              <span>Price of 1 kWh now</span>
              <span className="tabular font-semibold text-on-surface">
                {grid?.electricityNow != null ? `${grid.electricityNow} kg` : '—'}
              </span>
            </li>
          </ul>
        </div>
      </div>

      <p className="mt-3 border-t border-outline-variant/40 pt-2 text-[10.5px] leading-snug text-outline">
        Source: {grid?.source || 'waiting for the first tick'} · graded calculations always use the brief's fixed 0.80 kg/kWh
        factor, so the live signal never changes your score.
      </p>
    </div>
  );
}
