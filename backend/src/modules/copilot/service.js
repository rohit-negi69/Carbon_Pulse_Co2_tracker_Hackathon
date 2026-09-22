import * as activityRepository from '../../db/repositories/activityRepository.js';
import * as targetRepository from '../../db/repositories/targetRepository.js';
import * as activities from '../activities/service.js';
import { currentWeekRange } from '../../domain/week.js';
import { ruleReply } from './engine.js';
import { askLLM, llmEnabled } from './llm.js';
import { buildAudit, polishAudit } from './audit.js';

// ---------------------------------------------------------------------------
// Copilot service: hybrid chat (rules always, LLM when configured) + AI audit.
// Can write to the ledger when the user describes an activity in chat.
// ---------------------------------------------------------------------------

export async function chat({ message, history = [] }) {
  const [all, target] = await Promise.all([activityRepository.find({}), targetRepository.get()]);
  const { start, end } = currentWeekRange();
  const weekUsed = Number(all.filter((a) => a.date >= start && a.date <= end).reduce((sum, a) => sum + a.co2, 0).toFixed(2));

  const stats = {
    totalKg: Number(all.reduce((sum, a) => sum + a.co2, 0).toFixed(2)),
    weekStart: start,
    weekEnd: end,
    weekUsedKg: weekUsed,
    weeklyTargetKg: target.weeklyTarget,
    activityCount: all.length,
    llm: llmEnabled(),
  };

  if (llmEnabled()) {
    const llm = await askLLM({ message, history, stats });
    if (llm) return { ...llm, engine: 'llm' };
  }

  const rule = await ruleReply({ message });

  if (rule.action?.type === 'log') {
    const created = await activities.create({
      type: rule.action.activityType,
      quantity: rule.action.quantity,
      notes: 'logged via copilot',
      source: 'chat',
    });
    if (created.ok) return { ...rule, engine: 'rules', logged: created.activity };
    return { ...rule, engine: 'rules' };
  }

  return { ...rule, engine: 'rules' };
}

export async function audit({ useLLM = false } = {}) {
  const result = await buildAudit();
  if (useLLM && llmEnabled()) {
    const polished = await polishAudit(result);
    if (polished) return { ...result, summary: polished.summary, nextBestAction: polished.nextBestAction, engine: 'hybrid (rules + LLM)' };
  }
  return result;
}
