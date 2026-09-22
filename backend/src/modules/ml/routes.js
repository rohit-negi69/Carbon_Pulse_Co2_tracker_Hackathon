import { Router } from 'express';
import * as activityRepository from '../../db/repositories/activityRepository.js';
import * as targetRepository from '../../db/repositories/targetRepository.js';
import * as factorRepository from '../../db/repositories/factorRepository.js';
import { detectAnomalies, learnedThresholds } from './anomaly.js';
import { forecastReport } from './forecast.js';
import { clusterDays } from './cluster.js';
import { recommendInterventions } from './recommend.js';
import { buildDailyFrame } from './features.js';
import { describeModels, fullReport, getClassifier, classifierState, classifyText, learn } from './registry.js';

// ---------------------------------------------------------------------------
// ML / intelligence routes.
//
//   GET  /api/ml/report           everything, one round-trip (the ML Lab page)
//   GET  /api/ml/models           model catalogue + trained classifier state
//   GET  /api/ml/forecast         7-day forecast, backtest, intervals
//   GET  /api/ml/anomalies        scored ledger + learned confirm thresholds
//   GET  /api/ml/clusters         day archetypes
//   GET  /api/ml/recommendations  ranked interventions
//   POST /api/ml/classify         classify free text
//   POST /api/ml/train            retrain the classifier (?force=1)
//   POST /api/ml/feedback         store a confirmed/corrected label (online learning)
// ---------------------------------------------------------------------------

const router = Router();

router.get('/ml/models', async (_req, res, next) => {
  try {
    await getClassifier();
    res.json({ models: describeModels(), classifier: classifierState() });
  } catch (err) {
    next(err);
  }
});

router.get('/ml/report', async (req, res, next) => {
  try {
    res.json(await fullReport({ horizon: Number(req.query.horizon) || 7 }));
  } catch (err) {
    next(err);
  }
});

router.get('/ml/forecast', async (req, res, next) => {
  try {
    const [activities, target] = await Promise.all([activityRepository.find({}), targetRepository.get()]);
    res.json(forecastReport(activities, { horizon: Number(req.query.horizon) || 7, target: target.weeklyTarget }));
  } catch (err) {
    next(err);
  }
});

router.get('/ml/anomalies', async (req, res, next) => {
  try {
    const [activities, factors] = await Promise.all([activityRepository.find({}), factorRepository.all()]);
    const result = detectAnomalies(activities, { lofThreshold: Number(req.query.threshold) || 1.75 });
    res.json({
      stats: result.stats,
      lofThreshold: result.lofThreshold,
      anomalies: result.scored.filter((s) => s.isOutlier).sort((a, b) => b.score - a.score),
      all: result.scored.slice(-40).reverse(),
      learnedThresholds: learnedThresholds(
        activities,
        Object.fromEntries(Object.entries(factors).map(([type, f]) => [type, f.sanityMax]))
      ),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/ml/clusters', async (_req, res, next) => {
  try {
    const activities = await activityRepository.find({});
    res.json(clusterDays(buildDailyFrame(activities, { days: 90 })));
  } catch (err) {
    next(err);
  }
});

router.get('/ml/recommendations', async (_req, res, next) => {
  try {
    const [activities, target, factors] = await Promise.all([
      activityRepository.find({}),
      targetRepository.get(),
      factorRepository.all(),
    ]);
    const forecast = forecastReport(activities, { target: target.weeklyTarget });
    res.json(recommendInterventions(activities, factors, { weeklyTarget: target.weeklyTarget, forecast }));
  } catch (err) {
    next(err);
  }
});

router.post('/ml/classify', async (req, res, next) => {
  try {
    const { text } = req.body || {};
    if (!text || typeof text !== 'string') return res.status(400).json({ error: 'text is required' });
    res.json(await classifyText(text, { minConfidence: Number(req.body?.minConfidence) || 0.42 }));
  } catch (err) {
    next(err);
  }
});

router.post('/ml/train', async (req, res, next) => {
  try {
    await getClassifier({ force: Boolean(req.query.force) || Boolean(req.body?.force) });
    res.json({ ok: true, classifier: classifierState() });
  } catch (err) {
    next(err);
  }
});

/** Online learning: a user confirmed or corrected a prediction. */
router.post('/ml/feedback', async (req, res, next) => {
  try {
    const { text, label, source } = req.body || {};
    if (!text || !label) return res.status(400).json({ error: 'text and label are required' });
    res.json(await learn({ text, label, source }));
  } catch (err) {
    next(err);
  }
});

export default router;
