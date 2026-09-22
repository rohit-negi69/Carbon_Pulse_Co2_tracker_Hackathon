// WebSocket transport tests: handshake, bidirectional commands, sequenced
// replay on resume, streaming copilot replies, presence and typing, and the
// always-on telemetry/grid ticker.
//
// Uses Node's built-in WebSocket client (Node 22+) — the server side is our own
// RFC 6455 implementation, so this exercises the real wire protocol.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/app.js';
import { attachWebSocket } from '../src/modules/realtime/ws.js';
import { startTicks, stopTicks } from '../src/modules/realtime/ticks.js';

process.env.NODE_ENV = 'test';

const app = createApp();
const server = createServer(app);
const ws = attachWebSocket(server);
server.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}/api`;
const wsUrl = `ws://127.0.0.1:${port}/api/ws`;
const sockets = new Set();

test.after(() => {
  for (const s of sockets) s.close();
  stopTicks();
  ws.close();
  server.closeAllConnections?.();
  server.close();
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Opens a WebSocket and exposes a tiny inbox: `next(predicate)` resolves with
 * the first matching frame, `send(cmd, payload, id)` awaits the matching ack.
 */
function connect({ page = 'test', lastEventId } = {}) {
  const url = `${wsUrl}?page=${page}${lastEventId ? `&lastEventId=${lastEventId}` : ''}`;
  const socket = new WebSocket(url);
  sockets.add(socket);

  const inbox = [];
  const pending = [];
  let seq = 0;
  let closed = false;

  const deliver = (frame) => {
    inbox.push(frame);
    for (let i = pending.length - 1; i >= 0; i--) {
      const waiter = pending[i];
      if (waiter.predicate(frame)) {
        pending.splice(i, 1);
        waiter.resolve(frame);
      }
    }
  };

  socket.addEventListener('message', (event) => {
    try {
      deliver(JSON.parse(event.data));
    } catch {
      /* ignore malformed frame */
    }
  });
  socket.addEventListener('close', () => {
    closed = true;
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(api));
    socket.addEventListener('error', () => reject(new Error('socket failed to open')));
    setTimeout(() => reject(new Error('socket open timed out')), 3000);
  });

  const api = {
    socket,
    get frames() {
      return inbox;
    },
    get closed() {
      return closed;
    },
    next(predicate, { timeoutMs = 3000, hint = 'frame' } = {}) {
      const existing = inbox.find(predicate);
      if (existing) return Promise.resolve(existing);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          const index = pending.findIndex((p) => p.reject === reject);
          if (index > -1) pending.splice(index, 1);
          reject(new Error(`timed out waiting for ${hint}`));
        }, timeoutMs);
        pending.push({
          predicate,
          resolve: (frame) => {
            clearTimeout(timer);
            resolve(frame);
          },
          reject,
        });
      });
    },
    ofType(kind, options) {
      return api.next((f) => f.kind === kind, { hint: `kind=${kind}`, ...options });
    },
    ofEvent(event, options) {
      return api.next((f) => f.kind === 'event' && f.event === event, { hint: `event=${event}`, ...options });
    },
    async send(cmd, payload = {}, { timeoutMs = 4000 } = {}) {
      const id = `c${++seq}`;
      socket.send(JSON.stringify({ id, cmd, payload }));
      const ack = await api.next((f) => f.kind === 'ack' && f.id === id, { timeoutMs, hint: `ack for ${cmd}` });
      return ack;
    },
    async sendRaw(raw) {
      socket.send(JSON.stringify(raw));
    },
    close() {
      try {
        socket.close();
      } catch {
        /* already closing */
      }
      sockets.delete(socket);
    },
  };

  api.ready = ready;
  return api;
}

const postJson = (path, body) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('socket handshake announces the transport, roster and a live snapshot', async () => {
  const client = connect({ page: 'handshake' });
  await client.ready;

  const hello = await client.ofType('hello');
  assert.equal(hello.data.transport, 'websocket');
  assert.equal(hello.data.protocol, 'carbonpulse.v1');
  assert.equal(hello.data.db, 'memory');
  assert.ok(hello.data.presence.some((p) => p.transport === 'websocket' && p.page === 'handshake'));
  assert.ok(hello.data.metrics.transports.includes('websocket'));

  const snapshot = await client.ofType('snapshot');
  assert.ok('total' in snapshot.data && 'week' in snapshot.data);

  client.close();
});

test('the socket is bidirectional: commands execute through the service layer', async () => {
  const client = connect({ page: 'commands' });
  await client.ready;

  const pong = await client.send('ping', { echo: 'rtt' });
  assert.equal(pong.ok, true);
  assert.equal(pong.data.echo, 'rtt');
  assert.ok(pong.data.serverTime > 0);

  const stats = await client.send('stats.get');
  assert.equal(stats.ok, true);
  assert.ok(stats.data.snapshot.week.target > 0);
  assert.ok(typeof stats.data.metrics.eventsTotal === 'number');

  const sim = await client.send('simulate', { fromType: 'car', toType: 'bus', quantity: 30 });
  assert.equal(sim.ok, true);
  assert.equal(sim.data.saving, 3.6);

  const unknown = await client.send('not.a.command');
  assert.equal(unknown.ok, false);
  assert.match(unknown.error.error, /unknown command/);

  client.close();
});

