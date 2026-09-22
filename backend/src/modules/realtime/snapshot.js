import * as activityRepository from '../../db/repositories/activityRepository.js';
import * as targetRepository from '../../db/repositories/targetRepository.js';
import * as factorRepository from '../../db/repositories/factorRepository.js';
import { summarise } from '../analytics/service.js';
import { currentWeekRange, weekProgress, paceOf } from '../../domain/week.js';

// ---------------------------------------------------------------------------
// Live snapshot.
// A compact, already-aggregated view of the ledger that is pushed over SSE the
// instant anything changes. Clients render straight from this payload, so the
// dashboard, targets and header update with zero HTTP round-trips.
// ---------------------------------------------------------------------------

export async function buildSnapshot({ recentLimit = 6 } = {}) {
  const [activities, factors, target] = await Promise.all([
    activityRepository.find({}),
    factorRepository.all(),
    targetRepository.get(),
  ]);

  const { total, byCategory } = summarise(activities, factors);
  const { start, end } = currentWeekRange();
  const { daysElapsed, daysRemaining } = weekProgress();
  const weekActivities = activities.filter((a) => a.date >= start && a.date <= end);
  const weekUsed = Number(weekActivities.reduce((sum, a) => sum + a.co2, 0).toFixed(2));
  const pct = target.weeklyTarget > 0 ? Math.round((weekUsed / target.weeklyTarget) * 100) : 0;
  const elapsedPct = Math.round((daysElapsed / 7) * 100);

  const ranked = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const topCategory = ranked.length && ranked[0][1] > 0
    ? {
        type: ranked[0][0],
        label: factors[ranked[0][0]].label,
        co2: ranked[0][1],
        share: total > 0 ? Math.round((ranked[0][1] / total) * 100) : 0,
      }
    : null;

  const activeDays = new Set(activities.map((a) => a.date)).size || 1;
  const scopeBreakdown = {};
  for (const a of activities) {
    const scope = factors[a.type]?.scope || 'scope-3';
    scopeBreakdown[scope] = Number(((scopeBreakdown[scope] || 0) + a.co2).toFixed(2));
  }

  return {
    total,
    byCategory,
    activityCount: activities.length,
    dailyAverage: Number((total / activeDays).toFixed(2)),
    activeDays,
    topCategory,
    scopeBreakdown,
    week: {
      start,
      end,
      used: weekUsed,
      target: target.weeklyTarget,
      pct,
      exceeded: weekUsed > target.weeklyTarget,
      pace: paceOf(pct, elapsedPct),
      daysElapsed,
      daysRemaining,
      elapsedPct,
      remaining: Number(Math.max(target.weeklyTarget - weekUsed, 0).toFixed(2)),
    },
    projection: Number(((daysElapsed > 0 ? weekUsed / daysElapsed : 0) * 7).toFixed(2)),
    recent: activities.slice(0, recentLimit).map((a) => ({
      id: String(a._id),
      type: a.type,
      label: factors[a.type]?.label || a.type,
      quantity: a.quantity,
      unit: factors[a.type]?.unit || '',
      co2: a.co2,
      date: a.date,
      notes: a.notes || '',
    })),
    at: new Date().toISOString(),
  };
}
