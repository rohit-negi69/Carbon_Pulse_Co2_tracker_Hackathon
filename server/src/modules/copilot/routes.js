import { Router } from 'express';
import * as copilot from './service.js';

const router = Router();

router.post('/chat', async (req, res, next) => {
  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message is required' });
    res.json(await copilot.chat({ message, history }));
  } catch (err) {
    next(err);
  }
});

router.get('/ai/audit', async (req, res, next) => {
  try {
    res.json(await copilot.audit({ useLLM: req.query.llm === '1' }));
  } catch (err) {
    next(err);
  }
});

export default router;
