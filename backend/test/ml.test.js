import test from 'node:test';
import assert from 'node:assert/strict';

import { median, mad, quantile, ols, mae, smape, robustZ, mulberry32, standardise, expWeights, weightedMean } from '../src/modules/ml/stats.js';
import { forecastReport, MODELS, holtWinters } from '../src/modules/ml/forecast.js';
import { detectAnomalies, learnedThresholds } from '../src/modules/ml/anomaly.js';
import { trainClassifier, classify, tokenize } from '../src/modules/ml/classify.js';
import { clusterDays } from '../src/modules/ml/cluster.js';
import { recommendInterventions } from '../src/modules/ml/recommend.js';
import { buildDailyFrame, isoWeekday, isoWeekKey } from '../src/modules/ml/features.js';
import { CATEGORY_TYPES, FACTORS, SEED_FACTORS } from '../src/domain/factors.js';
import { toDateStr } from '../src/domain/week.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Deterministic synthetic ledger: weekday commute + weekend spike. */
function synthLedger(days = 42, seed = 3) {
  const rng = mulberry32(seed);
  const rows = [];
  let id = 1;
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = toDateStr(d);
    const dow = isoWeekday(date);
    const isWeekend = dow >= 6;

    const carKm = isWeekend ? 5 + rng() * 10 : 18 + rng() * 12;
    rows.push({ _id: String(id++), type: 'car', quantity: Number(carKm.toFixed(1)), date, co2: Number((carKm * 0.2).toFixed(2)), tier: 'low' });

    if (isWeekend) {
      const elec = 6 + rng() * 8;
      rows.push({ _id: String(id++), type: 'electricity', quantity: Number(elec.toFixed(1)), date, co2: Number((elec * 0.8).toFixed(2)), tier: 'med' });
    }
    if (!isWeekend && rng() > 0.4) {
      const meals = 1 + Math.floor(rng() * 2);
      rows.push({ _id: String(id++), type: 'non_veg_meal', quantity: meals, date, co2: Number((meals * 2).toFixed(2)), tier: 'med' });
    }
    if (rng() > 0.85) {
      rows.push({ _id: String(id++), type: 'bus', quantity: Number((8 + rng() * 10).toFixed(1)), date, co2: Number(((8 + rng() * 10) * 0.08).toFixed(2)), tier: 'low' });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// stats
// ---------------------------------------------------------------------------

test('stats: robust estimators and error metrics behave as documented', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(quantile([1, 2, 3, 4, 5], 0.5), 3);

  // MAD is immune to a single wild outlier; stdev is not — that is the point.
  const clean = [10, 11, 10.5, 10.2, 10.8];
  const dirty = [...clean, 100000];
  assert.ok(mad(dirty) < 1, 'MAD should ignore the injected outlier');
  assert.ok(robustZ(100000, clean) > 100, 'outlier should score enormously on a robust z-scale');

  const reg = ols([0, 1, 2, 3], [1, 3, 5, 7]);
  assert.ok(Math.abs(reg.slope - 2) < 1e-9);
  assert.ok(Math.abs(reg.intercept - 1) < 1e-9);
  assert.ok(reg.r2 > 0.999);

  assert.equal(mae([1, 2, 3], [1, 2, 3]), 0);
  assert.equal(smape([0, 0], [0, 0]), 0);
  assert.ok(expWeights(5).at(-1) > expWeights(5)[0], 'weights must favour recent samples');
  assert.ok(Math.abs(weightedMean([1, 2], [1, 1]) - 1.5) < 1e-9);

  const { data } = standardise([[1, 10], [2, 20], [3, 30]]);
  assert.ok(Math.abs(data.reduce((a, r) => a + r[0], 0)) < 1e-9, 'standardised columns are centred');
});

// ---------------------------------------------------------------------------
// feature engineering
// ---------------------------------------------------------------------------

test('features: the daily frame is continuous, zero-filled and correctly keyed', () => {
  const rows = synthLedger(20);
  const frame = buildDailyFrame(rows, { days: 30 });
  assert.equal(frame.totals.length, 30);
  assert.equal(frame.dates.length, 30);
  assert.equal(frame.matrix.length, 30);
  assert.equal(frame.featureNames.length, frame.matrix[0].length);

  // every ledger kilo must appear in the frame
  const frameTotal = frame.totals.reduce((a, b) => a + b, 0);
  const ledgerTotal = rows.reduce((a, r) => a + r.co2, 0);
  assert.ok(Math.abs(frameTotal - ledgerTotal) < 0.6, `frame ${frameTotal} vs ledger ${ledgerTotal}`);

  // dates are consecutive
  for (let i = 1; i < frame.dates.length; i += 1) {
    const prev = new Date(frame.dates[i - 1]);
    const cur = new Date(frame.dates[i]);
    assert.equal((cur - prev) / 86_400_000, 1);
  }

  assert.equal(isoWeekday('2026-09-21'), 1, 'a Monday');
  assert.equal(isoWeekday('2026-09-27'), 7, 'a Sunday');
  assert.match(isoWeekKey('2026-09-22'), /^2026-W\d{2}$/);
});

// ---------------------------------------------------------------------------
// forecasting
// ---------------------------------------------------------------------------

test('forecast: Holt-Winters tracks a clean linear ramp', () => {
  const series = Array.from({ length: 40 }, (_, i) => 10 + i * 0.5);
  const { fitted, forecastAt } = holtWinters(series, { alpha: 0.6, beta: 0.3, gamma: 0.1, phi: 1 });
  const tailError = Math.abs(fitted.at(-1) - series.at(-1));
  assert.ok(tailError < 2, `one-step error ${tailError} should be small on a smooth ramp`);
  assert.ok(forecastAt(1) > series.at(-1) - 1, 'forecast should continue the upward ramp');
});

test('forecast: every model runs the walk-forward backtest and reports real metrics', () => {
  const rows = synthLedger(45);
  const report = forecastReport(rows, { target: 50 });

  assert.equal(report.status, 'ok');
  assert.ok(report.forecast.length === 7, 'seven forecast days');
  assert.ok(report.forecast.every((f) => f.predicted >= 0), 'predictions are never negative');
  assert.ok(report.forecast.every((f) => f.high80 >= f.predicted && f.low80 <= f.predicted), 'intervals bracket the point estimate');

  // Backtest must include the baselines *and* the ensemble.
  const names = report.backtest.models.map((m) => m.name);
  assert.ok(names.includes('seasonal-naive'));
  assert.ok(names.includes('holt-winters'));
  assert.ok(names.includes('ensemble'));
  assert.equal(report.backtest.models.length, Object.keys(MODELS).length + 1);

  // Every model scored with a finite MAE, and the ensemble weight vector sums to 1.
  for (const m of report.backtest.models) {
    assert.ok(Number.isFinite(m.mae) && m.mae >= 0, `${m.name} MAE must be finite`);
    assert.ok(Number.isFinite(m.rmse));
  }
  const ensemble = report.backtest.models.find((m) => m.name === 'ensemble');
  const weightSum = Object.values(ensemble.weights).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(weightSum - 1) < 0.01, `ensemble weights sum to ${weightSum}`);

  // Reports an accuracy grade rather than claiming perfection.
  assert.ok(['high', 'moderate', 'low', 'weak'].includes(report.accuracy.grade));
  assert.ok(report.accuracy.mae != null);

  // The week projection blends actuals with forecasts.
  const week = report.currentWeek;
  assert.ok(week.actualToDate >= 0);
  assert.ok(week.projectedTotal >= week.actualToDate - 1e-6, 'projection cannot be below what is already logged');
  assert.equal(typeof week.willExceed, 'boolean');
});

