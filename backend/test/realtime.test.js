// Real-time test suite: SSE stream, sequenced replay, presence, pushed
// snapshots, telemetry and token streaming from the copilot.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

process.env.NODE_ENV = 'test';

const app = createApp();
const server = app.listen(0);
const { port } = server.address();
const base = `http://127.0.0.1:${port}/api`;

test.after(() => {
  server.closeAllConnections?.();
  server.close();
});

const postJson = (path, body) =>
  fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function activityCount() {
  const res = await fetch(`${base}/activities`);
  const body = await res.json();
  return body.count;
}

/**
 * Opens the SSE stream, runs `before()` (so mutations happen while the stream
 * is live), collects frames until `until` matches or the timeout elapses,
 * then hands them to `fn`. Always tears the connection down afterwards — an
 * open stream would keep the test process alive and hang the runner.
 */
async function withStream(options, fn) {
  const { lastEventId, until, timeoutMs = 2500, before } = options;
  const controller = new AbortController();
  const url = lastEventId != null ? `${base}/stream?lastEventId=${lastEventId}` : `${base}/stream`;

  let res;
  try {
    res = await fetch(url, { signal: controller.signal, headers: { Accept: 'text/event-stream' } });
  } catch (err) {
    controller.abort();
    throw err;
  }

  const frames = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  const readLoop = (async () => {
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const part of parts) {
          if (!part.trim()) continue;
          const eventLine = part.split('\n').find((l) => l.startsWith('event:'));
          const dataLine = part.split('\n').find((l) => l.startsWith('data:'));
          const idLine = part.split('\n').find((l) => l.startsWith('id:'));
          if (!dataLine) continue;
          let data = {};
          try {
            data = JSON.parse(dataLine.slice(5).trim());
          } catch {
            /* ignore partial frame */
          }
          frames.push({
            id: idLine ? Number(idLine.slice(3).trim()) : null,
            event: eventLine ? eventLine.slice(6).trim() : 'message',
            data,
          });
        }
        if (until && frames.some(until)) break;
      }
    } catch {
      /* aborted or closed */
    }
  })();

  // Let the handshake land before mutating, so no frame is missed.
  await wait(120);
  if (before) await before(wait);

  await Promise.race([readLoop, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
  controller.abort();

  try {
    return await fn(frames);
  } finally {
    // reader/stream already aborted above; nothing else to release
  }
}

/**
 * A fresh client has seen no sequenced frame yet, so it has no Last-Event-ID of
 * its own to send back. The handshake is what reports where the bus is right
 * now (`metrics.lastEventId`), and everything downstream keys off that.
 */
const handshakePosition = (frames) => {
  const hello = frames.find((f) => f.event === 'hello');
  assert.ok(hello, 'the handshake should arrive on connect');
  const position = hello.data.metrics?.lastEventId;
  assert.equal(typeof position, 'number', 'the handshake reports the current sequence position');
  return position;
};

test('stream sends a handshake and an immediate live snapshot', async () => {
  await withStream({ until: (f) => f.event === 'snapshot' }, async (frames) => {
    const hello = frames.find((f) => f.event === 'hello');
    const snapshot = frames.find((f) => f.event === 'snapshot');

    assert.ok(hello, 'hello frame should arrive first');
    assert.equal(hello.data.db, 'memory');
    assert.ok(Array.isArray(hello.data.presence));
    assert.ok(hello.data.metrics.eventsTotal >= 0);

    assert.ok(snapshot, 'a snapshot is pushed on connect so the client needs no fetch');
    assert.ok('total' in snapshot.data);
    assert.ok('week' in snapshot.data);
    assert.ok(Array.isArray(snapshot.data.recent));
  });
});

test('logging an activity pushes the entry and a recalculated snapshot', async () => {
  const baseline = await activityCount();

  await withStream(
    {
      until: (f) => f.event === 'snapshot' && f.data.activityCount > baseline,
      before: () => postJson('/activities', { type: 'flight', quantity: 200, notes: 'realtime test' }),
    },
    async (frames) => {
      const activity = frames.find((f) => f.event === 'activity');
      const snapshot = frames.filter((f) => f.event === 'snapshot' && f.data.activityCount > baseline).at(-1);

      assert.ok(activity, 'activity frame should be pushed');
      assert.equal(activity.data.co2, 50);
      assert.equal(activity.data.label, 'Flight');

      assert.ok(snapshot, 'a refreshed snapshot should follow the write');
      assert.equal(snapshot.data.recent[0].notes, 'realtime test');
      assert.ok(snapshot.data.week.used >= 50);
    }
  );
});

test('every pushed frame carries a strictly increasing sequence id', async () => {
  await withStream(
    {
      // collect a fixed window: two writes produce 2 activity frames + 2 snapshots
      until: () => false,
      timeoutMs: 1800,
      before: async (wait) => {
        await postJson('/activities', { type: 'bus', quantity: 5 });
        await wait(150);
        await postJson('/activities', { type: 'car', quantity: 7 });
      },
    },
    async (frames) => {
      const sequenced = frames.filter((f) => typeof f.data?.seq === 'number');
      assert.ok(sequenced.length >= 4, `expected several sequenced frames, got ${sequenced.length}`);
      for (let i = 1; i < sequenced.length; i++) {
        assert.ok(sequenced[i].data.seq > sequenced[i - 1].data.seq, 'sequence ids must increase so clients can resume');
      }
    }
  );
});

test('a reconnecting client replays exactly the events it missed', async () => {
  // 1) A client connects and learns the current sequence position from the
  //    handshake — it has not seen a sequenced frame yet, so it has nothing of
  //    its own to resume from.
  const seenSeq = await withStream({ until: (f) => f.event === 'hello' }, async (frames) => handshakePosition(frames));

  // 2) While it is away, an entry is logged.
  await postJson('/activities', { type: 'electricity', quantity: 3, notes: 'replay-test' });

  // 3) It reconnects with Last-Event-ID and must receive the missed frame —
  //    and nothing older than the position it resumed from. Waiting for the
  //    handshake is safe because replay is written ahead of it.
  await withStream({ lastEventId: seenSeq, until: (f) => f.event === 'hello' }, async (frames) => {
    const activityIndex = frames.findIndex((f) => f.event === 'activity');
    assert.ok(activityIndex > -1, 'the missed activity should be replayed on resume');
    assert.equal(frames[activityIndex].data.activity.notes, 'replay-test', 'the replayed frame is the missed entry');

    // every replayed frame must be newer than what the client had already seen
    const replayed = frames.slice(0, activityIndex + 1).filter((f) => typeof f.data?.seq === 'number');
    assert.ok(replayed.length > 0, 'the replay should carry the missed, sequenced frames');
    assert.ok(replayed.every((f) => f.data.seq > seenSeq));

    // and replay must precede the fresh handshake
    const helloIndex = frames.findIndex((f) => f.event === 'hello');
    assert.ok(helloIndex > activityIndex, 'replay happens before the new handshake');
  });
});

test('presence reports connected sessions with their age', async () => {
  await withStream({ until: (f) => f.event === 'hello' }, async (frames) => {
    const hello = frames.find((f) => f.event === 'hello');
    assert.ok(hello.data.presence.length >= 1);
    assert.ok(hello.data.presence.every((p) => typeof p.connectedSeconds === 'number' && typeof p.page === 'string'));
    assert.equal(hello.data.clients, hello.data.presence.length);
  });
});

test('telemetry reports connection and event-rate metrics', async () => {
  const res = await fetch(`${base}/telemetry`);
  const body = await res.json();
  assert.equal(body.transport, 'server-sent-events');
  assert.ok(body.eventsTotal > 0);
  assert.ok(typeof body.eventsLastMinute === 'number');
  assert.ok(typeof body.replayBuffer === 'number');
  assert.ok(body.uptimeSeconds >= 0);
});

test('stream/state returns metrics, presence and a snapshot in one call', async () => {
  const res = await fetch(`${base}/stream/state`);
  const body = await res.json();
  assert.ok(body.metrics && body.snapshot);
  assert.ok(Array.isArray(body.presence));
  assert.ok(body.snapshot.week.target > 0);
});

test('target changes push the new target and a fresh snapshot', async () => {
  await withStream(
    {
      until: (f) => f.event === 'snapshot' && f.data.week?.target === 42,
      before: () =>
        fetch(`${base}/target`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ weeklyTarget: 42 }),
        }),
    },
    async (frames) => {
      const target = frames.find((f) => f.event === 'target');
      assert.ok(target, 'target change should be pushed');
      assert.equal(target.data.weeklyTarget, 42);

      const snapshot = frames.filter((f) => f.event === 'snapshot').at(-1);
      assert.equal(snapshot.data.week.target, 42);
    }
  );
});

