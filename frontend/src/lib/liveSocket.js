import { api } from './api.js';

// ---------------------------------------------------------------------------
// LiveConnection — the real-time client.
//
// Transport ladder, best first:
//   1. WebSocket  (/api/ws)  — bidirectional: server pushes events, we push
//                              commands ({ id, cmd, payload }) and await acks.
//   2. SSE        (/api/stream) — server → client only; commands fall back to
//                              the REST equivalents, so behaviour is identical.
//   3. Polling    (/api/stream/state) — last resort, keeps the UI honest.
//
// Also handled here: sequenced replay on resume (no gaps, no duplicates),
// latency probes, offline command queueing, streamed copilot replies and
// presence/typing state.
// ---------------------------------------------------------------------------

const API = import.meta.env.VITE_API_URL || '/api';
const MAX_LOG = 80;
const MAX_QUEUE = 25;
const COMMAND_TIMEOUT = 9000;
const CHAT_TIMEOUT = 45_000;
const POLL_MS = 8000;
const POLL_HIDDEN_MS = 30_000;
// A stream that ends on schedule (a serverless duration cap, a proxy timeout)
// is back in well under a second. Only a gap longer than this is shown.
const RECONNECT_GRACE_MS = 2500;
const WS_PATH = `${API.replace(/\/$/, '')}/ws`;

// Deployment-level transport preference. A serverless host cannot hold an open
// stream, so a deployment can set VITE_TRANSPORT=polling: each poll is a short
// request instead of a function invocation held open for the tab's lifetime,
// which is what makes an idle tab cheap. Unset keeps the full ladder.
const PREFERRED = (import.meta.env.VITE_TRANSPORT || '').toLowerCase();
const INITIAL_MODE = ['websocket', 'sse', 'polling'].includes(PREFERRED) ? PREFERRED : 'websocket';

const REST_FALLBACK = {
  ping: () => fetch(`${API}/telemetry`).then(json),
  'stats.get': () => fetch(`${API}/stream/state`).then(json),
  'telemetry.get': () => fetch(`${API}/telemetry`).then(json),
  'activity.log': (p) => post('/activities', p),
  'activity.delete': (p) => fetch(`${API}/activities/${p.id}`, { method: 'DELETE' }).then(json),
  'activity.list': (p) => fetch(`${API}/activities?${new URLSearchParams(clean(p)).toString()}`).then(json),
  'target.set': (p) => put('/target', p),
  'insights.get': () => fetch(`${API}/insights`).then(json),
  'audit.get': () => fetch(`${API}/ai/audit`).then(json),
  'nudges.get': () => fetch(`${API}/nudges?evaluate=1`).then(json),
  simulate: (p) => post('/simulate', p),
  'session.describe': () => Promise.resolve({ commands: Object.keys(REST_FALLBACK) }),
};

const clean = (obj = {}) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''));

async function json(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error?.error || data.error || data.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

const post = (path, body) =>
  fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).then(json);

const put = (path, body) =>
  fetch(`${API}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  }).then(json);

function socketUrl(lastEventId) {
  const base = /^https?:/i.test(API)
    ? (() => {
        const url = new URL(API);
        url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        url.pathname = `${url.pathname.replace(/\/$/, '')}/ws`;
        return url.origin + url.pathname;
      })()
    : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${WS_PATH}`;

  const params = new URLSearchParams({ page: 'carbonpulse' });
  if (lastEventId) params.set('lastEventId', String(lastEventId));
  return `${base}?${params.toString()}`;
}

const INITIAL = {
  status: 'connecting', // connecting | live | reconnecting | polling | offline
  transport: 'none', // websocket | sse | polling
  latencyMs: null,
  serverClockOffset: 0,
  reconnects: 0,
  clients: 1,
  presence: [],
  typing: null,
  lastEventId: null,
  lastEvent: null,
  metrics: null,
  telemetry: null,
  snapshot: null,
  grid: null,
  log: [],
  queueSize: 0,
  error: null,
  mode: 'websocket',
};

export class LiveConnection {
  constructor({ onFrame, onState } = {}) {
    this.state = { ...INITIAL };
    this.onFrame = onFrame || null;
    this.onState = onState || null;
    this.socket = null;
    this.source = null;
    this.timers = { poll: null, ping: null, retry: null, typing: null, grace: null };
    this.pending = new Map();
    this.queue = [];
    this.seq = 0;
    this.attempts = 0;
    this.running = false;
    this.mode = INITIAL_MODE;
    this.state.mode = INITIAL_MODE;
    this.everOpen = false;
    this.restFallback = { ...REST_FALLBACK };
  }

  // ------------------------------------------------------------- lifecycle

