import { config } from '../config/index.js';

// Optional geo/maps provider. Useful for estimating trip distances from place
// names before the user logs a car or flight entry.

export const geo = {
  enabled: () => Boolean(config.geoKey),
  note: () => (geo.enabled() ? 'Distance estimation enabled' : 'Optional — enter distances directly'),

  async distanceKm(from, to) {
    if (!geo.enabled()) return null;
    try {
      const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(from)}&destinations=${encodeURIComponent(to)}&key=${config.geoKey}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const data = await res.json();
      const meters = data?.rows?.[0]?.elements?.[0]?.distance?.value;
      return typeof meters === 'number' ? Number((meters / 1000).toFixed(1)) : null;
    } catch {
      return null;
    }
  },
};
