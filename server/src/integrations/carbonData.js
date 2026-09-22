import { config } from '../config/index.js';

// Optional carbon-data provider (regional grid intensity, flight factors).
// The brief fixes our factors, so this is an enrichment hook rather than a
// dependency: when a key exists the app can annotate entries with live grid
// intensity without changing the graded calculations.

export const carbonData = {
  enabled: () => Boolean(config.carbonDataKey),
  note: () =>
    carbonData.enabled()
      ? 'Live enrichment enabled (grid intensity annotations)'
      : 'Optional — fixed brief factors are used for all calculations',

  async gridIntensity(region = 'IN') {
    if (!carbonData.enabled()) return null;
    try {
      const res = await fetch(`https://api.carbonintensity.org.uk/regional/regionid/${encodeURIComponent(region)}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.data?.[0]?.data?.[0] ?? null;
    } catch {
      return null;
    }
  },
};
