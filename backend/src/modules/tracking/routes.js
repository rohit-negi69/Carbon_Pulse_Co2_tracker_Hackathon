import { Router } from 'express';
import * as tracking from './service.js';

// ---------------------------------------------------------------------------
// Real-world tracking routes.
//
//   POST   /api/tracking/trips                 start a session (returns id)
//   POST   /api/tracking/trips/:id/points      append GPS fixes, get a live read
//   PUT    /api/tracking/trips/:id/mode        user correction (ground truth)
//   POST   /api/tracking/trips/:id/complete    close + optionally write to ledger
//   GET    /api/tracking/trips                 recent sessions
//   DELETE /api/tracking/trips/:id             discard a session
//   POST   /api/tracking/classify              classify a raw trace without persisting
//   GET    /api/tracking/meta                  classifier rules + cleaning thresholds
// ---------------------------------------------------------------------------

const router = Router();

router.get('/tracking/meta', async (_req, res, next) => {
  try {
    res.json(await tracking.trackingStats());
  } catch (err) {
    next(err);
  }
});

router.get('/tracking/trips', async (req, res, next) => {
  try {
    res.json(await tracking.listTrips({ status: req.query.status, limit: Number(req.query.limit) || 25 }));
  } catch (err) {
    next(err);
  }
});

router.post('/tracking/trips', async (req, res, next) => {
  try {
    const result = await tracking.startTrip(req.body || {});
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/tracking/trips/:id/points', async (req, res, next) => {
  try {
    const result = await tracking.appendPoints(req.params.id, req.body?.points || []);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.put('/tracking/trips/:id/mode', async (req, res, next) => {
  try {
    const result = await tracking.correctMode(req.params.id, req.body?.mode);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/tracking/trips/:id/complete', async (req, res, next) => {
  try {
    const result = await tracking.completeTrip(req.params.id, {
      log: req.body?.log !== false,
      label: req.body?.label,
    });
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/tracking/trips/:id', async (req, res, next) => {
  try {
    const result = await tracking.discardTrip(req.params.id);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Stateless: classify a trace without storing it (used by the live tracker UI). */
router.post('/tracking/classify', async (req, res, next) => {
  try {
    const { points = [] } = req.body || {};
    const cleaned = tracking.cleanFixes(points);
    const measurement = tracking.measure(cleaned.kept);
    res.json({
      ok: true,
      measurement,
      classification: tracking.classifyMode(measurement),
      dropped: cleaned.dropped,
      rawPoints: cleaned.raw,
      keptPoints: cleaned.kept.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
