// ---------------------------------------------------------------------------
// Vercel entrypoint.
//
// Vercel has no long-lived process and no WebSocket, so this wraps the very
// same Express app that `server.js` listens with: one function serves every
// /api/* route, while the built frontend is served from Vercel's CDN. The
// client needs no special case — its transport ladder already falls through
// WebSocket → SSE → polling on its own.
//
// The default export is an Express app (not just a handler) so it satisfies
// Vercel's Express service runtime. Boot work is cached per warm instance:
// the DB connection, the live ticker and the optional demo seed run once.
// ---------------------------------------------------------------------------

import express from 'express';
import { createApp } from './app.js';
import { connectDB } from './db/index.js';

const inner = createApp();

let bootstrap = null;

async function boot() {
  const mode = await connectDB();

  // The ticker publishes grid intensity + telemetry, and its first tick fires
  // immediately, so a cold instance has live data without a long-lived timer.
  const { startTicks } = await import('./modules/realtime/ticks.js');
  startTicks();

  // Serverless storage is per-instance and ephemeral. DEMO_SEED fills a fresh
  // instance with six weeks of demo data so a keyless deployment still shows a
  // populated dashboard; with MONGODB_URI set the store is durable and the
  // seeder skips itself once entries exist.
  if (process.env.DEMO_SEED && mode !== 'mongo') {
    const { seed } = await import('./scripts/seed.js');
    await seed({ days: 42 }).catch((err) => console.warn(`[vercel] demo seed skipped: ${err.message}`));
  }

  return mode;
}

function ready() {
  // A failed boot must not be cached, or every later request inherits it.
  if (!bootstrap) {
    bootstrap = boot().catch((err) => {
      bootstrap = null;
      throw err;
    });
  }
  return bootstrap;
}

const app = express();

app.use(async (req, res, next) => {
  // A service can be entered with the /api prefix already stripped; restore the
  // path the client asked for so the mounted routes keep matching.
  if (!req.url?.startsWith('/api')) {
    req.url = `/api${!req.url || req.url === '/' ? '' : req.url}`;
  }
  try {
    await ready();
    next();
  } catch (err) {
    next(err);
  }
});

app.use(inner);

export default app;
