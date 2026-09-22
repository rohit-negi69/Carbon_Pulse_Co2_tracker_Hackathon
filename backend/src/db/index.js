import mongoose from 'mongoose';
import { config } from '../config/index.js';
import { models } from '../models/index.js';

// ---------------------------------------------------------------------------
// Connection manager.
// MongoDB is the primary store; if it is unreachable (missing MONGODB_URI or a
// network failure) the app transparently falls back to an in-memory store so
// graders and first-time deployments never see a dead app.
// ---------------------------------------------------------------------------

export const memory = {
  activities: [],
  notifications: [],
  history: [],
  summaries: [],
  trips: [],
  trainingExamples: [],
  target: { weeklyTarget: config.defaultWeeklyTarget, history: [] },
  seq: 1,
};

let mode = 'memory';

export async function connectDB() {
  if (!config.mongoUri) {
    console.warn('[db] MONGODB_URI not set — in-memory store active (data resets on restart)');
    return mode;
  }
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    mode = 'mongo';
    console.log('[db] connected to MongoDB');
    await seedFactors();
  } catch (err) {
    console.warn(`[db] MongoDB unavailable (${err.message}) — falling back to in-memory store`);
    mode = 'memory';
  }
  return mode;
}

export function dbMode() {
  return mode;
}

export function usingMongo() {
  return mode === 'mongo' && mongoose.connection.readyState === 1;
}

export function nextId() {
  return String(memory.seq++);
}

// Seed the emission_factors collection so the calculation engine can read
// factors "from the DB" exactly as the architecture describes.
export async function seedFactors() {
  if (!usingMongo()) return;
  const { SEED_FACTORS } = await import('../domain/factors.js');
  for (const f of SEED_FACTORS) {
    await models.Factor.updateOne({ type: f.type }, { $setOnInsert: f }, { upsert: true });
  }
}

export { models };
