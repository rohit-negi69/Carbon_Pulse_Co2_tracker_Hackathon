import { Router } from 'express';
import * as analytics from './service.js';

const router = Router();

router.get('/dashboard', async (_req, res, next) => {
  try {
    res.json(await analytics.dashboard());
  } catch (err) {
    next(err);
  }
});

router.get('/week', async (_req, res, next) => {
  try {
    res.json(await analytics.week());
  } catch (err) {
    next(err);
  }
});

// Charts & Insights: trend, weekday profile, category mix, week-over-week delta.
router.get('/insights', async (_req, res, next) => {
  try {
    res.json(await analytics.insights());
  } catch (err) {
    next(err);
  }
});

// Server-side export so scripts/agents can pull the audit ledger directly.
router.get('/export', async (req, res, next) => {
  try {
    const { type, from, to, q, tier, format = 'csv' } = req.query;
    if (format === 'json') {
      const { count } = await analytics.exportCsv({ type, from, to, q, tier });
      const rows = await (await import('../../db/repositories/activityRepository.js')).find({ type, from, to, q, tier });
      return res.json({ count, activities: rows });
    }
    const { csv, count } = await analytics.exportCsv({ type, from, to, q, tier });
    res.set({ 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="carbonpulse-ledger.csv"`, 'X-Record-Count': String(count) });
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

export default router;
