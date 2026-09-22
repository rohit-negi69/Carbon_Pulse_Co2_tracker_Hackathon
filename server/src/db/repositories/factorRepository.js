import { usingMongo, models } from '../index.js';
import { SEED_FACTORS, FACTORS } from '../../domain/factors.js';

// Emission factor repository.
// The calculation engine asks here for factors — they are seeded into MongoDB
// on boot ("Fetch Emission Factor from DB") with the static seed as fallback.

export async function all() {
  if (usingMongo()) {
    const docs = await models.Factor.find().lean();
    if (docs.length) {
      return Object.fromEntries(docs.map((d) => [d.type, { label: d.label, unit: d.unit, factor: d.factor, sanityMax: d.sanityMax, scope: d.scope }]));
    }
  }
  return FACTORS;
}

export async function get(type) {
  const factors = await all();
  return factors[type] || null;
}

export async function seed() {
  if (!usingMongo()) return false;
  for (const f of SEED_FACTORS) {
    await models.Factor.updateOne({ type: f.type }, { $setOnInsert: f }, { upsert: true });
  }
  return true;
}
