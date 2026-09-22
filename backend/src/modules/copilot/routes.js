import { Router } from 'express';
import * as copilot from './service.js';

const router = Router();

// Buffered chat (single JSON response).
router.post('/chat', async (req, res, next) => {
  try {
    const { message, history } = req.body || {};
    if (!message || typeof message !== 'string') return res.status(400).json({ error: 'message is required' });
    res.json(await copilot.chat({ message, history }));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Streaming chat — the copilot answers token by token over SSE so the reply
// types itself into the panel as it is generated.
// ---------------------------------------------------------------------------
router.post('/chat/stream', async (req, res, next) => {
  const { message, history } = req.body || {};
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'message is required' });
  }

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    let full = '';
    for await (const frame of copilot.chatStream({ message, history })) {
      if (frame.type === 'chunk') {
        full += frame.text;
        send('chunk', { text: frame.text });
      } else if (frame.type === 'action') {
        send('action', { logged: frame.logged });
      } else if (frame.type === 'done') {
        send('done', { engine: frame.engine, full });
      }
    }
  } catch (err) {
    send('error', { message: err.message });
  } finally {
    res.end();
  }
});

router.get('/ai/audit', async (req, res, next) => {
  try {
    res.json(await copilot.audit({ useLLM: req.query.llm === '1' }));
  } catch (err) {
    next(err);
  }
});

export default router;
