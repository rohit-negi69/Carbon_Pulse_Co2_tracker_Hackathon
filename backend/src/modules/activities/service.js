import * as activityRepository from '../../db/repositories/activityRepository.js';
import * as historyRepository from '../../db/repositories/historyRepository.js';
import * as engine from '../calculation/service.js';
import * as nudges from '../nudges/service.js';
import { publish } from '../realtime/hub.js';
import { buildSnapshot } from '../realtime/snapshot.js';
import { toDateStr } from '../../domain/week.js';
import { integrations } from '../../integrations/index.js';

// ---------------------------------------------------------------------------
// Activity Management
// Orchestrates: validate → calculate → persist → audit → nudge → publish.
// Every write ends with a live snapshot broadcast, so subscribed browsers
// re-render from pushed state rather than re-fetching.
// ---------------------------------------------------------------------------

export async function create({ type, quantity, date, notes, confirmed = false, source = 'form' }) {
  const result = await engine.calculate({ type, quantity, confirmed });
  if (!result.ok) return result;

  const day = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toDateStr(new Date());
  const record = await activityRepository.create({
    type,
    quantity: Number(quantity),
    date: day,
    notes: typeof notes === 'string' ? notes.trim().slice(0, 160) : '',
    co2: result.co2,
    factorUsed: result.factor.factor,
    tier: result.tier,
    source,
    confirmed: Boolean(confirmed),
  });

  await historyRepository.record('created', String(record._id), record);

  // 1) the entry itself (for tickers, highlight flashes and toasts)
  publish('activity', { activity: record, co2: result.co2, label: result.factor.label, source, tier: result.tier });
  // 2) recalculated aggregates (dashboard, header, targets update instantly)
  publish('snapshot', await buildSnapshot());

  const newNudges = await nudges.evaluate();
  newNudges.filter(Boolean).forEach((n) => publish('nudge', n));

  integrations.email.notifyActivity(record, result.factor).catch(() => {});

  return { ok: true, activity: record, co2: result.co2, factor: result.factor };
}

export async function list(filters) {
  const activities = await activityRepository.find(filters);
  return { activities, count: activities.length };
}

export async function remove(id) {
  const deleted = await activityRepository.remove(id);
  if (!deleted) return { ok: false, status: 404, error: 'Activity not found' };

  await historyRepository.record('deleted', String(id), deleted);
  publish('deleted', { id: String(id), activity: deleted });
  publish('snapshot', await buildSnapshot());
  const newNudges = await nudges.evaluate();
  newNudges.filter(Boolean).forEach((n) => publish('nudge', n));

  return { ok: true, activity: deleted };
}

export async function recentHistory(limit = 25) {
  return historyRepository.recent(limit);
}
