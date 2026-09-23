import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config/index.js';
import { connectDB, dbMode } from './db/index.js';
import { attachWebSocket, WS_PATH } from './modules/realtime/ws.js';
import { startTicks } from './modules/realtime/ticks.js';

// ---------------------------------------------------------------------------
// Entry point.
// connect the data layer → create the HTTP server → attach the WebSocket
// transport to it → start the live ticker → listen.
// REST and real-time share one port, so a single deployment serves both.
// ---------------------------------------------------------------------------

export function createRealtimeServer() {
  const app = createApp();
  const server = createServer(app);
  const ws = attachWebSocket(server);
  return { app, server, ws };
}

const { server } = createRealtimeServer();

connectDB().then((mode) => {
  startTicks();

  server.listen(config.port, '0.0.0.0', () => {
    console.log(`[server] CarbonPulse API listening on :${config.port} (db=${mode || dbMode()})`);
    console.log(`[server] websocket: ws://0.0.0.0:${config.port}${WS_PATH}`);
    console.log(`[server] docs: http://0.0.0.0:${config.port}/api/docs`);
  });
});
