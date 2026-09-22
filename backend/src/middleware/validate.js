import { CATEGORY_TYPES } from '../domain/factors.js';

// Lightweight request validators — keeps controllers free of parsing noise.

export function validateActivity(req, res, next) {
  const { type, quantity } = req.body || {};
  if (!type) return res.status(400).json({ error: 'type is required' });
  if (!CATEGORY_TYPES.includes(type)) {
    return res.status(400).json({ error: `Unknown activity type. Valid types: ${CATEGORY_TYPES.join(', ')}` });
  }
  if (quantity === undefined || quantity === null || quantity === '') {
    return res.status(400).json({ error: 'quantity is required' });
  }
  next();
}

export function validateDateRange(req, res, next) {
  const { from, to } = req.query;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (from && !re.test(from)) return res.status(400).json({ error: 'from must be YYYY-MM-DD' });
  if (to && !re.test(to)) return res.status(400).json({ error: 'to must be YYYY-MM-DD' });
  next();
}