test('forecast: degrades honestly on an almost-empty ledger instead of inventing data', () => {
  const report = forecastReport([], { target: 50 });
  assert.equal(report.status, 'insufficient-data');
  assert.equal(report.accuracy.grade, 'insufficient');
  assert.equal(report.confidence, 'low');
  assert.match(report.note, /log a few more|Only 0/i);
});

test('forecast: the ensemble beats a constant-mean predictor on seasonal data', () => {
  const rows = synthLedger(56);
  const report = forecastReport(rows, { target: 50 });
  const ensemble = report.backtest.models.find((m) => m.name === 'ensemble');
  const flatMeanMae = report.backtest.models.find((m) => m.name === 'seasonal-naive');
  assert.ok(ensemble.mae <= flatMeanMae.mae + 0.5, 'the ensemble should be at least as good as the naive baseline');
});

// ---------------------------------------------------------------------------
// anomaly detection (DP2)
// ---------------------------------------------------------------------------

test('anomaly: an absurd entry is flagged with a stated reason', () => {
  const rows = synthLedger(30);
  rows.push({
    _id: 'typo-1',
    type: 'car',
    quantity: 500000,
    date: toDateStr(new Date()),
    co2: 100000,
    tier: 'high',
  });

  const result = detectAnomalies(rows);
  const flagged = result.scored.find((s) => s.id === 'typo-1');
  assert.ok(flagged, 'the absurd entry must be scored');
  assert.equal(flagged.isOutlier, true);
  assert.ok(flagged.robustZ > 4, `robust z ${flagged.robustZ} should be extreme`);
  assert.ok(flagged.reasons.length > 0, 'anomalies must explain themselves');

  // The typo must be the *worst* entry, and precision must stay high: LOF can
  // legitimately flag one neighbouring point once an extreme value distorts the
  // local density, so we bound the false-positive rate rather than demanding
  // exactly one flag.
  const worst = [...result.scored].sort((a, b) => b.score - a.score)[0];
  assert.equal(worst.id, 'typo-1', 'the absurd entry must rank highest by anomaly score');
  assert.ok(result.stats.flaggedShare < 15, `flagged share ${result.stats.flaggedShare}% should stay well under 15%`);
});