test('activity.log over the socket writes, acknowledges and pushes to other sessions', async () => {
  const observer = connect({ page: 'observer' });
  const writer = connect({ page: 'writer' });
  await Promise.all([observer.ready, writer.ready]);

  const ack = await writer.send('activity.log', { type: 'car', quantity: 20, notes: 'socket write' });
  assert.equal(ack.ok, true);
  assert.equal(ack.data.co2, 4);
  assert.equal(ack.data.factor.label, 'Car travel');

  // The observer is a different session: it learns about the write from the bus.
  const pushed = await observer.ofEvent('activity');
  assert.equal(pushed.data.activity.notes, 'socket write');
  assert.equal(pushed.data.co2, 4);

  const snapshot = await observer.next(
    (f) => f.kind === 'event' && f.event === 'snapshot' && f.data.recent?.some((r) => r.notes === 'socket write'),
    { hint: 'pushed snapshot' }
  );
  assert.equal(snapshot.data.week.pushedBy, undefined);
  assert.ok(snapshot.data.activityCount >= 1);

  const removed = await writer.send('activity.delete', { id: ack.data.activity._id });
  assert.equal(removed.ok, true);

  const missing = await writer.send('activity.delete', { id: 'does-not-exist' });
  assert.equal(missing.ok, false);

  observer.close();
  writer.close();
});

test('DP2 confirmation travels over the socket as well', async () => {
  const client = connect({ page: 'dp2' });
  await client.ready;

  const flagged = await client.send('activity.log', { type: 'car', quantity: 500_000 });
  assert.equal(flagged.ok, false);
  assert.equal(flagged.error.needsConfirmation, true);
  assert.ok(flagged.error.computedCo2 > 0);

  const confirmed = await client.send('activity.log', { type: 'car', quantity: 500_000, confirmed: true });
  assert.equal(confirmed.ok, true);
  assert.equal(confirmed.data.co2, 100_000);

  await client.send('activity.delete', { id: confirmed.data.activity._id });
  client.close();
});

test('chat.ask streams tokens then resolves with the full reply', async () => {
  const client = connect({ page: 'chat' });
  await client.ready;

  const id = 'c-chat';
  client.socket.send(JSON.stringify({ id, cmd: 'chat.ask', payload: { message: 'I drove 15 km' } }));

  const firstChunk = await client.next((f) => f.kind === 'stream' && f.id === id, { hint: 'stream chunk' });
  assert.ok(firstChunk.chunk.length > 0);

  const ack = await client.next((f) => f.kind === 'ack' && f.id === id, { timeoutMs: 8000, hint: 'chat ack' });
  assert.equal(ack.ok, true);
  assert.equal(ack.data.streaming, true);
  assert.match(ack.data.text, /15 km/);
  assert.ok(ack.data.logged, 'the copilot logs the described activity');

  const chunks = client.frames.filter((f) => f.kind === 'stream' && f.id === id);
  assert.ok(chunks.length > 3, `expected a streamed reply, got ${chunks.length} chunks`);

  client.close();
});

test('a resuming socket replays exactly the frames it missed', async () => {
  const first = connect({ page: 'replay-a' });
  await first.ready;
  const hello = await first.ofType('hello');
  const seen = Math.max(...first.frames.filter((f) => typeof f.seq === 'number').map((f) => f.seq), hello.data.metrics.lastEventId);
  first.close();

  // While the client is away, an entry is logged by someone else.
  await postJson('/activities', { type: 'bus', quantity: 12, notes: 'replay-over-socket' });

  const second = connect({ page: 'replay-b', lastEventId: seen });
  await second.ready;

  const replayed = await second.ofEvent('activity');
  assert.equal(replayed.data.activity.notes, 'replay-over-socket');
  assert.ok(replayed.seq > seen, 'replayed frames are newer than the resume point');
  assert.ok(
    second.frames.every((f) => typeof f.seq !== 'number' || f.seq > seen),
    'nothing older than the resume point is replayed'
  );

  second.close();
});

test('typing indicators reach the other sessions', async () => {
  const a = connect({ page: 'typing-a' });
  const b = connect({ page: 'typing-b' });
  await Promise.all([a.ready, b.ready]);

  const ack = await a.send('presence.typing', { typing: true, page: 'typing-a' });
  assert.equal(ack.ok, true);

  const typing = await b.ofEvent('typing');
  assert.equal(typing.data.typing, true);
  assert.equal(typing.data.page, 'typing-a');

  a.close();
  b.close();
});

test('the ticker broadcasts grid intensity and telemetry without any request', async () => {
  startTicks({ intervalMs: 400 });

  const client = connect({ page: 'ticker' });
  await client.ready;

  const grid = await client.ofEvent('grid', { timeoutMs: 3000 });
  assert.equal(typeof grid.data.grid.intensity, 'number');
  assert.ok(grid.data.grid.intensity > 0 && grid.data.grid.intensity < 2);
  assert.ok(grid.data.grid.source);
  assert.ok(Array.isArray(grid.data.grid.spark));
  assert.equal(typeof grid.data.grid.trend, 'string');

  const telemetry = await client.ofEvent('telemetry', { timeoutMs: 3000 });
  assert.ok(telemetry.data.clients >= 1);
  assert.equal(typeof telemetry.data.eventsLastMinute, 'number');
  assert.ok(Array.isArray(telemetry.data.presence));

  stopTicks();
  client.close();
  await wait(50);
});

test('the realtime descriptor documents transports and socket commands', async () => {
  const res = await fetch(`${base}/realtime`);
  const body = await res.json();

  assert.equal(body.transports[0].name, 'websocket');
  assert.equal(body.transports[0].direction, 'bidirectional');
  assert.equal(body.lifecycle.resumable.length > 0, true);
  assert.ok(body.socketCommands.some((c) => c.cmd === 'activity.log'));
  assert.ok(body.socketCommands.some((c) => c.cmd === 'chat.ask'));
  assert.ok(body.events.includes('telemetry'));

  const health = await (await fetch(`${base}/health`)).json();
  assert.equal(health.realtime.primary, 'websocket');
  assert.ok(health.realtime.fallbacks.includes('server-sent-events'));
});
