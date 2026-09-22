import { CATEGORY_TYPES } from '../../domain/factors.js';
import { toDateStr, fromDateStr } from '../../domain/week.js';

// ---------------------------------------------------------------------------
// Feature engineering.
//
// Everything downstream (forecasting, clustering, anomaly detection) consumes
// the same daily matrix so the models can never disagree about what a "day"
// contains. One row per calendar day, continuous — zero-filled gaps included,
// because a day with no activity genuinely emitted nothing and treating it as
// missing would bias every average upward.
// ---------------------------------------------------------------------------

export const DAY_MS = 86_400_000;

/** Shift a YYYY-MM-DD string by n days without timezone drift. */
export function shiftDate(dateStr, n) {
  const d = fromDateStr(dateStr);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

/** Inclusive list of date strings from `from` to `to`. */
export function dateRange(from, to) {
  const out = [];
  let cur = from;
  for (let i = 0; i < 400 && cur <= to; i += 1) {
    out.push(cur);
    cur = shiftDate(cur, 1);
  }
  return out;
}

/** ISO-8601 weekday index: Monday = 1 … Sunday = 7. Matches our week model. */
export function isoWeekday(dateStr) {
  const d = fromDateStr(dateStr);
  return ((d.getDay() + 6) % 7) + 1;
}

export const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Week key like `2026-W39`, used for rollups and seasonality indexes. */
export function isoWeekKey(dateStr) {
  const d = fromDateStr(dateStr);
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  target.setDate(target.getDate() + 3 - ((target.getDay() + 6) % 7));
  const week1 = new Date(target.getFullYear(), 0, 4);
  const week = 1 + Math.round(((target - week1) / DAY_MS - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Aggregate the ledger into one continuous daily series ending today.
 *
 * @returns {{
 *   dates: string[], totals: number[], counts: number[], byCategory: Object<string, number[]>,
 *   weekdays: number[], matrix: number[][], featureNames: string[]
 * }}
 */
export function buildDailyFrame(activities, { days = 90, today = toDateStr(new Date()) } = {}) {
  const start = shiftDate(today, -(days - 1));
  const dates = dateRange(start, today);
  const index = new Map(dates.map((d, i) => [d, i]));

  const totals = new Array(dates.length).fill(0);
  const counts = new Array(dates.length).fill(0);
  const byCategory = Object.fromEntries(CATEGORY_TYPES.map((t) => [t, new Array(dates.length).fill(0)]));

  for (const a of activities) {
    const i = index.get(a.date);
    if (i === undefined) continue; // outside the window
    totals[i] += a.co2;
    counts[i] += 1;
    if (byCategory[a.type]) byCategory[a.type][i] += a.co2;
  }

  // Round once at the end so the series adds up to the ledger total.
  for (let i = 0; i < dates.length; i += 1) {
    totals[i] = Number(totals[i].toFixed(2));
    for (const t of CATEGORY_TYPES) byCategory[t][i] = Number(byCategory[t][i].toFixed(2));
  }

  const weekdays = dates.map(isoWeekday);

  // --- categorical one-hot so the *relative* mix of a day is a model feature
  const featureNames = ['total', 'logCount', ...CATEGORY_TYPES, 'carShare', 'flightShare', 'isWeekend', 'isMonday', 'isSunday'];
  const matrix = dates.map((_, i) => {
    const total = totals[i] || 1;
    const dow = weekdays[i];
    return [
      totals[i],
      counts[i],
      ...CATEGORY_TYPES.map((t) => byCategory[t][i]),
      byCategory.car[i] / total,
      byCategory.flight[i] / total,
      dow >= 6 ? 1 : 0,
      dow === 1 ? 1 : 0,
      dow === 7 ? 1 : 0,
    ];
  });

  return { dates, totals, counts, byCategory, weekdays, matrix, featureNames, start, end: today };
}

/**
 * Share of each weekday's long-run average vs the overall daily mean — a
 * multiplicative seasonality index. `1.0` means "an average day".
 */
export function weekdaySeasonality(totals, weekdays) {
  const overall = totals.reduce((a, b) => a + b, 0) / (totals.length || 1) || 0;
  const idx = {};
  for (let d = 1; d <= 7; d += 1) {
    const vals = totals.filter((_, i) => weekdays[i] === d);
    const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    idx[d] = overall > 0 ? Number((avg / overall).toFixed(3)) : 1;
  }
  return idx;
}
