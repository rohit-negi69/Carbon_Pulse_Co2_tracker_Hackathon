// Central configuration. Everything environment-dependent lives here so the
// rest of the codebase never reads process.env directly.
import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) > 0 ? Number(process.env.PORT) : 3001,
  mongoUri: process.env.MONGODB_URI || '',
  clientOrigin: process.env.CLIENT_ORIGIN || '*',

  // Optional AI upgrade — the rule-based copilot works without it.
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
