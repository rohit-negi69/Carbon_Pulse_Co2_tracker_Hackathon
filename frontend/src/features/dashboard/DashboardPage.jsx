import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from 'recharts';
import { api } from '../../lib/api.js';
import {
  Card,
  AuroraCard,
  Icon,
  StatCard,
  CountUp,
  Progress,
  SegmentedBar,
  RadialGauge,
  AreaSparkline,
  LiveDot,
  Badge,
  SectionHeading,
  CATEGORY_META,
  Skeleton,
  EmptyState,
} from '../../components/ui/index.jsx';
import LiveTicker from '../realtime/LiveTicker.jsx';
import GridPulse from '../realtime/GridPulse.jsx';

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgb(var(--outline-variant))',
  background: 'rgb(var(--surface-container-lowest))',
  color: 'rgb(var(--on-surface))',
  fontSize: 12,
  boxShadow: '0 18px 40px -18px rgb(0 0 0 / 0.35)',
};

export default function Dashboard({ refreshKey, live, onGoToTarget, onOpenCopilot, onOpenLog, onOpenLive }) {
  const [data, setData] = useState(null);
  const [week, setWeek] = useState(null);
  const [audit, setAudit] = useState(null);
  const [trend, setTrend] = useState([]);
  const [error, setError] = useState(null);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([api.dashboard(), api.week(), api.audit(), api.insights().catch(() => null)])
      .then(([d, w, a, ins]) => {
        if (!alive) return;
        setData(d);
        setWeek(w);
        setAudit(a);
        setTrend(ins?.trend || []);
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

  // Render straight from the pushed snapshot: no fetch, no flash of stale data.
  useEffect(() => {
    const snap = live?.snapshot;
    if (!snap) return;
    setData((prev) => ({ ...(prev || {}), ...snap }));
    setWeek((prev) => ({ ...(prev || {}), ...snap.week }));
  }, [live?.snapshot]);

  if (error) {
    return (
      <Card className="p-8 text-center">
        <Icon name="alert" size={22} className="mx-auto mb-2 text-rose" />
        <p className="text-[13px] text-on-surface-variant">{error}</p>
      </Card>
    );
  }

  if (!data || !week) {
    return (
      <div className="space-y-5">
        <Skeleton h={188} className="rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={116} className="rounded-2xl" />)}
        </div>
        <div className="grid gap-5 xl:grid-cols-12">
          <Skeleton h={330} className="rounded-2xl xl:col-span-8" />
          <Skeleton h={330} className="rounded-2xl xl:col-span-4" />
        </div>
      </div>
    );
  }

  const segments = Object.entries(data.byCategory)
    .filter(([, v]) => v > 0)
    .map(([type, value]) => ({
      key: type,
      label: CATEGORY_META[type]?.label || type,
      value,
      color: CATEGORY_META[type]?.color || '#006948',
    }))
    .sort((a, b) => b.value - a.value);

  const chartData = segments.map((s) => ({ name: s.label, kg: +s.value.toFixed(2), color: s.color }));
  const pctTone = week.exceeded ? 'rose' : week.pct > 80 ? 'amber' : 'primary';
  const remaining = Math.max(week.target - week.used, 0);
  const trendPoints = trend.map((t) => t.kg);
  const weekTrend = trend.filter((t) => t.isCurrentWeek).map((t) => t.kg);
  const liveSessionKgs = live?.metrics?.co2ThisSession ?? null;

  return (
    <div className="flex w-full flex-col gap-5">
      {/* ================================================================= hero */}
      <AuroraCard className="animate-fade-up">
        <div className="grid gap-6 p-5 md:p-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col justify-between gap-5">
            <div>
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <Badge tone={live?.status === 'live' ? 'live' : 'warn'}>
                  <LiveDot tone={live?.status === 'live' ? 'primary' : 'amber'} size={6} />
                  {live?.status === 'live' ? 'Real-time stream' : 'Reconnecting'}
                </Badge>
                <Badge tone="primary">
                  <Icon name="verified" size={11} /> Factors fixed per brief
                </Badge>
                <Badge tone="info">
                  <Icon name="database" size={11} /> Persisted ledger
                </Badge>
              </div>

              <h1 className="font-headline text-[27px] font-extrabold leading-[1.1] tracking-[-0.03em] text-on-surface md:text-[34px]">
                Your carbon, <span className="text-gradient-animated">in real time</span>
              </h1>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-on-surface-variant">
                Every car trip, bus ride, flight, kilowatt-hour and meal is priced in CO₂ the moment it lands. The target
                ring shows this week; the copilot tells you what to change first.
              </p>
            </div>

            <div className="flex flex-wrap items-end gap-x-8 gap-y-5">
              <div>
                <div className="muted-label mb-1.5">Total footprint</div>
                <div className="flex items-baseline gap-2">
                  <span className="display-num text-[42px] text-on-surface md:text-[52px]">
                    <CountUp value={data.total} decimals={1} />
                  </span>
                  <span className="pb-1 text-[13px] font-semibold text-on-surface-variant">kg CO₂e</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[11.5px] font-medium text-on-surface-variant">
                  <Icon name="layers" size={13} className="text-primary" />
                  {data.activityCount} activities across {data.activeDays} active day{data.activeDays === 1 ? '' : 's'}
                </div>
              </div>

              <div className="min-w-[190px] flex-1">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="muted-label">Last 14 days</span>
                  <span className="tabular text-[11px] font-semibold text-on-surface-variant">
                    {trendPoints.reduce((a, b) => a + b, 0).toFixed(1)} kg
                  </span>
                </div>
                <AreaSparkline points={trendPoints.length > 1 ? trendPoints : [0, 0]} height={62} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={onOpenLog} className="btn-primary">
                <Icon name="plus" size={15} /> Log activity
              </button>
              <button onClick={onOpenCopilot} className="btn-secondary">
                <Icon name="sparkles" size={15} className="text-primary" /> Ask the copilot
              </button>
              <button onClick={onOpenLive} className="btn-ghost hidden sm:inline-flex">
                Live Ops <Icon name="arrowRight" size={14} />
              </button>
            </div>
          </div>

          {/* target ring */}
          <div className="flex items-center justify-center gap-6 rounded-2xl border border-outline-variant/40 bg-surface-container-lowest/60 p-5 backdrop-blur">
            <RadialGauge
              pct={week.pct}
              over={week.exceeded}
              size={186}
              label={`of ${week.target} kg cap`}
              sublabel={`${week.daysRemaining} day${week.daysRemaining === 1 ? '' : 's'} left`}
            />
            <div className="flex min-w-0 flex-col gap-2.5">
              <div>
                <div className="muted-label">This week</div>
                <div className="display-num text-[26px] text-on-surface">
                  <CountUp value={week.used} decimals={1} />
                  <span className="ml-1 text-[12px] font-semibold text-on-surface-variant">kg</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 text-[11.5px]">
                <span className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${week.exceeded ? 'bg-rose' : 'bg-primary'}`} />
                  <span className="text-on-surface-variant">Pace</span>
                  <span className="ml-auto font-semibold capitalize text-on-surface">{week.pace.replace('-', ' ')}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-outline" />
                  <span className="text-on-surface-variant">{week.exceeded ? 'Over by' : 'Room left'}</span>
                  <span className="tabular ml-auto font-semibold text-on-surface">
                    {(week.exceeded ? week.used - week.target : remaining).toFixed(1)} kg
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-tertiary" />
                  <span className="text-on-surface-variant">Week elapsed</span>
                  <span className="tabular ml-auto font-semibold text-on-surface">{week.elapsedPct}%</span>
                </span>
              </div>
              <button onClick={onGoToTarget} className="btn-secondary mt-0.5 w-full text-[12px]">
                <Icon name="target" size={14} /> Manage target
              </button>
            </div>
          </div>
        </div>
      </AuroraCard>

      {/* first-run guidance — a fresh deployment should never feel broken */}
      {data.activityCount === 0 && (
        <div className="animate-fade-up rounded-2xl border border-primary/25 bg-primary/6 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-sheen text-on-primary shadow-glow-sm">
                <Icon name="rocket" size={20} />
              </span>
              <div>
                <h2 className="font-headline text-[16px] font-bold text-on-surface">Start with one honest entry</h2>
                <p className="text-[12.5px] text-on-surface-variant">
                  Nothing to configure, no account. Log anything and the dashboard, target ring and copilot audit fill in immediately.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 md:ml-auto">
              {['car', 'bus', 'electricity', 'non_veg_meal'].map((t) => (
                <button
                  key={t}
                  onClick={onOpenLog}
                  className="chip-off"
                  title={`Log ${CATEGORY_META[t].label}`}
                >
                  <Icon name={CATEGORY_META[t].icon} size={13} style={{ color: CATEGORY_META[t].color }} />
                  {CATEGORY_META[t].label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* live arrival flash */}
      {flash && (
        <div className="animate-scale-in flex items-center gap-2.5 rounded-2xl border border-primary/25 bg-emerald-soft px-4 py-2.5 text-[12.5px] font-medium text-emerald">
          <LiveDot size={7} />
          Live update received — {flash} just entered the ledger.
        </div>
      )}

      {/* ================================================================ KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="This week"
          icon="calendar"
          value={data.week.used}
          decimals={1}
          unit="kg CO₂"
          accent="rgb(var(--primary))"
          delay={0}
        >
          <div className="relative mt-1.5 flex items-center gap-2">
            <Progress pct={week.pct} tone={pctTone} height={7} glow />
            <span className={`tabular flex-shrink-0 text-[11px] font-bold ${week.exceeded ? 'text-rose' : 'text-primary'}`}>
              {week.pct}%
            </span>
          </div>
        </StatCard>

        <StatCard
          label="Daily mean output"
          icon="trend"
          value={data.dailyAverage}
          decimals={2}
          unit="kg / day"
          accent="#0284c7"
          delay={60}
        >
          <div className="relative mt-1.5">
            <AreaSparkline points={weekTrend.length > 1 ? weekTrend : trendPoints.slice(-7)} height={30} color="#0284c7" />
          </div>
        </StatCard>

        <StatCard
          label="Highest contributor"
          icon={data.topCategory ? CATEGORY_META[data.topCategory.type]?.icon : 'globe'}
          value={data.topCategory?.co2 ?? 0}
          decimals={1}
          unit="kg CO₂"
          accent={data.topCategory ? CATEGORY_META[data.topCategory.type]?.color : 'rgb(var(--primary))'}
          delay={120}
          footer={
            data.topCategory ? (
              <>
                <Icon name="target" size={13} className="text-primary" />
                {data.topCategory.label} · {data.topCategory.share}% of everything logged
              </>
            ) : (
              'No entries yet — log your first activity'
            )
          }
        />

        <StatCard
          label={liveSessionKgs != null ? 'Logged in this session' : 'Events over the wire'}
          icon="pulse"
          value={liveSessionKgs != null ? liveSessionKgs : live?.telemetry?.eventsTotal ?? 0}
          decimals={liveSessionKgs != null ? 1 : 0}
          unit={liveSessionKgs != null ? 'kg CO₂ live' : 'broadcast'}
          accent="rgb(var(--tertiary))"
          delay={180}
          footer={
            <>
              <LiveDot tone={live?.status === 'live' ? 'primary' : 'amber'} size={5} />
              {live?.transport === 'websocket' ? 'WebSocket' : live?.transport === 'sse' ? 'SSE' : 'Polling'}
              {live?.latencyMs != null && <span className="tabular">· {live.latencyMs} ms</span>}
              {live?.telemetry?.eventsLastMinute != null && <span className="tabular">· {live.telemetry.eventsLastMinute}/min</span>}
            </>
          }
        />
      </div>

      {/* ============================================================= bento grid */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        {/* ------------------------------------------------------------ LEFT */}
        <div className="flex flex-col gap-5 xl:col-span-8">
          <Card className="animate-fade-up p-5">
            <SectionHeading
              eyebrow={
                <>
                  <Icon name="clock" size={12} className="text-primary" />
                  Week {week.start} → {week.end}
                </>
              }
              title="Weekly target progress"
              subtitle={`Day ${week.daysElapsed} of 7 · ${week.daysRemaining} day(s) remaining. Weeks start Monday 00:00 local time, so mid-week pacing is judged against days elapsed, not a rolling window.`}
              actions={
                <button onClick={onGoToTarget} className="btn-ghost">
                  Manage <Icon name="arrowRight" size={14} />
                </button>
              }
              className="mb-4"
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-3">
                <div className="muted-label mb-1">Pace verdict</div>
                <div className="flex items-center gap-1.5 text-[14px] font-semibold capitalize text-on-surface">
                  <span className={`h-2 w-2 rounded-full ${week.exceeded ? 'bg-rose' : week.pace === 'behind' ? 'bg-amber' : 'bg-primary'}`} />
                  {week.pace.replace('-', ' ')}
                </div>
                <p className="mt-1 text-[11px] leading-snug text-on-surface-variant">
                  {week.exceeded
                    ? 'Target crossed — the nudge below is encouraging, and logging stays open.'
                    : week.pace === 'behind'
                      ? 'Ahead of budget for the days elapsed. Keep it steady.'
                      : 'Tracking on plan for the days elapsed so far.'}
                </p>
              </div>
              <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-3">
                <div className="muted-label mb-1">{week.exceeded ? 'Over by' : 'Budget left'}</div>
                <div className="tabular display-num text-[22px] text-on-surface">
                  <CountUp value={week.exceeded ? week.used - week.target : remaining} decimals={1} />
                  <span className="ml-1 text-[11px] font-semibold text-on-surface-variant">kg</span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-on-surface-variant">
                  {week.exceeded ? 'Nothing is blocked — this is a signal, not a wall.' : 'Before the week closes on Sunday.'}
                </p>
              </div>
              <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low p-3">
                <div className="muted-label mb-1">Week elapsed</div>
                <div className="tabular display-num text-[22px] text-on-surface">
                  <CountUp value={week.elapsedPct} />
                  <span className="ml-1 text-[11px] font-semibold text-on-surface-variant">%</span>
                </div>
                <div className="mt-2">
                  <Progress pct={week.elapsedPct} tone="tertiary" height={6} />
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <Progress pct={week.pct} tone={pctTone} height={12} glow />
              <span className="tabular flex-shrink-0 text-[12.5px] font-bold text-on-surface">{week.pct}%</span>
            </div>
          </Card>

          <Card className="animate-fade-up p-5" style={{ animationDelay: '80ms' }}>
            <SectionHeading
              eyebrow={
                <>
                  <Icon name="scale" size={12} className="text-primary" />
                  {segments.length} active categor{segments.length === 1 ? 'y' : 'ies'}
                </>
              }
              title="Footprint by category"
              actions={<span className="muted-label">kg CO₂ · all time</span>}
              className="mb-4"
            />

            {chartData.length === 0 ? (
              <EmptyState
                title="Nothing logged yet"
                body="Log a car trip, a bus ride, some electricity or a meal and the breakdown appears here instantly."
                action={
                  <button onClick={onOpenLog} className="btn-primary">
                    <Icon name="plus" size={15} /> Log your first activity
                  </button>
                }
              />
            ) : (
              <>
                <div className="h-60">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 6, right: 8, left: -14, bottom: 4 }}>
                      <CartesianGrid stroke="rgb(var(--outline-variant))" strokeOpacity={0.5} vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgb(var(--outline))' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--outline))' }} axisLine={false} tickLine={false} />
                      <Tooltip
                        cursor={{ fill: 'rgb(var(--primary) / 0.07)' }}
                        formatter={(v) => [`${Number(v).toFixed(2)} kg CO₂`, 'Footprint']}
                        contentStyle={TOOLTIP_STYLE}
                      />
                      <Bar dataKey="kg" radius={[7, 7, 2, 2]} maxBarSize={56}>
                        {chartData.map((row) => (
                          <Cell key={row.name} fill={row.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-outline-variant/40">
                  <table className="w-full text-left text-[13px]">
                    <thead className="bg-surface-container-low">
                      <tr className="text-outline">
                        <th className="px-3.5 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em]">Category</th>
                        <th className="px-3.5 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.08em]">kg CO₂</th>
                        <th className="px-3.5 py-2.5 text-right text-[10.5px] font-semibold uppercase tracking-[0.08em]">Share</th>
                        <th className="hidden px-3.5 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] sm:table-cell">
                          Factor applied
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {chartData.map((row) => {
                        const type = segments.find((s) => s.label === row.name)?.key;
                        const meta = CATEGORY_META[type];
                        const share = data.total > 0 ? (row.kg / data.total) * 100 : 0;
                        return (
                          <tr key={row.name} className="border-t border-outline-variant/30 transition-colors hover:bg-surface-container-low/60">
                            <td className="px-3.5 py-2.5">
                              <div className="flex items-center gap-2.5">
                                <span
                                  className="flex h-6 w-6 items-center justify-center rounded-md"
                                  style={{ background: `${row.color}22`, color: row.color }}
                                >
                                  <Icon name={meta?.icon || 'leaf'} size={13} />
                                </span>
                                <span className="font-medium text-on-surface">{row.name}</span>
                              </div>
                            </td>
                            <td className="tabular px-3.5 py-2.5 text-right font-semibold text-on-surface">{row.kg.toFixed(2)}</td>
                            <td className="px-3.5 py-2.5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-container-high sm:block">
                                  <span className="block h-full rounded-full" style={{ width: `${share}%`, background: row.color }} />
                                </span>
                                <span className="tabular text-[12px] text-on-surface-variant">{share.toFixed(0)}%</span>
                              </div>
                            </td>
                            <td className="tabular hidden px-3.5 py-2.5 text-on-surface-variant sm:table-cell">
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

        {/* ----------------------------------------------------------- RIGHT */}
        <div className="flex flex-col gap-5 xl:col-span-4">
          <Card className="animate-fade-up overflow-hidden p-0">
            <div className="relative border-b border-outline-variant/40 bg-sheen p-4 text-on-primary">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
                  <Icon name="sparkles" size={18} />
                </span>
                <div className="min-w-0">
                  <div className="font-headline text-[15px] font-bold">AI Eco-Audit Copilot</div>
                  <div className="flex items-center gap-1.5 text-[11px] font-medium opacity-90">
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    {audit?.engine === 'llm' ? 'LLM-augmented' : 'Rule engine'} · hybrid, always available
                  </div>
                </div>
                {audit?.projection != null && (
                  <span className="ml-auto flex-shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[10.5px] font-bold backdrop-blur">
                    {audit.projection} kg proj.
                  </span>
                )}
              </div>
            </div>

            <div className="p-4">
              {audit?.summary && (
                <p className="mb-3 rounded-xl bg-surface-container-low p-3 text-[12.5px] leading-relaxed text-on-surface">
                  {audit.summary}
                </p>
              )}

              <div className="space-y-2">
                {(audit?.insights || []).slice(0, 3).map((ins, i) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-xl border border-outline-variant/30 bg-surface-container-low/60 p-2.5">
                    <Icon
                      name={CATEGORY_META[ins.icon]?.icon || (ins.severity === 'high' ? 'alert' : 'target')}
                      size={16}
                      className={`mt-0.5 flex-shrink-0 ${
                        ins.severity === 'high' ? 'text-rose' : ins.severity === 'med' ? 'text-amber' : 'text-primary'
                      }`}
                    />
                    <div className="text-[12.5px] leading-snug">
                      <strong className="text-on-surface">{ins.title}.</strong>{' '}
                      <span className="text-on-surface-variant">{ins.detail}</span>
                    </div>
                  </div>
                ))}
                {!audit?.insights?.length && (
                  <p className="text-[12.5px] text-on-surface-variant">Log a few activities and the audit populates itself.</p>
                )}
              </div>

              {audit?.nextBestAction && (
                <div className="mt-3 rounded-xl border border-primary/25 bg-emerald-soft p-3 text-[12.5px] font-medium text-emerald">
                  <span className="muted-label mb-1 block text-emerald">Next best action</span>
                  {audit.nextBestAction}
                </div>
              )}

              <button onClick={onOpenCopilot} className="btn-primary mt-3 w-full">
                <Icon name="chat" size={15} /> Open copilot chat
              </button>
            </div>
          </Card>

          <GridPulse live={live} onOpenLive={onOpenLive} />

          <LiveTicker live={live} />

          <Card className="animate-fade-up p-5">
            <SectionHeading title="Mass distribution" actions={<span className="muted-label">by category</span>} className="mb-3" />
            <SegmentedBar segments={segments.length ? segments : [{ key: 'none', label: 'none', value: 0, color: 'rgb(var(--surface-container-highest))' }]} />
            <div className="mt-3.5 grid grid-cols-2 gap-2.5 text-[11.5px]">
              {segments.length === 0 && <span className="col-span-2 text-on-surface-variant">Nothing logged yet.</span>}
              {segments.map((s) => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: s.color }} />
                  <span className="truncate text-on-surface-variant">{s.label}</span>
                  <span className="tabular ml-auto font-semibold text-on-surface">{s.value.toFixed(1)}</span>
                </div>
              ))}
            </div>
          </Card>

          <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-low/70 p-4 text-[11.5px] leading-relaxed text-on-surface-variant">
            <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-on-surface">
              <Icon name="shield" size={15} className="text-primary" />
              Method transparency
            </div>
            Footprint = quantity × fixed factor (car 0.20 · bus 0.08 · flight 0.25 kg/km; electricity 0.80 kg/kWh; veg 0.5 ·
            non-veg 2.0 kg/meal). Weeks run Monday 00:00 → Sunday in local time. Factors are never adjusted or modelled.
          </div>
        </div>
      </div>
    </div>
  );
}