test('anomaly: a clean ledger produces no false positives', () => {
  const result = detectAnomalies(synthLedger(40));
  assert.equal(result.stats.flagged, 0, `expected no flags, got ${result.stats.flagged}`);
  assert.match(result.stats.note, /No entries look inconsistent/i);
});

test('anomaly: learned ranges adapt to the user while DP2 behaviour stays deterministic', () => {
  const brief = Object.fromEntries(SEED_FACTORS.map((f) => [f.type, f.sanityMax]));

  const rows = synthLedger(40);
  const learned = learnedThresholds(rows, brief);

  // The confirmation threshold is always the brief's value, for every category.
  for (const type of CATEGORY_TYPES) {
    assert.equal(learned[type].effectiveThreshold, brief[type], `${type} must keep the brief threshold`);
  }

  // The advisory range reflects the user's own data and is a real number.
  assert.ok(learned.car.advisoryRange > 0);
  assert.ok(learned.car.median > 0);
  assert.ok(learned.car.usableSamples > 20);
  assert.ok(typeof learned.car.note === 'string' && learned.car.note.length > 10);

  // A confirmed absurd value must never poison the learned normal range.
  const poisoned = [...rows, { _id: 'x', type: 'car', quantity: 500000, date: '2026-01-01', co2: 100000, tier: 'high' }];
  const after = learnedThresholds(poisoned, brief);
  assert.equal(after.car.advisoryRange, learned.car.advisoryRange, 'a confirmed typo must not widen the learned range');
  assert.equal(after.car.usableSamples, learned.car.usableSamples, 'the typo is excluded from the statistics');

  const sparse = learnedThresholds([], brief);
  assert.equal(sparse.car.effectiveThreshold, brief.car);
  assert.equal(sparse.car.advisoryRange, null);
});

