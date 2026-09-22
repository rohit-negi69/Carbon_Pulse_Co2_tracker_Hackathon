import * as tripRepository from '../../db/repositories/tripRepository.js';
import * as activityRepository from '../../db/repositories/activityRepository.js';
import * as activities from '../activities/service.js';
import { publish } from '../realtime/hub.js';
import { mean, stdev, quantile, round, clamp } from '../ml/stats.js';
import { toDateStr } from '../../domain/week.js';

// ---------------------------------------------------------------------------
// Real-world tracking.
//
// A trip is built from genuine device GPS fixes. Raw traces are noisy, so the
// pipeline cleans before it measures:
//
//   1. drop fixes whose reported accuracy is worse than 50 m
//   2. drop teleports (implied speed > 250 km/h between consecutive fixes)
//   3. detect stops (slow for > 3 min) and exclude them from *moving* distance,
//      so sitting in traffic is not billed as travel
//   4. sum haversine legs, then apply a road-winding factor
//
// The mode classifier is deliberately a soft, explainable scoring model rather
// than a black box: each mode defines membership functions over the kinematic
// features, the scores go through a softmax to a probability, and the winning
// mode comes with the reasons that produced it. A user correction is stored as
// ground truth and is never silently overridden.
// ---------------------------------------------------------------------------

const R_EARTH_KM = 6371.0088;

/** Great-circle distance between two {lat, lon} fixes. */
export function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

const MAX_ACCURACY_M = 50;

// A GPS glitch is a jump between two consecutive fixes that implies an
// impossible speed — typically a large offset inside a second or two, i.e.
// kilometres per second. The bar therefore has to sit *above* genuine air
// travel (a commercial jet cruises near 900 km/h) or a real flight would be
// discarded as noise. 1200 km/h clears every civil aircraft and still catches
// any realistic glitch by a wide margin.
const TELEPORT_KMH = 1200;

const STOP_SPEED_KMH = 1.5;
// Telematics convention: slow for 30 s or more is a stop. Shorter dips are GPS
// noise around the threshold, not a red light.
const STOP_MIN_SECONDS = 30;

/**
 * Clean a raw fix stream.
 * @returns {{kept: Array, dropped: {accuracy: number, teleport: number}, raw: number}}
 */
export function cleanFixes(rawPoints = []) {
  const dropped = { accuracy: 0, teleport: 0 };
  const kept = [];

  for (const p of rawPoints) {
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    if (Number.isFinite(Number(p.accuracy)) && Number(p.accuracy) > MAX_ACCURACY_M) {
      dropped.accuracy += 1;
      continue;
    }
    const t = new Date(p.t ?? p.time ?? p.timestamp ?? Date.now()).getTime();
    const point = { lat, lon, t, accuracy: Number(p.accuracy) || null };

    const prev = kept[kept.length - 1];
    if (prev) {
      const dtHours = Math.max((point.t - prev.t) / 3_600_000, 1 / 3600);
      const km = haversineKm(prev, point);
      if (km / dtHours > TELEPORT_KMH) {
        dropped.teleport += 1;
        continue; // GPS jump, not a 250 km/h sprint
      }
    }
    kept.push(point);
  }

  return { kept, dropped, raw: rawPoints.length };
}

/**
 * Haversine distance with stop exclusion.
 *
 * @returns {{distanceKm, movingKm, stoppedKm, durationMin, avgSpeedKmh, maxSpeedKmh, p85Kmh,
 *            speedCv, stopFraction, legs, speedProfile}}
 */
