import { median, mad, robustZ, quantile, euclid, mean, round, clamp } from './stats.js';
import { CATEGORY_TYPES } from '../../domain/factors.js';
import { isoWeekday } from './features.js';

// ---------------------------------------------------------------------------
// Anomaly detection.
//
// DP2 asks how an obviously wrong entry should be treated. A hard-coded
// threshold can only ever say "too big"; this module can say *why*, using two
// complementary detectors:
//
//   1. Robust per-category z-score (median + MAD). Interpretable: "this car
//      trip is 9.4 scaled MADs above your typical car trip".
//   2. Local Outlier Factor over the pooled feature space
//      [log CO₂, category, weekday, recency]. Catches unusual *combinations* —
//      a mid-sized flight on a Tuesday when the user never flies midweek —
//      that a per-category magnitude test cannot see.
//
// The detectors are combined, but never silently: the ledger write path still
// asks for explicit confirmation (DP2) and always records what the user chose.
// ---------------------------------------------------------------------------

const K = 5; // LOF neighbourhood size

/** log1p keeps a 500,000 km entry from swamping a 5 km one in distance terms. */
const l1p = (v) => Math.log1p(Math.max(0, v));

function featuresOf(activity, index, total) {
  return [
    l1p(activity.co2),
    CATEGORY_TYPES.indexOf(activity.type) / Math.max(CATEGORY_TYPES.length - 1, 1),
    (isoWeekday(activity.date) - 1) / 6,
    total > 1 ? index / (total - 1) : 0,
  ];
}

/**
 * Local Outlier Factor (Breunig et al., 2000).
 *
 * For each point p: find its k nearest neighbours, average their reachability
 * distance to p to get the local reachability density, then compare that
 * density with the densities of its neighbours. A point in a sparse region
 * surrounded by dense neighbours scores well above 1.
 */
function localOutlierFactor(X, k = K) {
  const n = X.length;
  if (n <= k) return new Array(n).fill(1);

  // pairwise distances (n is small — the ledger window, not a data lake)
  const dist = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const d = euclid(X[i], X[j]);
      dist[i][j] = d;
      dist[j][i] = d;
    }
  }

  const kth = [];
  const neighbours = [];
  for (let i = 0; i < n; i += 1) {
    const order = Array.from({ length: n }, (_, j) => j)
      .filter((j) => j !== i)
      .sort((a, b) => dist[i][a] - dist[i][b]);
    const nb = order.slice(0, k);
    neighbours.push(nb);
    kth.push(dist[i][nb[nb.length - 1]]);
  }

  const reach = (i, j) => Math.max(kth[j], dist[i][j]);

  const lrd = neighbours.map((nb, i) => {
    const avgReach = mean(nb.map((j) => reach(i, j))) || 1e-9;
    return 1 / avgReach;
  });

  return neighbours.map((nb, i) => {
    const avg = mean(nb.map((j) => lrd[j] / (lrd[i] || 1e-9)));
    return Number(avg.toFixed(3));
  });
}

/**
 * Score every activity in the window.
 * @returns {{scored: Array, stats: Object, lofThreshold: number}}
 */
