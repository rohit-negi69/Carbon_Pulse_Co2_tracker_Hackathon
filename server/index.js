import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { FACTORS, ABSURD_THRESHOLDS } from './factors.js';
import { connectDB, insertActivity, listActivities, deleteActivity, getTarget, setTarget, dbMode } from './db.js';
import { currentWeekRange, weekProgress } from './week.js';
import { ruleReply } from './chat/engine.js';
import { askLLM, llmEnabled } from './chat/llm.js';
import { buildAudit, polishAuditWithLLM } from './chat/ai.js';
import { addClient, removeClient, broadcast, connectedClients } from './events.js';

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CLIENT_ORIGIN || '*' }));

// ---------- real-time stream (SSE) ----------
// Every open tab subscribes here; mutations below push an event so all
// sessions update live without polling or refreshing.
app.get('/api/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();
  res.write(`event: hello\ndata: ${JSON.stringify({ clients: connectedClients() + 1, db: dbMode, ts: Date.now() })}\n\n`);
  addClient(res);

  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      clearInterval(keepAlive);
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAlive);
    removeClient(res);
  });
});

// ---------- factors ----------
app.get('/api/factors', (_req, res) => {
  res.json({ factors: FACTORS, thresholds: ABSURD_THRESHOLDS });
});

// ---------- activities ----------
app.post('/api/activities', async (req, res) => {
  const { type, quantity, date, confirmed, notes } = req.body || {};
  const f = FACTORS[type];
  if (!f) {
    return res.status(400).json({ error: `Unknown activity type. Valid types: ${Object.keys(FACTORS).join(', ')}` });
  }
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive number.' });
  }
  const day = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : new Date().toISOString().slice(0, 10);

  // DP2: absurd input → ask for confirmation instead of silently clamping.
  const threshold = ABSURD_THRESHOLDS[type];
  const co2 = +(qty * f.factor).toFixed(2);
  if (!confirmed && threshold && qty > threshold) {
    return res.status(422).json({
      needsConfirmation: true,
      message: `That's ${qty} ${f.unit} ≈ ${co2.toLocaleString()} kg CO₂ — that looks like it might be a typo. Confirm or edit the value.`,
      computedCo2: co2,
    });
  }

  const doc = { type, quantity: qty, date: day, co2, notes: typeof notes === 'string' ? notes.slice(0, 160) : '' };
  const saved = await insertActivity(doc);
  broadcast('activity', { activity: saved, co2, label: f.label });
  res.status(201).json({ activity: saved, co2 });
});

app.get('/api/activities', async (req, res) => {
  const { type, from, to, q, tier } = req.query;
  if (type && !FACTORS[type]) return res.status(400).json({ error: `Unknown type: ${type}` });
  const acts = await listActivities({ type, from, to, q, tier });
  res.json({ activities: acts, count: acts.length });
});

app.delete('/api/activities/:id', async (req, res) => {
  const deleted = await deleteActivity(req.params.id);
  if (!deleted) return res.status(404).json({ error: 'Activity not found' });
  broadcast('deleted', { id: req.params.id });
  res.json({ ok: true });
});

// ---------- dashboard ----------
app.get('/api/dashboard', async (_req, res) => {
  const acts = await listActivities({});
  const total = acts.reduce((s, a) => s + a.co2, 0);
  const byCategory = {};
  for (const t of Object.keys(FACTORS)) byCategory[t] = 0;
  for (const a of acts) byCategory[a.type] = +(byCategory[a.type] + a.co2).toFixed(2);

  const { start, end } = currentWeekRange();
  const weekActs = acts.filter((a) => a.date >= start && a.date <= end);
  const weekTotal = +weekActs.reduce((s, a) => s + a.co2, 0).toFixed(2);
  const target = await getTarget();

  // Top contributor (all time) for the insight / telemetry card
  const ranked = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const topCategory = ranked.length && ranked[0][1] > 0
    ? { type: ranked[0][0], label: FACTORS[ranked[0][0]].label, co2: +ranked[0][1].toFixed(2), share: Math.round((ranked[0][1] / total) * 100) }
    : null;

  // Daily average over the days actually covered by the log (min 1 day)
  const days = new Set(acts.map((a) => a.date)).size || 1;

  res.json({
    total: +total.toFixed(2),
    byCategory,
    activityCount: acts.length,
    dailyAverage: +(total / days).toFixed(2),
    activeDays: days,
    topCategory,
    week: { start, end, used: weekTotal, target, pct: target > 0 ? Math.round((weekTotal / target) * 100) : 0, exceeded: weekTotal > target },
  });
});

