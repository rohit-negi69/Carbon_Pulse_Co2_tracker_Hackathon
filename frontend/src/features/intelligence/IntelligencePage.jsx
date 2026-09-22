import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine,
} from 'recharts';
import { api } from '../../lib/api.js';
import {
  Card, Icon, StatCard, CountUp, Badge, LiveDot, SectionHeading, Skeleton, EmptyState, CATEGORY_META,
} from '../../components/ui/index.jsx';

// ---------------------------------------------------------------------------
// ML Lab.
//
// Every panel is a window onto a model that actually ran on this ledger: the
// forecaster shows its walk-forward backtest and residual-quantile bands, the
// integrity detector shows the LOF and robust-z scores behind each flag, the
// clustering shows the silhouette sweep that chose k, and the classifier shows
// its held-out confusion matrix beside a live playground.
//
// Nothing here asks to be believed. That is the point.
// ---------------------------------------------------------------------------

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid rgb(var(--outline-variant))',
  background: 'rgb(var(--surface-container-lowest))',
  color: 'rgb(var(--on-surface))',
  fontSize: 12,
  boxShadow: '0 18px 40px -18px rgb(0 0 0 / 0.35)',
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const GRADE_TONE = { high: 'live', moderate: 'info', low: 'warn', weak: 'danger', insufficient: 'warn', unknown: 'neutral' };
const TONE_BAR = { primary: 'bg-primary', amber: 'bg-amber', rose: 'bg-rose' };
const labelOf = (t) => CATEGORY_META[t]?.label || t;

function MetricBar({ label, value, max = 1, tone = 'primary', display, wide = false }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center gap-2 text-[11.5px]">
      <span className={`flex-shrink-0 truncate text-on-surface-variant ${wide ? 'w-36' : 'w-24'}`} title={label}>{label}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-high">
        <span className={`block h-full rounded-full transition-all duration-700 ${TONE_BAR[tone]}`} style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular w-11 flex-shrink-0 text-right font-semibold text-on-surface">
        {display ?? value.toFixed(2)}
      </span>
    </div>
  );
}

function MiniStat({ label, value, unit, tone }) {
  return (
    <div>
      <div className="muted-label">{label}</div>
      <div className={`tabular display-num mt-0.5 text-[17px] ${tone || 'text-on-surface'}`}>
        {value ?? '—'}
        {unit && <span className="ml-1 text-[10.5px] font-semibold text-on-surface-variant">{unit}</span>}
      </div>
    </div>
  );
}