export function detectAnomalies(activities, { lofThreshold = 1.75 } = {}) {
  const rows = [...activities].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const n = rows.length;

  if (n < 6) {
    return {
      scored: rows.map((a) => ({ id: String(a._id), type: a.type, date: a.date, co2: a.co2, quantity: a.quantity, lof: 1, robustZ: 0, score: 0, isOutlier: false, reasons: [] })),
      stats: { sampleSize: n, note: 'Fewer than 6 entries — not enough data to establish a behavioural baseline.' },
      lofThreshold,
    };
  }

  const X = rows.map((a, i) => featuresOf(a, i, n));
  const lof = localOutlierFactor(X, K);

  // per-category robust scale on quantity
  const byCategory = {};
  for (const type of CATEGORY_TYPES) {
    const qty = rows.filter((a) => a.type === type).map((a) => a.quantity);
    byCategory[type] = {
      count: qty.length,
      median: round(median(qty), 3),
      mad: round(mad(qty), 3),
      p95: round(quantile(qty, 0.95) || 0, 3),
      max: qty.length ? Math.max(...qty) : 0,
    };
  }

  const scored = rows.map((a, i) => {
    const cat = byCategory[a.type];
    const z = cat.count >= 3 ? robustZ(a.quantity, rows.filter((r) => r.type === a.type).map((r) => r.quantity)) : 0;
    const score = round(Math.max(Math.abs(z) / 4, (lof[i] - 1) / (lofThreshold - 1)), 3);

    const reasons = [];
    if (Math.abs(z) >= 4) reasons.push(`${Math.abs(z).toFixed(1)}× the scaled MAD above your typical ${a.type.replace('_', ' ')} entry`);
    if (lof[i] >= lofThreshold) reasons.push(`unusual in context (LOF ${lof[i]}) — size, category and weekday rarely co-occur`);
    if (cat.p95 > 0 && a.quantity > cat.p95 * 3) reasons.push(`${a.quantity} ${a.unit || 'units'} is ${(a.quantity / cat.p95).toFixed(1)}× your 95th percentile for this category`);

    return {
      id: String(a._id),
      type: a.type,
      date: a.date,
      co2: a.co2,
      quantity: a.quantity,
      notes: a.notes || '',
      lof: lof[i],
      robustZ: round(z, 2),
      score: clamp(score, 0, 10),
      isOutlier: lof[i] >= lofThreshold || Math.abs(z) >= 4,
      reasons,
    };
  });

  const flagged = scored.filter((s) => s.isOutlier);
  const lofValues = scored.map((s) => s.lof);

  return {
    scored,
    stats: {
      sampleSize: n,
      medianLof: round(median(lofValues), 3),
      lofThreshold,
      flagged: flagged.length,
      flaggedShare: round((flagged.length / n) * 100, 1),
      byCategory,
      note:
        flagged.length === 0
          ? 'No entries look inconsistent with this ledger — every value sits inside the learned normal range.'
          : `${flagged.length} of ${n} entries sit outside the learned normal range.`,
    },
    lofThreshold,
  };
}

/**
 * Learn each user's *normal range* per category.
 *
 * The output is explicitly **advisory**, and `effectiveThreshold` is always the
 * brief's `sanityMax`. That separation is deliberate:
 *
 *  • The confirmation step (DP2) stays deterministic, so the same input is
 *    treated the same way on every deployment and can be graded by script.
 *  • The learned range cannot be poisoned. If the ceiling adapted, a single
 *    confirmed 500,000 km typo would permanently widen the user's "normal" and
 *    silently disable future detection — the failure mode that makes adaptive
 *    thresholds dangerous in production.
 *
 * What the learned range *does* buy is explanation: "9.4× your scaled MAD" is a
 * far more useful message than "value too large".
 */
export function learnedThresholds(activities, briefThresholds) {
  const out = {};
  for (const type of CATEGORY_TYPES) {
    const all = activities.filter((a) => a.type === type).map((a) => a.quantity);
    const brief = briefThresholds?.[type] ?? null;

    // Statistics are computed from plausible entries only — anything already
    // above the brief ceiling is a confirmed outlier and must not set the norm.
    const qty = brief == null ? all : all.filter((q) => q <= brief);

    if (qty.length < 3) {
      out[type] = {
        samples: all.length,
        usableSamples: qty.length,
        effectiveThreshold: brief,
        advisoryRange: null,
        source: 'brief default (not enough history to learn a range)',
        note: `Only ${qty.length} plausible entr${qty.length === 1 ? 'y' : 'ies'} of this type so far.`,
      };
      continue;
    }

    const centre = median(qty);
    const scale = mad(qty);
    const robustCeiling = round(centre + 6 * scale, 2);
    const observedCeiling = round((quantile(qty, 0.98) || centre) * 1.5, 2);
    const learned = round(Math.max(robustCeiling, observedCeiling), 2);

    out[type] = {
      samples: all.length,
      usableSamples: qty.length,
      median: round(centre, 2),
      mad: round(scale, 2),
      p95: round(quantile(qty, 0.95) || 0, 2),
      learnedNormalRange: learned,
      effectiveThreshold: brief,
      advisoryRange: learned,
      exceedsBrief: brief != null && learned > brief,
      source: brief == null ? 'learned' : 'brief default (learned range shown as advisory)',
      note:
        brief != null && learned > brief
          ? `Your normal usage already reaches ${learned}, above the ${brief} brief default. The confirmation step still uses ${brief} so behaviour stays predictable for everyone.`
          : `Confirmation triggers above ${brief ?? learned}; typical entries sit under ${round(centre + scale, 2)}.`,
    };
  }
  return out;
}
