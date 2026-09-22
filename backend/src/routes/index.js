import { Router } from 'express';

import healthRoutes from '../modules/health/routes.js';
import calculationRoutes from '../modules/calculation/routes.js';
import activityRoutes from '../modules/activities/routes.js';
import analyticsRoutes from '../modules/analytics/routes.js';
import targetRoutes from '../modules/targets/routes.js';
import nudgeRoutes from '../modules/nudges/routes.js';
import copilotRoutes from '../modules/copilot/routes.js';
import realtimeRoutes from '../modules/realtime/routes.js';

// ---------------------------------------------------------------------------
// REST API surface. Every feature module contributes its own router; this file
// is the single place that defines the public API shape.
// ---------------------------------------------------------------------------

const api = Router();

api.use(healthRoutes);       // /health, /docs, /services
api.use(calculationRoutes);  // /factors, /calculate, /simulate   (CO₂ engine)
api.use(activityRoutes);     // /activities, /history             (activity management)
api.use(analyticsRoutes);    // /dashboard, /week, /insights, /export
api.use(targetRoutes);       // /target                           (weekly target)
api.use(nudgeRoutes);        // /nudges                           (alerts & nudges)
api.use(copilotRoutes);      // /chat, /ai/audit                  (AI layer)
api.use(realtimeRoutes);     // /stream                           (real-time hub)

export default api;
