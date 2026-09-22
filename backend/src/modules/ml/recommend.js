import { mean, median, quantile, round, clamp } from './stats.js';
import { CATEGORY_TYPES } from '../../domain/factors.js';

// ---------------------------------------------------------------------------
// Prescriptive layer.
//
// The audit module describes the past; this module ranks what to do next. Every
// candidate is grounded in the user's *own* quantities — "you average 34 km of
// car travel on the days you drive" beats a generic "drive less" — and every
// saving is computed with the same fixed factors the ledger uses, so the
// number shown is exactly what would be recorded if the swap happened.
//
// Confidence comes from sample size and dispersion, not from optimism: a swap
// suggested from two observations is labelled low-confidence instead of
// presented as fact.
// ---------------------------------------------------------------------------

/** Plausible substitutions, expressed as a fraction of the original quantity. */
const CANDIDATES = [
  {
    id: 'car-to-bus',
    from: 'car',
    to: 'bus',
    ratio: 0.7,
    label: 'Shift car kilometres to the bus',
    detail: 'Bus travel is 0.08 kg/km against 0.20 kg/km for a car — a 60% cut per kilometre.',
    feasibility: 0.75,
    effort: 'moderate',
  },
  {
    id: 'car-to-active',
    from: 'car',
    to: null,
    ratio: 0.25,
    label: 'Replace short car trips with walking or cycling',
    detail: 'Trips under ~5 km are usually walkable, and those kilometres disappear entirely.',
    feasibility: 0.6,
    effort: 'moderate',
  },
  {
    id: 'flight-to-rail',
    from: 'flight',
    to: 'bus',
    ratio: 0.4,
    label: 'Take rail instead of short-haul flights',
    detail: 'Rail on a comparable route is roughly 0.08 kg/km versus 0.25 kg/km in the air.',
    feasibility: 0.35,
    effort: 'high',
  },
  {
    id: 'flight-short-haul',
    from: 'flight',
    to: null,
    ratio: 0.2,
    label: 'Drop one short-haul flight',
    detail: 'Flights dominate most ledgers because a single trip outweighs weeks of commuting.',
    feasibility: 0.4,
    effort: 'high',
  },
  {
    id: 'grid-off-peak',
    from: 'electricity',
    to: null,
    ratio: 0.15,
    label: 'Move heavy appliance loads off the evening peak',
    detail: 'Grid carbon intensity swings through the day; shifting laundry and charging cuts the effective factor.',
    feasibility: 0.8,
    effort: 'low',
  },
  {
    id: 'electricity-demand',
    from: 'electricity',
    to: null,
    ratio: 0.12,
    label: 'Trim standby and heating setpoints',
    detail: 'Electricity is 0.80 kg/kWh — small continuous loads compound at that price.',
    feasibility: 0.85,
    effort: 'low',
  },
  {
    id: 'meal-swap',
    from: 'non_veg_meal',
    to: 'veg_meal',
    ratio: 0.5,
    label: 'Swap half of your non-veg meals for vegetarian',
    detail: 'Non-veg is 2.0 kg per meal against 0.5 kg — the highest per-unit factor in the brief.',
    feasibility: 0.7,
    effort: 'low',
  },
];

/**
 * Rank interventions for this ledger.
 *
 * @param {Array} activities
 * @param {Object} factors registry { type: {label, unit, factor} }
 * @param {Object} opts { weeklyTarget, forecast }
 */
