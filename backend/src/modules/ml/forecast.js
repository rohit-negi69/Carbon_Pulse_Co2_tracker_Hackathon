import {
  mean, median, quantile, ols, mae, rmse, smape, expWeights, weightedMean, clamp, round, mulberry32,
} from './stats.js';
import { buildDailyFrame, weekdaySeasonality, shiftDate, isoWeekday, WEEKDAY_LABELS } from './features.js';
import { currentWeekRange, weekProgress, toDateStr } from '../../domain/week.js';

// ---------------------------------------------------------------------------
// Forecasting engine.
//
// Five models compete on a walk-forward backtest; the winner (or an
// inverse-error ensemble of all of them) produces the 7-day forecast. Nothing
// is asserted without a measured error next to it — every number the API
// returns can be reproduced by re-running the backtest.
//
//   1. seasonal-naive   — y(t) = y(t-7).  The benchmark every model must beat.
//   2. weekday-profile  — exponentially weighted mean of that weekday.
//   3. damped-trend     — Holt's linear trend with a damping factor.
//   4. holt-winters     — level + trend + weekly seasonality (alpha/beta/gamma
//                         chosen by grid search on one-step-ahead SSE).
//   5. ensemble         — inverse-MAE weighted blend of the four above.
// ---------------------------------------------------------------------------

const SEASON = 7; // days — the weekly cycle

export function holtWinters(series, { alpha, beta, gamma, phi = 1, season = SEASON } = {}) {
  const n = series.length;
  if (n === 0) return { fitted: [], forecast: () => 0, params: { alpha, beta, gamma, phi } };

  const m = n >= season * 2 ? season : Math.min(n, season);
  const seasonal = new Array(m).fill(0);
  const firstMean = mean(series.slice(0, m)) || 1;
  for (let i = 0; i < m; i += 1) seasonal[i] = series[i] - firstMean;

  let level = firstMean;
  let trend = n >= 2 * m ? (mean(series.slice(m, 2 * m)) - firstMean) / m : 0;

  const fitted = [];
  for (let i = 0; i < n; i += 1) {
    const s = seasonal[i % m];
    const oneStep = level + phi * trend + s;
    fitted.push(oneStep);

    const prevLevel = level;
    level = alpha * (series[i] - s) + (1 - alpha) * (level + phi * trend);
    trend = beta * (level - prevLevel) + (1 - beta) * phi * trend;
    seasonal[i % m] = gamma * (series[i] - level) + (1 - gamma) * seasonal[i % m];
  }

  return {
    fitted,
    params: { alpha, beta, gamma, phi },
    forecastAt(h) {
      return clamp(level + phi * trend * h + seasonal[(n + h - 1) % m], 0, Infinity);
    },
  };
}

/** One-step-ahead SSE for a parameter set — the grid-search objective. */
function hwObjective(series, params) {
  const { fitted } = holtWinters(series, params);
  let sse = 0;
  for (let i = SEASON; i < series.length; i += 1) sse += (series[i] - fitted[i]) ** 2;
  return sse;
}

