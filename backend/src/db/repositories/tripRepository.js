import { usingMongo, memory, nextId, models } from '../index.js';

// ---------------------------------------------------------------------------
// Trip repository — GPS tracking sessions.
// ---------------------------------------------------------------------------

export async function create(doc) {
  if (usingMongo()) {
    const created = await models.Trip.create(doc);
    return created.toObject();
  }
  const stored = {
    _id: nextId(),
    createdAt: new Date(),
    updatedAt: new Date(),
    status: 'active',
    points: [],
    ...doc,
  };
  memory.trips.push(stored);
  return stored;
}

export async function findById(id) {
  if (usingMongo()) return models.Trip.findById(id).lean();
  return memory.trips.find((t) => String(t._id) === String(id)) || null;
}

export async function update(id, patch) {
  if (usingMongo()) return models.Trip.findByIdAndUpdate(id, patch, { new: true }).lean();
  const trip = await findById(id);
  if (!trip) return null;
  Object.assign(trip, patch, { updatedAt: new Date() });
  return trip;
}

export async function find({ status, limit = 25 } = {}) {
  if (usingMongo()) {
    const query = status ? { status } : {};
    return models.Trip.find(query).sort({ createdAt: -1 }).limit(limit).lean();
  }
  let rows = [...memory.trips];
  if (status) rows = rows.filter((t) => t.status === status);
  return rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);
}

export async function remove(id) {
  if (usingMongo()) return models.Trip.findByIdAndDelete(id).lean();
  const i = memory.trips.findIndex((t) => String(t._id) === String(id));
  if (i === -1) return null;
  return memory.trips.splice(i, 1)[0];
}

export async function count() {
  if (usingMongo()) return models.Trip.countDocuments();
  return memory.trips.length;
}