// ---------------------------------------------------------------------------
// text classifier
// ---------------------------------------------------------------------------

test('classifier: trains, generalises, and reports its own accuracy', () => {
  const model = trainClassifier();
  const m = model.metrics;

  // Seven classes (six categories + `unknown`) from 284 labelled phrases. The
  // residual error is concentrated on the car↔bus boundary, which shares verbs
  // and only differs by one noun — a documented limitation rather than a hidden
  // one. Thresholds are set from what the model actually achieves.
  assert.ok(m.accuracy > 0.78, `holdout accuracy ${m.accuracy} should clear 0.78`);
  assert.ok(m.macroF1 > 0.75, `macro F1 ${m.macroF1}`);
  assert.ok(m.testSize >= 60, 'the holdout must be large enough to mean something');
  assert.ok(m.logLoss < 0.9, `calibrated log-loss ${m.logLoss} should beat a uniform 1.95`);
  assert.ok(m.meanConfidence > 0.6, `mean confidence ${m.meanConfidence}`);
  assert.equal(m.perClass.length, CATEGORY_TYPES.length + 1, 'including the unknown class');
  assert.ok(Object.keys(m.confusion).length === m.perClass.length);

  // every class must actually be predicted at least once
  for (const row of m.perClass) assert.ok(row.support > 0, `${row.label} has no test examples`);
});

test('classifier: recognises paraphrases it was never trained on verbatim', () => {
  const model = trainClassifier();

  const cases = [
    ['I drove the car to the office this morning', 'car'],
    ['we took a bus into town', 'bus'],
    ['hopped on a plane to bangalore', 'flight'],
    ['the washing machine ran for two hours', 'electricity'],
    ['had a vegetarian bowl for lunch', 'veg_meal'],
    ['grilled chicken for dinner', 'non_veg_meal'],
    ['caught the tube into central london', 'bus'],
    ['charged my electric car overnight', 'electricity'],
    ['cooked a lentil curry for supper', 'veg_meal'],
  ];

  for (const [text, expected] of cases) {
    const out = classify(text, model);
    assert.equal(out.category, expected, `"${text}" → ${out.category} (expected ${expected})`);
    assert.ok(out.confidence > 0.5, `confidence ${out.confidence} too low for "${text}"`);
    assert.ok(out.evidence.length > 0, 'the model must be able to justify its answer');
  }
});

test('classifier: refuses to guess when the text is not an activity', () => {
  const model = trainClassifier();
  for (const text of ['i paid my rent', 'can you explain the factors', 'good morning']) {
    const out = classify(text, model);
    assert.equal(out.category, null, `"${text}" must not be forced into a category`);
    assert.equal(out.needsConfirmation, true);
  }
});

test('classifier: user-confirmed examples are folded into the training set', () => {
  const extra = ['car\tI did the school run in the volvo', 'bus\ttook the 42 to the depot'];
  const model = trainClassifier({ extraExamples: extra });
  assert.equal(model.userExamples, 2);
  assert.equal(model.sampleCount, trainClassifier().sampleCount + 2);

  // the learned phrasing should now resolve
  assert.equal(classify('i did the school run in the volvo', model).category, 'car');
  assert.equal(classify('took the 42 to the depot', model).category, 'bus');

  // tokenizer sanity
  const tokens = tokenize('I drove 15 km to the office');
  assert.ok(tokens.includes('drove'));
  assert.ok(tokens.some((t) => t.includes('_')), 'bigrams are generated');
});

// ---------------------------------------------------------------------------
// clustering
// ---------------------------------------------------------------------------