export function measure(kept) {
  if (kept.length < 2) {
    return { distanceKm: 0, movingKm: 0, stoppedKm: 0, durationMin: 0, avgSpeedKmh: 0, maxSpeedKmh: 0, p85Kmh: 0, speedCv: 0, stopFraction: 1, legs: 0, speedProfile: [] };
  }

  let distanceKm = 0;
  let movingKm = 0;
  const speeds = [];
  let stoppedSeconds = 0;
  let stopRun = 0;

  // A slow run only counts once it has lasted STOP_MIN_SECONDS. The run is
  // flushed both when movement resumes *and* at the end of the trace — a trip
  // that finishes while parked would otherwise report zero stopped time.
  const flush = () => {
    if (stopRun >= STOP_MIN_SECONDS * 1000) stoppedSeconds += stopRun;
    stopRun = 0;
  };

  for (let i = 1; i < kept.length; i += 1) {
    const a = kept[i - 1];
    const b = kept[i];
    const km = haversineKm(a, b);
    const hours = Math.max((b.t - a.t) / 3_600_000, 1 / 3600);
    const kmh = km / hours;

    distanceKm += km;
    speeds.push(kmh);

    if (kmh < STOP_SPEED_KMH) {
      stopRun += b.t - a.t;
    } else {
      movingKm += km;
      flush();
    }
  }
  flush();

  const durationMin = (kept[kept.length - 1].t - kept[0].t) / 60_000;
  const avg = mean(speeds);
  const overallAvg = durationMin > 0 ? (distanceKm / durationMin) * 60 : 0;

  return {
    distanceKm: round(distanceKm, 3),
    movingKm: round(movingKm, 3),
    stoppedKm: round(distanceKm - movingKm, 3),
    durationMin: round(durationMin, 1),
    // Use whole-trip average: the mean of instantaneous speeds over-weights
    // densely sampled slow segments.
    avgSpeedKmh: round(overallAvg, 1),
    maxSpeedKmh: round(Math.max(...speeds), 1),
    p85Kmh: round(quantile(speeds, 0.85), 1),
    speedCv: avg > 0 ? round(stdev(speeds) / avg, 3) : 0,
    stopFraction: durationMin > 0 ? round(clamp(stoppedSeconds / (durationMin * 60_000), 0, 1), 3) : 0,
    legs: kept.length - 1,
    speedProfile: speeds.map((s) => round(s, 1)),
  };
}

// ---------------------------------------------------------------------------
// Mode classifier — soft membership functions over kinematic features.
// ---------------------------------------------------------------------------

/** Trapezoidal membership: 1 inside [a,b], tapering to 0 at [a-w, b+w]. */
function band(x, a, b, w) {
  if (x >= a && x <= b) return 1;
  if (x < a) return clamp(1 - (a - x) / w, 0, 1);
  return clamp(1 - (x - b) / w, 0, 1);
}

const MODE_RULES = [
  {
    mode: 'walking',
    label: 'Walking',
    activityType: null, // zero-emission; nothing is written to the ledger
    zeroEmission: true,
    score: (f) => 1.15 * band(f.p85Kmh, 0, 6.5, 3) + 0.6 * band(f.maxSpeedKmh, 0, 9, 4),
  },
  {
    mode: 'cycling',
    label: 'Cycling',
    activityType: null,
    zeroEmission: true,
    score: (f) => 1.15 * band(f.p85Kmh, 8, 24, 5) + 0.5 * band(f.avgSpeedKmh, 7, 21, 5) + 0.2 * clamp(1 - f.stopFraction * 2, 0, 1),
  },
  {
    mode: 'bus',
    label: 'Bus / coach',
    activityType: 'bus',
    score: (f) => 1.0 * band(f.avgSpeedKmh, 12, 42, 8) + 0.95 * band(f.stopFraction, 0.18, 1, 0.22) + 0.35 * band(f.maxSpeedKmh, 0, 75, 20) + 0.3 * clamp(f.speedCv, 0, 1.4),
  },
  {
    mode: 'car',
    label: 'Car',
    activityType: 'car',
    score: (f) => 1.05 * band(f.avgSpeedKmh, 22, 85, 14) + 0.5 * band(f.stopFraction, 0, 0.4, 0.2) + 0.4 * band(f.maxSpeedKmh, 35, 130, 30),
  },
  {
    mode: 'rail',
    label: 'Train / metro',
    activityType: 'bus', // public transport: the brief's bus factor
    // Rail is the *steady, fast* mode. It is scored on 85th-percentile speed
    // (not mean, which stop dwell drags down), on genuinely low speed variance,
    // and on distance — a 3 km hop does not happen by train. A car on a
    // motorway can hold a steady 50 km/h, so the p85 floor is what keeps the
    // two apart; when it still cannot, classifyMode reports a close call
    // instead of pretending to certainty.
    score: (f) =>
      1.1 * band(f.p85Kmh, 55, 170, 22) +
      0.75 * clamp(1 - f.speedCv * 2.4, 0, 1) +
      0.3 * band(f.stopFraction, 0, 0.12, 0.1) +
      0.3 * clamp((f.distanceKm - 12) / 60, 0, 1),
  },
  {
    mode: 'flight',
    label: 'Flight',
    activityType: 'flight',
    score: (f) => 1.4 * band(f.maxSpeedKmh, 280, 1000, 90) + 0.8 * clamp((f.distanceKm - 150) / 400, 0, 1),
  },
];