test('nudges are pushed when the weekly budget is crossed', async () => {
  await withStream(
    {
      until: (f) => f.event === 'nudge',
      before: () => postJson('/activities', { type: 'flight', quantity: 800 }),
    },
    async (frames) => {
      const nudge = frames.find((f) => f.event === 'nudge');
      assert.ok(nudge, 'crossing the budget should push a nudge');
      assert.equal(nudge.data.kind, 'exceeded');
      assert.match(nudge.data.body, /awareness|trim|swap/i);
    }
  );
});

test('copilot chat streams its reply token by token', async () => {
  const res = await fetch(`${base}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: "what's my footprint?" }),
  });
  assert.match(res.headers.get('content-type'), /text\/event-stream/);

  const text = await res.text();
  const chunks = text.split('\n\n').filter((f) => f.includes('event: chunk'));
  assert.ok(chunks.length > 3, `expected a streamed reply, got ${chunks.length} chunks`);

  const done = text.split('\n\n').find((f) => f.includes('event: done'));
  assert.ok(done, 'a done frame should close the stream');
  assert.match(done, /rules/);
});

test('streaming chat logs an activity and reports it in the action frame', async () => {
  const before = await activityCount();
  const res = await fetch(`${base}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'I drove 25 km' }),
  });
  const text = await res.text();
  assert.match(text, /event: action/);

  const after = await activityCount();
  assert.equal(after, before + 1);
});
