import { usingMongo, memory, nextId, models } from '../index.js';
import { tierOf } from '../../domain/factors.js';

// ---------------------------------------------------------------------------
// Activity repository — the only place that knows how activities are stored.
// ---------------------------------------------------------------------------

function sortRows(rows) {
  return rows.sort((a, b) => (b.date === a.date ? new Date(b.createdAt) - new Date(a.createdAt) : b.date < a.date ? -1 : 1));
}

export async function create(doc) {
  const record = { ...doc, tier: doc.tier || tierOf(doc.co2) };
  if (usingMongo()) {
    const created = await models.Activity.create(record);
    return created.toObject();
  }
  const stored = { _id: nextId(), createdAt: new Date(), updatedAt: new Date(), ...record };
  memory.activities.push(stored);
  return stored;
}

export async function find({ type, from, to, q, tier } = {}) {
  if (usingMongo()) {
    const query = {};
    if (type) query.type = type;
    if (from || to) {
      query.date = {};
      if (from) query.date.$gte = from;
      if (to) query.date.$lte = to;
    }
    if (tier) query.tier = tier;
    if (q) {
      const rx = { $regex: q, $options: 'i' };
      query.$or = [{ notes: rx }, { type: rx }];
    }
    return models.Activity.find(query).sort({ date: -1, createdAt: -1 }).lean();
  }
  let rows = [...memory.activities];
  if (type) rows = rows.filter((a) => a.type === type);
  if (from) rows = rows.filter((a) => a.date >= from);
  if (to) rows = rows.filter((a) => a.date <= to);
  if (tier) rows = rows.filter((a) => (a.tier || tierOf(a.co2)) === tier);
  if (q) {
    const needle = String(q).toLowerCase();
    rows = rows.filter((a) => (a.notes || '').toLowerCase().includes(needle) || a.type.toLowerCase().includes(needle));
  }
  return sortRows(rows);
}

export async function findById(id) {
  if (usingMongo()) return models.Activity.findById(id).lean();
  return memory.activities.find((a) => String(a._id) === String(id)) || null;
}

export async function remove(id) {
  if (usingMongo()) return models.Activity.findByIdAndDelete(id);
  const index = memory.activities.findIndex((a) => String(a._id) === String(id));
  if (index === -1) return null;
  return memory.activities.splice(index, 1)[0];
}

export async function count() {
  if (usingMongo()) return models.Activity.countDocuments();
  return memory.activities.length;
}
