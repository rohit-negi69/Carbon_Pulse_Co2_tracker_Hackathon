import * as targetRepository from '../../db/repositories/targetRepository.js';
import * as historyRepository from '../../db/repositories/historyRepository.js';
import * as activities from '../activities/service.js';
import * as engine from '../calculation/service.js';
import * as analytics from '../analytics/service.js';
import * as nudges from '../nudges/service.js';
import * as copilot from '../copilot/service.js';
import { publish, presence, metrics } from './hub.js';
import { buildSnapshot } from './snapshot.js';
import { currentWeekRange } from '../../domain/week.js';

// ---------------------------------------------------------------------------
// WebSocket command router.
//
// One place that turns a `{ cmd, payload }` frame into the same service calls
// the REST layer makes, so the socket is a first-class API surface rather than
// a second implementation. Commands that stream (chat) emit `stream` frames
// before their final `ack`.
//
//   client → { id: 7, cmd: 'activity.log', payload: { type: 'car', quantity: 10 } }
//   server → { kind: 'ack', id: 7, ok: true, data: { activity, co2, snapshot } }
// ---------------------------------------------------------------------------

export const COMMANDS = [
  { cmd: 'ping', describe: 'Round-trip latency probe (server time + echo)' },
  { cmd: 'stats.get', describe: 'Live snapshot + telemetry + presence' },
  { cmd: 'activity.log', describe: 'Log an activity (DP2 confirmation aware)' },
  { cmd: 'activity.delete', describe: 'Delete an activity by id' },
  { cmd: 'activity.list', describe: 'List activities with filters' },
  { cmd: 'target.set', describe: 'Set the weekly CO₂ target' },
  { cmd: 'chat.ask', describe: 'Hybrid copilot reply, streamed token by token' },
  { cmd: 'insights.get', describe: 'Aggregations, trend and weekday profile' },
  { cmd: 'simulate', describe: 'What-if swap simulation' },
  { cmd: 'audit.get', describe: 'AI audit (hotspots, projection, next best action)' },
  { cmd: 'nudges.get', describe: 'Evaluate and return the nudge feed' },
  { cmd: 'presence.typing', describe: 'Broadcast a typing indicator to other tabs' },
  { cmd: 'session.describe', describe: 'Describe this session and its page' },
];

export async function handleCommand({ id, cmd, payload = {} }, ctx) {
  switch (cmd) {
    case 'ping':
      return ctx.reply(true, { serverTime: Date.now(), echo: payload.echo ?? null });

    case 'stats.get':
      return ctx.reply(true, {
        snapshot: await buildSnapshot(),
        metrics: metrics(),
        presence: presence(),
      });

    case 'session.describe':
      if (payload.page) ctx.updatePage(payload.page);
      return ctx.reply(true, { clientId: ctx.clientId, commands: COMMANDS.map((c) => c.cmd) });

    case 'activity.log': {
      const result = await activities.create({
        type: payload.type,
        quantity: payload.quantity,
        date: payload.date,
        notes: payload.notes,
        confirmed: Boolean(payload.confirmed),
        source: payload.source || 'socket',
      });
      if (!result.ok) return ctx.reply(false, result);
      return ctx.reply(true, { activity: result.activity, co2: result.co2, factor: result.factor });
    }

    case 'activity.delete': {
      const result = await activities.remove(payload.id);
      if (!result.ok) return ctx.reply(false, result);
      return ctx.reply(true, { deleted: String(payload.id) });
    }

    case 'activity.list': {
      const filters = {
        type: payload.type,
        from: payload.from,
        to: payload.to,
        q: payload.q,
        tier: payload.tier,
      };
      const { activities: rows, count } = await activities.list(filters);
      return ctx.reply(true, { activities: rows, count });
    }

    case 'target.set': {
      const value = Number(payload.weeklyTarget);
      if (!Number.isFinite(value) || value <= 0) return ctx.reply(false, { error: 'weeklyTarget must be a positive number' });
      if (value > 100_000 && !payload.confirmed) {
        return ctx.reply(false, { needsConfirmation: true, message: 'That target is very large — resend with confirmed: true.' });
      }
      const weeklyTarget = await targetRepository.set(value);
      await historyRepository.record('target-changed', 'singleton', { weeklyTarget, via: 'socket' });
      publish('target', { weeklyTarget });
      publish('snapshot', await buildSnapshot());
      for (const n of (await nudges.evaluate()).filter(Boolean)) publish('nudge', n);
      return ctx.reply(true, { weeklyTarget });
    }

    case 'chat.ask': {
      const message = String(payload.message || '').slice(0, 800);
      if (!message.trim()) return ctx.reply(false, { error: 'message is required' });

      let text = '';
      let logged = null;
      let engineName = 'rules';
      try {
        for await (const frame of copilot.chatStream({ message, history: payload.history || [], delayMs: 0 })) {
          if (frame.type === 'chunk') {
            text += frame.text;
            ctx.send({ kind: 'stream', id, chunk: frame.text });
          } else if (frame.type === 'action') {
            logged = frame.logged || null;
          } else if (frame.type === 'done') {
            engineName = frame.engine || engineName;
          }
        }
      } catch (err) {
        return ctx.reply(false, { error: err.message || 'copilot failed' });
      }
      return ctx.reply(true, { text, logged, engine: engineName, streaming: true });
    }

    case 'insights.get':
      return ctx.reply(true, await analytics.insights());

    case 'simulate':
      return ctx.reply(true, await engine.simulate(payload));

    case 'audit.get':
      return ctx.reply(true, await copilot.audit({ useLLM: Boolean(payload.llm) }));

    case 'nudges.get':
      return ctx.reply(true, { nudges: await nudges.evaluate() });

    case 'presence.typing': {
      const typing = Boolean(payload.typing);
      ctx.updatePage(payload.page || undefined);
      publish('typing', { clientId: ctx.clientId, page: payload.page, typing, text: payload.text || '' }, { replay: false });
      return ctx.reply(true, { typing });
    }

    case 'week.get': {
      const { start, end } = currentWeekRange();
      return ctx.reply(true, { week: { start, end }, snapshot: await buildSnapshot() });
    }

    default:
      return ctx.reply(false, { error: `unknown command "${cmd}"`, commands: COMMANDS.map((c) => c.cmd) });
  }
}