// ---------- weekly target ----------
app.get('/api/target', async (_req, res) => {
  res.json({ weeklyTarget: await getTarget() });
});

app.put('/api/target', async (req, res) => {
  const v = Number(req.body?.weeklyTarget);
  if (!Number.isFinite(v) || v <= 0) return res.status(400).json({ error: 'weeklyTarget must be a positive number (kg CO₂).' });
  if (v > 100000) return res.status(422).json({ needsConfirmation: true, message: 'That target is very large — confirm it is intended in kg CO₂ per week.', computed: v });
  const weeklyTarget = await setTarget(v);
  broadcast('target', { weeklyTarget });
  res.json({ weeklyTarget });
});

// ---------- week progress (DP3) ----------
app.get('/api/week', async (_req, res) => {
  const { start, end } = currentWeekRange();
  const acts = await listActivities({ from: start, to: end });
  const used = +acts.reduce((s, a) => s + a.co2, 0).toFixed(2);
  const target = await getTarget();
  const { daysElapsed, daysRemaining } = weekProgress();
  const pct = target > 0 ? Math.round((used / target) * 100) : 0;
  // pace: what % of the week has elapsed vs what % of budget is used
  const elapsedPct = Math.round((daysElapsed / 7) * 100);
  const pace = pct > elapsedPct + 10 ? 'behind' : pct < elapsedPct - 10 ? 'ahead' : 'on-track';
  res.json({ start, end, daysElapsed, daysRemaining, elapsedPct, used, target, pct, exceeded: used > target, pace });
});

// ---------- chatbot (hybrid) ----------
app.post('/api/chat', async (req, res) => {
  const { message, history } = req.body || {};
  if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message is required' });

  // Build live stats for the LLM grounding; also used to execute rule-based log actions.
  const acts = await listActivities({});
  const total = +acts.reduce((s, a) => s + a.co2, 0).toFixed(2);
  const { start, end } = currentWeekRange();
  const weekUsed = +acts.filter((a) => a.date >= start && a.date <= end).reduce((s, a) => s + a.co2, 0).toFixed(2);
  const target = await getTarget();
  const stats = { totalKg: total, weekStart: start, weekEnd: end, weekUsedKg: weekUsed, weeklyTargetKg: target };

  const rule = await ruleReply({ message });

  if (llmEnabled()) {
    const llm = await askLLM({ message, history, stats });
    if (llm) return res.json({ ...llm, engine: 'llm' });
  }

  // Execute any logging action the rule engine detected.
  if (rule.action?.type === 'log') {
    const f = FACTORS[rule.action.activityType];
    const co2 = +(rule.action.quantity * f.factor).toFixed(2);
    const saved = await insertActivity({ type: rule.action.activityType, quantity: rule.action.quantity, date: new Date().toISOString().slice(0, 10), co2, notes: 'logged via chat' });
    broadcast('activity', { activity: saved, co2, label: f.label, source: 'chat' });
    return res.json({ ...rule, engine: 'rules', logged: saved });
  }

  res.json({ ...rule, engine: 'rules' });
});

// ---------- AI audit (deterministic + optional LLM polish) ----------
app.get('/api/ai/audit', async (req, res) => {
  const audit = await buildAudit();
  if (req.query.llm === '1') {
    const polished = await polishAuditWithLLM(audit);
    if (polished) return res.json({ ...audit, summary: polished.summary, nextBestAction: polished.nextBestAction, engine: 'hybrid (rules + LLM)' });
  }
  res.json(audit);
});

// ---------- health ----------
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    db: dbMode,
    llm: llmEnabled() ? 'on' : 'off (rule-based chat + audit active)',
    realtime: 'sse',
    clients: connectedClients(),
  });
});

const PORT = Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 3001;
connectDB(process.env.MONGODB_URI).then(() => {
  app.listen(PORT, () => console.log(`[server] listening on :${PORT} (db=${dbMode})`));
});
