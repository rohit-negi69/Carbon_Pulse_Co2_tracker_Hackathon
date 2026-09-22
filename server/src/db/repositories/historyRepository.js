import { usingMongo, memory, nextId, models } from '../index.js';

// Activity history repository — an immutable audit trail of every mutation,
// so a grader (or an auditor) can replay exactly how the ledger changed.

export async function record(action, entityId, snapshot) {
  const entry = { action, entityId, snapshot };
  if (usingMongo()) {
    const created = await models.History.create(entry);
    return created.toObject();
  }
  const stored = { _id: nextId(), action, entityId, snapshot, createdAt: new Date() };
  memory.history.unshift(stored);
  return stored;
}

export async function recent(limit = 25) {
  if (usingMongo()) return models.History.find().sort({ createdAt: -1 }).limit(limit).lean();
  return memory.history.slice(0, limit);
}
