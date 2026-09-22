import { createHash } from 'node:crypto';
import {
  registerClient, removeClient, updateClient, publish, replayFrom, presence,
  metrics, connectedClients, registerTransport, noteCommand,
} from './hub.js';
import { dbMode } from '../../db/index.js';
import { handleCommand } from './commands.js';
import { buildSnapshot } from './snapshot.js';

// ---------------------------------------------------------------------------
// WebSocket transport — implemented directly on Node's HTTP upgrade with the
// RFC 6455 frame codec, so the real-time channel needs no extra dependency.
//
// The socket is bidirectional: the server pushes events (activity, snapshot,
// nudge, telemetry, grid, typing) and the client sends commands
// ({ id, cmd, payload }) that execute through the same service layer the REST
// routes use, then answers with an `ack` frame. That makes the UI able to log,
// delete, retarget, simulate and chat without a single HTTP round-trip.
// ---------------------------------------------------------------------------

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
export const WS_PATH = '/api/ws';
const MAX_PAYLOAD = 128 * 1024;
const HEARTBEAT_MS = 20_000;
const MAX_BUFFERED = 1 << 20; // 1 MiB of unwritten socket data → shed frames
const COMMAND_BUDGET = 60; // commands per rolling 10s per socket

const OP = { CONT: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xa };

// ----------------------------------------------------------- frame codec ---

function encodeFrame(opcode, payload = Buffer.alloc(0)) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.alloc(2);
    header[1] = len;
  } else if (len < 65_536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(len, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  header[0] = 0x80 | opcode; // FIN + opcode (server frames are never fragmented)
  return Buffer.concat([header, payload]);
}

/**
 * Incremental RFC 6455 frame parser. Feed it chunks from the socket; it calls
 * back with complete text messages and control frames.
 */
class FrameParser {
  constructor({ onMessage, onPing, onPong, onClose, onProtocolError, maxPayload = MAX_PAYLOAD }) {
    this.buf = Buffer.alloc(0);
    this.fragments = [];
    this.fragmentOpcode = null;
    this.maxPayload = maxPayload;
    Object.assign(this, { onMessage, onPing, onPong, onClose, onProtocolError });
  }

  push(chunk) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;

    while (true) {
      if (this.buf.length < 2) return;

      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;

      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(this.maxPayload)) return this.fail(1009, 'frame too large');
        len = Number(big);
        offset = 10;
      }

      if (len > this.maxPayload) return this.fail(1009, 'frame too large');
      if (!masked) return this.fail(1002, 'client frames must be masked');

      const total = offset + 4 + len;
      if (this.buf.length < total) return;

      const key = this.buf.subarray(offset, offset + 4);
      const payload = Buffer.from(this.buf.subarray(offset + 4, total));
      for (let i = 0; i < payload.length; i += 1) payload[i] ^= key[i & 3];
      this.buf = this.buf.subarray(total);

      if (opcode === OP.CLOSE) {
        this.onClose?.(payload);
        return;
      }
      if (opcode === OP.PING) {
        this.onPing?.(payload);
        continue;
      }
      if (opcode === OP.PONG) {
        this.onPong?.(payload);
        continue;
      }
      if (opcode === OP.BINARY) {
        // Binary frames are not part of this protocol; ignore quietly.
        continue;
      }

      if (opcode === OP.CONT) {
        if (this.fragmentOpcode == null) return this.fail(1002, 'unexpected continuation');
        this.fragments.push(payload);
      } else {
        this.fragmentOpcode = opcode;
        this.fragments = [payload];
      }

      if (!fin) continue;

      const message = Buffer.concat(this.fragments);
      this.fragments = [];
      this.fragmentOpcode = null;
      this.onMessage?.(message.toString('utf8'));
    }
  }

  fail(code, reason) {
    this.onProtocolError?.(code, reason);
  }
}

// ------------------------------------------------------------- bot class ---

/** One connected browser tab. Owns its socket, budget and outbound framing. */
class SocketClient {
  constructor({ socket, url, state }) {
    this.socket = socket;
    this.state = state;
    this.alive = true;
    this.commandTimes = [];
    this.counted = true;

    this.parser = new FrameParser({
      onMessage: (text) => this.onMessage(text),
      onPing: (payload) => this.raw(encodeFrame(OP.PONG, payload)),
      onPong: () => {
        this.alive = true;
      },
      onClose: () => this.close(1000, 'closed by client'),
      onProtocolError: (code, reason) => this.close(code, reason),
    });

    socket.on('data', (chunk) => this.parser.push(chunk));
    socket.on('error', () => this.destroy());
    socket.on('close', () => this.destroy());

    this.clientId = registerClient({
      transport: 'websocket',
      page: String(url.searchParams.get('page') || 'unknown'),
      write: (frame) => this.sendEvent(frame),
    });
    state.clients.add(this);

    this.handshake(url);
  }