export function recommendInterventions(activities, factors, { weeklyTarget = 50, forecast = null } = {}) {
  const factorOf = (type) => factors?.[type]?.factor ?? 0;
  const unitOf = (type) => factors?.[type]?.unit ?? 'units';

  // Per-category daily average is the right scale: "per week" only makes sense
  // once we know how often the user actually does the thing.
  const activeDays = new Set(activities.map((a) => a.date)).size || 1;
  const byCategory = Object.fromEntries(CATEGORY_TYPES.map((t) => [t, []]));
  for (const a of activities) if (byCategory[a.type]) byCategory[a.type].push(a.quantity);

  const stats = Object.fromEntries(
    CATEGORY_TYPES.map((t) => {
      const qty = byCategory[t];
      const totalKg = qty.reduce((acc, q) => acc + q * factorOf(t), 0);
      return [
        t,
        {
          observations: qty.length,
          meanQuantity: round(mean(qty), 2),
          typicalQuantity: round(median(qty), 2),
          p75Quantity: round(quantile(qty, 0.75) || 0, 2),
          totalKg: round(totalKg, 2),
          kgPerActiveDay: round(totalKg / activeDays, 2),
          share: 0,
        },
      ];
    })
  );

  const grandTotal = Object.values(stats).reduce((acc, s) => acc + s.totalKg, 0) || 1;
  for (const t of CATEGORY_TYPES) stats[t].share = round((stats[t].totalKg / grandTotal) * 100, 1);

  const weeklyHorizon = 7;
  const ranked = CANDIDATES.map((candidate) => {
    const source = stats[candidate.from];
    if (!source || source.observations < 1) return null;

    // Only propose a swap the user actually does, and only if it is material.
    if (source.share < 3) return null;

    const displacedQuantity = source.typicalQuantity * candidate.ratio;
    const fromFactor = factorOf(candidate.from);
    const toFactor = candidate.to ? factorOf(candidate.to) : 0;

    const beforeKg = displacedQuantity * fromFactor;
    const afterKg = displacedQuantity * toFactor;
    const savingPerEvent = beforeKg - afterKg;
    if (savingPerEvent <= 0) return null;

    const eventsPerWeek = clamp((source.observations / activeDays) * weeklyHorizon, 0.2, weeklyHorizon);
    const savingPerWeek = (savingPerEvent * eventsPerWeek * candidate.feasibility) / 1;

    // Confidence from how much evidence we have and how consistent it is.
    const spread = source.p75Quantity > 0 ? source.p75Quantity / Math.max(source.typicalQuantity, 0.001) : 1;
    const evidence = clamp(source.observations / 8, 0, 1);
    const consistency = clamp(1 / Math.max(spread, 1), 0.2, 1);
    const confidenceScore = round(evidence * 0.6 + consistency * 0.4, 3);

    return {
      id: candidate.id,
      label: candidate.label,
      detail: candidate.detail,
      effort: candidate.effort,
      feasibility: candidate.feasibility,
      from: candidate.from,
      to: candidate.to,
      fromLabel: factors?.[candidate.from]?.label ?? candidate.from,
      toLabel: candidate.to ? factors?.[candidate.to]?.label ?? candidate.to : null,
      unit: unitOf(candidate.from),
      displacedPerEvent: round(displacedQuantity, 2),
      savingPerEventKg: round(savingPerEvent, 2),
      eventsPerWeek: round(eventsPerWeek, 2),
      savingPerWeekKg: round(savingPerWeek, 2),
      savingPerMonthKg: round(savingPerWeek * 4.345, 2),
      annualKg: round(savingPerWeek * 52, 1),
      shareOfFootprint: round((savingPerWeek / Math.max(grandTotal / Math.max(activeDays / 7, 1), 0.001)) * 100, 1),
      confidence: confidenceScore >= 0.7 ? 'high' : confidenceScore >= 0.4 ? 'moderate' : 'low',
      confidenceScore,
      evidence: `${source.observations} logged ${source.observations === 1 ? 'occurrence' : 'occurrences'}`,
      // Efficiency = kg saved per unit of user effort, used for tie-breaking.
      efficiency: round(savingPerWeek / (candidate.effort === 'low' ? 1 : candidate.effort === 'moderate' ? 2 : 3), 2),
      maths: `${round(displacedQuantity, 2)} ${unitOf(candidate.from)} × (${fromFactor} − ${toFactor}) kg/${unitOf(candidate.from)} = ${round(savingPerEvent, 2)} kg per event`,
    };
  }).filter(Boolean);

  ranked.sort((a, b) => b.savingPerWeekKg - a.savingPerWeekKg);

  // Greedy "best next move": highest saving per unit of effort among confident ones.
  const viable = ranked.filter((r) => r.confidence !== 'low');
  const bestNext = [...(viable.length ? viable : ranked)].sort((a, b) => b.efficiency - a.efficiency)[0] || null;

  const combinedWeekly = ranked.slice(0, 3).reduce((acc, r) => acc + r.savingPerWeekKg, 0);
  const projected = forecast?.currentWeek?.projectedTotal ?? null;

  return {
    horizon: 'week',
    generatedFor: new Date().toISOString().slice(0, 10),
    categories: stats,
    recommendations: ranked,
    bestNext,
    summary: {
      weeklyFootprint: round(grandTotal / Math.max(activeDays / 7, 1), 2),
      weeklyTarget,
      gapToTarget: round(Math.max(grandTotal / Math.max(activeDays / 7, 1) - weeklyTarget, 0), 2),
      achievableWeeklySaving: round(combinedWeekly, 2),
      achievableFromTopThree: round(combinedWeekly, 2),
      // Plain boolean: does applying the top three substitutions bring the
      // forecast week back inside the target?
      closesGap: projected != null ? combinedWeekly >= Math.max(projected - weeklyTarget, 0) : null,
      projectedWeekEnd: projected,
      projectedAfterTopThree: projected != null ? round(Math.max(projected - combinedWeekly, 0), 2) : null,
    },
    note:
      ranked.length === 0
        ? 'Not enough history in any single category to rank a substitution yet — log a few more entries.'
        : `Ranked ${ranked.length} substitutions by modelled kg saved per week, weighted by how feasible each one is for you.`,
    method: 'Fixed brief factors × the user’s own typical quantities, scaled by feasibility; confidence from sample size and dispersion.',
  };
}
