import { publish, metrics, presence, connectedClients } from './hub.js';
import { dbMode } from '../../db/index.js';
import { integrations } from '../../integrations/index.js';
import { config } from '../../config/index.js';

// ---------------------------------------------------------------------------
// Live ticker.
//
// A real-time app should be alive even when nobody is typing. This module
// broadcasts, on a fixed cadence:
//
//   telemetry  — subscribers, events/min, transport mix, command counters
//   grid       — grid carbon intensity (kg CO₂/kWh), the signal behind the
//                electricity factor. Uses the carbon-data integration when a
//                key is configured; otherwise a deterministic model so the
//                live gauge is honest about being modelled (`source` field).
//
// Both are ephemeral frames: delivered live, never replayed on reconnect.
// ---------------------------------------------------------------------------

const TICK_MS = Math.max(Number(config.tickMs) || 4000, 1000);
const GRID_TTL_MS = 5 * 60_000;
const HISTORY = 40;

const state = {
  timer: null,
  ticks: 0,
  grid: null, // { intensity, source, region, trend, updatedAt }
  history: [], // rolling intensity sparkline
  lastLiveFetch: 0,
  cleanest: null, // best upcoming low-carbon window, refreshed hourly
  cleanestAt: 0,
};

// Deterministic-ish random walk around the Indian grid average (~0.71 kg/kWh),
// so the gauge moves smoothly instead of jumping.
function modelledIntensity() {
  const previous = state.grid?.intensity ?? 0.71;
  const drift = (Math.random() - 0.5) * 0.03;
  const pull = (0.71 - previous) * 0.12; // mean reversion
  const next = Math.min(0.95, Math.max(0.45, previous + drift + pull));
  return Number(next.toFixed(3));
}

// Real grid intensity. The UK National Grid feed needs no key, so "live" is
// the default path and the modelled series is a genuine last resort — the
// payload always names which one produced the number.
async function currentGrid() {
  const now = Date.now();
  if (state.grid && now - state.lastLiveFetch < GRID_TTL_MS) return state.grid;

  const live = await integrations.carbonData.gridIntensity(config.gridRegion).catch(() => null);
  state.lastLiveFetch = now;

  const intensity = live?.intensityKg ?? modelledIntensity();
  const previous = state.grid?.intensity ?? intensity;
  state.grid = {
    intensity,
    previous: Number(previous.toFixed(3)),
    trend: intensity > previous ? 'rising' : intensity < previous ? 'falling' : 'flat',
    source: live ? live.provider : 'modelled series (provider unreachable)',
    isLive: Boolean(live),
    index: live?.index ?? null,
    region: live?.region ?? config.gridRegion,
    updatedAt: new Date().toISOString(),
  };
  return state.grid;
}

// The forward curve only changes hourly, so it is refreshed on its own slower
// cadence instead of on every 4s tick.
async function refreshCleanest() {
  const now = Date.now();
  if (state.cleanest && now - state.cleanestAt < 60 * 60_000) return state.cleanest;
  state.cleanestAt = now;
  state.cleanest = await integrations.carbonData.cleanestWindow(24).catch(() => null);
  return state.cleanest;
}

function pushHistory(intensity) {
  state.history.push({ t: new Date().toISOString(), kg: intensity });
  if (state.history.length > HISTORY) state.history.shift();
}

async function tick() {
  state.ticks += 1;

  const base = metrics();
  const [grid, cleanest] = await Promise.all([currentGrid(), refreshCleanest().catch(() => null)]);
  pushHistory(grid.intensity);

  // Electricity is priced by the current grid mix: show what 1 kWh costs right
  // now next to the fixed brief factor so the two are never confused.
  const electricityNow = Number((grid.intensity * 1).toFixed(3));

  publish(
    'grid',
    {
      grid: {
        ...grid,
        spark: state.history.map((h) => h.kg),
        electricityNow,
        briefFactor: 0.8,
        cleanestWindow: cleanest,
      },
    },
    { replay: false }
  );

  publish(
    'telemetry',
    {
      ...base,
      clients: connectedClients(),
      presence: presence(),
      db: dbMode(),
      ticks: state.ticks,
      transport: 'websocket + server-sent-events',
      tickMs: TICK_MS,
      at: new Date().toISOString(),
    },
    { replay: false }
  );
}

export function startTicks({ intervalMs = TICK_MS } = {}) {
  if (state.timer) return state.timer;
  // Fire once immediately so a client that connects mid-quiet-period has data.
  tick().catch(() => {});
  state.timer = setInterval(() => tick().catch(() => {}), intervalMs);
  state.timer.unref?.();
  return state.timer;
}

export function stopTicks() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

export function tickState() {
  return {
    running: Boolean(state.timer),
    ticks: state.ticks,
    intervalMs: TICK_MS,
    grid: state.grid,
    history: state.history,
  };
}
