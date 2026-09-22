import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Real-time hub — the single bus every transport writes through.
//
// * Clients (WebSocket, Server-Sent Events, in-process test taps) register with
//   a `write(frame)` callback, so a mutation only has to be published once.
// * Every published frame gets a monotonically increasing sequence id and is
//   kept in a short replay buffer, so a browser that drops its connection can
//   resume with Last-Event-ID and receive exactly what it missed — no polling,
//   no gaps.
// * High-frequency signals (telemetry ticks, grid intensity, presence, typing)
//   are published as *ephemeral* frames: they are delivered live but never
//   enter the replay buffer, so a reconnect is not flooded with stale noise.
// * Rolling telemetry (events/min, commands handled, per-transport counts) is
//   what the UI's live Ops console renders.
// ---------------------------------------------------------------------------

const REPLAY_LIMIT = 250;
const startedAt = Date.now();

let seq = 0;
const replayBuffer = [];
const clients = new Map(); // id → { id, transport, page, meta, joinedAt, write, sent }
const transports = new Map(); // name → { broadcast(frame), count() }
const eventTimes = []; // timestamps for events/min
const commandCounts = new Map();

// ---------------------------------------------------------------- clients ---

/**
 * Register any live client. `write(frame)` receives publishable frames
 * ({ id, event, data }) and is responsible for its own wire encoding.
 */
export function registerClient({ transport = 'sse', page = 'unknown', write, meta = {} } = {}) {
  const id = randomUUID();
  clients.set(id, { id, transport, page, meta, write, joinedAt: Date.now(), lastSeen: Date.now(), sent: 0 });
  return id;
}

/** SSE convenience wrapper: encodes frames in the `text/event-stream` format. */
export function subscribe(res, meta = {}) {
  return registerClient({
    transport: 'sse',
    page: meta.page || 'unknown',
    meta,
    write: (frame) => res.write(serialize(frame)),
  });
}

export function writeTo(clientId, frame) {
  const client = clients.get(clientId);
  if (client) deliver(client, frame);
}

export function updateClient(clientId, patch = {}) {
  const client = clients.get(clientId);
  if (!client) return null;
  if (patch.page) client.page = String(patch.page).slice(0, 40);
  if (patch.meta) client.meta = { ...client.meta, ...patch.meta };
  return client;
}

export function clientById(clientId) {
  return clients.get(clientId) || null;
}

export function removeClient(clientId) {
  const client = clients.get(clientId);
  clients.delete(clientId);
  return client || null;
}

// Retained for call sites written before the transport-agnostic registry.
export const unsubscribe = removeClient;

function deliver(client, frame) {
  try {
    client.write(frame);
    client.sent += 1;
    client.lastSeen = Date.now();
  } catch {
    clients.delete(client.id);
  }
}

// ------------------------------------------------------------- publishing ---

/**
 * Publish a frame to every live client and every transport adapter.
 * @param {string} event
 * @param {object} data
 * @param {{replay?: boolean}} options pass `replay: false` for high-frequency
 *        signals that must not pollute the reconnect buffer.
 */
export function publish(event, data, { replay = true } = {}) {
  const frame = {
    id: ++seq,
    event,
    data: { ...data, seq, at: new Date().toISOString() },
    replayable: replay,
  };

  if (replay) {
    replayBuffer.push(frame);
    if (replayBuffer.length > REPLAY_LIMIT) replayBuffer.shift();
  }

  eventTimes.push(Date.now());
  pruneEventTimes();

  for (const client of clients.values()) deliver(client, frame);
  for (const [name, transport] of transports) {
    try {
      transport.broadcast(frame);
    } catch {
      transports.delete(name);
    }
  }
  return frame;
}

// Kept as `broadcast` for call sites that predate the sequenced API.
export const broadcast = publish;

export function serialize({ id, event, data }) {
  // Handshake frames pass id: null — they are not part of the replay sequence.
  const idLine = Number.isFinite(id) ? `id: ${id}\n` : '';
  return `${idLine}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/** Events the client missed while disconnected (ordered, replayable only). */
export function replayFrom(lastEventId) {
  const id = Number(lastEventId);
  if (!Number.isFinite(id)) return [];
  return replayBuffer.filter((frame) => frame.id > id);
}

// -------------------------------------------------------------- transports ---

/**
 * Register a transport adapter (the WebSocket server uses this) so it sees the
 * same stream as the SSE clients.
 * @param {string} name
 * @param {{broadcast: (frame: object) => void, count?: () => number}} adapter
 */
export function registerTransport(name, adapter) {
  transports.set(name, { broadcast: () => {}, count: () => 0, ...adapter });
  return () => transports.delete(name);
}

export function transportNames() {
  return [...transports.keys()];
}

export function transportBreakdown() {
  const byTransport = {};
  for (const client of clients.values()) {
    byTransport[client.transport] = (byTransport[client.transport] || 0) + 1;
  }
  for (const [name, transport] of transports) {
    // Only surface adapter-only transports: clients already report their own
    // transport, so adding both would double-count WebSocket sessions.
    if (byTransport[name]) continue;
    const count = transport.count();
    if (count) byTransport[name] = count;
  }
  return byTransport;
}

// ------------------------------------------------------------ telemetry -----

export function connectedClients() {
  return clients.size;
}

export function presence() {
  return [...clients.values()].map((c) => ({
    id: c.id,
    transport: c.transport,
    joinedAt: new Date(c.joinedAt).toISOString(),
    connectedSeconds: Math.round((Date.now() - c.joinedAt) / 1000),
    sent: c.sent,
    page: c.page || 'unknown',
    typing: Boolean(c.meta?.typing),
  }));
}

export function noteCommand(name, { ok = true } = {}) {
  const key = `${name}${ok ? '' : ':error'}`;
  commandCounts.set(key, (commandCounts.get(key) || 0) + 1);
}

function pruneEventTimes() {
  const cutoff = Date.now() - 60_000;
  while (eventTimes.length && eventTimes[0] < cutoff) eventTimes.shift();
}

export function metrics() {
  pruneEventTimes();
  return {
    subscribers: clients.size,
    eventsTotal: seq,
    eventsLastMinute: eventTimes.length,
    replayBuffer: replayBuffer.length,
    byTransport: transportBreakdown(),
    commands: Object.fromEntries(commandCounts),
    commandsHandled: [...commandCounts.values()].reduce((n, v) => n + v, 0),
    transports: transportNames(),
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    lastEventId: seq,
  };
}
