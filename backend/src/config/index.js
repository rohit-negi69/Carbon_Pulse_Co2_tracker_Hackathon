// Central configuration. Everything environment-dependent lives here so the
// rest of the codebase never reads process.env directly.
import 'dotenv/config';

/**
 * Resolve where the Ollama provider lives.
 *
 * A base URL pointing at someone's laptop can never work from a deployed
 * container, where localhost is the container itself. Rather than let a copied
 * local .env silently degrade to the rule engine, prefer Ollama Cloud and say
 * why in the logs.
 *
 * `explicit` marks a base URL the operator actually set. That matters because
 * setting one is itself the opt-in: a local server needs no key, and neither
 * does a tunnelled one — only the default cloud URL does.
 */
function resolveOllama() {
  const configured = (process.env.OLLAMA_BASE_URL || '').trim();
  const pointsAtLocalhost = /(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/i.test(configured);

  if (configured && pointsAtLocalhost && process.env.VERCEL) {
    console.warn(
      '[config] OLLAMA_BASE_URL points at localhost, which is unreachable from a deployment — using https://ollama.com/v1. Set OLLAMA_API_KEY to enable cloud models.'
    );
    return { url: 'https://ollama.com/v1', explicit: false };
  }

  return { url: configured || 'https://ollama.com/v1', explicit: Boolean(configured) };
}

const ollama = resolveOllama();

export const config = {
  port: Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 3000,
  mongoUri: process.env.MONGODB_URI || '',
  clientOrigin: process.env.CLIENT_ORIGIN || '*',

  // Optional AI upgrade — the rule-based copilot works without it.
  // Two interchangeable OpenAI-compatible providers:
  //   • Ollama (cloud or local)  — OLLAMA_API_KEY + OLLAMA_BASE_URL + OLLAMA_MODEL
  //   • OpenAI                   — OPENAI_API_KEY + OPENAI_MODEL
  // Ollama wins if both are set, so a local-first setup is never overridden.
  ollamaKey: process.env.OLLAMA_API_KEY || '',
  ollamaBaseUrl: ollama.url, // cloud; http://localhost:11434/v1 locally, or a tunnel URL for a deployed app
  ollamaBaseUrlExplicit: ollama.explicit, // an operator-set base URL counts as opting in
  ollamaModel: process.env.OLLAMA_MODEL || 'gpt-oss:120b',
  openaiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',

  // Optional external services (the "External Services" layer).
  resendKey: process.env.RESEND_API_KEY || '',
  notifyEmail: process.env.NOTIFY_EMAIL || '',
  carbonDataKey: process.env.CARBON_DATA_API_KEY || '',
  geoKey: process.env.GEO_API_KEY || '',

  // Real-time
  tickMs: Number(process.env.REALTIME_TICK_MS) > 0 ? Number(process.env.REALTIME_TICK_MS) : 4000,
  gridRegion: process.env.GRID_REGION || 'IN',

  // Product defaults
  defaultWeeklyTarget: 50, // kg CO2 per week
  nudgeWarnRatio: 0.8, // warn at 80% of budget
  rateLimit: { windowMs: 60_000, max: 240 },
};

export const COLLECTIONS = {
  activities: 'activities',
  targets: 'weekly_targets',
  factors: 'emission_factors',
  notifications: 'notifications',
  history: 'activity_history',
  summaries: 'analytics_summary',
};
