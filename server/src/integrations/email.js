import { config } from '../config/index.js';

// Optional email provider (Resend). Disabled unless RESEND_API_KEY is set, so
// the app never fails over a missing third-party credential.

export const email = {
  enabled: () => Boolean(config.resendKey && config.notifyEmail),
  note: () =>
    email.enabled()
      ? `Sending to ${config.notifyEmail}`
      : 'Set RESEND_API_KEY + NOTIFY_EMAIL to enable digests',

  async send(subject, text) {
    if (!email.enabled()) return { ok: false, skipped: true };
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.resendKey}` },
        body: JSON.stringify({ from: 'CarbonPulse <onboarding@resend.dev>', to: [config.notifyEmail], subject, text }),
        signal: AbortSignal.timeout(10_000),
      });
      return { ok: res.ok };
    } catch {
      return { ok: false, error: 'provider unavailable' };
    }
  },

  // Fired after every ledger write when email is configured.
  async notifyActivity(activity, factor) {
    if (!email.enabled()) return { ok: false, skipped: true };
    return email.send(
      `CarbonPulse: ${factor.label} logged (${activity.co2} kg CO₂)`,
      `${activity.quantity} ${factor.unit} of ${factor.label} on ${activity.date}.\nComputed footprint: ${activity.co2} kg CO₂.`
    );
  },
};
