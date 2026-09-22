import * as activityRepository from '../../db/repositories/activityRepository.js';
import * as factorRepository from '../../db/repositories/factorRepository.js';
import * as targetRepository from '../../db/repositories/targetRepository.js';
import { currentWeekRange, weekProgress } from '../../domain/week.js';
import { callOpenAI, llmEnabled } from './llm.js';
import { forecastReport } from '../ml/forecast.js';
import { recommendInterventions } from '../ml/recommend.js';
import { detectAnomalies } from '../ml/anomaly.js';

// ---------------------------------------------------------------------------
// AI audit.
// Deterministic analysis (works with no API key): hotspot attribution, week-end
// projection, quantified swap suggestions and a prioritised next best action.
// Optional LLM polish rewrites the narrative when a key is configured.
//
// The projection and the next best action are not heuristics any more — they
// come from the ML layer: the week-end figure is the trained forecast blended
// with actuals-to-date, and the recommendation is the top-ranked intervention
// from the prescriptive model. The report therefore stays internally consistent
// with the ML Lab page.
// ---------------------------------------------------------------------------

const SWAPS = {
  car: { text: 'Swap short car trips for the bus or a bike', savingPerUnit: 0.12, unit: 'km' },
  bus: { text: 'Public transit is already your lowest-carbon wheel', savingPerUnit: 0, unit: 'km' },
  flight: { text: 'Replace the next short-haul flight with rail', savingPerUnit: 0.25, unit: 'km' },
  electricity: { text: 'Shift heavy appliance use off-peak and trim standby load', savingPerUnit: 0.16, unit: 'kWh' },
  veg_meal: { text: 'Keep the plant-based streak going', savingPerUnit: 0, unit: 'meal' },
  non_veg_meal: { text: 'Swap one non-veg meal a week for a plant-based one', savingPerUnit: 1.5, unit: 'meal' },
};