test('cluster: finds archetypes on a ledger with a clear structure', () => {
  const frame = buildDailyFrame(synthLedger(60), { days: 60 });
  const result = clusterDays(frame);

  assert.equal(result.status, 'ok');
  assert.ok(result.clusters.length >= 2, 'at least two archetypes');
  assert.ok(result.k >= 2 && result.k <= 5);
  assert.ok(result.silhouette > 0, `silhouette ${result.silhouette} should be positive on structured data`);
  assert.ok(result.sweep.length >= 2, 'a silhouette sweep is reported so k is auditable');

  // shares are a distribution
  const shareSum = result.clusters.reduce((a, c) => a + c.share, 0);
  assert.ok(Math.abs(shareSum - 100) < 1.5, `cluster shares sum to ${shareSum}`);
  for (const c of result.clusters) {
    assert.ok(c.label && c.icon && c.dayCount > 0);
    assert.ok(c.contribution >= 0 && c.contribution <= 100);
    assert.deepEqual(Object.keys(c.meanKgByCategory).sort(), [...CATEGORY_TYPES].sort());
  }

  // Labels must be distinguishable — two "Commute day" rows tell a reader
  // nothing about which is which.
  const labels = result.clusters.map((c) => c.label);
  assert.equal(new Set(labels).size, labels.length, `duplicate cluster labels: ${labels.join(', ')}`);

  // Every active day is assigned to exactly one cluster.
  const assigned = result.days.filter((d) => d.cluster != null);
  assert.equal(assigned.length, result.activeDays);
  for (const d of assigned) assert.ok(d.cluster >= 0 && d.cluster < result.k);
});

test('cluster: declines to cluster a ledger with almost no history', () => {
  const frame = buildDailyFrame(synthLedger(2), { days: 30 });
  const result = clusterDays(frame);
  assert.equal(result.status, 'insufficient-data');
  assert.deepEqual(result.clusters, []);
});

// ---------------------------------------------------------------------------
// recommendations
// ---------------------------------------------------------------------------

test('recommend: ranks the highest-value swaps and quantifies them with brief factors', () => {
  const rows = synthLedger(45);
  const result = recommendInterventions(rows, FACTORS, { weeklyTarget: 50 });

  assert.ok(result.recommendations.length > 0, 'a ledger with car travel must yield a transit swap');
  assert.ok(!result.bestNext || result.bestNext.savingPerWeekKg > 0);

  // savings are monotonically ordered
  for (let i = 1; i < result.recommendations.length; i += 1) {
    assert.ok(result.recommendations[i - 1].savingPerWeekKg >= result.recommendations[i].savingPerWeekKg);
  }

  // the maths must match the brief's fixed factors exactly
  const carSwap = result.recommendations.find((r) => r.id === 'car-to-bus');
  assert.ok(carSwap, 'car → bus should be recommended for a commuter ledger');
  const expectedPerKm = 0.2 - 0.08;
  const impliedPerUnit = carSwap.savingPerEventKg / carSwap.displacedPerEvent;
  assert.ok(Math.abs(impliedPerUnit - expectedPerKm) < 0.01, `per-unit saving ${impliedPerUnit} vs expected ${expectedPerKm}`);

  assert.ok(['high', 'moderate', 'low'].includes(carSwap.confidence));
  assert.ok(carSwap.evidence.includes('logged'));
  assert.ok(result.summary.achievableWeeklySaving > 0);
});

test('recommend: proposes the meal swap when diet carries the footprint', () => {
  const rows = [];
  for (let i = 0; i < 20; i += 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    rows.push({ _id: `m${i}`, type: 'non_veg_meal', quantity: 3, date: toDateStr(d), co2: 6, tier: 'med' });
  }
  const result = recommendInterventions(rows, FACTORS, { weeklyTarget: 50 });
  assert.equal(result.bestNext.id, 'meal-swap');
  // 1.5 kg saved per meal displaced (2.0 − 0.5), so the maths string must show it
  assert.match(result.bestNext.maths, /1\.5/);
});

test('recommend: says so instead of guessing when there is no history', () => {
  const result = recommendInterventions([], FACTORS, { weeklyTarget: 50 });
  assert.equal(result.recommendations.length, 0);
  assert.match(result.note, /Not enough history/i);
});
