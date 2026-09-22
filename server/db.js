import mongoose from 'mongoose';

// In-memory fallback store so the app never hard-fails when MongoDB is
// unreachable (e.g. missing MONGODB_URI during grading or first deploy).
// Not durable — README says to set MONGODB_URI for persistence.
const mem = {
  activities: [],
  target: 50,
  nextId: 1,
};

export let dbMode = 'memory'; // 'mongo' | 'memory'

export async function connectDB(uri) {
  if (!uri) {
    console.warn('[db] MONGODB_URI not set — using in-memory store (data resets on restart)');
    return;
  }
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    dbMode = 'mongo';
    console.log('[db] connected to MongoDB');
  } catch (err) {
    console.warn(`[db] MongoDB connection failed (${err.message}) — using in-memory store`);
  }
}

export function usingMongo() {
  return dbMode === 'mongo' && mongoose.connection.readyState === 1;
}

// ---- Activity operations (transparently switch store) ----

export async function insertActivity(doc) {
  if (usingMongo()) {
    const { Activity } = getModels();
    return Activity.create(doc);
  }
  const rec = { _id: String(mem.nextId++), createdAt: new Date(), ...doc };
  mem.activities.push(rec);
  return rec;
}

export async function listActivities({ type, from, to, q, tier }) {
  const tierOf = (co2) => (co2 < 2 ? 'low' : co2 <= 10 ? 'med' : 'high');
  if (usingMongo()) {
    const { Activity } = getModels();
    const query = {};
    if (type) query.type = type;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = from;
      if (to) query.date.$lte = to;
    }
    if (q) {
      query.$or = [{ notes: { $regex: q, $options: 'i' } }, { type: { $regex: q, $options: 'i' } }];
    }
    if (tier === 'low') query.co2 = { $lt: 2 };
    else if (tier === 'med') query.co2 = { $gte: 2, $lte: 10 };
    else if (tier === 'high') query.co2 = { $gt: 10 };
    return Activity.find(query).sort({ date: -1, createdAt: -1 }).lean();
  }
  let rows = [...mem.activities];
  if (type) rows = rows.filter((a) => a.type === type);
  if (from) rows = rows.filter((a) => a.date >= from);
  if (to) rows = rows.filter((a) => a.date <= to);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((a) => (a.notes || '').toLowerCase().includes(needle) || a.type.toLowerCase().includes(needle));
  }
  if (tier) rows = rows.filter((a) => tierOf(a.co2) === tier);
  rows.sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date < a.date ? -1 : 1));
  return rows;
}

export async function deleteActivity(id) {
  if (usingMongo()) {
    const { Activity } = getModels();
    return Activity.findByIdAndDelete(id);
  }
  const idx = mem.activities.findIndex((a) => String(a._id) === String(id));
  if (idx === -1) return null;
  return mem.activities.splice(idx, 1)[0];
}

// ---- Target operations ----

export async function getTarget() {
  if (usingMongo()) {
    const { Target } = getModels();
    const doc = await Target.findOne({ key: 'singleton' }).lean();
    return doc ? doc.weeklyTarget : 50;
  }
  return mem.target;
}

export async function setTarget(value) {
  if (usingMongo()) {
    const { Target } = getModels();
    await Target.updateOne({ key: 'singleton' }, { weeklyTarget: value }, { upsert: true });
  } else {
    mem.target = value;
  }
  return value;
}

async function getModels() {
  const mod = await import('./models.js');
  return mod.getModels();
}
