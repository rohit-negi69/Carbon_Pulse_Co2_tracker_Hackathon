import * as activityRepository from '../../db/repositories/activityRepository.js';
import * as targetRepository from '../../db/repositories/targetRepository.js';
import * as factorRepository from '../../db/repositories/factorRepository.js';
import * as trainingRepository from '../../db/repositories/trainingRepository.js';
import { currentWeekRange } from '../../domain/week.js';
import { detectAnomalies, learnedThresholds } from './anomaly.js';
import { forecastReport } from './forecast.js';
import { classify, trainClassifier } from './classify.js';
import { clusterDays } from './cluster.js';
import { recommendInterventions } from './recommend.js';
import { buildDailyFrame, weekdaySeasonality } from './features.js';
import { round, mean } from './stats.js';
import { CORPUS_SIZE } from './corpus.js';

// ---------------------------------------------------------------------------
// Model registry.
//
// One place that trains, caches and reports on every model in the platform, so
// the API and the UI can never disagree about what is deployed or how well it
// performs. The classifier is retrained lazily whenever the user has confirmed
// new ground-truth phrases; the statistical models read the ledger on demand
// (they are closed-form and cheap, so caching them would only risk staleness).
// ---------------------------------------------------------------------------

const state = {
  classifier: null,
  classifierTrainedFor: -1, // number of user examples the current model saw
  trainedAt: null,
  trainCount: 0,
};

/** Train (or reuse) the text classifier. */
export async function getClassifier({ force = false } = {}) {
  const examples = await trainingRepository.all();
  if (!force && state.classifier && state.classifierTrainedFor === examples.length) return state.classifier;

  const started = process.hrtime.bigint();
  const classifier = trainClassifier({ extraExamples: examples });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;

  state.classifier = classifier;
  state.classifierTrainedFor = examples.length;
  state.trainedAt = new Date().toISOString();
  state.trainCount += 1;
  state.lastTrainMs = round(elapsedMs, 1);
  return classifier;
}

export function classifierState() {
  const c = state.classifier;
  if (!c) return { trained: false };
  return {
    trained: true,
    trainedAt: c.trainedAt,
    version: c.version,
    algorithm: c.algorithm,
    sampleCount: c.sampleCount,
    seedCorpusSize: CORPUS_SIZE,
    userExamples: c.userExamples,
    vocabularySize: c.vocabularySize,
    trainRuns: state.trainCount,
    lastTrainMs: state.lastTrainMs,
    metrics: c.metrics,
  };
}

/** Classify free text against the current model. */
export async function classifyText(text, opts) {
  const classifier = await getClassifier();
  return { ...classify(text, classifier, opts), model: classifier.version };
}

/** Learn from a confirmed or corrected prediction (online learning). */
export async function learn({ text, label, source }) {
  const row = await trainingRepository.add({ text, label, source });
  if (row) await getClassifier({ force: true }); // fold it in immediately
  return { ok: true, stored: Boolean(row), examples: await trainingRepository.count(), model: classifierState() };
}

/** Everything the intelligence page needs, in one round-trip. */
export async function fullReport({ horizon = 7 } = {}) {
  const [activities, target, factors] = await Promise.all([
    activityRepository.find({}),
    targetRepository.get(),
    factorRepository.all(),
  ]);
  const classifier = await getClassifier();

  const forecast = forecastReport(activities, { horizon, target: target.weeklyTarget });
  const anomalies = detectAnomalies(activities);
  const frame = buildDailyFrame(activities, { days: 90 });
  const clusters = clusterDays(frame);

  const briefThresholds = Object.fromEntries(Object.entries(factors).map(([type, f]) => [type, f.sanityMax]));
  const thresholds = learnedThresholds(activities, briefThresholds);

  const recommendations = recommendInterventions(activities, factors, {
    weeklyTarget: target.weeklyTarget,
    forecast,
  });

  const week = forecast.currentWeek;
  void classifier; // trained above; its state is reported via classifierState()

  return {
    generatedAt: new Date().toISOString(),
    window: forecast.window,
    models: describeModels(),
    forecast,
    anomalies: { stats: anomalies.stats, top: anomalies.scored.filter((s) => s.isOutlier).slice(0, 8), threshold: anomalies.lofThreshold },
    thresholds,
    clusters,
    recommendations,
    seasonality: weekdaySeasonality(frame.totals, frame.weekdays),
    classifier: classifierState(),
    health: {
      ledgerSize: activities.length,
      activeDays: forecast.window.activeDays,
      coverage: round((forecast.window.activeDays / forecast.window.days) * 100, 1),
      confidence: forecast.confidence,
      grade: forecast.accuracy?.grade ?? 'unknown',
      weekStart: currentWeekRange().start,
      weeklyTarget: target.weeklyTarget,
      projectedWeekEnd: week.projectedTotal,
    },
  };
}

/** Catalogue shown in the UI — every entry names its algorithm and inputs. */
export function describeModels() {
  return [
    {
      key: 'forecast',
      name: 'Footprint forecaster',
      algorithm: 'Holt-Winters (additive weekly seasonality, grid-searched) in an inverse-error ensemble with seasonal-naive, weighted weekday profile and damped-Holt baselines',
      inputs: ['daily kg over a 90-day window', 'ISO weekday', 'time index'],
      output: '7-day prediction with 80% and 95% residual-quantile intervals',
      validation: 'walk-forward expanding-window backtest; MAE / RMSE / sMAPE per model',
      status: state.classifier ? 'active' : 'active',
    },
    {
      key: 'anomaly',
      name: 'Input integrity detector',
      algorithm: 'Local Outlier Factor (k=5) over [log CO₂, category, weekday, recency] combined with per-category robust z-scores (median + MAD)',
      inputs: ['activity quantity', 'category', 'date', 'CO₂'],
      output: 'anomaly score, flags and per-entry reasons',
      validation: 'robust statistics — no training required, immune to the outliers it detects',
      status: 'active',
    },
    {
      key: 'classify',
      name: 'Activity text classifier',
      algorithm: 'Multinomial Naive Bayes over TF-IDF (unigrams + bigrams, sublinear TF, Laplace smoothing)',
      inputs: ['free-text notes and copilot messages'],
      output: 'category + probability, with the tokens that drove the decision',
      validation: 'stratified 75/25 train/test hold-out — accuracy, macro-F1, confusion matrix',
      status: 'active',
    },
    {
      key: 'cluster',
      name: 'Day-archetype discovery',
      algorithm: 'k-means++ (fixed seed), k chosen by mean silhouette score over 2–5',
      inputs: ['daily feature matrix: total, log count, per-category kg, weekend flags'],
      output: 'named behavioural archetypes with per-cluster contribution',
      validation: 'silhouette sweep reported alongside the chosen k',
      status: 'active',
    },
    {
      key: 'recommend',
      name: 'Intervention ranker',
      algorithm: 'Prescriptive scoring: fixed brief factors × the user’s own typical quantities, weighted by feasibility; confidence from sample size and dispersion',
      inputs: ['per-category quantities', 'weekly target', 'forecast'],
      output: 'ranked substitutions with kg/week, kg/month and expected outcome',
      validation: 'savings are computed with the same engine that writes the ledger',
      status: 'active',
    },
  ];
}

/** Small helper for the audit/copilot: mean daily kg used by several models. */
export function meanDaily(activities, days = 30) {
  const frame = buildDailyFrame(activities, { days });
  return round(mean(frame.totals), 2);
}

export const registryState = () => ({ ...state, classifier: undefined });
