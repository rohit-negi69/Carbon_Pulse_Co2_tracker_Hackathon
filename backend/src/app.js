import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config/index.js';
import api from './routes/index.js';
import { requestLog } from './middleware/requestLog.js';
import { rateLimit } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

// ---------------------------------------------------------------------------
// App assembly: middleware → routes → error handling.
// Exported separately from the listener so tests can mount it in-process.
// ---------------------------------------------------------------------------

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));
  app.use(cors({ origin: config.clientOrigin }));
  app.use(requestLog);
  app.use('/api', rateLimit());
  app.use('/api', api);

  const distDir = path.resolve(process.cwd(), 'frontend/dist');
  if (process.env.NODE_ENV !== 'test' && fs.existsSync(distDir)) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      const indexPath = path.join(distDir, 'index.html');
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
      next();
    });
  } else {
    // Friendly root so a human hitting the deployed API URL sees something useful.
    app.get('/', (_req, res) => {
      res.json({ name: 'CarbonPulse API', docs: '/api/docs', health: '/api/health' });
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