  async handshake(url) {
    this.send({
      kind: 'hello',
      data: {
        clientId: this.clientId,
        transport: 'websocket',
        protocol: 'carbonpulse.v1',
        db: dbMode(),
        clients: connectedClients(),
        presence: presence(),
        metrics: metrics(),
        serverTime: Date.now(),
      },
    });

    // Replay whatever the client missed before it reconnected.
    const since = url.searchParams.get('lastEventId') || url.searchParams.get('since');
    for (const frame of replayFrom(since)) this.sendEvent(frame);

    try {
      this.send({ kind: 'snapshot', data: await buildSnapshot() });
    } catch {
      /* snapshot is best-effort at connect time */
    }

    publish('presence', { presence: presence(), clients: connectedClients(), joined: this.clientId }, { replay: false });
  }

  // -------------------------------------------------------------- outbound

  raw(buffer) {
    if (this.socket.destroyed) return;
    if (this.socket.writableLength > MAX_BUFFERED) return; // shed, never block the bus
    try {
      this.socket.write(buffer);
    } catch {
      this.destroy();
    }
  }

  send(payload) {
    this.raw(encodeFrame(OP.TEXT, Buffer.from(JSON.stringify(payload))));
  }

  sendEvent(frame) {
    this.send({ kind: 'event', event: frame.event, seq: frame.id, at: frame.data?.at, data: frame.data });
  }

  reply(id, ok, payload) {
    this.send({ kind: 'ack', id, ok, ...(ok ? { data: payload } : { error: payload }) });
  }

  // --------------------------------------------------------------- inbound

  async onMessage(text) {
    if (text.length > MAX_PAYLOAD) return this.close(1009, 'message too large');

    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return this.send({ kind: 'error', error: 'invalid JSON message' });
    }

    const { id = null, cmd } = message || {};
    if (!cmd || typeof cmd !== 'string') return this.send({ kind: 'error', id, error: 'missing cmd' });
    if (!this.allowCommand()) {
      noteCommand(cmd, { ok: false });
      return this.reply(id, false, { error: 'rate limited — slow down' });
    }

    try {
      await handleCommand({ id, cmd, payload: message.payload ?? {} }, {
        clientId: this.clientId,
        client: this,
        send: (payload) => this.send(payload),
        reply: (ok, payload) => this.reply(id, ok, payload),
        updatePage: (page) => {
          if (!page) return { clientId: this.clientId };
          updateClient(this.clientId, { page });
          return { clientId: this.clientId, page };
        },
      });
      noteCommand(cmd);
    } catch (err) {
      noteCommand(cmd, { ok: false });
      this.reply(id, false, { error: err.message || 'command failed' });
    }
  }

  allowCommand() {
    const now = Date.now();
    this.commandTimes = this.commandTimes.filter((t) => now - t < 10_000);
    if (this.commandTimes.length >= COMMAND_BUDGET) return false;
    this.commandTimes.push(now);
    return true;
  }

  ping() {
    this.alive = false;
    this.raw(encodeFrame(OP.PING, Buffer.from(String(Date.now()))));
  }

  close(code = 1000, reason = '') {
    if (this.socket.destroyed) return;
    try {
      const payload = Buffer.alloc(2 + Buffer.byteLength(reason));
      payload.writeUInt16BE(code, 0);
      payload.write(reason, 2);
      this.raw(encodeFrame(OP.CLOSE, payload));
    } catch {
      /* socket already gone */
    }
    this.socket.end();
    this.destroy();
  }

  destroy() {
    if (this.dead) return;
    this.dead = true;
    this.state.clients.delete(this);
    if (this.counted) {
      removeClient(this.clientId);
      publish('presence', { presence: presence(), clients: connectedClients(), left: this.clientId }, { replay: false });
    }
  }
}

// ------------------------------------------------------------ public API ---

/**
 * Attach the WebSocket endpoint to an HTTP server (path: /api/ws).
 * @returns {{clients: Set, close: () => void, count: () => number}}
 */
export function attachWebSocket(server, { path = WS_PATH } = {}) {
  const state = { clients: new Set() };

  server.on('upgrade', (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    } catch {
      return socket.destroy();
    }

    if (url.pathname !== path) {
      socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }

    const key = req.headers['sec-websocket-key'];
    const upgrade = String(req.headers.upgrade || '').toLowerCase();
    if (upgrade !== 'websocket' || !key) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }

    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(
      [
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '',
        '',
      ].join('\r\n')
    );
    socket.setNoDelay?.(true);

    const client = new SocketClient({ socket, url, state });
    if (head?.length) client.parser.push(head);
  });

  const heartbeat = setInterval(() => {
    for (const client of state.clients) {
      if (!client.alive) {
        client.close(1001, 'heartbeat timeout');
        client.destroy();
        continue;
      }
      client.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  const unregister = registerTransport('websocket', {
    // Every published frame already reaches WS clients through their write()
    // callback, so the transport adapter only needs to report its count.
    broadcast: () => {},
    count: () => state.clients.size,
  });

  return {
    clients: state.clients,
    count: () => state.clients.size,
    close() {
      clearInterval(heartbeat);
      unregister();
      for (const client of state.clients) client.close(1001, 'server shutting down');
      state.clients.clear();
    },
  };
}
