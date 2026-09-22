import * as activityRepository from '../../db/repositories/activityRepository.js';
import * as targetRepository from '../../db/repositories/targetRepository.js';
import * as factorRepository from '../../db/repositories/factorRepository.js';
import * as activities from '../activities/service.js';
import { currentWeekRange } from '../../domain/week.js';
import { ruleReply } from './engine.js';
import { askLLM, llmEnabled, streamOpenAI, llmMessages } from './llm.js';
import { buildAudit, polishAudit } from './audit.js';
import { classifyText, learn } from '../ml/registry.js';

// ---------------------------------------------------------------------------
// Copilot service: hybrid chat (rules always, ML when the rules miss, LLM when
// configured) + AI audit. Can write to the ledger when the user describes an
// activity in chat.
// ---------------------------------------------------------------------------

/**
 * Quantity extraction, independent of category. Handles "15 km", "8 kWh",
 * "2 meals", "drove for 40 kilometres".
 */
function extractQuantity(message) {
  const text = String(message).toLowerCase();
  const unitMatch = text.match(/(\d+(?:\.\d+)?)\s*(km|kilometres?|kilometers?|kwh|kilowatt[-\s]?hours?|meals?|miles?|mi)\b/);
  if (unitMatch) {
    let value = parseFloat(unitMatch[1]);
    const unit = unitMatch[2];
    if (/^mi/.test(unit)) value *= 1.60934; // miles → km so the brief factors apply
    return { value, unit: /^mi/.test(unit) ? 'km' : /kwh|kilowatt/.test(unit) ? 'kWh' : /meal/.test(unit) ? 'meals' : 'km' };
  }
  const bare = text.match(/\b(?:drove|flew|used|consumed|ate|had|ordered|rode|took)\b[^0-9]*(\d+(?:\.\d+)?)/);
  return bare ? { value: parseFloat(bare[1]), unit: null } : null;
}

/**
 * Hybrid intent resolution for chat logging.
 *
 * 1. The deterministic rule engine gets first refusal — it is exact when the
 *    phrasing matches a known shape and should never be second-guessed.
 * 2. When the rules find no category, the trained TF-IDF + Naive Bayes
 *    classifier reads the sentence. It only wins if it clears its confidence
 *    threshold, so "I paid my rent" is refused rather than mislabelled.
 */
async function resolveLogIntent(message) {
  const rule = await ruleReply({ message });
  if (rule.action?.type === 'log') return { ...rule, via: 'rules' };

  const quantity = extractQuantity(message);
  if (!quantity || !Number.isFinite(quantity.value) || quantity.value <= 0) {
    return { ...rule, via: 'rules' };
  }

  const prediction = await classifyText(message, { minConfidence: 0.5 });
  if (!prediction.category) {
    return { ...rule, via: 'rules', classifierConsidered: prediction.ranked };
  }

  const factor = await factorRepository.get(prediction.category);
  const co2 = Number((quantity.value * factor.factor).toFixed(2));
  return {
    reply: `I read that as ${quantity.value} ${factor.unit} of ${factor.label} (~${co2} kg CO₂) — logged. This came from the trained classifier at ${Math.round(
      prediction.confidence * 100
    )}% confidence, so tell me if the category is wrong and I'll re-file it.`,
    action: { type: 'log', activityType: prediction.category, quantity: quantity.value },
    via: 'classifier',
    prediction,
  };
}

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

  const rule = await resolveLogIntent(message);

  if (rule.action?.type === 'log') {
    const created = await activities.create({
      type: rule.action.activityType,
      quantity: rule.action.quantity,
      notes: rule.via === 'classifier' ? 'logged via copilot (ML classifier)' : 'logged via copilot',
      source: 'chat',
    });
    // Every accepted chat log is ground truth — fold the phrasing back into the
    // classifier so the next similar sentence is recognised by the rules too.
    if (rule.via === 'classifier') {
      learn({ text: message, label: rule.action.activityType, source: 'copilot-confirmed' }).catch(() => {});
    }
    if (created.ok) return { ...rule, engine: rule.via === 'classifier' ? 'classifier' : 'rules', logged: created.activity };
    return { ...rule, engine: 'rules' };
  }

  return { ...rule, engine: 'rules' };
}

/**
 * Streaming chat.
 * Yields {type:'chunk'|'action'|'done'} frames. LLM mode streams provider
 * tokens as they arrive; rule mode streams the composed answer in word chunks
 * so the UI behaves identically whether or not a key is configured.
 */
export async function* chatStream({ message, history = [], delayMs = 14 }) {
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
  };

  let engine = 'rules';
  let text = '';

  if (llmEnabled()) {
    engine = 'llm';
    for await (const chunk of streamOpenAI(llmMessages({ message, history, stats }))) {
      text += chunk;
      yield { type: 'chunk', text: chunk };
    }
  }

  if (!text) {
    const rule = await resolveLogIntent(message);
    text = rule.reply;

    // Carry the log action to the end so the UI can show the confirmation last.
    for (const chunk of chunkText(text)) {
      yield { type: 'chunk', text: chunk };
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    }

    if (rule.action?.type === 'log') {
      const created = await activities.create({
        type: rule.action.activityType,
        quantity: rule.action.quantity,
        notes: rule.via === 'classifier' ? 'logged via copilot (ML classifier)' : 'logged via copilot',
        source: 'chat',
      });
      if (rule.via === 'classifier') {
        learn({ text: message, label: rule.action.activityType, source: 'copilot-confirmed' }).catch(() => {});
      }
      if (created.ok) yield { type: 'action', logged: created.activity };
    }
    yield { type: 'done', engine: rule.via === 'classifier' ? 'classifier' : 'rules' };
    return;
  }

  yield { type: 'done', engine };
}

function chunkText(text, size = 4) {
  const parts = text.split(/(\s+)/);
  const out = [];
  for (let i = 0; i < parts.length; i += size) out.push(parts.slice(i, i + size).join(''));
  return out;
}

export async function audit({ useLLM = false } = {}) {
  const result = await buildAudit();
  if (useLLM && llmEnabled()) {
    const polished = await polishAudit(result);
    if (polished) return { ...result, summary: polished.summary, nextBestAction: polished.nextBestAction, engine: 'hybrid (rules + LLM)' };
  }
  return result;
}
