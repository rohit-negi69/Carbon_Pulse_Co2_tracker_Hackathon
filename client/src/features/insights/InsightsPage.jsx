import { useEffect, useMemo, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, BarChart, Bar,
} from 'recharts';
import { api } from '../../lib/api.js';
import { Card, Icon, StatCard, CATEGORY_META, SegmentedBar, Skeleton } from '../../components/ui/index.jsx';

const RANGES = [
  { key: '14', label: '14 days' },
  { key: '30', label: '30 days' },
];

export default function InsightsPage({ refreshKey, live, onToast }) {
  const [data, setData] = useState(null);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);
  const [range, setRange] = useState('14');

  // What-if simulator state
  const [fromType, setFromType] = useState('car');
  const [toType, setToType] = useState('bus');
  const [quantity, setQuantity] = useState('30');
  const [simulation, setSimulation] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.insights(), api.audit()])
      .then(([i, a]) => {
        if (!alive) return;
        setData(i);
        setAudit(a);
        setError(null);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const trend = useMemo(() => {
    if (!data) return [];
    return range === '14' ? data.trend : data.trend;
  }, [data, range]);

  async function runSimulation(e) {
    e?.preventDefault();
    try {
      const result = await api.simulate({ fromType, toType, quantity: Number(quantity) });
      setSimulation(result);
    } catch (err) {
      setError(err.message);
    }
  }

  if (error) return <Card className="p-6 text-error">{error}</Card>;
  if (!data) {
    return (
      <div className="space-y-4">
        <Skeleton h={40} className="max-w-md" />
        <div className="grid gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={104} />)}</div>
        <Skeleton h={280} />
      </div>
    );
  }

  const segments = data.mix.map((m) => ({
    key: m.type,
    label: m.label,
    value: m.kg,
    color: CATEGORY_META[m.type]?.color || '#006948',
  }));

  const deltaTone = data.deltaPct == null ? 'text-on-surface-variant' : data.deltaPct > 0 ? 'text-rose' : 'text-primary';
  const projectionTone = data.projection > data.target ? 'text-rose' : 'text-primary';
  const worstWeekday = [...data.weekdayTotals].sort((a, b) => b.kg - a.kg)[0];

  return (
    <div className="flex w-full flex-col">
      <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
            <span className="h-2 w-2 rounded-full bg-primary" />
            Charts &amp; insights · aggregated from the live ledger
            <span className="text-outline">•</span>
            <span className="text-secondary">{live?.status === 'live' ? 'streaming' : 'sync mode'}</span>
          </div>
          <h1 className="font-headline text-[26px] font-bold tracking-tight text-on-surface md:text-[30px]">
            Carbon analytics &amp; reduction modelling
          </h1>
        </div>
        <div className="flex items-center gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`rounded px-2.5 py-1 text-[11.5px] font-medium transition-all ${
                range === r.key ? 'bg-primary font-semibold text-on-primary' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ribbon */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="This week"
          icon="calendar"
          value={data.thisWeekTotal.toFixed(1)}
          unit="kg CO₂"
          footer={
            <>
              <Icon name={data.deltaPct > 0 ? 'trend' : 'pulse'} size={13} className={deltaTone} />
              <span className={deltaTone}>
                {data.deltaPct == null ? 'no baseline yet' : `${data.deltaPct > 0 ? '+' : ''}${data.deltaPct}% vs last week`}
              </span>
            </>
          }
        />
        <StatCard label="Last week" icon="history" value={data.lastWeekTotal.toFixed(1)} unit="kg CO₂" footer={
          <>
            <Icon name="verified" size={13} className="text-primary" /> previous Mon–Sun window
          </>
        } />
        <StatCard label="Week-end projection" icon="target" value={data.projection.toFixed(1)} unit="kg CO₂" footer={
          <>
            <Icon name="pulse" size={13} className={projectionTone} />
            <span className={projectionTone}>
              {data.projection > data.target ? `${(data.projection - data.target).toFixed(1)} kg over target` : `${(data.target - data.projection).toFixed(1)} kg under target`}
            </span>
          </>
        } />
        <StatCard label="Peak weekday" icon="scale" value={worstWeekday?.name || '—'} unit={`${(worstWeekday?.kg || 0).toFixed(1)} kg avg`} footer={
          <>
            <Icon name="alert" size={13} className="text-amber" /> highest-output day of the week
          </>
        } />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        {/* Trend + weekday */}
        <div className="flex flex-col gap-5 xl:col-span-8">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-headline text-[17px] font-semibold text-on-surface">Daily footprint trend</h2>
              <span className="text-[11px] font-medium text-outline">kg CO₂ per day · last 14 days</span>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#006948" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#006948" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#eaedff" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6d7a72' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6d7a72' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v) => [`${Number(v).toFixed(2)} kg CO₂`, 'Footprint']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #bccac0', fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="kg" stroke="#006948" strokeWidth={2} fill="url(#trendFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-[12px] text-on-surface-variant">
              Peaks usually come from one-off travel. The copilot flags the single largest entry so you know which spike matters.
            </p>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-headline text-[17px] font-semibold text-on-surface">Weekday profile</h2>
              <span className="text-[11px] font-medium text-outline">kg CO₂ by day of week · all time</span>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.weekdayTotals} margin={{ top: 6, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke="#eaedff" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6d7a72' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6d7a72' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(v, n, p) => [`${Number(v).toFixed(2)} kg · ${p.payload.count} entr${p.payload.count === 1 ? 'y' : 'ies'}`, 'Total']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #bccac0', fontSize: 12 }}
                  />
                  <Bar dataKey="kg" fill="#00855d" radius={[6, 6, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          {/* What-if simulator */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-headline text-[17px] font-semibold text-on-surface">Reduction modeler</h2>
              <span className="pill bg-surface-container-high text-on-surface-variant">what-if · read-only</span>
            </div>
            <p className="mb-4 text-[12.5px] text-on-surface-variant">
              Model a swap before you commit to it. The engine applies the same fixed factors the ledger uses, so the saving is
              exactly what you'd record.
            </p>
            <form onSubmit={runSimulation} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className="field-label" htmlFor="fromType">Replace</label>
                <select id="fromType" value={fromType} onChange={(e) => setFromType(e.target.value)} className="input">
                  {Object.entries(CATEGORY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="toType">With</label>
                <select id="toType" value={toType} onChange={(e) => setToType(e.target.value)} className="input">
                  {Object.entries(CATEGORY_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label" htmlFor="simQty">Quantity ({CATEGORY_META[fromType]?.unit})</label>
                <input id="simQty" type="number" min="1" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="input tabular" />
              </div>
              <div className="flex items-end">
                <button type="submit" className="btn-primary w-full">
                  <Icon name="spark" size={15} /> Model swap
                </button>
              </div>
            </form>

            {simulation && (
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-lg bg-surface-container-low p-3">
                  <div className="muted-label">Current</div>
                  <div className="tabular text-[16px] font-bold text-on-surface">{simulation.before} kg</div>
                </div>
                <div className="rounded-lg bg-surface-container-low p-3">
                  <div className="muted-label">After swap</div>
                  <div className="tabular text-[16px] font-bold text-on-surface">{simulation.after} kg</div>
                </div>
                <div className={`rounded-lg p-3 ${simulation.saving > 0 ? 'bg-emerald-soft' : 'bg-amber-soft'}`}>
                  <div className="muted-label">Saving</div>
                  <div className={`tabular text-[16px] font-bold ${simulation.saving > 0 ? 'text-[#065f46]' : 'text-[#92400e]'}`}>
                    {simulation.saving} kg ({simulation.savingPct}%)
                  </div>
                </div>
                <div className="rounded-lg bg-surface-container-low p-3">
                  <div className="muted-label">Monthly impact</div>
                  <div className="tabular text-[16px] font-bold text-on-surface">{simulation.monthlySaving} kg</div>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Mix + audit + rollups */}
        <div className="flex flex-col gap-5 xl:col-span-4">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-headline text-[15px] font-semibold text-on-surface">Category mix</h2>
              <span className="text-[11px] font-medium text-outline">all time</span>
            </div>
            {segments.length === 0 ? (
              <p className="text-[12.5px] text-on-surface-variant">Nothing logged yet.</p>
            ) : (
              <>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={segments} dataKey="value" nameKey="label" innerRadius={44} outerRadius={68} paddingAngle={2} stroke="none">
                        {segments.map((s) => <Cell key={s.key} fill={s.color} />)}
                      </Pie>
                      <Tooltip formatter={(v, n) => [`${Number(v).toFixed(2)} kg`, n]} contentStyle={{ borderRadius: 8, border: '1px solid #bccac0', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="mt-3 space-y-1.5">
                  {data.mix.map((m) => (
                    <div key={m.type} className="flex items-center justify-between text-[12px]">
                      <span className="flex items-center gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-sm" style={{ background: CATEGORY_META[m.type]?.color }} />
                        <span className="text-on-surface">{m.label}</span>
                      </span>
                      <span className="tabular text-on-surface-variant">{m.kg.toFixed(1)} kg · {m.share}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-headline text-[15px] font-semibold text-on-surface">Scope split</h2>
              <span className="text-[11px] font-medium text-outline">GHG protocol view</span>
            </div>
            <SegmentedBar
              segments={[
                { key: 'scope-1', label: 'Scope 1 · direct', value: data.scopeBreakdown['scope-1'] || 0, color: '#006948' },
                { key: 'scope-2', label: 'Scope 2 · energy', value: data.scopeBreakdown['scope-2'] || 0, color: '#00855d' },
                { key: 'scope-3', label: 'Scope 3 · value chain', value: data.scopeBreakdown['scope-3'] || 0, color: '#0284c7' },
              ]}
            />
            <div className="mt-3 grid grid-cols-1 gap-1.5 text-[12px]">
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary" /><span className="text-on-surface-variant">Scope 1 · direct ({(data.scopeBreakdown['scope-1'] || 0).toFixed(1)} kg)</span></div>
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-primary-container" /><span className="text-on-surface-variant">Scope 2 · purchased energy ({(data.scopeBreakdown['scope-2'] || 0).toFixed(1)} kg)</span></div>
              <div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-tertiary" /><span className="text-on-surface-variant">Scope 3 · value chain ({(data.scopeBreakdown['scope-3'] || 0).toFixed(1)} kg)</span></div>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-headline text-[15px] font-semibold text-on-surface">Weekly rollups</h2>
            <div className="space-y-2">
              {data.summaries.map((s) => (
                <div key={s.period} className="flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-2">
                  <div>
                    <div className="text-[12.5px] font-semibold text-on-surface">{s.period}</div>
                    <div className="text-[11px] text-on-surface-variant">{s.activityCount} entries</div>
                  </div>
                  <div className="text-right">
                    <div className="tabular text-[12.5px] font-semibold text-on-surface">{s.total} kg</div>
                    <span className={`pill ${s.exceeded ? 'bg-rose-soft text-[#9f1239]' : 'bg-emerald-soft text-[#065f46]'}`}>
                      {s.exceeded ? 'Over' : 'Under'} {s.target}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {audit?.nextBestAction && (
            <div className="rounded-xl border border-primary/20 bg-emerald-soft p-4 text-[12.5px] font-medium text-[#065f46]">
              Next best action: {audit.nextBestAction}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
