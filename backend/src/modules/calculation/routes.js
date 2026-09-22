import { Router } from 'express';
import * as engine from './service.js';

const router = Router();

// Emission factor registry (the calculation engine's source data).
router.get('/factors', async (_req, res, next) => {
  try {
    res.json(await engine.listFactors());
  } catch (err) {
    next(err);
  }
});

// Stateless preview endpoint: POST /api/calculate {type, quantity, confirmed}
// Used for the live impact preview and by scripts/agents that want the engine
// without writing to the ledger.
router.post('/calculate', async (req, res, next) => {
  try {
    const result = await engine.calculate(req.body || {});
    if (!result.ok) return res.status(result.status).json(result);
    res.json({ type: req.body.type, quantity: Number(req.body.quantity), co2: result.co2, tier: result.tier, factor: result.factor });
  } catch (err) {
    next(err);
  }
});

// What-if simulator: swap N units of one category for another and see the delta.
// Shares one implementation with the socket's `simulate` command.
router.post('/simulate', async (req, res, next) => {
  try {
    const result = await engine.simulate(req.body || {});
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    const { ok, ...payload } = result;
    res.json(payload);
  } catch (err) {
    next(err);
  }
});

export default router;
