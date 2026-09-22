import { createApp } from './app.js';
import { config } from './config/index.js';
import { connectDB, dbMode } from './db/index.js';

// Entry point: connect the data layer, then start listening.

const app = createApp();

connectDB().then((mode) => {
  app.listen(config.port, () => {
    console.log(`[server] CarbonPulse API listening on :${config.port} (db=${mode || dbMode()})`);
    console.log(`[server] docs: http://localhost:${config.port}/api/docs`);
  });
});