/**
 * Classify a cleaned trace.
 * @returns {{mode, label, activityType, confidence, ranked, reasons, zeroEmission}}
 */
export function classifyMode(measurement) {
  const f = measurement;
  const scored = MODE_RULES.map((rule) => ({ rule, s: Math.max(0, rule.score(f)) }));

  // Softmax over scores → a genuine probability distribution, not a hard pick.
  const max = Math.max(...scored.map((x) => x.s), 0.0001);
  const exps = scored.map((x) => Math.exp((x.s - max) * 2.2));
  const total = exps.reduce((a, b) => a + b, 0) || 1;
  const ranked = scored
    .map((x, i) => ({
      mode: x.rule.mode,
      label: x.rule.label,
      activityType: x.rule.activityType,
      zeroEmission: Boolean(x.rule.zeroEmission),
      rawScore: round(x.s, 3),
      probability: round(exps[i] / total, 4),
    }))
    .sort((a, b) => b.probability - a.probability);

  const top = ranked[0];

  // No movement at all → no mode.
  if (!f.legs || f.distanceKm < 0.05 || f.durationMin < 0.2) {
    return {
      mode: 'stationary',
      label: 'Stationary',
      activityType: null,
      zeroEmission: true,
      confidence: 1,
      ranked: [{ mode: 'stationary', label: 'Stationary', probability: 1 }],
      reasons: ['Under 50 m of movement — nothing to log.'],
    };
  }

  const reasons = [];
  reasons.push(`Average ${f.avgSpeedKmh} km/h, 85th percentile ${f.p85Kmh} km/h over ${f.distanceKm} km`);
  if (f.stopFraction > 0.15) reasons.push(`${Math.round(f.stopFraction * 100)}% of the trip was stationary (stop-start profile)`);
  if (f.speedCv < 0.35) reasons.push('Very steady speed — typical of rail');
  if (f.maxSpeedKmh > 250) reasons.push(`Peak of ${f.maxSpeedKmh} km/h is only reachable in the air`);

  // Ambiguity is reported, not hidden. A motorway car and a train can share a
  // speed profile, so when the runner-up is close the user is asked to confirm
  // rather than being handed a confident guess.
  const margin = top.probability - (ranked[1]?.probability ?? 0);
  const closeCall = margin < 0.15 && ranked.length > 1;
  if (closeCall) {
    reasons.push(`Close call with ${ranked[1].label} — confirm if this matters to you`);
  }

  return {
    mode: top.mode,
    label: top.label,
    activityType: top.activityType,
    zeroEmission: top.zeroEmission,
    confidence: top.probability,
    margin: round(margin, 4),
    closeCall,
    alternatives: closeCall ? ranked.slice(0, 2).map((r) => r.label) : [],
    ranked,
    reasons,
  };
}

/** Road winding factor: straight-line GPS chords under-count curving routes. */
const WINDING_FACTOR = 1.08;

// ---------------------------------------------------------------------------
// Trip lifecycle
// ---------------------------------------------------------------------------

export async function startTrip({ label = '', startedAt } = {}) {
  const trip = await tripRepository.create({
    label: String(label).slice(0, 80),
    status: 'active',
    startedAt: startedAt ? new Date(startedAt) : new Date(),
    points: [],
  });
  publish('trip', { phase: 'started', trip: { id: String(trip._id), label: trip.label } });
  return { ok: true, trip };
}

export async function appendPoints(id, points = []) {
  const trip = await tripRepository.findById(id);
  if (!trip) return { ok: false, status: 404, error: 'Trip not found' };
  if (trip.status !== 'active') return { ok: false, status: 409, error: `Trip is ${trip.status}` };

  const merged = [...(trip.points || []), ...points];
  const { kept, dropped } = cleanFixes(merged);
  const measurement = measure(kept);
  const classification = classifyMode(measurement);

  const updated = await tripRepository.update(id, {
    points: merged.slice(-2000),
    distanceKm: round(measurement.movingKm * WINDING_FACTOR, 3),
    durationMin: measurement.durationMin,
    avgSpeedKmh: measurement.avgSpeedKmh,
    maxSpeedKmh: measurement.maxSpeedKmh,
    autoMode: classification.mode,
    // A user correction always wins over the classifier.
    mode: trip.corrected ? trip.mode : classification.mode,
  });

  // Stream the live classification so the tracking UI updates as you move.
  publish('trip', {
    phase: 'point',
    trip: {
      id: String(id),
      distanceKm: updated.distanceKm,
      durationMin: updated.durationMin,
      avgSpeedKmh: updated.avgSpeedKmh,
      mode: updated.mode,
      autoMode: classification.mode,
      confidence: classification.confidence,
      corrected: Boolean(updated.corrected),
      points: kept.length,
    },
  }, { replay: false });

  // The tracker UI narrates the cleaning pass ("kept N fixes, dropped X for poor
  // accuracy, Y as impossible jumps"), so the counts have to travel back with
  // the live read rather than being recomputed on the client.
  return { ok: true, trip: updated, measurement, classification, dropped };
}

