import { Router } from 'express';
import { addClient, removeClient, connectedClients, broadcast } from './hub.js';
import { dbMode } from '../../db/index.js';

const router = Router();

router.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  res.write(
    `event: hello\ndata: ${JSON.stringify({ clients: connectedClients() + 1, db: dbMode(), ts: Date.now() })}\n\n`
  );
  addClient(res);

  const keepAlive = setInterval(() => {
    try {
      res.write(`: ping ${Date.now()}\n\n`);
    } catch {
      clearInterval(keepAlive);
    }
  }, 20_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    removeClient(res);
  });
});

// Manual broadcast hook — handy for scripts, demo tooling and tests.
router.post('/stream/broadcast', (req, res) => {
  const { event = 'info', data = {} } = req.body || {};
  broadcast(event, data);
  res.json({ ok: true, clients: connectedClients() });
});

export default router;
