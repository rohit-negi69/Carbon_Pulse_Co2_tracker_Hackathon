// ---------------------------------------------------------------------------
// Vercel serverless entry.
//
// Vercel cannot hold a WebSocket or a long-lived process, so this file adapts
// the very same Express app that `src/server.js` listens with: one function
// serves every /api/* route, while the built frontend is served from Vercel's
// CDN. The client needs no special case — its transport ladder already falls
// through WebSocket → SSE → polling on its own.
//
// Everything here is cached per warm instance: the DB connection, the live
// ticker and (optionally) the demo seed run once, not once per request.
// ---------------------------------------------------------------------------

import { createApp } from '../backend/src/app.js';
import { connectDB } from '../backend/src/db/index.js';
import { startTicks } from '../backend/src/modules/realtime/ticks.js';

const app = createApp();

let bootstrap = null;

async function boot() {
  const mode = await connectDB();

  // The ticker publishes grid intensity + telemetry. Its first tick fires
  // immediately, so a cold instance has live data without waiting a cadence.
  startTicks();

  // Serverless storage is per-instance and ephemeral. DEMO_SEED fills a fresh
  // instance with six weeks of demo data so a keyless deployment still shows a
  // populated dashboard; with MONGODB_URI set the data is durable and the
  // seeder skips itself once entries exist.
  if (process.env.DEMO_SEED && mode !== 'mongo') {
    const { seed } = await import('../backend/src/scripts/seed.js');
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

export default async function handler(req, res) {
  // Vercel can address this function by its rewritten path; normalise so
  // Express always sees the route the client actually asked for.
  if (!req.url?.startsWith('/api')) {
    req.url = `/api${!req.url || req.url === '/' ? '' : req.url}`;
  }

  await ready();
  return app(req, res);
}
