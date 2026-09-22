import { config } from '../config/index.js';

// Minimal sliding-window rate limiter. No external dependency, plenty for a
// single-instance deployment, and it protects the copilot from loops.

const hits = new Map();

export function rateLimit({ windowMs = config.rateLimit.windowMs, max = config.rateLimit.max } = {}) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path.split('/')[2] || 'root'}`;
    const now = Date.now();
    const entry = hits.get(key) || { count: 0, reset: now + windowMs };

    if (now > entry.reset) {
      entry.count = 0;
      entry.reset = now + windowMs;
    }
    entry.count += 1;
    hits.set(key, entry);

    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(Math.max(max - entry.count, 0)));

    if (entry.count > max) {
      return res.status(429).json({ error: 'Too many requests — slow down a little.' });
    }
    next();
  };
}
