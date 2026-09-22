import { Router } from 'express';
import * as activities from './service.js';
import { validateActivity } from '../../middleware/validate.js';

const router = Router();

// Log an activity.
router.post('/activities', validateActivity, async (req, res, next) => {
  try {
    const result = await activities.create(req.body || {});
    if (!result.ok) return res.status(result.status).json(result);
    res.status(201).json({ activity: result.activity, co2: result.co2 });
  } catch (err) {
    next(err);
  }
});

// List with filters: type, from, to, q, tier.
router.get('/activities', async (req, res, next) => {
  try {
    const { type, from, to, q, tier } = req.query;
    if (type) {
      const factor = await (await import('../calculation/service.js')).factorFor(type);
      if (!factor) return res.status(400).json({ error: `Unknown type: ${type}` });
    }
    res.json(await activities.list({ type, from, to, q, tier }));
  } catch (err) {
    next(err);
  }
});

router.delete('/activities/:id', async (req, res, next) => {
  try {
    const result = await activities.remove(req.params.id);
    if (!result.ok) return res.status(result.status).json(result);
    res.json({ ok: true, deleted: result.activity });
  } catch (err) {
    next(err);
  }
});

// Immutable audit trail of every ledger mutation.
router.get('/history', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    res.json({ history: await activities.recentHistory(limit) });
  } catch (err) {
    next(err);
  }
});

export default router;
