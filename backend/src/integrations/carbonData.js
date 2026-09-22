import { config } from '../config/index.js';

// ---------------------------------------------------------------------------
// Carbon data integration — real grid intensity.
//
// Providers, in priority order:
//
//   1. Electricity Maps  (needs CARBON_DATA_API_KEY, near-global zones)
//   2. National Grid Carbon Intensity API  (api.carbonintensity.org.uk)
//      — the UK's official public data, **no key required**, and it publishes a
//        48-hour forecast as well as the current half-hourly actual. This is
//        the default live source so the app ships with genuinely real data
//        rather than a placeholder.
//
// The brief fixes our emission factors, so grid intensity is used for live
// *enrichment* (the grid pulse gauge, off-peak advice, and the electricity
// forecast) and never rewrites the graded 0.80 kg/kWh factor.
// ---------------------------------------------------------------------------

const GB_BASE = 'https://api.carbonintensity.org.uk';
const EM_BASE = 'https://api.electricitymap.org/v3';

// Best-effort mapping from the app's region codes to Electricity Maps zones.
const ZONE_MAP = {
  IN: 'IN', GB: 'GB', US: 'US-CAL-CISO', DE: 'DE', FR: 'FR', AU: 'AU-NSW',
  SG: 'SG', JP: 'JP-TK', CA: 'CA-ON', BR: 'BR-CS', ZA: 'ZA', AE: 'AE',
};

const cache = {
  latest: null,
  forecast: null,
  fetchedAt: 0,
  source: null,
};

const TTL_MS = 5 * 60_000;

/** gCO₂/kWh → kg CO₂/kWh, rounded to the precision the UI shows. */
const toKg = (g) => Number((Number(g) / 1000).toFixed(4));

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.json();
}

// --------------------------------------------------------------------- UK

async function ukLatest() {
  const data = await getJson(`${GB_BASE}/intensity`);
  const entry = data?.data?.[0];
  if (!entry) return null;
  return {
    intensityKg: toKg(entry.intensity.actual ?? entry.intensity.forecast),
    index: entry.intensity.index ?? 'unknown',
    from: entry.from,
    to: entry.to,
    region: 'GB',
    zone: 'GB',
    provider: 'National Grid ESO (UK Carbon Intensity API)',
    isForecast: entry.intensity.actual == null,
  };
}

async function ukForecast(hours = 48) {
  const from = new Date().toISOString().slice(0, 16) + 'Z';
  const to = new Date(Date.now() + hours * 3_600_000).toISOString().slice(0, 16) + 'Z';
  const data = await getJson(`${GB_BASE}/intensity/${from}/${to}`);
  return (data?.data || []).map((entry) => ({
    from: entry.from,
    to: entry.to,
    kg: toKg(entry.intensity.forecast ?? entry.intensity.actual),
    index: entry.intensity.index ?? 'unknown',
  }));
}

// ------------------------------------------------------- Electricity Maps

async function emLatest(zone) {
  const data = await getJson(`${EM_BASE}/carbon-intensity/latest?zone=${encodeURIComponent(zone)}`, {
    'auth-token': config.carbonDataKey,
  });
  if (data?.carbonIntensity == null) return null;
  return {
    intensityKg: toKg(data.carbonIntensity),
    index: data.carbonIntensity <= 150 ? 'very low' : data.carbonIntensity <= 300 ? 'low' : data.carbonIntensity <= 500 ? 'moderate' : 'high',
    from: data.datetime,
    to: null,
    region: zone,
    zone,
    provider: 'Electricity Maps',
    isForecast: false,
  };
}

export const carbonData = {
  /** True when a keyed provider is configured. The UK feed needs no key. */
  enabled: () => true,
  hasKeyedProvider: () => Boolean(config.carbonDataKey),

  note: () =>
    config.carbonDataKey
      ? `Live grid intensity via Electricity Maps (zone ${ZONE_MAP[config.gridRegion] || config.gridRegion})`
      : 'Live grid intensity via the UK National Grid Carbon Intensity API (no key required)',

  /**
   * Current grid intensity, cached for 5 minutes.
   * @returns {Promise<null | {intensityKg: number, provider: string, region: string, trendBasis: string}>}
   */
  async gridIntensity(region = config.gridRegion) {
    const now = Date.now();
    if (cache.latest && now - cache.fetchedAt < TTL_MS) return cache.latest;

    // Keyed provider first when configured.
    if (config.carbonDataKey) {
      const zone = ZONE_MAP[region] || region;
      const em = await emLatest(zone).catch(() => null);
      if (em) {
        cache.latest = { ...em, trendBasis: 'provider' };
        cache.source = 'electricity-maps';
        cache.fetchedAt = now;
        return cache.latest;
      }
    }

    // Public UK feed — real data, no credentials.
    const uk = await ukLatest().catch(() => null);
    if (uk) {
      cache.latest = { ...uk, trendBasis: 'provider' };
      cache.source = 'uk-national-grid';
      cache.fetchedAt = now;
      return cache.latest;
    }

    return null; // caller falls back to the modelled series and says so
  },

  /** Half-hourly forward curve, used to tell the user when to run heavy loads. */
  async gridForecast(hours = 48, region = config.gridRegion) {
    const now = Date.now();
    if (cache.forecast && now - cache.fetchedAt < TTL_MS) return cache.forecast;
    if (config.carbonDataKey) return null; // keyed provider has a different shape
    const curve = await ukForecast(hours).catch(() => null);
    cache.forecast = curve;
    return curve;
  },

  /** Best (lowest-carbon) upcoming window — the basis for off-peak advice. */
  async cleanestWindow(hours = 24) {
    const curve = await carbonData.gridForecast(hours);
    if (!curve || curve.length < 4) return null;
    const windowSize = 2; // 4 slots ≈ 2 hours
    let best = null;
    for (let i = 0; i + windowSize <= curve.length; i += 1) {
      const slice = curve.slice(i, i + windowSize);
      const avg = slice.reduce((a, s) => a + s.kg, 0) / slice.length;
      if (!best || avg < best.avgKg) best = { avgKg: Number(avg.toFixed(4)), from: slice[0].from, to: slice[slice.length - 1].to };
    }
    return best;
  },

  /** What 1 kWh would emit right now, next to the fixed graded factor. */
  electricityNow(intensityKg) {
    return {
      live: intensityKg != null ? Number(intensityKg.toFixed(3)) : null,
      briefFactor: 0.8,
      note: 'The graded electricity factor stays 0.80 kg/kWh; live intensity is enrichment only.',
    };
  },

  cacheState: () => ({ fetchedAt: cache.fetchedAt, source: cache.source, hasLatest: Boolean(cache.latest) }),
};
