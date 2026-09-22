// AI layer.
// - `buildAudit` is deterministic (works with no API key): it analyses the
//   user's real log and produces prioritised reduction insights, a week-end
//   projection, and a "next best action". Always available, instantly.
// - `polishAuditWithLLM` optionally rewrites the narrative when OPENAI_API_KEY
//   is configured, so the panel reads naturally.
import { FACTORS } from '../factors.js';
import { listActivities, getTarget } from '../db.js';
import { currentWeekRange, weekProgress } from '../week.js';
import { llmEnabled } from './llm.js';

const SWAPS = {
  car: { text: 'Swap short car trips for the bus or a bike', savingPerUnit: 0.12, unit: 'km' },
  flight: { text: 'Replace the next short-haul flight with rail', savingPerUnit: 0.25, unit: 'km' },
  electricity: { text: 'Shift heavy appliance use off-peak and trim standby load', savingPerUnit: 0.16, unit: 'kWh' },
  non_veg_meal: { text: 'Swap one non-veg meal a week for a plant-based one', savingPerUnit: 1.5, unit: 'meal' },
  veg_meal: { text: 'Keep the plant-based streak going', savingPerUnit: 0, unit: 'meal' },
  bus: { text: 'Public transit is already your lowest-carbon wheel', savingPerUnit: 0, unit: 'km' },
};

export async function buildAudit() {
  const acts = await listActivities({});
  const { start, end } = currentWeekRange();
  const weekActs = acts.filter((a) => a.date >= start && a.date <= end);
  const weekUsed = +weekActs.reduce((s, a) => s + a.co2, 0).toFixed(2);
  const target = await getTarget();
  const { daysElapsed, daysRemaining } = weekProgress();

  const byCategory = {};
  for (const t of Object.keys(FACTORS)) byCategory[t] = 0;
  for (const a of weekActs) byCategory[a.type] = +(byCategory[a.type] + a.co2).toFixed(2);
  const ranked = Object.entries(byCategory).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  const insights = [];

  if (ranked.length) {
    const [type, value] = ranked[0];
    const share = weekUsed > 0 ? Math.round((value / weekUsed) * 100) : 0;
    const swap = SWAPS[type];
    const avgQty = (weekActs.filter((a) => a.type === type).reduce((s, a) => s + a.quantity, 0) || 0) /
      Math.max(weekActs.filter((a) => a.type === type).length, 1);
    const saving = +(Math.min(avgQty, 30) * (swap?.savingPerUnit || 0) * 4).toFixed(1); // per-month estimate
    insights.push({
      severity: share >= 50 ? 'high' : 'med',
      title: `${FACTORS[type].label} dominates your week`,
      detail: `${value.toFixed(1)} kg CO₂ (${share}% of this week). ${swap?.text || 'Consider a lower-carbon alternative'}${saving > 0 ? ` — worth about ${saving} kg CO₂ a month.` : '.'}`,
      icon: type,
    });
  }

  const biggest = acts.slice().sort((a, b) => b.co2 - a.co2)[0];
  if (biggest && biggest.co2 > 10) {
    insights.push({
      severity: 'med',
      title: `Your single largest entry: ${biggest.co2.toFixed(1)} kg`,
      detail: `${FACTORS[biggest.type].label} · ${biggest.quantity} ${FACTORS[biggest.type].unit}${biggest.notes ? ` · ${biggest.notes}` : ''}. Big one-off events are where the largest cuts live — one change here beats a month of micro-tweaks.`,
      icon: biggest.type,
    });
  }

  // Week-end projection at the current daily rate
  const rate = daysElapsed > 0 ? weekUsed / daysElapsed : 0;
  const projection = +(rate * 7).toFixed(2);
  if (target > 0) {
    insights.push({
      severity: projection > target ? 'high' : 'low',
      title: projection > target ? `On track to finish the week at ${projection} kg` : `On track to finish under target (${projection} kg)`,
      detail: projection > target
        ? `At today's pace you'd end ${(projection - target).toFixed(1)} kg over your ${target} kg target, with ${daysRemaining} day(s) left. One swapped trip usually closes the gap.`
        : `Your current pace lands ${(target - projection).toFixed(1)} kg under your ${target} kg target. Nice work — keep the habits that got you here.`,
      icon: 'target',
    });
  }

  if (!insights.length) {
    insights.push({
      severity: 'low',
      title: 'No data to analyse yet',
      detail: 'Log a few activities and the copilot will surface hotspots, projections, and the highest-leverage swap for your week.',
      icon: 'spark',
    });
  }

  const nextBestAction = ranked.length
    ? SWAPS[ranked[0][0]]?.text || 'Log a few more activities to unlock a targeted suggestion.'
    : 'Log your first activity to start the audit.';

  return {
    generatedAt: new Date().toISOString(),
    engine: llmEnabled() ? 'hybrid (rules + LLM)' : 'rules',
    weekStart: start,
    weekEnd: end,
    weekUsed,
    target,
    projection,
    daysRemaining,
    insights,
    nextBestAction,
    byCategory,
  };
}

export async function polishAuditWithLLM(audit) {
  if (!llmEnabled()) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        max_tokens: 260,
        messages: [
          {
            role: 'system',
            content:
              'You are a concise carbon analyst. Given JSON audit data, return a JSON object {"summary": string, "nextBestAction": string}. ' +
              'Summary: max 45 words, encouraging, never shaming, cite the key number. nextBestAction: one concrete, quantified action under 25 words. Return JSON only.',
          },
          { role: 'user', content: JSON.stringify({ weekUsed: audit.weekUsed, target: audit.target, projection: audit.projection, byCategory: audit.byCategory, insights: audit.insights.map((i) => i.title) }) },
        ],
      }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const json = JSON.parse(text.replace(/```json|```/g, '').trim());
    return typeof json.summary === 'string' ? json : null;
  } catch {
    return null;
  }
}