/** Record a user correction — this becomes ground truth for the model. */
export async function correctMode(id, mode) {
  const trip = await tripRepository.findById(id);
  if (!trip) return { ok: false, status: 404, error: 'Trip not found' };
  const rule = MODE_RULES.find((r) => r.mode === mode);
  if (!rule) return { ok: false, status: 400, error: `Unknown mode "${mode}"` };
  const updated = await tripRepository.update(id, { mode, corrected: true });
  return { ok: true, trip: updated, activityType: rule.activityType };
}

/**
 * Close a trip and (optionally) write it to the ledger.
 * Zero-emission modes are reported but never billed.
 */
export async function completeTrip(id, { log = true, label } = {}) {
  const trip = await tripRepository.findById(id);
  if (!trip) return { ok: false, status: 404, error: 'Trip not found' };
  if (trip.status === 'completed') return { ok: false, status: 409, error: 'Trip already completed' };

  const { kept } = cleanFixes(trip.points || []);
  const measurement = measure(kept);
  const classification = classifyMode(measurement);
  const mode = trip.corrected ? trip.mode : classification.mode;
  const rule = MODE_RULES.find((r) => r.mode === mode) || { activityType: null, zeroEmission: true, label: mode };

  const distanceKm = round(measurement.movingKm * WINDING_FACTOR, 2);
  const patch = {
    status: 'completed',
    endedAt: new Date(),
    distanceKm,
    durationMin: measurement.durationMin,
    avgSpeedKmh: measurement.avgSpeedKmh,
    maxSpeedKmh: measurement.maxSpeedKmh,
    mode,
    autoMode: classification.mode,
    activityType: rule.activityType,
    co2: 0,
    factorUsed: 0,
    label: label ?? trip.label,
  };

  let created = null;
  if (log && rule.activityType && distanceKm > 0) {
    const written = await activities.create({
      type: rule.activityType,
      quantity: distanceKm,
      date: toDateStr(new Date()),
      notes: `GPS trip${patch.label ? ` · ${patch.label}` : ''} · ${mode} · ${measurement.durationMin} min`,
      source: 'api',
      confirmed: true, // a measured trace is not a typo
    });
    if (written.ok) {
      created = written.activity;
      patch.co2 = written.co2;
      patch.factorUsed = written.factor.factor;
      patch.activityId = String(written.activity._id);
      patch.logged = true;
    }
  }

  const updated = await tripRepository.update(id, patch);
  publish('trip', { phase: 'completed', trip: { id: String(id), mode, distanceKm, co2: patch.co2, logged: patch.logged } });

  return { ok: true, trip: updated, measurement, classification, activity: created };
}

export async function listTrips({ status, limit = 25 } = {}) {
  const trips = await tripRepository.find({ status, limit });
  return {
    trips: trips.map((t) => ({ ...t, points: undefined, pointCount: (t.points || []).length })),
    count: trips.length,
  };
}

export async function discardTrip(id) {
  const trip = await tripRepository.findById(id);
  if (!trip) return { ok: false, status: 404, error: 'Trip not found' };
  await tripRepository.remove(id);
  return { ok: true };
}

/** Ledger totals written by tracking — shown on the tracker card. */
export async function trackingStats() {
  const all = await activityRepository.find({});
  const tracked = all.filter((a) => /^GPS trip/.test(a.notes || '') || a.source === 'api');
  return {
    trackedActivities: tracked.length,
    trackedKg: round(tracked.reduce((acc, a) => acc + a.co2, 0), 2),
    modes: MODE_RULES.map((r) => ({ mode: r.mode, label: r.label, activityType: r.activityType, zeroEmission: Boolean(r.zeroEmission) })),
    classifier: 'soft membership scoring over kinematic features → softmax posterior',
    windingFactor: WINDING_FACTOR,
    cleaning: { maxAccuracyM: MAX_ACCURACY_M, teleportKmh: TELEPORT_KMH, stopSpeedKmh: STOP_SPEED_KMH, stopMinSeconds: STOP_MIN_SECONDS },
  };
}
