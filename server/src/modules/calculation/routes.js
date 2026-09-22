import { Router } from 'express';
import * as engine from './service.js';
import * as factorRepository from '../../db/repositories/factorRepository.js';

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
router.post('/simulate', async (req, res, next) => {
  try {
    const { fromType, toType, quantity } = req.body || {};
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });
    const factors = await factorRepository.all();
    if (!factors[fromType] || !factors[toType]) return res.status(400).json({ error: 'fromType and toType must be valid activity types' });

    const before = Number((qty * factors[fromType].factor).toFixed(2));
    const after = Number((qty * factors[toType].factor).toFixed(2));
    const saving = Number((before - after).toFixed(2));
    res.json({
      fromType,
      toType,
      quantity: qty,
      before,
      after,
      saving,
      savingPct: before > 0 ? Math.round((saving / before) * 100) : 0,
      monthlySaving: Number((saving * 4).toFixed(2)),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
