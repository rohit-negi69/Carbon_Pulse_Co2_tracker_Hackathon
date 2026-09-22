import { Router } from 'express';
import * as targetRepository from '../../db/repositories/targetRepository.js';
import * as historyRepository from '../../db/repositories/historyRepository.js';
import * as nudges from '../nudges/service.js';
import { publish } from '../realtime/hub.js';
import { buildSnapshot } from '../realtime/snapshot.js';

const router = Router();

router.get('/target', async (_req, res, next) => {
  try {
    res.json(await targetRepository.get());
  } catch (err) {
    next(err);
  }
});

router.put('/target', async (req, res, next) => {
  try {
    const value = Number(req.body?.weeklyTarget);
    if (!Number.isFinite(value) || value <= 0) {
      return res.status(400).json({ error: 'weeklyTarget must be a positive number (kg CO₂).' });
    }
    if (value > 100_000) {
      return res.status(422).json({
        needsConfirmation: true,
        message: 'That target is very large — confirm it is intended in kg CO₂ per week.',
        computed: value,
      });
    }

    const weeklyTarget = await targetRepository.set(value);
    await historyRepository.record('target-changed', 'singleton', { weeklyTarget });
    publish('target', { weeklyTarget });
    publish('snapshot', await buildSnapshot());

    const evaluated = await nudges.evaluate();
    evaluated.filter(Boolean).forEach((n) => publish('nudge', n));

    res.json({ weeklyTarget });
  } catch (err) {
    next(err);
  }
});

export default router;
