import { usingMongo, memory, models } from '../index.js';
import { config } from '../../config/index.js';

// Weekly target repository — one active target per workspace, with change history.

export async function get() {
  if (usingMongo()) {
    const doc = await models.Target.findOne({ key: 'singleton' }).lean();
    return { weeklyTarget: doc?.weeklyTarget ?? config.defaultWeeklyTarget, history: doc?.history ?? [] };
  }
  return { ...memory.target };
}

export async function set(weeklyTarget) {
  if (usingMongo()) {
    const doc = await models.Target.findOneAndUpdate(
      { key: 'singleton' },
      { weeklyTarget, $push: { history: { value: weeklyTarget, at: new Date() } } },
      { upsert: true, new: true }
    ).lean();
    return doc.weeklyTarget;
  }
  memory.target.weeklyTarget = weeklyTarget;
  memory.target.history.push({ value: weeklyTarget, at: new Date() });
  return weeklyTarget;
}
