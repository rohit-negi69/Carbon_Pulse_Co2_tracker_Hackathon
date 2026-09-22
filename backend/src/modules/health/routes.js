import { Router } from 'express';
import { dbMode, usingMongo } from '../../db/index.js';
import { connectedClients, metrics, transportNames } from '../realtime/hub.js';
import { WS_PATH } from '../realtime/ws.js';
import { tickState } from '../realtime/ticks.js';
import { llmEnabled } from '../copilot/llm.js';
import { integrations } from '../../integrations/index.js';
import { classifierState, describeModels } from '../ml/registry.js';

const startedAt = Date.now();

const ROUTES = [
  ['GET', '/api/health', 'Service + dependency status'],
  ['GET', '/api/docs', 'This route table'],
  ['GET', '/api/services', 'External service provider status'],
  ['GET', '/api/factors', 'Emission factor registry'],
  ['POST', '/api/calculate', 'Stateless CO₂ calculation (no write)'],
  ['POST', '/api/simulate', 'What-if swap simulator'],
  ['POST', '/api/activities', 'Log an activity'],
  ['GET', '/api/activities', 'List activities (type, from, to, q, tier)'],
  ['DELETE', '/api/activities/:id', 'Delete an activity'],
  ['GET', '/api/history', 'Audit trail of ledger mutations'],
  ['GET', '/api/dashboard', 'Totals, category breakdown, scope split, week'],
  ['GET', '/api/week', 'Weekly budget, pace and days remaining'],
  ['GET', '/api/insights', 'Charts & insights: trend, weekday profile, mix, deltas'],
  ['GET', '/api/export', 'CSV/JSON ledger export'],
  ['GET', '/api/target · PUT /api/target', 'Read / set the weekly CO₂ target'],
  ['GET', '/api/nudges · POST /api/nudges/read', 'Alerts & nudges feed'],
  ['POST', '/api/chat', 'Hybrid copilot chat (can log activities)'],
  ['GET', '/api/ai/audit', 'AI audit insights (+ ?llm=1 for LLM polish)'],
  ['POST', '/api/chat/stream', 'Streaming copilot reply (SSE, token by token)'],
  ['GET', '/api/ml/report', 'Full ML report: forecast, anomalies, clusters, recommendations'],
  ['GET', '/api/ml/models', 'Model catalogue + trained classifier state'],
  ['GET', '/api/ml/forecast', '7-day forecast with backtest metrics and intervals'],
  ['GET', '/api/ml/anomalies', 'Outlier-scored ledger + learned confirmation thresholds'],
  ['GET', '/api/ml/clusters', 'Behavioural day archetypes (k-means, silhouette-selected k)'],
  ['GET', '/api/ml/recommendations', 'Ranked interventions with quantified kg savings'],
  ['POST', '/api/ml/classify', 'Classify free text into an activity category'],
  ['POST', '/api/ml/train', 'Retrain the text classifier'],
  ['POST', '/api/ml/feedback', 'Store a confirmed label (online learning)'],
  ['POST', '/api/tracking/trips', 'Start a GPS tracking session'],
  ['POST', '/api/tracking/trips/:id/points', 'Append GPS fixes and get a live classification'],
  ['POST', '/api/tracking/classify', 'Classify a raw GPS trace without persisting it'],
  ['POST', '/api/tracking/trips/:id/complete', 'Close a trip and write it to the ledger'],
  ['WS', `${WS_PATH}`, 'Bidirectional WebSocket: events in, commands out (primary transport)'],
  ['GET', '/api/realtime', 'Transport descriptor: socket commands + lifecycle'],
  ['GET', '/api/stream', 'Server-Sent Events stream: hello, snapshot, activity, nudge, presence'],
  ['GET', '/api/stream/state', 'Current metrics + presence + snapshot without subscribing'],
  ['GET', '/api/telemetry', 'Live connection and event-rate telemetry'],
  ['POST', '/api/stream/broadcast', 'Manual broadcast hook'],
];

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    db: dbMode(),
    dbPersistent: usingMongo(),
    llm: llmEnabled() ? 'on' : 'off (rule-based chat + audit active)',
    realtime: {
      primary: 'websocket',
      fallbacks: ['server-sent-events', 'polling'],
      transports: [...new Set(['websocket', ...transportNames()])],
      socket: WS_PATH,
      ticker: tickState(),
    },
    clients: connectedClients(),
    telemetry: metrics(),
    integrations: integrations.status(),
    ml: {
      models: describeModels().length,
      classifier: classifierState().trained ? 'trained' : 'untrained',
      classifierVersion: classifierState().version || null,
      classifierAccuracy: classifierState().metrics?.accuracy ?? null,
    },
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
  });
});

router.get('/docs', (_req, res) => {
  res.json({ name: 'CarbonPulse API', version: '2.0.0', routes: ROUTES.map(([method, path, purpose]) => ({ method, path, purpose })) });
});

router.get('/services', (_req, res) => {
  res.json({ services: integrations.describe() });
});

export default router;
