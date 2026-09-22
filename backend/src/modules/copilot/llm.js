import { config } from '../../config/index.js';

// Optional LLM upgrade with token streaming. Without a key the caller falls
// back to the rule engine, so the copilot is never dependent on a provider.

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export function llmEnabled() {
  return Boolean(config.openaiKey);
}

function headers() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiKey}` };
}

export async function callOpenAI(messages, maxTokens = 320) {
  if (!llmEnabled()) return null;
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: headers(),
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

/**
 * Stream a chat completion token by token.
 * Yields string chunks; returns silently if the provider is unavailable.
 */
export async function* streamOpenAI(messages, maxTokens = 320) {
  if (!llmEnabled()) return;
  let res;
  try {
    res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ model: config.openaiModel, max_tokens: maxTokens, messages, stream: true }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return;
  }
  if (!res.ok || !res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const chunk = JSON.parse(payload).choices?.[0]?.delta?.content;
        if (chunk) yield chunk;
      } catch {
        /* partial frame — ignore */
      }
    }
  }
}

export function copilotSystemPrompt(stats) {
  return (
    'You are a friendly carbon coach inside a footprint tracker. Be concise (under 120 words), encouraging, never shaming. ' +
    `Live user data: ${JSON.stringify(stats)}. ` +
    'Factors: car 0.2 kg/km, bus 0.08, flight 0.25, electricity 0.8 kg/kWh, veg meal 0.5 kg, non-veg meal 2.0 kg. ' +
    'If the user reports an activity, confirm the quantity so the app can log it.'
  );
}

export async function askLLM({ message, history = [], stats }) {
  const reply = await callOpenAI([
    { role: 'system', content: copilotSystemPrompt(stats) },
    ...history.slice(-8).map((h) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
    { role: 'user', content: message },
  ]);
  return reply ? { reply, action: null } : null;
}

export function llmMessages({ message, history = [], stats }) {
  return [
    { role: 'system', content: copilotSystemPrompt(stats) },
    ...history.slice(-8).map((h) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
    { role: 'user', content: message },
  ];
}
