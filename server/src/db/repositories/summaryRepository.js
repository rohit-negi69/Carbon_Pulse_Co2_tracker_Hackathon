import { usingMongo, memory, models } from '../index.js';

// Analytics summary repository — upserted rollups used by the insights view
// and for comparing the current week against previous baselines.

export async function upsert(period, summary) {
  if (usingMongo()) {
    const doc = await models.Summary.findOneAndUpdate(
      { period },
      { $set: { ...summary, period } },
      { upsert: true, new: true }
    ).lean();
    return doc;
  }
  const index = memory.summaries.findIndex((s) => s.period === period);
  const record = { period, ...summary, updatedAt: new Date() };
  if (index >= 0) memory.summaries[index] = record;
  else memory.summaries.push(record);
  return record;
}

export async function recent(limit = 8) {
  if (usingMongo()) return models.Summary.find().sort({ period: -1 }).limit(limit).lean();
  return [...memory.summaries].sort((a, b) => (a.period < b.period ? 1 : -1)).slice(0, limit);
}
