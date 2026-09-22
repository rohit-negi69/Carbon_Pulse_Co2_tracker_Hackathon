import { Router } from 'express';
import * as nudges from './service.js';

const router = Router();

// Re-evaluate the ledger against the weekly target and return current nudges.
router.get('/nudges', async (req, res, next) => {
  try {
    if (req.query.evaluate === '1') await nudges.evaluate();
    res.json(await nudges.list());
  } catch (err) {
    next(err);
  }
});

router.post('/nudges/read', async (req, res, next) => {
  try {
    const { id } = req.body || {};
    if (id) await nudges.markRead(id);
    else await nudges.markAllRead();
    res.json(await nudges.list());
  } catch (err) {
    next(err);
  }
});

export default router;
