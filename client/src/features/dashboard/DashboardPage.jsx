import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { api } from '../../lib/api.js';
import { Card, Icon, StatCard, Progress, SegmentedBar, CATEGORY_META, Skeleton } from '../../components/ui/index.jsx';

export default function Dashboard({ refreshKey, live, onGoToTarget, onOpenCopilot, onOpenLog }) {
  const [data, setData] = useState(null);
  const [week, setWeek] = useState(null);
  const [audit, setAudit] = useState(null);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.dashboard(), api.week(), api.audit()])
      .then(([d, w, a]) => {
        if (!alive) return;
        setData(d);
        setWeek(w);
        setAudit(a);
        setError(null);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  // Real-time arrival highlight (someone/something logged an entry)
  useEffect(() => {
    if (live?.lastEvent?.type === 'activity') {
      setFlash(live.lastEvent.label || 'New activity');
      const t = setTimeout(() => setFlash(null), 4000);
      return () => clearTimeout(t);
    }
  }, [live?.lastEvent]);

  if (error) return <Card className="p-6 text-error">{error}</Card>;
  if (!data || !week) {
    return (
      <div className="space-y-4">
        <Skeleton h={40} className="max-w-md" />
        <div className="grid gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={104} />)}
        </div>
      </div>
    );
  }

  const segments = Object.entries(data.byCategory)
    .filter(([, v]) => v > 0)
    .map(([type, value]) => ({ key: type, label: CATEGORY_META[type]?.label || type, value, color: CATEGORY_META[type]?.color || '#006948' }));

  const chartData = segments.map((s) => ({ name: s.label, kg: +s.value.toFixed(2), color: s.color }));
  const pctTone = week.exceeded ? 'rose' : week.pct > 80 ? 'amber' : 'primary';
  const remaining = Math.max(week.target - week.used, 0);

  return (
    <div className="flex w-full flex-col">
      {/* Telemetry meta line */}
      <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span>Live audit trail · Scope 1, 2, 3 telemetry</span>
            <span className="text-outline">•</span>
            <span className="text-secondary">Verified emission factors (fixed per brief)</span>
          </div>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="font-headline text-[26px] font-bold tracking-tight text-on-surface md:text-[30px]">
              Carbon Intelligence Dashboard
            </h1>
            <span className="pill bg-surface-container-high text-on-surface-variant">
              {live?.status === 'live' ? 'Real-time' : 'Sync mode'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onOpenLog} className="btn-primary">
            <Icon name="plus" size={15} /> Log activity
          </button>
          <button onClick={onOpenCopilot} className="btn-secondary">
            <Icon name="spark" size={15} className="text-primary" /> Ask the copilot
          </button>
        </div>
      </div>

      {/* Live arrival flash */}
      {flash && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-primary/20 bg-emerald-soft px-3 py-2 text-[12.5px] font-medium text-[#065f46]">
          <Icon name="pulse" size={15} />
          Live update received — {flash} just entered the ledger.
        </div>
      )}

      {/* Stat ribbon */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total footprint"
          icon="globe"
          value={data.total.toLocaleString()}
          unit="kg CO₂"
          footer={
            <>
              <Icon name="history" size={13} className="text-primary" />
              {data.activityCount} activities · {data.activeDays} active day{data.activeDays === 1 ? '' : 's'}
            </>
          }
        />
        <StatCard label="This week" icon="calendar" value={data.week.used.toFixed(1)} unit="kg CO₂">
          <div className="mt-2 space-y-1.5">
            <Progress pct={week.pct} tone={pctTone} height={8} />
            <div className="flex items-center justify-between text-[11px] font-semibold">
              <span className="tabular text-on-surface-variant">{week.pct}% of {week.target} kg cap</span>
              <span className={`pill ${week.exceeded ? 'bg-rose-soft text-[#9f1239]' : 'bg-emerald-soft text-[#065f46]'}`}>
                {week.exceeded ? 'Over budget' : 'Under budget'}
              </span>
            </div>
          </div>
        </StatCard>
        <StatCard
          label="Daily mean output"
          icon="trend"
          value={data.dailyAverage.toFixed(2)}
          unit="kg CO₂ / day"
          footer={
            <>
              <Icon name="scale" size={13} className="text-primary" />
              averaged across {data.activeDays} logged day{data.activeDays === 1 ? '' : 's'}
            </>
          }
        />
        <div className="flex flex-col justify-between rounded-xl border border-outline-variant/40 bg-surface-container-low p-4 shadow-card">
          <div className="mb-1 flex items-center justify-between">
            <span className="muted-label">Telemetry health</span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
              <span className="text-[11px] font-semibold text-primary">Active</span>
            </span>
          </div>
          <div className="text-[12.5px] leading-snug text-on-surface">
            {data.topCategory ? (
              <>
                Highest contributor is <strong>{data.topCategory.label}</strong> at {data.topCategory.co2.toFixed(1)} kg CO₂ (
                {data.topCategory.share}%).
              </>
            ) : (
              <>No entries yet — log your first activity to unlock the audit.</>
            )}
          </div>
          <button onClick={onOpenCopilot} className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-tertiary hover:text-tertiary-container">
            Run AI audit <Icon name="target" size={13} />
          </button>
        </div>
      </div>

      {/* Bento grid */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        {/* LEFT: weekly progress + breakdown */}
        <div className="flex flex-col gap-5 xl:col-span-8">
          <Card className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-headline text-[18px] font-semibold text-on-surface">Weekly target progress</h2>
                <p className="text-[12px] text-on-surface-variant">
                  Week {week.start} → {week.end} · day {week.daysElapsed} of 7 · {week.daysRemaining} day(s) remaining
                </p>
              </div>
              <button onClick={onGoToTarget} className="btn-ghost">
                Manage target <Icon name="target" size={14} />
              </button>
            </div>

            <div className="flex flex-col gap-5 md:flex-row md:items-center">
              <div className="w-full">
                <Progress pct={week.pct} tone={pctTone} height={14} />
                <div className="mt-2 flex items-center justify-between text-[12px] font-medium">
                  <span className="tabular text-on-surface">
                    <strong>{week.used.toFixed(1)} kg</strong> used of {week.target} kg
                  </span>
                  <span className={`tabular font-semibold ${week.exceeded ? 'text-rose' : 'text-primary'}`}>{week.pct}%</span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-surface-container-low p-2.5">
                    <div className="muted-label mb-0.5">Pace</div>
                    <div className="text-[13px] font-semibold capitalize text-on-surface">
                      {week.pace.replace('-', ' ')}
                    </div>
                  </div>
                  <div className="rounded-lg bg-surface-container-low p-2.5">
                    <div className="muted-label mb-0.5">{week.exceeded ? 'Over by' : 'Budget left'}</div>
                    <div className="tabular text-[13px] font-semibold text-on-surface">
                      {week.exceeded ? `${(week.used - week.target).toFixed(1)} kg` : `${remaining.toFixed(1)} kg`}
                    </div>
                  </div>
                  <div className="rounded-lg bg-surface-container-low p-2.5">
                    <div className="muted-label mb-0.5">Week elapsed</div>
                    <div className="tabular text-[13px] font-semibold text-on-surface">{week.elapsedPct}%</div>
                  </div>
                </div>

                {week.exceeded && (
                  <div className="mt-4 rounded-lg border border-amber/25 bg-amber-soft p-3 text-[12.5px] leading-snug text-[#92400e]">
                    <strong>You've passed this week's target — no guilt attached.</strong> Awareness is the win; the actions
                    below show where it came from and the single highest-leverage swap for next week.
                  </div>
                )}
              </div>
            </div>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-headline text-[18px] font-semibold text-on-surface">Footprint by category</h2>
              <span className="text-[11px] font-medium text-outline">kg CO₂ · all time</span>
            </div>

            {chartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-low text-outline">
                  <Icon name="leaf" size={22} />
                </div>
                <p className="text-[13px] text-on-surface-variant">No activities yet — log one to see the breakdown.</p>
                <button onClick={onOpenLog} className="btn-primary mt-3">
                  <Icon name="plus" size={15} /> Log your first activity
                </button>
              </div>
            ) : (
              <>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 6, right: 8, left: -14, bottom: 4 }}>
                      <CartesianGrid stroke="#eaedff" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6d7a72' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#6d7a72' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: 'rgba(0, 105, 72, 0.06)' }}
                        formatter={(v) => [`${Number(v).toFixed(2)} kg CO₂`, 'Footprint']}
                        contentStyle={{ borderRadius: 8, border: '1px solid #bccac0', fontSize: 12 }}
                      />
                      <Bar dataKey="kg" radius={[6, 6, 0, 0]} maxBarSize={54}>
                        {chartData.map((row) => (
                          <Cell key={row.name} fill={row.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 overflow-hidden rounded-lg border border-outline-variant/40">
                  <table className="w-full text-left text-[13px]">
                    <thead className="bg-surface-container-low">
                      <tr className="text-outline">
                        <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider">Category</th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">kg CO₂</th>
                        <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wider">Share</th>
                        <th className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider">Factor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((row) => {
                        const type = segments.find((s) => s.label === row.name)?.key;
                        const meta = CATEGORY_META[type];
                        return (
                          <tr key={row.name} className="border-t border-surface-container">
                            <td className="flex items-center gap-2 px-3 py-2 font-medium text-on-surface">
                              <span className="h-2.5 w-2.5 rounded-full" style={{ background: row.color }} />
                              {row.name}
                            </td>
                            <td className="tabular px-3 py-2 text-right font-semibold">{row.kg.toFixed(2)}</td>
                            <td className="tabular px-3 py-2 text-right text-on-surface-variant">
                              {Math.round((row.kg / data.total) * 100)}%
                            </td>
                            <td className="tabular px-3 py-2 text-on-surface-variant">
                              {meta ? `${meta.factor} kg/${meta.unit}` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Card>
        </div>

        {/* RIGHT: AI copilot + distribution */}
        <div className="flex flex-col gap-5 xl:col-span-4">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
                  <Icon name="spark" size={17} />
                </div>
                <div>
                  <div className="font-headline text-[15px] font-semibold text-on-surface">Eco-Audit Copilot</div>
                  <div className="flex items-center gap-1 text-[11px] font-medium text-primary">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" /> {audit?.engine || 'rules'}
                  </div>
                </div>
              </div>
              <span className="pill bg-surface-container-high text-on-surface-variant">
                {audit?.projection != null ? `${audit.projection} kg projected` : 'analysing'}
              </span>
            </div>

            <p className="mb-3 text-[12.5px] leading-snug text-on-surface-variant">
              Continuous analysis across your live ledger identifies peak emission hotspots and high-leverage substitutions.
            </p>

            {audit?.summary && (
              <div className="mb-3 rounded-lg bg-surface-container-low p-3 text-[12.5px] leading-snug text-on-surface">
                {audit.summary}
              </div>
            )}

            <div className="mb-3 space-y-2">
              {(audit?.insights || []).slice(0, 3).map((ins, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg bg-surface-container-low p-2.5">
                  <Icon
                    name={CATEGORY_META[ins.icon]?.icon || (ins.severity === 'high' ? 'alert' : 'target')}
                    size={16}
                    className={`mt-0.5 flex-shrink-0 ${ins.severity === 'high' ? 'text-rose' : ins.severity === 'med' ? 'text-amber' : 'text-primary'}`}
                  />
                  <div className="text-[12.5px] leading-snug">
                    <strong className="text-on-surface">{ins.title}.</strong>{' '}
                    <span className="text-on-surface-variant">{ins.detail}</span>
                  </div>
                </div>
              ))}
            </div>

            {audit?.nextBestAction && (
              <div className="mb-3 rounded-lg border border-primary/20 bg-emerald-soft p-3 text-[12.5px] font-medium text-[#065f46]">
                Next best action: {audit.nextBestAction}
              </div>
            )}

            <button onClick={onOpenCopilot} className="btn-primary w-full">
              <Icon name="chat" size={15} /> Open copilot chat
            </button>
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-headline text-[15px] font-semibold text-on-surface">Mass distribution</span>
              <span className="text-[11px] font-medium text-outline">by category</span>
            </div>
            <SegmentedBar segments={segments.length ? segments : [{ key: 'none', label: 'none', value: 0, color: '#dae2fd' }]} />
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
              {segments.length === 0 && <span className="text-on-surface-variant">Nothing logged yet.</span>}
              {segments.map((s) => (
                <div key={s.key} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
                  <span className="text-on-surface-variant">
                    {s.label} ({s.value.toFixed(1)} kg)
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div className="rounded-xl bg-surface-container-low p-4 text-[11px] text-on-surface-variant">
            <div className="mb-1 flex items-center gap-1 text-[12px] font-semibold text-on-surface">
              <Icon name="verified" size={15} className="text-secondary" />
              Method transparency
            </div>
            <p>
              Footprint = quantity × fixed factor (car 0.20 · bus 0.08 · flight 0.25 kg/km; electricity 0.80 kg/kWh; veg 0.5 ·
              non-veg 2.0 kg/meal). Weeks run Monday 00:00 → Sunday in local time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
