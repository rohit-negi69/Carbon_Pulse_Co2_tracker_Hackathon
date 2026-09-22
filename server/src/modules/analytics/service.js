import * as activityRepository from '../../db/repositories/activityRepository.js';
import * as targetRepository from '../../db/repositories/targetRepository.js';
import * as summaryRepository from '../../db/repositories/summaryRepository.js';
import * as factorRepository from '../../db/repositories/factorRepository.js';
import { currentWeekRange, previousWeekRange, weekProgress, paceOf, toDateStr } from '../../domain/week.js';

// ---------------------------------------------------------------------------
// Analytics & Aggregation
// All footprint maths lives here so routes stay thin.
// ---------------------------------------------------------------------------

const round = (n) => Number(n.toFixed(2));

export function emptyByCategory(factors) {
  return Object.fromEntries(Object.keys(factors).map((type) => [type, 0]));
}

export function summarise(activities, factors) {
  const total = round(activities.reduce((sum, a) => sum + a.co2, 0));
  const byCategory = emptyByCategory(factors);
  for (const a of activities) byCategory[a.type] = round((byCategory[a.type] || 0) + a.co2);
  return { total, byCategory };
}

export async function dashboard() {
  const [activities, factors] = await Promise.all([activityRepository.find({}), factorRepository.all()]);
  const target = (await targetRepository.get()).weeklyTarget;
  const { total, byCategory } = summarise(activities, factors);

  const week = currentWeekRange();
  const weekActivities = activities.filter((a) => a.date >= week.start && a.date <= week.end);
  const weekUsed = round(weekActivities.reduce((sum, a) => sum + a.co2, 0));

  const ranked = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const topCategory = ranked.length && ranked[0][1] > 0
    ? { type: ranked[0][0], label: factors[ranked[0][0]].label, co2: ranked[0][1], share: total > 0 ? Math.round((ranked[0][1] / total) * 100) : 0 }
    : null;

  const activeDays = new Set(activities.map((a) => a.date)).size || 1;

  return {
    total,
    byCategory,
    activityCount: activities.length,
    dailyAverage: round(total / activeDays),
    activeDays,
    topCategory,
    scopeBreakdown: scopeBreakdown(activities, factors),
    week: {
      ...week,
      used: weekUsed,
      target,
      pct: target > 0 ? Math.round((weekUsed / target) * 100) : 0,
      exceeded: weekUsed > target,
    },
  };
}

// Scope 1/2/3 view — the dashboard's "audit trail" framing.
export function scopeBreakdown(activities, factors) {
  const out = {};
  for (const a of activities) {
    const scope = factors[a.type]?.scope || 'scope-3';
    out[scope] = round((out[scope] || 0) + a.co2);
  }
  return out;
}

export async function week() {
  const { start, end } = currentWeekRange();
  const [activities, target] = await Promise.all([
    activityRepository.find({ from: start, to: end }),
    targetRepository.get(),
  ]);
  const used = round(activities.reduce((sum, a) => sum + a.co2, 0));
  const { daysElapsed, daysRemaining } = weekProgress();
  const pct = target.weeklyTarget > 0 ? Math.round((used / target.weeklyTarget) * 100) : 0;
  const elapsedPct = Math.round((daysElapsed / 7) * 100);

  return {
    start,
    end,
    daysElapsed,
    daysRemaining,
    elapsedPct,
    used,
    target: target.weeklyTarget,
    pct,
    exceeded: used > target.weeklyTarget,
    pace: paceOf(pct, elapsedPct),
    remaining: round(Math.max(target.weeklyTarget - used, 0)),
  };
}

// Charts & Insights payload: daily trend, weekday profile, category mix and a
// comparison against the previous week (plus a persisted weekly rollup).
export async function insights() {
  const [activities, factors] = await Promise.all([activityRepository.find({}), factorRepository.all()]);
  const target = (await targetRepository.get()).weeklyTarget;
  const week = currentWeekRange();
  const prev = previousWeekRange();

  const thisWeek = activities.filter((a) => a.date >= week.start && a.date <= week.end);
  const lastWeek = activities.filter((a) => a.date >= prev.start && a.date <= prev.end);

  // 14-day daily trend
  const trend = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = toDateStr(d);
    const dayTotal = round(activities.filter((a) => a.date === key).reduce((sum, a) => sum + a.co2, 0));
    trend.push({ date: key, label: key.slice(5), kg: dayTotal, isCurrentWeek: key >= week.start });
  }

  // Weekday profile over all history
  const weekdayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const weekdayTotals = weekdayNames.map((name) => ({ name, kg: 0, count: 0 }));
  for (const a of activities) {
    const [y, m, d] = a.date.split('-').map(Number);
    const idx = (new Date(y, m - 1, d).getDay() + 6) % 7;
    weekdayTotals[idx].kg = round(weekdayTotals[idx].kg + a.co2);
    weekdayTotals[idx].count += 1;
  }

  const { byCategory } = summarise(activities, factors);
  const mix = Object.entries(byCategory)
    .filter(([, kg]) => kg > 0)
    .map(([type, kg]) => ({ type, label: factors[type].label, kg, share: 0 }))
    .sort((a, b) => b.kg - a.kg);
  const total = mix.reduce((sum, slice) => sum + slice.kg, 0);
  mix.forEach((slice) => (slice.share = total > 0 ? Math.round((slice.kg / total) * 100) : 0));

  const thisWeekTotal = round(thisWeek.reduce((sum, a) => sum + a.co2, 0));
  const lastWeekTotal = round(lastWeek.reduce((sum, a) => sum + a.co2, 0));
  const deltaPct = lastWeekTotal > 0 ? Math.round(((thisWeekTotal - lastWeekTotal) / lastWeekTotal) * 100) : null;

  const period = isoWeekKey(new Date());
  await summaryRepository.upsert(period, {
    start: week.start,
    end: week.end,
    total: thisWeekTotal,
    byCategory: summarise(thisWeek, factors).byCategory,
    activityCount: thisWeek.length,
    target,
    exceeded: thisWeekTotal > target,
  });

  const days = Math.max(weekProgress().daysElapsed, 1);
  return {
    weekStart: week.start,
    weekEnd: week.end,
    thisWeekTotal,
    lastWeekTotal,
    deltaPct,
    projection: round((thisWeekTotal / days) * 7),
    target,
    trend,
    weekdayTotals,
    mix,
    scopeBreakdown: scopeBreakdown(activities, factors),
    summaries: (await summaryRepository.recent(6)).map((s) => ({
      period: s.period,
      total: s.total,
      target: s.target,
      exceeded: s.exceeded,
      activityCount: s.activityCount,
    })),
  };
}

export function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// CSV export of the (filtered) ledger for auditors.
export async function exportCsv(filters) {
  const [activities, factors] = await Promise.all([activityRepository.find(filters), factorRepository.all()]);
  const header = ['date', 'type', 'label', 'quantity', 'unit', 'factor_kg_per_unit', 'co2_kg', 'tier', 'scope', 'notes'];
  const lines = activities.map((a) => {
    const f = factors[a.type] || {};
    const notes = (a.notes || '').replace(/[",\n]/g, ' ');
    return [a.date, a.type, f.label || a.type, a.quantity, f.unit || '', f.factor ?? a.factorUsed ?? '', a.co2, a.tier || '', f.scope || '', `"${notes}"`].join(',');
  });
  return { csv: [header.join(','), ...lines].join('\n'), count: activities.length };
}