export async function buildAudit() {
  const [activities, factors, target] = await Promise.all([
    activityRepository.find({}),
    factorRepository.all(),
    targetRepository.get(),
  ]);

  const { start, end } = currentWeekRange();
  const weekActivities = activities.filter((a) => a.date >= start && a.date <= end);
  const weekUsed = Number(weekActivities.reduce((sum, a) => sum + a.co2, 0).toFixed(2));
  const { daysElapsed, daysRemaining } = weekProgress();

  const byCategory = Object.fromEntries(Object.keys(factors).map((type) => [type, 0]));
  for (const a of weekActivities) byCategory[a.type] = Number((byCategory[a.type] + a.co2).toFixed(2));
  const ranked = Object.entries(byCategory).filter(([, kg]) => kg > 0).sort((a, b) => b[1] - a[1]);

  const insights = [];

  if (ranked.length) {
    const [type, value] = ranked[0];
    const share = weekUsed > 0 ? Math.round((value / weekUsed) * 100) : 0;
    const swap = SWAPS[type];
    const entries = weekActivities.filter((a) => a.type === type);
    const avgQty = entries.reduce((sum, a) => sum + a.quantity, 0) / Math.max(entries.length, 1);
    const monthlySaving = Number((Math.min(avgQty, 30) * (swap?.savingPerUnit || 0) * 4).toFixed(1));
    insights.push({
      severity: share >= 50 ? 'high' : 'med',
      icon: type,
      title: `${factors[type].label} dominates your week`,
      detail: `${value.toFixed(1)} kg CO₂ (${share}% of this week). ${swap?.text || 'Consider a lower-carbon alternative'}${
        monthlySaving > 0 ? ` — worth about ${monthlySaving} kg CO₂ a month.` : '.'
      }`,
    });
  }

  const biggest = [...activities].sort((a, b) => b.co2 - a.co2)[0];
  if (biggest && biggest.co2 > 10) {
    insights.push({
      severity: 'med',
      icon: biggest.type,
      title: `Your single largest entry: ${biggest.co2.toFixed(1)} kg`,
      detail: `${factors[biggest.type].label} · ${biggest.quantity} ${factors[biggest.type].unit}${
        biggest.notes ? ` · ${biggest.notes}` : ''
      }. Big one-off events are where the largest cuts live — one change here beats a month of micro-tweaks.`,
    });
  }

  // ---- model-driven projection ------------------------------------------
  // The forecast blends actuals-to-date with a per-day prediction for the
  // remaining days, so a Monday glance and a Sunday glance are not extrapolated
  // by the same naive run-rate.
  const forecast = forecastReport(activities, { target: target.weeklyTarget });
  const projection = forecast.currentWeek?.projectedTotal ?? (daysElapsed > 0 ? Number(((weekUsed / daysElapsed) * 7).toFixed(2)) : 0);
  const interval = forecast.intervals || null;
  const confident = forecast.confidence || 'low';

  if (target.weeklyTarget > 0) {
    const over = projection > target.weeklyTarget;
    insights.push({
      severity: over ? 'high' : 'low',
      icon: 'target',
      title: over
        ? `Forecast to finish the week at ${projection} kg`
        : `Forecast to finish under target (${projection} kg)`,
      detail: over
        ? `The forecast model blends ${weekUsed} kg logged so far with predictions for the ${daysRemaining} remaining day(s)${
            interval ? ` (±${interval.q80} kg at 80% confidence)` : ''
          }, landing ${(projection - target.weeklyTarget).toFixed(1)} kg over your ${target.weeklyTarget} kg target. Forecast confidence: ${confident}.`
        : `The model lands ${(target.weeklyTarget - projection).toFixed(1)} kg under your ${target.weeklyTarget} kg target${
            interval ? ` (±${interval.q80} kg at 80% confidence)` : ''
          }. Forecast confidence: ${confident}.`,
    });
  }

  // ---- input integrity ---------------------------------------------------
  const anomalies = detectAnomalies(activities);
  if (anomalies.stats?.flagged > 0) {
    const worst = anomalies.scored.filter((s) => s.isOutlier).sort((a, b) => b.score - a.score)[0];
    insights.push({
      severity: 'med',
      icon: worst.type,
      title: `${anomalies.stats.flagged} entr${anomalies.stats.flagged === 1 ? 'y' : 'ies'} look inconsistent with your ledger`,
      detail: `Highest score: ${worst.quantity} of ${factors[worst.type]?.label || worst.type} on ${worst.date} — ${worst.reasons[0] || 'outside the learned normal range'}. Nothing was changed automatically; check History if that was a typo.`,
    });
  }

  if (!insights.length) {
    insights.push({
      severity: 'low',
      icon: 'spark',
      title: 'No data to analyse yet',
      detail: 'Log a few activities and the copilot will surface hotspots, a week-end projection and the highest-leverage swap.',
    });
  }

  // ---- prescriptive next best action -------------------------------------
  const recommendations = recommendInterventions(activities, factors, {
    weeklyTarget: target.weeklyTarget,
    forecast,
  });
  const best = recommendations.bestNext;
  const nextBestAction = best
    ? `${best.label} — about ${best.savingPerWeekKg} kg CO₂/week (${best.savingPerMonthKg} kg/month), ${best.confidence} confidence.`
    : ranked.length
      ? SWAPS[ranked[0][0]]?.text || 'Log a few more activities to unlock a targeted suggestion.'
      : 'Log your first activity to start the audit.';

  return {
    generatedAt: new Date().toISOString(),
    engine: llmEnabled() ? 'hybrid (rules + ML + LLM)' : 'rules + ML',
    weekStart: start,
    weekEnd: end,
    weekUsed,
    target: target.weeklyTarget,
    projection,
    daysRemaining,
    insights,
    nextBestAction,
    byCategory,
    // Model provenance, so the UI can show where the numbers came from.
    model: {
      projectionMethod: 'ensemble forecast blended with actuals-to-date',
      selectedModel: forecast.selectedModel || null,
      confidence: forecast.confidence || 'low',
      interval80: interval?.q80 ?? null,
      backtestMae: forecast.accuracy?.mae ?? null,
      backtestSmape: forecast.accuracy?.smape ?? null,
      anomalyCount: anomalies.stats?.flagged ?? 0,
      topRecommendation: best ? { id: best.id, savingPerWeekKg: best.savingPerWeekKg, confidence: best.confidence } : null,
    },
  };
}

export async function polishAudit(audit) {
  const text = await callOpenAI(
    [
      {
        role: 'system',
        content:
          'You are a concise carbon analyst. Given audit JSON, return ONLY JSON: {"summary": string, "nextBestAction": string}. ' +
          'summary: max 45 words, encouraging, never shaming, cite the key number. nextBestAction: one concrete quantified action under 25 words.',
      },
      {
        role: 'user',
        content: JSON.stringify({
          weekUsed: audit.weekUsed,
          target: audit.target,
          projection: audit.projection,
          byCategory: audit.byCategory,
          insights: audit.insights.map((i) => i.title),
        }),
      },
    ],
    260
  );
  if (!text) return null;
  try {
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());
    return typeof parsed.summary === 'string' ? parsed : null;
  } catch {
    return null;
  }
}
