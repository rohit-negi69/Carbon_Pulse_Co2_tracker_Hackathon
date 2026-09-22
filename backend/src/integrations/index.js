import { email } from './email.js';
import { carbonData } from './carbonData.js';
import { geo } from './geo.js';

// ---------------------------------------------------------------------------
// External Services layer.
// Every provider is optional and self-reporting: the registry exposes which
// ones are configured, so the UI/health endpoint can show exactly what is live
// instead of silently degrading.
// ---------------------------------------------------------------------------

export const integrations = {
  email,        // Resend — nudge/activity email digests
  carbonData,   // regional grid intensity / flight data (optional)
  geo,          // distance estimation between locations (optional)

  describe() {
    return [
      { key: 'email', label: 'Email notifications (Resend)', enabled: email.enabled(), note: email.note() },
      { key: 'carbonData', label: 'Carbon data API (grid mix, flight factors)', enabled: carbonData.enabled(), note: carbonData.note() },
      { key: 'geo', label: 'Geo / distance API', enabled: geo.enabled(), note: geo.note() },
      { key: 'ai', label: 'LLM copilot (OpenAI)', enabled: Boolean(process.env.OPENAI_API_KEY), note: 'Optional — rule-based copilot always available' },
    ];
  },

  status() {
    return Object.fromEntries(this.describe().map((s) => [s.key, s.enabled]));
  },
};