  start() {
    if (this.running) return this;
    this.running = true;
    this._connect();
    // Polls already carry metrics, so the extra telemetry probe would only
    // double the request count of an idle tab.
    if (this.mode !== 'polling') this.timers.ping = setInterval(() => this._probe(), 12_000);
    return this;
  }

  stop() {
    this.running = false;
    clearInterval(this.timers.ping);
    clearTimeout(this.timers.poll);
    clearTimeout(this.timers.retry);
    clearTimeout(this.timers.grace);
    if (this._onVisible && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._onVisible);
      this._onVisible = null;
    }
    try {
      this.socket?.close();
    } catch {
      /* already closed */
    }
    this.source?.close();
    this.socket = null;
    this.source = null;
    this._patch({ status: 'offline', transport: 'none' });
  }

  get connected() {
    return this.state.status === 'live';
  }

  _patch(patch) {
    this.state = { ...this.state, ...patch };
    this.onState?.(this.state);
  }

  /**
   * Announce a reconnect only once the gap is real. Flashing "reconnecting"
   * for a sub-second blip reads as breakage when nothing actually broke.
   */
  _noteDrop() {
    if (this.timers.grace) return;
    this.timers.grace = setTimeout(() => {
      this.timers.grace = null;
      if (!this.running) return;
      this._patch({ status: 'reconnecting', reconnects: this.state.reconnects + 1 });
    }, RECONNECT_GRACE_MS);
  }

  _clearDrop() {
    clearTimeout(this.timers.grace);
    this.timers.grace = null;
  }

  // --------------------------------------------------------------- connect

  _connect() {
    if (!this.running) return;
    if (this.mode === 'websocket') this._connectSocket();
    else if (this.mode === 'sse') this._connectSse();
    else this._startPolling();
  }

  _connectSocket() {
    if (typeof WebSocket === 'undefined') {
      this._degrade('sse', 'WebSocket unavailable in this browser');
      return;
    }

    this._patch({ status: this.everOpen ? 'reconnecting' : 'connecting', mode: 'websocket', error: null });

    let socket;
    try {
      socket = new WebSocket(socketUrl(this.state.lastEventId));
    } catch (err) {
      this._degrade('sse', err.message);
      return;
    }
    this.socket = socket;

    socket.onopen = () => {
      this.everOpen = true;
      this.attempts = 0;
      this._lastPing = Date.now();
      socket.send(JSON.stringify({ id: 'probe', cmd: 'ping', payload: { echo: Date.now() } }));
    };

    socket.onmessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      this._onSocketMessage(message);
    };

    socket.onerror = () => {
      this._patch({ error: 'socket error' });
    };

    socket.onclose = () => {
      if (!this.running || this.mode !== 'websocket') return;
      this._noteDrop();
      this.attempts += 1;
      // Zig-zag attempts, then hand over to SSE rather than retrying forever.
      if (!this.everOpen && this.attempts >= 2) {
        this._degrade('sse', 'WebSocket endpoint unreachable');
        return;
      }
      const backoff = Math.min(400 * 2 ** Math.min(this.attempts, 4), 6000) + Math.random() * 250;
      clearTimeout(this.timers.retry);
      this.timers.retry = setTimeout(() => this._connectSocket(), backoff);
    };
  }

  _connectSse() {
    if (typeof EventSource === 'undefined') {
      this._degrade('polling', 'EventSource unavailable');
      return;
    }

    this._patch({ status: 'reconnecting', mode: 'sse', transport: 'sse', error: null });
    const params = new URLSearchParams({ page: 'carbonpulse' });
    if (this.state.lastEventId) params.set('lastEventId', String(this.state.lastEventId));
    const source = new EventSource(`${API}/stream?${params.toString()}`);
    this.source = source;

    source.addEventListener('hello', (event) => {
      let data = {};
      try {
        data = JSON.parse(event.data);
      } catch {
        /* ignore malformed frame */
      }
      this._clearDrop();
      this._seedPosition(data);
      this._patch({
        status: 'live',
        transport: 'sse',
        mode: 'sse',
        clients: data.clients ?? this.state.clients,
        presence: data.presence || this.state.presence,
        metrics: data.metrics || this.state.metrics,
      });
      this._pushLog({ type: 'connected', transport: 'sse' });
    });
    source.addEventListener('open', () => this._patch({ status: 'live', transport: 'sse' }));

    const forward = (name) => (event) => {
      let data = {};
      try {
        data = JSON.parse(event.data);
      } catch {
        /* ignore malformed frame */
      }
      this._onEvent(name, data, event.lastEventId ? Number(event.lastEventId) : null);
    };

    ['snapshot', 'presence', 'telemetry', 'grid', 'activity', 'deleted', 'target', 'nudge', 'typing', 'trip'].forEach((name) =>
      source.addEventListener(name, forward(name))
    );

    source.onerror = () => {
      if (!this.running || this.mode !== 'sse') return;
      this._noteDrop();
      this.attempts += 1;
      if (source.readyState === 2 && this.attempts >= 2) this._degrade('polling', 'SSE unavailable');
    };
  }

  _startPolling() {
    this._patch({ status: 'polling', transport: 'polling', mode: 'polling' });

    // Returning to a backgrounded tab should refresh at once rather than wait
    // out the idle cadence, so it can be slow without feeling stale.
    this._onVisible = () => {
      if (typeof document === 'undefined' || document.hidden) return;
      clearTimeout(this.timers.poll);
      this._poll();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', this._onVisible);

    this._poll();
  }

  async _poll() {
    const started = Date.now();
    try {
      const state = await fetch(`${API}/stream/state`).then(json);
      this._setSnapshot(state.snapshot);
      this._patch({
        metrics: state.metrics || null,
        presence: state.presence || [],
        clients: state.metrics?.subscribers ?? 1,
        latencyMs: Date.now() - started,
      });
      // The grid reading arrives in the same response, so the live-intensity
      // card keeps working without an open stream.
      if (state.grid) this._patch({ grid: state.grid });
      this._pushLog({ type: 'poll' });
    } catch (err) {
      this._patch({ error: err.message });
    }
    this._schedulePoll();
  }

  /**
   * Cadence is the cost dial: a visible tab polls on the tick interval, a
   * backgrounded one backs off — most of an idle tab's lifetime is time nobody
   * is looking at it.
   */
  _schedulePoll() {
    if (!this.running || this.mode !== 'polling') return;
    const hidden = typeof document !== 'undefined' && document.hidden;
    clearTimeout(this.timers.poll);
    this.timers.poll = setTimeout(() => this._poll(), hidden ? POLL_HIDDEN_MS : POLL_MS);
  }

  _degrade(nextMode, reason) {
    if (this.mode === nextMode) return;
    this.mode = nextMode;
    this.attempts = 0;
    this._patch({ mode: nextMode, error: reason, status: 'reconnecting' });
    try {
      this.socket?.close();
    } catch {
      /* ignore */
    }
    this.socket = null;
    clearInterval(this.timers.poll);
    this._connect();
  }

  // ------------------------------------------------------------- inbound

  _onSocketMessage(message) {
    const { kind } = message;
    if (kind === 'hello') {
      this._clearDrop();
      this._serverOffset = (message.data.serverTime || Date.now()) - Date.now();
      this._seedPosition(message.data);
      this._patch({
        status: 'live',
        transport: 'websocket',
        clients: message.data.clients ?? 1,
        presence: message.data.presence || [],
        metrics: message.data.metrics || null,
        error: null,
      });
      this._pushLog({ type: 'connected', transport: 'websocket', protocol: message.data.protocol });
      this._flushQueue();
      return;
    }
    if (kind === 'snapshot') {
      this._setSnapshot(message.data);
      return;
    }
    if (kind === 'event') {
      this._onEvent(message.event, message.data, message.seq);
      return;
    }
    if (kind === 'stream') {
      this.pending.get(message.id)?.onChunk?.(message.chunk);
      return;
    }
    if (kind === 'pong') {
      this._patch({ latencyMs: Math.max(Date.now() - (this._lastPing || Date.now()), 0), serverClockOffset: this._serverOffset || 0 });
      return;
    }
    if (kind === 'ack') {
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      clearTimeout(waiter.timer);
      if (message.ok) waiter.resolve(message.data ?? { ok: true });
      else {
        const err = new Error(message.error?.error || message.error?.message || 'command failed');
        err.data = message.error;
        waiter.reject(err);
      }
      return;
    }
    if (kind === 'error') this._patch({ error: message.error || 'socket error' });
  }

  _setSnapshot(snapshot) {
    if (!snapshot) return;
    this._patch({ snapshot });
  }

  /**
   * Adopt the bus position the handshake advertises (`metrics.lastEventId`).
   * A client that drops before it has ever seen a sequenced frame has no
   * Last-Event-ID of its own; resuming from 0 would replay the whole buffer,
   * while the handshake plus the snapshot that follows it already describe
   * exactly that position. This is where a fresh client learns where it is.
   */
  _seedPosition(data) {
    const position = data?.metrics?.lastEventId;
    if (typeof position !== 'number') return;
    if (position > (this.state.lastEventId || 0)) this._patch({ lastEventId: position });
  }

  _onEvent(type, data = {}, seq) {
    const frame = { type, ...data, at: data.at || new Date().toISOString() };

    if (typeof seq === 'number' && seq > (this.state.lastEventId || 0)) this._patch({ lastEventId: seq });
    else if (typeof data.seq === 'number' && data.seq > (this.state.lastEventId || 0)) this._patch({ lastEventId: data.seq });

    if (type === 'snapshot') this._setSnapshot(data);
    else if (type === 'telemetry') this._patch({ telemetry: data, metrics: data, clients: data.clients ?? this.state.clients });
    else if (type === 'grid') this._patch({ grid: data.grid });
    else if (type === 'presence') this._patch({ presence: data.presence || [], clients: data.clients ?? this.state.clients });
    else if (type === 'typing') this._setTyping(data);

    this._pushLog(frame);
    this.onFrame?.(frame);
  }

  _setTyping(data) {
    if (!data.typing) {
      this._patch({ typing: null });
      return;
    }
    this._patch({ typing: { ...data, expiresAt: Date.now() + 3000 } });
    clearTimeout(this.timers.typing);
    this.timers.typing = setTimeout(() => this._patch({ typing: null }), 3000);
  }

  _pushLog(frame) {
    const entry = { ...frame, at: frame.at || new Date().toISOString() };
    this._patch({ log: [entry, ...this.state.log].slice(0, MAX_LOG), lastEvent: entry });
  }

  // ------------------------------------------------------------ outbound

  /**
   * Run a socket command, waiting for its ack. Falls back to the matching REST
   * call when the socket is not available, so callers never branch on transport.
   */
  send(cmd, payload = {}, { timeoutMs = COMMAND_TIMEOUT, onChunk } = {}) {
    const socket = this.socket;
    if (this.mode === 'websocket' && socket && socket.readyState === 1) {
      return this._sendSocket(cmd, payload, { timeoutMs, onChunk });
    }
    if (this.mode === 'websocket' && socket && socket.readyState === 0) {
      return this._enqueue(cmd, payload, { timeoutMs, onChunk });
    }
    return this._sendRest(cmd, payload, { onChunk });
  }

  _sendSocket(cmd, payload, { timeoutMs, onChunk }) {
    const id = `c${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`"${cmd}" timed out`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, onChunk, timer, cmd });
      try {
        this.socket.send(JSON.stringify({ id, cmd, payload }));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        this._sendRest(cmd, payload, { onChunk }).then(resolve, reject);
      }
    });
  }

  _enqueue(cmd, payload, options) {
    if (this.queue.length >= MAX_QUEUE) this.queue.shift();
    return new Promise((resolve, reject) => {
      const entry = { cmd, payload, options, resolve, reject };
      // A command issued while the socket is still opening waits for the
      // handshake, but never forever: if the connect drags on we run the same
      // command over REST so the UI is not left hanging.
      entry.timer = setTimeout(() => {
        const index = this.queue.indexOf(entry);
        if (index === -1) return;
        this.queue.splice(index, 1);
        this._patch({ queueSize: this.queue.length });
        this._sendRest(cmd, payload, options).then(resolve, reject);
      }, Math.min(options.timeoutMs || COMMAND_TIMEOUT, 6000));
      this.queue.push(entry);
      this._patch({ queueSize: this.queue.length });
    });
  }

  _flushQueue() {
    const queued = this.queue.splice(0, this.queue.length);
    this._patch({ queueSize: 0 });
    for (const item of queued) {
      clearTimeout(item.timer);
      this._sendSocket(item.cmd, item.payload, item.options).then(item.resolve, item.reject);
    }
  }

  async _sendRest(cmd, payload, { onChunk } = {}) {
    if (cmd === 'chat.ask') {
      const result = await api.chatStream(payload.message, payload.history || [], { onChunk });
      return { text: result.text, logged: result.logged, engine: result.engine, transport: 'rest' };
    }
    const handler = this.restFallback[cmd];
    if (!handler) throw new Error(`"${cmd}" needs the live socket — reconnecting`);
    return handler(payload || {});
  }

  /** Streaming copilot call that works on either transport. */
  chat(message, history = [], onChunk) {
    return this.send('chat.ask', { message, history }, { onChunk, timeoutMs: CHAT_TIMEOUT });
  }

  /** Typing indicator for other sessions (no-op over REST). */
  typing(typing = true, page = 'carbonpulse') {
    return this.send('presence.typing', { typing, page }, { timeoutMs: 2500 }).catch(() => ({}));
  }

  _probe() {
    if (this.mode === 'websocket' && this.socket?.readyState === 1) {
      this._lastPing = Date.now();
      try {
        this.socket.send(JSON.stringify({ id: 'probe', cmd: 'ping', payload: { echo: this._lastPing } }));
      } catch {
        /* socket closing */
      }
      return;
    }
    const started = Date.now();
    fetch(`${API}/telemetry`)
      .then((res) => res.json())
      .then((data) => this._patch({ telemetry: data, metrics: data, latencyMs: Date.now() - started, clients: data.subscribers ?? this.state.clients }))
      .catch(() => {});
  }
}

export function createLiveConnection(handlers) {
  return new LiveConnection(handlers);
}
