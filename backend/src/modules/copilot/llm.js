import { config } from '../../config/index.js';

// ---------------------------------------------------------------------------
// Optional LLM upgrade for the copilot, over any OpenAI-compatible endpoint.
//
//   Ollama (cloud or local) — OLLAMA_API_KEY, default base https://ollama.com/v1
//     cloud:  OLLAMA_API_KEY=sk-...            (key from ollama.com → Settings)
//     local:  OLLAMA_BASE_URL=http://localhost:11434/v1  (key optional, ignored)
//   OpenAI — OPENAI_API_KEY (classic path, unchanged)
//
// Ollama is preferred when both are configured. Without any key the caller
// falls back to the rule engine, so the copilot is never dependent on a
// provider.
// ---------------------------------------------------------------------------

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

const isLocalOllama = () => /localhost|127\.0\.0\.1/.test(config.ollamaBaseUrl);

const provider = () => {
  // A local Ollama server needs no key (it may even ignore one), so a
  // localhost base URL activates the provider on its own.
  if (config.ollamaKey || isLocalOllama()) {
    return {
      name: `ollama (${isLocalOllama() ? 'local' : 'cloud'})`,
      url: `${config.ollamaBaseUrl.replace(/\/$/, '')}/chat/completions`,
      key: config.ollamaKey || 'ollama', // required by OpenAI clients, ignored locally
      model: config.ollamaModel,
    };
  }
  if (config.openaiKey) {
    return { name: 'openai', url: OPENAI_URL, key: config.openaiKey, model: config.openaiModel };
  }
  return null;
};

export function llmEnabled() {
  return Boolean(provider());
}

export function llmProvider() {
  const p = provider();
  return p ? { name: p.name, model: p.model } : null;
}

function headers() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${provider().key}` };
}

const SUBSCRIPTS = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };

/** Some chat models answer in LaTeX ($\\text{CO}_2$); plain text reads better in a chat bubble. */
function prettify(text) {
  return text
    .replace(/\$\\text\{([^}]+)\}(?:_(\d+))?\$/g, (_, sym, sub) => sym + (sub ? [...sub].map((d) => SUBSCRIPTS[d] || d).join('') : ''))
    .replace(/\$([^$]+)\$/g, '$1')
    .trim();
}

export async function callLLM(messages, maxTokens = 320) {
  if (!llmEnabled()) return null;
  const p = provider();
  try {
    const res = await fetch(p.url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ model: p.model, max_tokens: maxTokens, messages }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.warn(`[llm] ${p.name} ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      return null;
    }
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;
    // Ollama cloud models sometimes emit a reasoning preamble inside
    // <think>…</think> before the answer; strip it so the chat stays clean.
    const cleaned = content.replace(/<think>[\s\S]*?<\/think>/g, '');
    return prettify(cleaned) || null;
  } catch {
    return null;
  }
}

/** Back-compat alias used by audit.js. */
export const callOpenAI = callLLM;

/**
 * Stream a chat completion token by token.
 * Yields string chunks; returns silently if the provider is unavailable.
 */
export async function* streamLLM(messages, maxTokens = 320) {
  if (!llmEnabled()) return;
  const p = provider();
  let res;
  try {
    res = await fetch(p.url, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ model: p.model, max_tokens: maxTokens, messages, stream: true }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    return;
  }
  if (!res.ok || !res.body) {
    if (!res.ok) console.warn(`[llm] ${p.name} stream ${res.status}`);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let insideThink = false;

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
      let chunk;
      try {
        chunk = JSON.parse(payload).choices?.[0]?.delta?.content;
      } catch {
        continue; // partial frame — ignore
      }
      if (!chunk) continue;
      // Suppress <think>…</think> reasoning preambles while streaming: hold
      // tokens back inside the tag, and let the rest through untouched.
      for (const part of chunk.split(/(<\/?think>)/)) {
        if (part === '<think>') insideThink = true;
        else if (part === '</think>') insideThink = false;
        else if (part && !insideThink) yield part;
      }
    }
  }
}

/** Back-compat alias used by service.js. */
export const streamOpenAI = streamLLM;

export function copilotSystemPrompt(stats) {
  return (
    'You are a friendly carbon coach inside a footprint tracker. Be concise (under 120 words), encouraging, never shaming. ' +
    'Write plain text only: no markdown, no ** or # or bullet symbols — use short sentences and line breaks. ' +
    `Live user data: ${JSON.stringify(stats)}. ` +
    'Factors: car 0.2 kg/km, bus 0.08, flight 0.25, electricity 0.8 kg/kWh, veg meal 0.5 kg, non-veg meal 2.0 kg. ' +
    'If the user reports an activity, confirm the quantity so the app can log it.'
  );
}

export async function askLLM({ message, history = [], stats }) {
  const reply = await callLLM([
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
