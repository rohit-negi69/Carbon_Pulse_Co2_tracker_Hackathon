// API test suite (node:test, no extra dependencies).
// Boots the app in-process on an ephemeral port and exercises the required
// features plus the three decision-point behaviours.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

process.env.NODE_ENV = 'test';

const app = createApp();
const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}/api`;

const get = async (path) => {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
};
const post = async (path, body) => {
  const res = await fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};

test.after(() => server.close());

test('health reports dependencies', async () => {
  const { status, body } = await get('/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
  assert.ok(['mongo', 'memory'].includes(body.db));
  assert.equal(body.realtime.primary, 'websocket');
  assert.ok(body.realtime.fallbacks.includes('server-sent-events'));
  assert.equal(body.realtime.socket, '/api/ws');
});

test('CO₂ calculation engine applies the fixed factors', async () => {
  const cases = [
    { type: 'car', quantity: 10, expected: 2 },
    { type: 'bus', quantity: 10, expected: 0.8 },
    { type: 'flight', quantity: 10, expected: 2.5 },
    { type: 'electricity', quantity: 10, expected: 8 },
    { type: 'veg_meal', quantity: 2, expected: 1 },
    { type: 'non_veg_meal', quantity: 2, expected: 4 },
  ];
  for (const c of cases) {
    const { body } = await post('/calculate', { type: c.type, quantity: c.quantity });
    assert.equal(body.co2, c.expected, `${c.type}: expected ${c.expected}, got ${body.co2}`);
  }
});

test('log an activity, then read it back with filters', async () => {
  const created = await post('/activities', { type: 'car', quantity: 10, notes: 'test commute' });
  assert.equal(created.status, 201);
  assert.equal(created.body.co2, 2);
  assert.equal(created.body.activity.tier, 'med');

  const filtered = await get('/activities?type=car&q=commute');
  assert.ok(filtered.body.activities.some((a) => a.notes === 'test commute'));

  const tiered = await get('/activities?tier=high');
  assert.equal(tiered.body.activities.filter((a) => a.co2 <= 10).length, 0);
});

test('DP2 — absurd input asks for confirmation instead of clamping', async () => {
  const first = await post('/activities', { type: 'car', quantity: 500000 });
  assert.equal(first.status, 422);
  assert.equal(first.body.needsConfirmation, true);
  assert.equal(first.body.computedCo2, 100000);

  const confirmed = await post('/activities', { type: 'car', quantity: 500000, confirmed: true });
  assert.equal(confirmed.status, 201);
  assert.equal(confirmed.body.co2, 100000);
});

test('DP3 — weeks start Monday and report pace', async () => {
  const { body } = await get('/week');
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(body.start));
  const [y, m, d] = body.start.split('-').map(Number);
  assert.equal(new Date(y, m - 1, d).getDay(), 1, 'week must start on a Monday');
  assert.ok(['ahead', 'on-track', 'behind'].includes(body.pace));
  assert.ok(body.daysRemaining >= 0 && body.daysRemaining <= 6);
});

test('DP1 — exceeding the target creates an encouraging nudge and never blocks writes', async () => {
  await fetch(base + '/target', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weeklyTarget: 1 }),
  });

  const logged = await post('/activities', { type: 'flight', quantity: 100 });
  assert.equal(logged.status, 201, 'logging must still work after exceeding the target');

  const { body: nudges } = await get('/nudges?evaluate=1');
  const exceeded = nudges.notifications.find((n) => n.kind === 'exceeded');
  assert.ok(exceeded, 'an exceeded nudge should be recorded');
  assert.match(exceeded.body, /awareness|swap|trim/i);
  assert.ok(!/shame|blocked|locked/i.test(exceeded.body));
});

test('dashboard reports totals, category breakdown, scopes and top contributor', async () => {
  const { body } = await get('/dashboard');
  assert.ok(body.total > 0);
  assert.ok(Object.keys(body.byCategory).length >= 6);
  assert.ok(body.topCategory && body.topCategory.share > 0);
  assert.ok(typeof body.dailyAverage === 'number');
  assert.ok(body.scopeBreakdown['scope-1'] >= 0);
});

test('insights returns trend, weekday profile, mix and week-over-week delta', async () => {
  const { body } = await get('/insights');
  assert.equal(body.trend.length, 14);
  assert.equal(body.weekdayTotals.length, 7);
  assert.ok(Array.isArray(body.mix));
  assert.ok('deltaPct' in body);
  assert.ok(body.summaries.length >= 1, 'a weekly rollup should be persisted');
});

test('what-if simulator quantifies a swap', async () => {
  const { body } = await post('/simulate', { fromType: 'car', toType: 'bus', quantity: 30 });
  assert.equal(body.before, 6);
  assert.equal(body.after, 2.4);
  assert.equal(body.saving, 3.6);
});

test('copilot answers questions and logs from natural language', async () => {
  const question = await post('/chat', { message: "what's my footprint?" });
  assert.equal(question.status, 200);
  assert.match(question.body.reply, /footprint/i);

  const logging = await post('/chat', { message: 'I drove 15 km' });
  assert.equal(logging.body.engine, 'rules');
  assert.ok(logging.body.logged, 'chat should create an activity');
  assert.equal(logging.body.logged.co2, 3);
});

test('AI audit produces prioritised insights and a projection', async () => {
  const { body } = await get('/ai/audit');
  assert.ok(body.insights.length >= 2);
  assert.ok(typeof body.projection === 'number');
  assert.ok(body.nextBestAction.length > 0);
  assert.match(body.engine, /rules/);
});

test('history records every mutation', async () => {
  const { body } = await get('/history?limit=50');
  const actions = new Set(body.history.map((h) => h.action));
  assert.ok(actions.has('created'));
  assert.ok(actions.has('deleted') || actions.has('target-changed'));
});

test('CSV export mirrors the filtered ledger', async () => {
  const res = await fetch(`${base}/export?format=csv`);
  const csv = await res.text();
  assert.match(res.headers.get('content-type'), /text\/csv/);
  assert.match(csv.split('\n')[0], /date,type,label/);
  assert.ok(csv.split('\n').length > 1);
});

test('validation rejects unknown types and bad quantities', async () => {
  assert.equal((await post('/activities', { type: 'rocket', quantity: 5 })).status, 400);
  assert.equal((await post('/activities', { type: 'car', quantity: -3 })).status, 400);
  assert.equal((await post('/activities', { type: 'car' })).status, 400);
});

test('docs endpoint lists the API surface', async () => {
  const { body } = await get('/docs');
  assert.ok(body.routes.length > 15);
  assert.ok(body.routes.some((r) => r.path.includes('/stream')));
});
