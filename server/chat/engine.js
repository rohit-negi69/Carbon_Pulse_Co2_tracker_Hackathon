// Rule-based chatbot engine. Always works, no API key needed.
// Understands: footprint totals, category breakdown, target progress,
// reduction tips, and logging activities from natural language
// ("I drove 15 km", "ate 2 non-veg meals", "used 8 kWh electricity").

import { FACTORS } from '../factors.js';
import { listActivities, getTarget } from '../db.js';
import { currentWeekRange } from '../week.js';

// Intent: log an activity from chat text
const LOG_PATTERNS = [
  { re: /\b(drove|driving|by car|car travel)\b[^0-9]*(\d+(?:\.\d+)?)\s*(km|kilometers|kilometres)?/i, type: 'car' },
  { re: /\b(\d+(?:\.\d+)?)\s*km\b[^.]*\bcar\b/i, type: 'car' },
  { re: /\b(bus|by bus)\b[^0-9]*(\d+(?:\.\d+)?)\s*(km)?/i, type: 'bus' },
  { re: /\b(\d+(?:\.\d+)?)\s*km\b[^.]*\bbus\b/i, type: 'bus' },
  { re: /\b(flew|flight|flying|plane)\b[^0-9]*(\d+(?:\.\d+)?)\s*(km)?/i, type: 'flight' },
  { re: /\b(\d+(?:\.\d+)?)\s*km\b[^.]*\bflight\b/i, type: 'flight' },
  { re: /\b(used|electricity|kwh)\b[^0-9]*(\d+(?:\.\d+)?)\s*(kwh|units)?/i, type: 'electricity' },
  { re: /\b(\d+(?:\.\d+)?)\s*kwh\b/i, type: 'electricity' },
  { re: /\b(ate|had|veg meals?)\b[^0-9]*(\d+(?:\.\d+)?)\s*(veg meals?|veg)?/i, type: 'veg_meal' },
  { re: /\b(ate|had|non-?veg meals?)\b[^0-9]*(\d+(?:\.\d+)?)\s*(non-?veg meals?)?/i, type: 'non_veg_meal' },
];

export async function ruleReply({ message }) {
  const text = message.toLowerCase().trim();

  // --- logging intent ---
  for (const p of LOG_PATTERNS) {
    const m = text.match(p.re);
    if (m) {
      const qty = parseFloat(m[2] ?? m[1]);
      if (!Number.isFinite(qty) || qty <= 0) break;
      const f = FACTORS[p.type];
      const co2 = +(qty * f.factor).toFixed(2);
      return {
        reply: `Got it — logged ${qty} ${f.unit} of ${f.label} (~${co2} kg CO₂). ${co2 > 50 ? "That's a big one!" : 'Every entry helps you see the pattern.'} You can review it on the History page.`,
        action: { type: 'log', activityType: p.type, quantity: qty },
      };
    }
  }

  // --- data questions ---
  if (/\b(total|footprint|how much|my co2|my carbon)\b/.test(text)) {
    const acts = await listActivities({});
    const total = acts.reduce((s, a) => s + a.co2, 0);
    const { start, end } = currentWeekRange();
    const weekActs = acts.filter((a) => a.date >= start && a.date <= end);
    const weekTotal = weekActs.reduce((s, a) => s + a.co2, 0);
    const target = await getTarget();
    const pct = target > 0 ? Math.round((weekTotal / target) * 100) : 0;
    return {
      reply: `Your all-time footprint is ${total.toFixed(1)} kg CO₂. This week (${start} → ${end}) you're at ${weekTotal.toFixed(1)} kg — ${pct}% of your ${target} kg target. ${pct > 100 ? "You've passed your target — no guilt, just pick one category to trim next week." : pct > 80 ? 'Getting close to the target — small swaps still help.' : 'Nice and steady, keep it up!'}`,
      action: null,
    };
  }

  if (/\b(worst|biggest|most|breakdown|categories|category|break ?down)\b/.test(text)) {
    const acts = await listActivities({});
    const byCat = {};
    for (const a of acts) byCat[a.type] = (byCat[a.type] || 0) + a.co2;
    const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    if (!rows.length) return { reply: 'No activities logged yet — add one on the Log Activity page and I can break it down for you.', action: null };
    const lines = rows.map(([t, v]) => `• ${FACTORS[t].label}: ${v.toFixed(1)} kg (${Math.round((v / rows.reduce((s, [, x]) => s + x, 0)) * 100)}%)`);
    return { reply: `Here's your breakdown by category:\n${lines.join('\n')}\n\nYour biggest contributor is ${FACTORS[rows[0][0]].label}.`, action: null };
  }

  if (/\b(target|goal|weekly|progress|budget)\b/.test(text)) {
    const target = await getTarget();
    const { start, end } = currentWeekRange();
    const acts = await listActivities({ from: start, to: end });
    const used = acts.reduce((s, a) => s + a.co2, 0);
    const pct = target > 0 ? Math.round((used / target) * 100) : 0;
    const left = Math.max(target - used, 0);
    return { reply: `Your weekly target is ${target} kg CO₂. This week: ${used.toFixed(1)} kg (${pct}%). ${left > 0 ? `You have ${left.toFixed(1)} kg left.` : "You've exceeded it — the banner on the dashboard has gentle suggestions, and you can raise the target if it was too tight."}`, action: null };
  }

  if (/\b(tip|tips|reduce|advice|how (can|do) i|lower|less)\b/.test(text)) {
    return {
      reply: [
        'A few high-impact swaps, roughly in order of impact:',
        '• One fewer flight is the single biggest lever — a 1,000 km flight is 250 kg CO₂.',
        '• Swap some non-veg meals for veg: each swap saves 1.5 kg CO₂.',
        '• For car trips under 5 km, a bus cuts emissions by 60% (0.08 vs 0.20 kg/km).',
        '• Shifting electricity use off-peak doesn\'t change kg, but reducing kWh does — 0.8 kg per kWh adds up fast.',
      ].join('\n'),
      action: null,
    };
  }

  if (/\b(help|what can you do|hello|hi|hey)\b/.test(text)) {
    return {
      reply: [
        "Hi! I'm your carbon coach. I can:",
        '• Log activities from chat — try "I drove 15 km" or "ate 2 veg meals"',
        "• Tell you your footprint — ask \"what's my total?\"",
        '• Show your worst category — ask "what\'s my breakdown?"',
        '• Track your weekly target — ask "how is my progress?"',
        '• Give reduction tips — just ask for tips',
      ].join('\n'),
      action: null,
    };
  }

  return {
    reply: "I'm not sure I understood that. Try:\n• \"I drove 15 km\"\n• \"what's my footprint?\"\n• \"which category is worst?\"\n• \"how is my weekly progress?\"\n• \"give me tips\"",
    action: null,
  };
}
