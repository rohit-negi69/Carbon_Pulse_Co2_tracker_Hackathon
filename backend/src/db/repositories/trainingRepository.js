import { usingMongo, memory, nextId, models } from '../index.js';

// ---------------------------------------------------------------------------
// Training-example repository.
//
// The classifier's online-learning path: every time a user confirms or corrects
// a predicted category, the phrase is stored here and folded into the next
// training run. The model therefore adapts to this deployment's real traffic
// instead of staying frozen at its seed corpus.
// ---------------------------------------------------------------------------

const MAX_EXAMPLES = 4000;

export async function add({ label, text, source = 'confirmed-prediction' }) {
  const clean = String(text || '').trim().slice(0, 240);
  if (!clean) return null;

  if (usingMongo()) {
    const existing = await models.TrainingExample.findOne({ label, text: clean }).lean();
    if (existing) return existing;
    const created = await models.TrainingExample.create({ label, text: clean, source });
    return created.toObject();
  }

  if (memory.trainingExamples.some((e) => e.label === label && e.text === clean)) return null;
  const row = { _id: nextId(), label, text: clean, source, createdAt: new Date() };
  memory.trainingExamples.push(row);
  if (memory.trainingExamples.length > MAX_EXAMPLES) memory.trainingExamples.shift();
  return row;
}

/** Returns `label\ttext` strings, the transport format the trainer consumes. */
export async function all() {
  if (usingMongo()) {
    const rows = await models.TrainingExample.find({}).limit(MAX_EXAMPLES).lean();
    return rows.map((r) => `${r.label}\t${r.text}`);
  }
  return memory.trainingExamples.map((r) => `${r.label}\t${r.text}`);
}

export async function count() {
  if (usingMongo()) return models.TrainingExample.countDocuments();
  return memory.trainingExamples.length;
}