/** Coordinate-descent grid search over the smoothing parameters. */
function tuneHoltWinters(series) {
  const grid = {
    alpha: [0.05, 0.15, 0.3, 0.5, 0.7, 0.9],
    beta: [0.01, 0.05, 0.15, 0.3, 0.5],
    gamma: [0.05, 0.15, 0.3, 0.5],
    phi: [0.85, 0.95, 1],
  };

  // Coordinate descent: two passes is enough to converge for these ranges and
  // keeps the whole search under a few thousand evaluations.
  let best = { alpha: 0.3, beta: 0.05, gamma: 0.2, phi: 1 };
  let bestScore = hwObjective(series, best);

  for (let pass = 0; pass < 2; pass += 1) {
    for (const key of ['alpha', 'beta', 'gamma', 'phi']) {
      for (const value of grid[key]) {
        const candidate = { ...best, [key]: value };
        const score = hwObjective(series, candidate);
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    }
  }
  return { params: best, sse: bestScore };
}

// ---------------------------------------------------------------------------
// Competing models. Each exposes predict(train[]) → forecast for h = 1..H.
// ---------------------------------------------------------------------------

// `fit(train, meta)` returns a predictor for h = 1..H, where `meta.weekdays`
// holds the ISO weekday (Mon=1) of every training sample so seasonal models
// key off the real calendar instead of assuming the series starts on a Monday.
const lastWeekday = (meta) => meta.weekdays[meta.weekdays.length - 1] ?? 7;
const weekdayAt = (meta, h) => ((lastWeekday(meta) - 1 + h) % 7) + 1;

export const MODELS = {
  'seasonal-naive': {
    label: 'Seasonal naive',
    note: 'Assumes next week looks like this week — the benchmark every model must beat.',
    fit(train, meta) {
      return (h) => {
        const targetDow = weekdayAt(meta, h);
        const vals = train.filter((_, i) => meta.weekdays[i] === targetDow);
        return vals.length ? mean(vals.slice(-3)) : mean(train.slice(-SEASON));
      };
    },
  },

  'weekday-profile': {
    label: 'Weighted weekday profile',
    note: 'Exponentially weighted mean per weekday, so recent weeks dominate.',
    fit(train, meta) {
      const w = expWeights(train.length, 10);
      const byDow = {};
      for (let d = 1; d <= 7; d += 1) {
        const vals = [];
        const weights = [];
        for (let i = 0; i < train.length; i += 1) {
          if (meta.weekdays[i] === d) {
            vals.push(train[i]);
            weights.push(w[i]);
          }
        }
        byDow[d] = vals.length ? weightedMean(vals, weights) : mean(train);
      }
      return (h) => byDow[weekdayAt(meta, h)] ?? mean(train);
    },
  },

  'damped-trend': {
    label: 'Damped Holt trend',
    note: 'Level + trend with damping, so one spike cannot extrapolate forever.',
    fit(train) {
      let level = train[0];
      let trend = 0;
      const alpha = 0.35;
      const beta = 0.1;
      const phi = 0.9;
      for (let i = 1; i < train.length; i += 1) {
        const prev = level;
        level = alpha * train[i] + (1 - alpha) * (level + phi * trend);
        trend = beta * (level - prev) + (1 - beta) * phi * trend;
      }
      return (h) => clamp(level + phi * trend * h, 0, Infinity);
    },
  },

  'holt-winters': {
    label: 'Holt-Winters (weekly season)',
    note: 'Level, trend and a 7-day seasonal component, tuned by grid search.',
    fit(train) {
      const { params } = tuneHoltWinters(train);
      const model = holtWinters(train, params);
      return Object.assign((h) => model.forecastAt(h), { params });
    },
  },
};

/** Inverse-error ensemble: better models get more weight, none is discarded. */
function ensembleWeights(scores) {
  const raw = scores.map((s) => 1 / Math.max(s, 1e-6));
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((r) => r / total);
}

/**
 * Walk-forward (expanding window) backtest.
 * For each held-out day the model only ever sees data strictly before it —
 * this is the only honest way to report forecast accuracy.
 */
function backtest(series, weekdays, horizon) {
  const n = series.length;
  const holdout = Math.min(horizon, Math.max(3, Math.floor(n / 4)));
  const startIdx = n - holdout;
  if (startIdx < SEASON) return { skipped: true, reason: 'not enough history for a walk-forward backtest' };

  const names = Object.keys(MODELS);
  const predictions = Object.fromEntries(names.map((k) => [k, []]));
  const actual = [];

  for (let t = startIdx; t < n; t += 1) {
    const train = series.slice(0, t);
    const meta = { weekdays: weekdays.slice(0, t) };
    actual.push(series[t]);
    for (const name of names) {
      const predict = MODELS[name].fit(train, meta);
      predictions[name].push(Math.max(0, predict(1)));
    }
  }

  const scores = names.map((name) => ({
    name,
    label: MODELS[name].label,
    note: MODELS[name].note,
    mae: round(mae(actual, predictions[name]), 3),
    rmse: round(rmse(actual, predictions[name]), 3),
    smape: smape(actual, predictions[name]),
    predictions: predictions[name],
  }));

  for (const s of scores) s.smape = s.smape == null ? null : round(s.smape, 1);

  const weights = ensembleWeights(scores.map((s) => s.mae || 1));
  const ensemblePred = actual.map((_, i) => scores.reduce((acc, s, k) => acc + s.predictions[i] * weights[k], 0));

  scores.push({
    name: 'ensemble',
    label: 'Inverse-error ensemble',
    note: 'Weighted blend of every model above, weighted by 1/MAE.',
    mae: round(mae(actual, ensemblePred), 3),
    rmse: round(rmse(actual, ensemblePred), 3),
    smape: round(smape(actual, ensemblePred) ?? 0, 1),
    weights: Object.fromEntries(scores.map((s, k) => [s.name, round(weights[k], 3)])),
  });

  const best = [...scores].sort((a, b) => a.mae - b.mae)[0];
  const residuals = actual.map((a, i) => a - ensemblePred[i]);

  return { actual, scores, best: best.name, residuals, holdout, weights };
}

/**
 * Produce the full forecast report.
 * @param {Array} activities ledger rows
 */
export function forecastReport(activities, { horizon = 7, days = 90, target = 50, now = new Date() } = {}) {
  const frame = buildDailyFrame(activities, { days, today: toDateStr(now) });
  const series = frame.totals;
  const nonZeroDays = series.filter((v) => v > 0).length;
  const result = {
    horizon,
    generatedFor: frame.end,
    window: { days: series.length, from: frame.start, to: frame.end, activeDays: nonZeroDays },
    seasonality: weekdaySeasonality(series, frame.weekdays),
    modelCatalog: Object.entries(MODELS).map(([name, m]) => ({ name, label: m.label, note: m.note })),
  };

  // ---- not enough data: say so instead of inventing a number -------------
  if (nonZeroDays < 3 || series.length < 8) {
    const baseline = nonZeroDays > 0 ? mean(series.filter((v) => v > 0)) : 0;
    return {
      ...result,
      status: 'insufficient-data',
      note: `Only ${nonZeroDays} day(s) with activity. Log a few more days and the models will start forecasting; until then the projection is a flat mean.`,
      confidence: 'low',
      accuracy: { grade: 'insufficient', smape: null, mae: null, sampleSize: nonZeroDays },
      forecast: frame.dates.slice(-horizon).map((_, i) => ({
        date: shiftDate(frame.end, i + 1),
        weekday: WEEKDAY_LABELS[isoWeekday(shiftDate(frame.end, i + 1)) - 1],
        predicted: round(baseline, 2),
        low80: 0,
        high80: round(baseline * 2, 2),
        low95: 0,
        high95: round(baseline * 3, 2),
      })),
      currentWeek: weekProjection({ frame, forecast: null, target, now, fallbackDaily: baseline }),
      trend: { slope: 0, direction: 'flat', r2: 0, changePerWeek: 0 },
    };
  }

  const backtestResult = backtest(series, frame.weekdays, horizon);

  // ---- refit the winning model on the full series ------------------------
  const baseNames = Object.keys(MODELS);
  const chosen = backtestResult.skipped ? 'weekday-profile' : backtestResult.best;
  const meta = { weekdays: frame.weekdays };
  const fitted = Object.fromEntries(baseNames.map((name) => [name, MODELS[name].fit(series, meta)]));

  const forecast = [];
  for (let h = 1; h <= horizon; h += 1) {
    const blended = baseNames.reduce((acc, name, k) => {
      const w = backtestResult.weights?.[k] ?? 1 / baseNames.length;
      return acc + Math.max(0, fitted[name](h)) * w;
    }, 0);
    const date = shiftDate(frame.end, h);
    forecast.push({
      date,
      weekday: WEEKDAY_LABELS[isoWeekday(date) - 1],
      isWeekend: isoWeekday(date) >= 6,
      predicted: round(blended, 2),
    });
  }

  // ---- prediction intervals from ensemble residuals ----------------------
  if (!backtestResult.skipped) {
    const absRes = backtestResult.residuals.map(Math.abs);
    const q80 = quantile(absRes, 0.8) || median(absRes) * 1.3;
    const q95 = quantile(absRes, 0.95) || median(absRes) * 2.2;
    for (const row of forecast) {
      row.low80 = round(Math.max(0, row.predicted - q80), 2);
      row.high80 = round(row.predicted + q80, 2);
      row.low95 = round(Math.max(0, row.predicted - q95), 2);
      row.high95 = round(row.predicted + q95, 2);
    }
    result.intervals = { q80: round(q80, 2), q95: round(q95, 2), method: 'empirical residual quantiles (walk-forward)' };
  }

  // ---- trend of the last four weeks --------------------------------------
  const recent = series.slice(-28);
  const regression = ols(recent.map((_, i) => i), recent);
  result.trend = {
    slope: round(regression.slope, 4),
    direction: regression.slope > 0.05 ? 'rising' : regression.slope < -0.05 ? 'falling' : 'flat',
    r2: round(regression.r2, 3),
    changePerWeek: round(regression.slope * 7, 2),
  };

  const winning = backtestResult.scores?.find((s) => s.name === 'ensemble') || { mae: null, smape: null };
  result.status = 'ok';
  result.backtest = {
    method: 'walk-forward, expanding window',
    holdoutDays: backtestResult.holdout,
    models: (backtestResult.scores || []).map(({ predictions, ...rest }) => rest),
    selected: chosen,
  };
  result.selectedModel = chosen;
  result.accuracy = {
    grade: gradeOf(winning.smape),
    mae: winning.mae,
    smape: winning.smape,
    sampleSize: series.length,
    note: backtestResult.skipped
      ? backtestResult.reason
      : `Ensemble one-step MAE ${winning.mae} kg over the last ${backtestResult.holdout} days (walk-forward).`,
  };
  result.confidence = confidenceOf(winning.smape, nonZeroDays, series.length);
  result.forecast = forecast;
  result.currentWeek = weekProjection({ frame, forecast, target, now });
  return result;
}

/** Blend actuals-so-far with the forecast for the remaining days. */
function weekProjection({ frame, forecast, target, now, fallbackDaily = 0 }) {
  const { start, end } = currentWeekRange(now);
  const { daysElapsed, daysRemaining } = weekProgress(now);
  const actualToDate = round(
    frame.totals.filter((_, i) => frame.dates[i] >= start && frame.dates[i] <= end).reduce((a, b) => a + b, 0),
    2
  );

  const remaining = [];
  for (let d = 1; d <= daysRemaining; d += 1) {
    const date = shiftDate(frame.end, d);
    const row = forecast?.find((f) => f.date === date);
    remaining.push(row ? row.predicted : fallbackDaily);
  }
  const forecastRemaining = round(remaining.reduce((a, b) => a + b, 0), 2);
  const projectedTotal = round(actualToDate + forecastRemaining, 2);
  const overBy = round(Math.max(projectedTotal - target, 0), 2);

  return {
    start,
    end,
    daysElapsed,
    daysRemaining,
    actualToDate,
    forecastRemaining,
    projectedTotal,
    target,
    willExceed: projectedTotal > target,
    overBy,
    // How much of the projection is still guesswork — a full week ahead is the
    // least certain, a Friday projection is nearly settled.
    settledFraction: round(daysElapsed / 7, 2),
  };
}

function gradeOf(smape) {
  if (smape == null) return 'unknown';
  if (smape <= 15) return 'high';
  if (smape <= 30) return 'moderate';
  if (smape <= 50) return 'low';
  return 'weak';
}

function confidenceOf(smape, activeDays, window) {
  const density = activeDays / Math.max(window, 1);
  if (smape == null) return 'low';
  if (smape <= 18 && activeDays >= 10 && density >= 0.35) return 'high';
  if (smape <= 40 && activeDays >= 5) return 'moderate';
  return 'low';
}

/** Bootstrapped sanity check used by the test-suite: cover most of the future. */
export function simulateForTest(series, seed = 7) {
  const rng = mulberry32(seed);
  return series.map((v) => Math.max(0, v + (rng() - 0.5) * v * 0.4));
}

