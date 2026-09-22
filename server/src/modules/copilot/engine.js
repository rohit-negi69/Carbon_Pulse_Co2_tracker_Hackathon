import * as activityRepository from '../../db/repositories/activityRepository.js';
import * as factorRepository from '../../db/repositories/factorRepository.js';
import * as targetRepository from '../../db/repositories/targetRepository.js';
import { currentWeekRange } from '../../domain/week.js';

// ---------------------------------------------------------------------------
// Rule-based copilot engine — always available, zero API keys.
// Understands: logging from natural language, footprint questions, category
// breakdowns, weekly progress, and reduction tips.
// ---------------------------------------------------------------------------

const LOG_PATTERNS = [
  { re: /\b(drove|driving|by car|car travel)\b[^0-9]*(\d+(?:\.\d+)?)/i, type: 'car' },
  { re: /\b(\d+(?:\.\d+)?)\s*km\b[^.]*\bcar\b/i, type: 'car' },
  { re: /\b(bus|by bus)\b[^0-9]*(\d+(?:\.\d+)?)/i, type: 'bus' },
  { re: /\b(\d+(?:\.\d+)?)\s*km\b[^.]*\bbus\b/i, type: 'bus' },
  { re: /\b(flew|flight|flying|plane)\b[^0-9]*(\d+(?:\.\d+)?)/i, type: 'flight' },
  { re: /\b(\d+(?:\.\d+)?)\s*km\b[^.]*\bflight\b/i, type: 'flight' },
  { re: /\b(used|consumed|electricity|kwh)\b[^0-9]*(\d+(?:\.\d+)?)/i, type: 'electricity' },
  { re: /\b(\d+(?:\.\d+)?)\s*kwh\b/i, type: 'electricity' },
  { re: /\b(ate|had|ordered)\b[^0-9]*(\d+(?:\.\d+)?)\s*(veg|vegetarian|plant)[\w\s-]*meal/i, type: 'veg_meal' },
  { re: /\b(ate|had|ordered)\b[^0-9]*(\d+(?:\.\d+)?)\s*(non-?veg|chicken|beef|meat)[\w\s-]*meal/i, type: 'non_veg_meal' },
];

export async function ruleReply({ message }) {
  const text = String(message).toLowerCase().trim();
  const factors = await factorRepository.all();

  // --- logging intent ---
  for (const pattern of LOG_PATTERNS) {
    const match = text.match(pattern.re);
    if (!match) continue;
    const qty = parseFloat(match[2] ?? match[1]);
    if (!Number.isFinite(qty) || qty <= 0) break;
    const factor = factors[pattern.type];
    if (!factor) break;
    const co2 = Number((qty * factor.factor).toFixed(2));
    return {
      reply: `Got it — logged ${qty} ${factor.unit} of ${factor.label} (~${co2} kg CO₂). ${
        co2 > 50 ? "That's a big one — worth a look in the audit." : 'Every entry sharpens the picture.'
      } You can review or delete it in History.`,
      action: { type: 'log', activityType: pattern.type, quantity: qty },
    };
  }

  const [activities, target] = await Promise.all([activityRepository.find({}), targetRepository.get()]);
  const { start, end } = currentWeekRange();
  const weekActivities = activities.filter((a) => a.date >= start && a.date <= end);
  const weekUsed = Number(weekActivities.reduce((sum, a) => sum + a.co2, 0).toFixed(2));

  if (/\b(total|footprint|how much|my co2|my carbon)\b/.test(text)) {
    const total = Number(activities.reduce((sum, a) => sum + a.co2, 0).toFixed(2));
    const pct = target.weeklyTarget > 0 ? Math.round((weekUsed / target.weeklyTarget) * 100) : 0;
    return {
      reply: `Your all-time footprint is ${total} kg CO₂. This week (${start} → ${end}) you're at ${weekUsed} kg — ${pct}% of your ${target.weeklyTarget} kg target. ${
        pct > 100
          ? "You've passed it — no guilt, just pick one category to trim next week."
          : pct > 80
            ? 'Getting close to the budget, so small swaps still count.'
            : 'Comfortably inside budget — keep it steady.'
      }`,
      action: null,
    };
  }

  if (/\b(worst|biggest|most|breakdown|categories|category)\b/.test(text)) {
    const byCategory = {};
    for (const a of activities) byCategory[a.type] = (byCategory[a.type] || 0) + a.co2;
    const rows = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return { reply: 'No activities logged yet — add one on the Log Activity page and I can break it down for you.', action: null };
    const total = rows.reduce((sum, [, value]) => sum + value, 0);
    const lines = rows.map(([type, value]) => `• ${factors[type].label}: ${value.toFixed(1)} kg (${Math.round((value / total) * 100)}%)`);
    return { reply: `Breakdown by category:\n${lines.join('\n')}\n\nBiggest contributor: ${factors[rows[0][0]].label}.`, action: null };
  }

  if (/\b(target|goal|weekly|progress|budget|pace)\b/.test(text)) {
    const pct = target.weeklyTarget > 0 ? Math.round((weekUsed / target.weeklyTarget) * 100) : 0;
    const left = Math.max(target.weeklyTarget - weekUsed, 0);
    return {
      reply: `Your weekly target is ${target.weeklyTarget} kg CO₂. This week: ${weekUsed} kg (${pct}%). ${
        left > 0
          ? `You have ${left.toFixed(1)} kg of budget left — check Charts & Insights for the trend line.`
          : "You're over budget; the nudge centre has pacing suggestions, and you can raise the target if it was too tight."
      }`,
      action: null,
    };
  }

  if (/\b(tip|tips|reduce|advice|how (can|do) i|lower|less|save)\b/.test(text)) {
    return {
      reply: [
        'High-impact swaps, roughly in order:',
        '• One fewer flight is the biggest single lever — 1,000 km of flying is 250 kg CO₂.',
        '• Swapping a non-veg meal for veg saves 1.5 kg per meal.',
        '• For car trips, the bus cuts emissions ~60% (0.08 vs 0.20 kg/km).',
        '• Electricity is 0.80 kg/kWh — trimming standby load compounds quickly.',
      ].join('\n'),
      action: null,
    };
  }

  if (/\b(help|what can you do|hello|hi|hey)\b/.test(text)) {
    return {
      reply: [
        "I'm your Eco-Audit Copilot. I can:",
        '• Log activities from chat — try "I drove 15 km" or "ate 2 veg meals"',
        '• Report your footprint — "what\'s my total?"',
        '• Show hotspots — "which category is worst?"',
        '• Check the budget — "how is my weekly progress?"',
        '• Suggest reductions — "give me tips"',
      ].join('\n'),
      action: null,
    };
  }

  return {
    reply: 'I didn\'t catch that. Try:\n• "I drove 15 km"\n• "what\'s my footprint?"\n• "which category is worst?"\n• "how is my weekly progress?"\n• "give me tips"',
    action: null,
  };
}