export default function IntelligencePage({ refreshKey, live, onToast }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [text, setText] = useState('I drove the car to the office this morning');
  const [prediction, setPrediction] = useState(null);
  const [predicting, setPredicting] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .mlReport()
      .then((r) => {
        if (!alive) return;
        setReport(r);
        setError(null);
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  const classify = useCallback(
    async (value) => {
      const q = (value ?? text).trim();
      if (!q) return;
      setPredicting(true);
      try {
        setPrediction(await api.mlClassify(q));
      } catch (err) {
        onToast?.(err.message, 'warn');
      } finally {
        setPredicting(false);
      }
    },
    [text, onToast]
  );

  // Re-run the demo whenever the model is retrained, so the playground always
  // shows the model that is actually deployed rather than an old snapshot.
  const modelVersion = report?.classifier?.version;
  useEffect(() => {
    if (modelVersion) classify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelVersion]);

  const forecast = report?.forecast;

  const forecastChart = useMemo(() => {
    if (!forecast?.forecast) return [];
    const history = (forecast.currentWeek?.actualToDate ?? 0) > 0
      ? [{ label: 'now', actual: forecast.currentWeek.actualToDate }]
      : [];
    void history;
    return forecast.forecast.map((f) => ({
      label: `${f.weekday} ${f.date.slice(8, 10)}`,
      predicted: f.predicted,
      band80: [f.low80 ?? f.predicted, f.high80 ?? f.predicted],
      band95: [f.low95 ?? f.predicted, f.high95 ?? f.predicted],
    }));
  }, [forecast]);

  if (error) {
    return (
      <Card className="p-8 text-center">
        <Icon name="alert" size={22} className="mx-auto mb-2 text-rose" />
        <p className="text-[13px] text-on-surface-variant">{error}</p>
      </Card>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton h={92} className="max-w-2xl rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} h={116} className="rounded-2xl" />)}
        </div>
        <Skeleton h={340} className="rounded-2xl" />
      </div>
    );
  }

  const { anomalies, clusters, recommendations, classifier, health, seasonality, thresholds, models } = report;
  const acc = forecast.accuracy || {};
  const selected = forecast.backtest?.selected;
  const top5 = (anomalies.top || []).slice(0, 5);
  const recs = (recommendations.recommendations || []).slice(0, 4);
  const summary = recommendations.summary || {};
  const perClass = classifier.metrics?.perClass || [];
  const confusion = classifier.metrics?.confusion || {};
  const classLabels = Object.keys(confusion);
  const dailyTarget = health.weeklyTarget > 0 ? health.weeklyTarget / 7 : null;
  const seasonEntries = Object.entries(seasonality || {}).map(([k, v]) => [WEEKDAYS[Number(k) - 1], v]);
  const seasonMax = Math.max(...seasonEntries.map(([, v]) => v), 0.001);
  const busy = [...seasonEntries].sort((a, b) => b[1] - a[1])[0];
  const quiet = [...seasonEntries].sort((a, b) => a[1] - b[1])[0];

  return (
    <div className="flex w-full flex-col gap-5">
      <SectionHeading
        className="animate-fade-up"
        eyebrow={
          <>
            <LiveDot tone={live?.status === 'live' ? 'primary' : 'amber'} size={6} />
            {models.length} models deployed · validated against your ledger
          </>
        }
        title="Carbon intelligence lab"
        subtitle="A forecasting ensemble, an outlier detector, a text classifier and a prescriptive ranker — each fitted or evaluated on this deployment's data, each publishing its own error bars."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={GRADE_TONE[health.grade] || 'neutral'}>
              <Icon name="verified" size={11} /> Forecast grade: {health.grade}
            </Badge>
            <Badge tone="primary">
              <Icon name="database" size={11} /> {health.ledgerSize} ledger rows
            </Badge>
          </div>
        }
      />

      {/* ------------------------------------------------------------- ribbon */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Forecast error"
          icon="trend"
          value={acc.smape == null ? '—' : acc.smape}
          decimals={1}
          unit={acc.smape == null ? 'sMAPE' : '% sMAPE'}
          accent="rgb(var(--primary))"
          delay={0}
          footer={
            <>
              <Icon name="verified" size={13} className="text-primary" />
              walk-forward · MAE {acc.mae ?? '—'} kg over {forecast.backtest?.holdoutDays ?? 0} held-out days
            </>
          }
        />
        <StatCard
          label="Projected week end"
          icon="target"
          value={health.projectedWeekEnd ?? 0}
          decimals={2}
          unit="kg CO₂"
          accent={forecast.currentWeek?.willExceed ? 'rgb(var(--rose))' : 'rgb(var(--primary))'}
          delay={60}
          footer={
            <>
              <Icon name="scale" size={13} className={forecast.currentWeek?.willExceed ? 'text-rose' : 'text-primary'} />
              {forecast.currentWeek?.willExceed
                ? `${forecast.currentWeek.overBy} kg over the ${health.weeklyTarget} kg target`
                : `${Math.max((health.weeklyTarget ?? 0) - (health.projectedWeekEnd ?? 0), 0).toFixed(2)} kg of headroom`
              }
            </>
          }
        />
        <StatCard
          label="Classifier accuracy"
          icon="cpu"
          value={(classifier.metrics?.accuracy ?? 0) * 100}
          decimals={1}
          unit="% hold-out"
          accent="rgb(var(--tertiary))"
          delay={120}
          footer={
            <>
              <Icon name="layers" size={13} className="text-tertiary" />
              macro-F1 {(classifier.metrics?.macroF1 ?? 0).toFixed(3)} · {classifier.sampleCount} labelled phrases
            </>
          }
        />
        <StatCard
          label="Inputs flagged"
          icon="alert"
          value={anomalies.stats?.flagged ?? 0}
          unit={`of ${anomalies.stats?.sampleSize ?? 0}`}
          accent="rgb(var(--amber))"
          delay={180}
          footer={
            <>
              <Icon name="shield" size={13} className="text-amber" />
              LOF ≥ {anomalies.threshold} or |z| ≥ 4 · nothing auto-changed
            </>
          }
        />
      </div>

      {/* ----------------------------------------------------------- forecast */}
      <Card className="animate-fade-up p-5">
        <SectionHeading
          eyebrow={
            <>
              <Icon name="cpu" size={12} className="text-primary" />
              Holt-Winters · seasonal-naive · weekday profile · damped Holt → inverse-error ensemble
            </>
          }
          title="7-day footprint forecast"
          subtitle={
            forecast.status === 'ok'
              ? `Selected on backtest error: ${forecast.backtest?.models?.find((m) => m.name === selected)?.label || selected}. Bands are empirical residual quantiles, not an assumed distribution.`
              : forecast.note
          }
          actions={
            forecast.intervals && (
              <div className="flex items-center gap-3 text-[11px] text-on-surface-variant">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-4 rounded-sm bg-primary/25" /> 95% (±{forecast.intervals.q95} kg)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-4 rounded-sm bg-primary/45" /> 80% (±{forecast.intervals.q80} kg)
                </span>
              </div>
            )
          }
          className="mb-4"
        />

        {forecast.status === 'ok' ? (
          <>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={forecastChart} margin={{ top: 8, right: 14, left: -18, bottom: 4 }}>
                  <CartesianGrid stroke="rgb(var(--outline-variant))" strokeOpacity={0.5} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'rgb(var(--outline))' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgb(var(--outline))' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v, n) => [Array.isArray(v) ? `${v[0]} – ${v[1]} kg` : `${Number(v).toFixed(2)} kg`, n]}
                  />
                  {dailyTarget != null && (
                    <ReferenceLine
                      y={dailyTarget}
                      stroke="rgb(var(--rose))"
                      strokeDasharray="4 4"
                      label={{ value: 'daily share of target', fontSize: 10, fill: 'rgb(var(--rose))', position: 'insideTopRight' }}
                    />
                  )}
                  <Area type="monotone" dataKey="band95" stroke="none" fill="rgb(var(--primary))" fillOpacity={0.15} name="95% interval" />
                  <Area type="monotone" dataKey="band80" stroke="none" fill="rgb(var(--primary))" fillOpacity={0.26} name="80% interval" />
                  <Line type="monotone" dataKey="predicted" stroke="rgb(var(--primary))" strokeWidth={2.4} dot={{ r: 3 }} name="Predicted" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="muted-label mb-2.5">Walk-forward backtest — every model, measured</h3>
                <div className="overflow-hidden rounded-xl border border-outline-variant/40">
                  <table className="w-full text-left text-[12.5px]">
                    <thead className="bg-surface-container-low">
                      <tr className="text-outline">
                        {['Model', 'MAE', 'RMSE', 'sMAPE'].map((h, i) => (
                          <th
                            key={h}
                            className={`px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[0.08em] ${i === 0 ? '' : 'text-right'}`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(forecast.backtest?.models || []).map((m) => (
                        <tr
                          key={m.name}
                          title={m.note}
                          className={`border-t border-outline-variant/30 ${m.name === selected ? 'bg-primary/8' : ''}`}
                        >
                          <td className="px-3 py-2 font-medium text-on-surface">
                            <span className="flex items-center gap-1.5">
                              {m.name === selected && <Icon name="check" size={12} className="flex-shrink-0 text-primary" />}
                              {m.label}
                            </span>
                          </td>
                          <td className="tabular px-3 py-2 text-right font-semibold text-on-surface">{m.mae}</td>
                          <td className="tabular px-3 py-2 text-right text-on-surface-variant">{m.rmse}</td>
                          <td className="tabular px-3 py-2 text-right text-on-surface-variant">{m.smape}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-on-surface-variant">
                  Expanding-window backtest: each held-out day is predicted using only the days before it. The seasonal-naive
                  baseline is included on purpose — an ensemble that cannot beat &ldquo;same day last week&rdquo; should not be
                  trusted, and you can see whether this one does.
                </p>
              </div>

              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="muted-label mb-2.5">Detected weekly rhythm</h3>
                  <div className="rounded-xl border border-outline-variant/40 bg-surface-container-low/50 p-3.5">
                    <div className="flex items-end justify-between gap-2">
                      {seasonEntries.map(([d, v]) => (
                        <div key={d} className="flex flex-1 flex-col items-center gap-1.5">
                          <div className="flex h-20 w-full items-end justify-center">
                            <div
                              className={`w-full rounded-t-md transition-all duration-700 ${v > 1.1 ? 'bg-rose/70' : v < 0.9 ? 'bg-primary/35' : 'bg-primary/65'}`}
                              style={{ height: `${Math.max((v / seasonMax) * 100, 5)}%` }}
                              title={`${d}: ${v}× an average day`}
                            />
                          </div>
                          <span className="text-[10px] font-semibold text-on-surface-variant">{d}</span>
                          <span className="tabular text-[10px] text-outline">{v.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <p className="mt-2.5 text-[11px] leading-relaxed text-on-surface-variant">
                      Heaviest day <strong className="text-on-surface">{busy[0]}</strong> at {busy[1]}× an average day; lightest{' '}
                      <strong className="text-on-surface">{quiet[0]}</strong> at {quiet[1]}×. The forecaster applies this
                      multiplicative shape rather than treating every day as interchangeable.
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="muted-label mb-2.5">This week, projected</h3>
                  <div className="grid grid-cols-3 gap-2.5">
                    <MiniStat label="Logged" value={forecast.currentWeek?.actualToDate} unit="kg" />
                    <MiniStat label="Forecast rest" value={forecast.currentWeek?.forecastRemaining} unit="kg" />
                    <MiniStat
                      label="Projected"
                      value={<CountUp value={forecast.currentWeek?.projectedTotal ?? 0} decimals={2} />}
                      unit="kg"
                      tone={forecast.currentWeek?.willExceed ? 'text-rose' : 'text-primary'}
                    />
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 text-[10.5px] text-on-surface-variant">
                    <Icon name="info" size={12} className="flex-shrink-0 text-primary" />
                    {Math.round((forecast.currentWeek?.settledFraction ?? 0) * 100)}% of the week is already settled, so{' '}
                    {Math.round((1 - (forecast.currentWeek?.settledFraction ?? 0)) * 100)}% of this number is still a forecast.
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            icon="trend"
            title="Not enough history to forecast honestly"
            body={forecast.note}
            action={<Badge tone="warn">The models refuse to draw a line they cannot support</Badge>}
          />
        )}
      </Card>

      {/* ---------------------------------------------- anomalies + clusters */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        <Card className="animate-fade-up p-5 xl:col-span-6">
          <SectionHeading
            eyebrow={
              <>
                <Icon name="shield" size={12} className="text-amber" />
                Local Outlier Factor (k=5) + per-category robust z (median / MAD)
              </>
            }
            title="Input integrity"
            subtitle="Nothing here mutates your data. Each flag explains itself, so a typo is quick to catch while a genuinely large trip stays exactly as logged."
            className="mb-4"
          />

          {top5.length === 0 ? (
            <EmptyState
              icon="verified"
              title="Nothing looks inconsistent"
              body={anomalies.stats?.note}
            />
          ) : (
            <ul className="flex flex-col gap-2.5">
              {top5.map((a) => (
                <li key={a.id} className="rounded-xl border border-amber/25 bg-amber-soft/60 p-3">
                  <div className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-amber/15 text-amber">
                      <Icon name={CATEGORY_META[a.type]?.icon || 'alert'} size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-[13px] font-semibold text-on-surface">
                          {a.quantity} {CATEGORY_META[a.type]?.unit || ''} · {labelOf(a.type)}
                        </span>
                        <Badge tone="warn">score {a.score}</Badge>
                        <span className="tabular text-[11px] text-on-surface-variant">{a.date}</span>
                      </div>
                      <p className="mt-1 text-[11.5px] leading-snug text-on-surface-variant">
                        {a.reasons?.[0] || 'Outside the learned normal range for this ledger.'}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10.5px] text-outline">
                        <span className="tabular">LOF {a.lof}</span>
                        <span className="tabular">robust z {a.robustZ}</span>
                        <span className="tabular">{a.co2} kg CO₂</span>
                        {a.notes && <span className="truncate">“{a.notes}”</span>}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-4 border-t border-outline-variant/40 pt-3.5">
            <div className="muted-label mb-2.5">Learned normal range vs the graded threshold</div>
            <div className="flex flex-col gap-2">
              {Object.entries(thresholds || {})
                .filter(([, v]) => v.advisoryRange != null)
                .map(([type, v]) => (
                  <div key={type} className="flex items-center gap-2 text-[11.5px]">
                    <span className="w-24 flex-shrink-0 truncate text-on-surface-variant">{labelOf(type)}</span>
                    <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-high">
                      <span
                        className={`absolute inset-y-0 left-0 rounded-full ${v.exceedsBrief ? 'bg-amber/60' : 'bg-primary/45'}`}
                        style={{ width: `${Math.min((v.advisoryRange / Math.max(v.effectiveThreshold, v.advisoryRange)) * 100, 100)}%` }}
                        title={`Learned normal ceiling: ${v.advisoryRange} ${CATEGORY_META[type]?.unit || ''}`}
                      />
                    </span>
                    <span className="tabular w-28 flex-shrink-0 text-right text-on-surface-variant">
                      {v.advisoryRange} / {v.effectiveThreshold}
                      {v.exceedsBrief && <span className="ml-1 text-amber" title="Learned range exceeds the brief ceiling — it stays advisory">▲</span>}
                    </span>
                  </div>
                ))}
              {Object.values(thresholds || {}).every((v) => v.advisoryRange == null) && (
                <p className="text-[11.5px] text-on-surface-variant">
                  Not enough plausible history yet to learn a per-category range — the brief&apos;s fixed ceiling is used.
                </p>
              )}
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-outline">
              The confirmation step always uses the brief&apos;s fixed threshold, so DP2 behaves identically for every user and
              can be graded by script. The learned range is shown as context and is deliberately never allowed to widen the
              threshold — if it could, one confirmed 500,000 km typo would permanently widen the user&apos;s &ldquo;normal&rdquo;
              and silently disable detection forever.
            </p>
          </div>
        </Card>

        <Card className="animate-fade-up p-5 xl:col-span-6">
          <SectionHeading
            eyebrow={
              <>
                <Icon name="layers" size={12} className="text-tertiary" />
                k-means++ (fixed seed) · k chosen by silhouette
                {clusters.silhouette != null && ` = ${clusters.silhouette}`}
              </>
            }
            title="Your day archetypes"
            subtitle={clusters.note}
            className="mb-4"
          />

          {clusters.status !== 'ok' ? (
            <EmptyState icon="layers" title="Not enough active days" body={clusters.note} />
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-1.5">
                {(clusters.sweep || []).map((s) => (
                  <span
                    key={s.k}
                    className={`pill ${s.k === clusters.k ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant'}`}
                  >
                    k={s.k} · silhouette {s.silhouette}
                  </span>
                ))}
              </div>

              <div className="flex flex-col gap-2.5">
                {clusters.clusters.map((c) => (
                  <div key={c.id} className="rounded-xl border border-outline-variant/40 bg-surface-container-low/50 p-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-tertiary/12 text-tertiary">
                        <Icon name={c.icon} size={15} />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-on-surface">{c.label}</span>
                      <Badge tone="neutral">{c.dayCount} days</Badge>
                      <Badge tone={c.contribution > c.share * 1.3 ? 'warn' : 'neutral'}>{c.contribution}% of CO₂</Badge>
                    </div>
                    <p className="mt-1.5 text-[11.5px] leading-snug text-on-surface-variant">{c.blurb}</p>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-outline">
                      <span className="tabular">mean {c.meanTotal} kg/day</span>
                      {Object.entries(c.meanKgByCategory || {})
                        .filter(([, kg]) => kg > 0.05)
                        .sort((a, b) => b[1] - a[1])
                        .slice(0, 3)
                        .map(([t, kg]) => (
                          <span key={t} className="tabular">{labelOf(t)} {kg}</span>
                        ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] leading-relaxed text-outline">
                {clusters.activeDays} active days clustered on total kg, log count, per-category kg and weekend flags. The sweep
                above is the evidence for k — a cluster count chosen without it is just an opinion.
              </p>
            </>
          )}
        </Card>
      </div>

      {/* ---------------------------------------------------- recommendations */}
      <Card className="animate-fade-up p-5">
        <SectionHeading
          eyebrow={
            <>
              <Icon name="target" size={12} className="text-primary" />
              brief factors × your own typical quantities × feasibility
            </>
          }
          title="What to change first"
          subtitle={recommendations.note}
          actions={
            summary.closesGap != null && (
              <Badge tone={summary.closesGap ? 'live' : 'warn'}>
                {summary.closesGap
                  ? 'The top three close the projected gap'
                  : `Projected ${summary.projectedWeekEnd} kg — still ${summary.gapToTarget} kg over`}
              </Badge>
            )
          }
          className="mb-4"
        />

        {recs.length === 0 ? (
          <EmptyState
            icon="target"
            title="No substitution has enough evidence yet"
            body={recommendations.summary?.note || 'Log a few more trips and meals and the ranker will have something concrete to model.'}
          />
        ) : (
          <>
            <div className="grid gap-3 lg:grid-cols-2">
              {recs.map((r, i) => (
                <div
                  key={r.id}
                  className={`rounded-xl border p-3.5 ${i === 0 ? 'border-primary/35 bg-primary/6' : 'border-outline-variant/40 bg-surface-container-low/50'}`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[13px] font-bold ${
                        i === 0 ? 'bg-sheen text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
                      }`}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[13px] font-semibold text-on-surface">{r.label}</span>
                        <Badge tone={r.effort === 'low' ? 'live' : r.effort === 'moderate' ? 'info' : 'warn'}>{r.effort} effort</Badge>
                        <Badge tone={r.confidence === 'high' ? 'live' : 'neutral'}>{r.confidence} confidence</Badge>
                      </div>
                      <p className="mt-1 text-[11.5px] leading-snug text-on-surface-variant">{r.detail}</p>
                      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                        <span className="tabular text-[16px] font-bold text-primary">{r.savingPerWeekKg} kg</span>
                        <span className="text-[11px] text-on-surface-variant">per week</span>
                        <span className="tabular text-[11px] text-on-surface-variant">{r.savingPerMonthKg} kg/month</span>
                        <span className="tabular text-[11px] text-on-surface-variant">{r.annualKg} kg/year</span>
                      </div>
                      <div className="mt-1.5 font-mono text-[10.5px] leading-relaxed text-outline">{r.maths}</div>
                      <div className="mt-1 text-[10.5px] text-outline">
                        Evidence: {r.evidence} · {r.eventsPerWeek}×/week typical · {r.shareOfFootprint}% of a typical week
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-3 border-t border-outline-variant/40 pt-4 sm:grid-cols-4">
              <MiniStat label="Typical weekly footprint" value={summary.weeklyFootprint} unit="kg" />
              <MiniStat label="Weekly target" value={summary.weeklyTarget} unit="kg" />
              <MiniStat label="Achievable saving" value={summary.achievableWeeklySaving} unit="kg/wk" tone="text-primary" />
              <MiniStat
                label="Projected week end"
                value={summary.projectedWeekEnd}
                unit="kg"
                tone={summary.closesGap ? 'text-primary' : 'text-amber'}
              />
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-outline">
              Savings are computed with the same engine that writes the ledger, so a recommendation can never claim a number the
              app would not then record. A swap is only proposed when you actually log that activity — advice about habits you do
              not have is noise.
            </p>
          </>
        )}
      </Card>

      {/* -------------------------------------------------------- classifier */}
      <Card className="animate-fade-up p-5">
        <SectionHeading
          eyebrow={
            <>
              <Icon name="cpu" size={12} className="text-primary" />
              Complement Naive Bayes · sublinear TF unigrams + bigrams · length-normalised, temperature-calibrated
            </>
          }
          title="Activity text classifier"
          subtitle="Reads free text and files it under the right category — it powers the copilot's natural-language logging, and it retrains on this deployment's confirmed corrections, so it sharpens as you use it."
          className="mb-4"
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="classifier-input">
              Try it — describe an activity in your own words
            </label>
            <div className="flex gap-2">
              <input
                id="classifier-input"
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && classify()}
                className="input"
                placeholder='e.g. "caught the metro across town"'
              />
              <button onClick={() => classify()} disabled={predicting} className="btn-primary flex-shrink-0">
                <Icon name={predicting ? 'reset' : 'sparkles'} size={15} className={predicting ? 'animate-spin' : ''} />
                Classify
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {[
                'I drove 20 km to the office',
                'took the metro across town',
                'ran the dishwasher for two hours',
                'had a lentil curry for lunch',
                'ate a beef burger',
                'what is my footprint so far?',
              ].map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setText(s);
                    classify(s);
                  }}
                  className="chip-off"
                >
                  {s}
                </button>
              ))}
            </div>

            {prediction && (
              <div className="mt-4 rounded-xl border border-outline-variant/40 bg-surface-container-low/50 p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  {prediction.category ? (
                    <>
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-lg"
                        style={{
                          background: `${CATEGORY_META[prediction.category]?.color || '#006948'}22`,
                          color: CATEGORY_META[prediction.category]?.color || '#006948',
                        }}
                      >
                        <Icon name={CATEGORY_META[prediction.category]?.icon || 'leaf'} size={16} />
                      </span>
                      <span className="text-[14px] font-bold text-on-surface">{labelOf(prediction.category)}</span>
                      <Badge tone="live">{(prediction.confidence * 100).toFixed(1)}% confidence</Badge>
                      <span className="tabular text-[11px] text-on-surface-variant">
                        margin +{(prediction.margin * 100).toFixed(1)} pts
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container-high text-on-surface-variant">
                        <Icon name="shield" size={16} />
                      </span>
                      <span className="text-[14px] font-bold text-on-surface">Not an activity</span>
                      <Badge tone="warn">
                        refused · best guess {prediction.label} at {(prediction.confidence * 100).toFixed(1)}%
                      </Badge>
                    </>
                  )}
                </div>

                <div className="mt-3 flex flex-col gap-1.5">
                  {(prediction.ranked || []).map((r) => (
                    <MetricBar
                      key={r.label}
                      label={labelOf(r.label)}
                      value={r.probability}
                      tone={r.label === prediction.label ? 'primary' : 'amber'}
                      display={`${(r.probability * 100).toFixed(1)}%`}
                    />
                  ))}
                </div>

                {prediction.evidence?.length > 0 && (
                  <div className="mt-3 border-t border-outline-variant/40 pt-2.5">
                    <div className="muted-label mb-1.5">Terms that drove this decision</div>
                    <div className="flex flex-wrap gap-1.5">
                      {prediction.evidence.map((e) => (
                        <span key={e.term} className="pill bg-primary/10 text-primary">
                          {e.term} <span className="tabular opacity-70">+{e.weight}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="mt-2.5 text-[11px] leading-relaxed text-outline">
                  Below the confidence threshold the model answers &ldquo;not an activity&rdquo; instead of forcing a six-way
                  choice. A classifier that cannot say &ldquo;I don&apos;t know&rdquo; will happily misfile your shopping list.
                </p>
              </div>
            )}
          </div>

          <div>
            <h3 className="muted-label mb-2.5">Held-out performance — per class</h3>
            <div className="flex flex-col gap-1.5">
              {perClass.map((p) => (
                <MetricBar
                  key={p.label}
                  label={`${labelOf(p.label)} (${p.support})`}
                  value={p.f1}
                  wide
                  tone={p.f1 >= 0.8 ? 'primary' : p.f1 >= 0.6 ? 'amber' : 'rose'}
                />
              ))}
            </div>

            <h3 className="muted-label mb-2.5 mt-5">Confusion matrix</h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[10.5px]">
                <thead>
                  <tr>
                    <th className="px-1.5 py-1 text-left font-semibold text-outline">actual ↓ / predicted →</th>
                    {classLabels.map((l) => (
                      <th key={l} className="px-1.5 py-1 text-center font-semibold text-outline">
                        {labelOf(l).split(' ')[0]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {classLabels.map((row) => {
                    const rowTotal = Object.values(confusion[row] || {}).reduce((a, b) => a + b, 0) || 1;
                    return (
                      <tr key={row}>
                        <td className="whitespace-nowrap px-1.5 py-1 font-medium text-on-surface-variant">{labelOf(row)}</td>
                        {classLabels.map((col) => {
                          const v = confusion[row]?.[col] || 0;
                          return (
                            <td key={col} className="px-1 py-1 text-center">
                              <span
                                className={`tabular inline-flex h-6 w-7 items-center justify-center rounded-md font-semibold ${
                                  v === 0 ? 'text-outline/50' : 'text-on-surface'
                                }`}
                                style={{
                                  background: v === 0 ? 'transparent' : `rgb(var(--primary) / ${0.12 + (v / rowTotal) * 0.6})`,
                                }}
                              >
                                {v}
                              </span>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-outline-variant/40 pt-3.5 sm:grid-cols-4">
              <MiniStat label="Accuracy" value={`${((classifier.metrics?.accuracy ?? 0) * 100).toFixed(1)}%`} />
              <MiniStat label="Macro F1" value={(classifier.metrics?.macroF1 ?? 0).toFixed(3)} />
              <MiniStat label="Log loss" value={(classifier.metrics?.logLoss ?? 0).toFixed(3)} />
              <MiniStat label="Temperature" value={(classifier.metrics?.temperature ?? 1).toFixed(2)} />
            </div>
            <p className="mt-2.5 text-[11px] leading-relaxed text-outline">
              {classifier.sampleCount} labelled phrases over a {classifier.vocabularySize}-term vocabulary, retrained{' '}
              {classifier.trainRuns}× in this process ({classifier.lastTrainMs} ms last run). Temperature scaling is fitted on the
              hold-out set so the percentages mean what they say — an overconfident model is worse than an accurate one that
              knows its limits.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
