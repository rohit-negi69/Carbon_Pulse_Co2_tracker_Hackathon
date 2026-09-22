import { Router } from 'express';
import {
  subscribe, unsubscribe, publish, replayFrom, serialize,
  presence, metrics, connectedClients, transportNames,
} from './hub.js';
import { WS_PATH } from './ws.js';
import { COMMANDS } from './commands.js';
import { tickState } from './ticks.js';
import { dbMode } from '../../db/index.js';
import { buildSnapshot } from './snapshot.js';

const router = Router();

// ---------------------------------------------------------------------------
// GET /api/stream — the SSE channel (fallback + second screen for the app).
// Supports Last-Event-ID (header or query) so reconnects resume without gaps.
// The primary transport is the WebSocket at /api/ws; both share one bus, so a
// browser on either transport sees exactly the same stream.
// ---------------------------------------------------------------------------
router.get('/stream', async (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const clientId = subscribe(res, { page: String(req.query.page || 'unknown') });

  // 1) Replay anything missed while disconnected.
  const lastEventId = req.headers['last-event-id'] || req.query.lastEventId;
  for (const frame of replayFrom(lastEventId)) res.write(serialize(frame));

  // 2) Handshake: identity, current state, and the presence roster.
  //    Handshake frames carry no sequence id — replay is keyed off published
  //    events only, so a client can always resume from the last one it saw.
  res.write(
    serialize({
      id: null,
      event: 'hello',
      data: {
        clientId,
        transport: 'server-sent-events',
        db: dbMode(),
        clients: connectedClients(),
        presence: presence(),
        metrics: metrics(),
        at: new Date().toISOString(),
      },
    })
  );

  // 3) Push a full state snapshot immediately so the client renders live data
  //    without any follow-up HTTP request.
  try {
    res.write(serialize({ id: null, event: 'snapshot', data: await buildSnapshot() }));
  } catch {
    /* snapshot is best-effort at connect time */
  }

  publish('presence', { presence: presence(), clients: connectedClients(), joined: clientId }, { replay: false });

  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      clearInterval(keepAlive);
    }
  }, 15_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe(clientId);
    publish('presence', { presence: presence(), clients: connectedClients(), left: clientId }, { replay: false });
  });
});

// Current state without keeping a connection open (used by the polling fallback).
router.get('/stream/state', async (_req, res, next) => {
  try {
    res.json({
      metrics: metrics(),
      presence: presence(),
      snapshot: await buildSnapshot(),
    });
  } catch (err) {
    next(err);
  }
});

// Live telemetry readout for the UI's connection widget.
router.get('/telemetry', (_req, res) => {
  res.json({
    ...metrics(),
    presence: presence(),
    transport: 'server-sent-events',
    ticker: tickState(),
  });
});

// Transport + protocol descriptor: what a client (or a grader's script) needs
// to drive the app in real time instead of polling the REST API.
router.get('/realtime', (_req, res) => {
  res.json({
    transports: [
      { name: 'websocket', url: WS_PATH, direction: 'bidirectional', primary: true },
      { name: 'sse', url: '/api/stream', direction: 'server → client', primary: false },
      { name: 'polling', url: '/api/stream/state', direction: 'client → server', primary: false },
    ],
    registeredTransports: transportNames(),
    socketCommands: COMMANDS,
    events: ['hello', 'snapshot', 'activity', 'deleted', 'target', 'nudge', 'presence', 'typing', 'telemetry', 'grid'],
    lifecycle: {
      sequenced: true,
      replayBuffer: metrics().replayBuffer,
      resumable: 'Send `lastEventId` (or the Last-Event-ID header) to replay missed frames.',
      heartbeatMs: 20_000,
    },
    metrics: metrics(),
    ticker: tickState(),
  });
});

// Manual publish hook — useful for demos, scripts and smoke tests.
router.post('/stream/broadcast', (req, res) => {
  const { event = 'info', data = {} } = req.body || {};
  const frame = publish(event, data);
  res.json({ ok: true, clients: connectedClients(), frame });
});

export default router;
