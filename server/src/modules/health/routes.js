import { Router } from 'express';
import { dbMode, usingMongo } from '../../db/index.js';
import { connectedClients } from '../realtime/hub.js';
import { llmEnabled } from '../copilot/llm.js';
import { integrations } from '../../integrations/index.js';

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
  ['GET', '/api/stream', 'Server-Sent Events stream of live changes'],
  ['POST', '/api/stream/broadcast', 'Manual broadcast hook'],
];

const router = Router();

router.get('/health', (_req, res) => {
  res.json({
    ok: true,
    db: dbMode(),
    dbPersistent: usingMongo(),
    llm: llmEnabled() ? 'on' : 'off (rule-based chat + audit active)',
    realtime: 'sse',
    clients: connectedClients(),
    integrations: integrations.status(),
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
