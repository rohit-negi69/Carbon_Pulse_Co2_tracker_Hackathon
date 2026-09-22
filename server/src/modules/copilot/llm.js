import { config } from '../../config/index.js';

// Optional LLM upgrade. Without a key the caller falls back to the rule engine,
// so the copilot never depends on an external service to function.

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export function llmEnabled() {
  return Boolean(config.openaiKey);
}

export async function callOpenAI(messages, maxTokens = 320) {
  if (!llmEnabled()) return null;
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiKey}` },
      body: JSON.stringify({ model: config.openaiModel, max_tokens: maxTokens, messages }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch {
    return null;
  }
}

export async function askLLM({ message, history = [], stats }) {
  const reply = await callOpenAI([
    {
      role: 'system',
      content:
        'You are a friendly carbon coach inside a footprint tracker. Be concise (under 120 words), encouraging, never shaming. ' +
        `Live user data: ${JSON.stringify(stats)}. ` +
        'Factors: car 0.2 kg/km, bus 0.08, flight 0.25, electricity 0.8 kg/kWh, veg meal 0.5 kg, non-veg meal 2.0 kg. ' +
        'If the user reports an activity that has not been logged, say you can log it if they confirm the quantity.',
    },
    ...history.slice(-8).map((h) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
    { role: 'user', content: message },
  ]);
  return reply ? { reply, action: null } : null;
}
