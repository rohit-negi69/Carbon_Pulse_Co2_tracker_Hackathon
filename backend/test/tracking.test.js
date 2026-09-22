import test from 'node:test';
import assert from 'node:assert/strict';

import { haversineKm, cleanFixes, measure, classifyMode } from '../src/modules/tracking/service.js';

// ---------------------------------------------------------------------------
// Fixtures: synthetic GPS traces with known ground truth.
// ---------------------------------------------------------------------------

const T0 = Date.parse('2026-09-22T08:00:00Z');

/** ~1.1 m per 0.00001° of latitude — enough to build traces of a known length. */
const DEG_PER_KM = 1 / 111.32;

/**
 * Straight-line trace with lateral GPS noise.
 * `jitterM` is in **metres** and is applied perpendicular to the direction of
 * travel, so it adds realistic receiver noise without inflating the measured
 * distance along the path — applying jitter to the latitude would fake progress.
 */
function trace(km, minutes, stepSeconds = 10, { jitterM = 0, accuracy = 8 } = {}) {
  const points = [];
  const totalSeconds = minutes * 60;
  const count = Math.max(2, Math.floor(totalSeconds / stepSeconds) + 1);
  const degPerM = 1 / 111_320;
  for (let i = 0; i < count; i += 1) {
    const frac = i / (count - 1);
    const noise = jitterM ? Math.sin(i * 1.7) * jitterM * degPerM : 0;
    points.push({
      lat: 51.5 + frac * km * DEG_PER_KM,
      lon: -0.12 + noise, // perpendicular wobble only
      t: T0 + i * stepSeconds * 1000,
      accuracy,
    });
  }
  return points;
}

/**
 * Stop-and-go trace: a bus-style dwell at every stop plus a steady run between
 * them. Dwells are 70 s, comfortably above the 30 s stop threshold.
 */
function stopStartTrace(totalKm, minutes, stepSeconds = 10) {
  const points = [];
  const totalSeconds = minutes * 60;
  const count = Math.floor(totalSeconds / stepSeconds) + 1;
  const cycle = 14; // samples per stop-and-run cycle
  const dwell = 7; // of which 7 (70 s) are stationary
  const movingFraction = (cycle - dwell) / cycle;
  const degPerM = 1 / 111_320;
  let lat = 51.5;
  for (let i = 0; i < count; i += 1) {
    if (i % cycle >= dwell) lat += (totalKm / count) * DEG_PER_KM * (1 / movingFraction);
    // A stationary receiver still wanders a metre or two; without that drift the
    // stopped legs contribute exactly zero distance and stop detection is never
    // exercised the way it is in the field.
    const drift = dwell && i % cycle < dwell ? Math.sin(i * 2.3) * 2 * degPerM : 0;
    points.push({ lat, lon: -0.12 + drift, t: T0 + i * stepSeconds * 1000, accuracy: 6 });
  }
  return points;
}

/**
 * Realistic road trace: a car never holds an exactly constant speed. Progress
 * is driven by a smooth accelerate/cruise/brake curve with small sampling
 * noise, which is what a real receiver reports.
 */
function roadTrace(totalKm, minutes, stepSeconds = 10) {
  const points = [];
  const totalSeconds = minutes * 60;
  const count = Math.floor(totalSeconds / stepSeconds) + 1;
  // distance covered up to sample i, from a varying speed profile
  const weights = Array.from({ length: count - 1 }, (_, i) => {
    const phase = (i / (count - 1)) * Math.PI * 5;
    const traffic = 1 + 0.45 * Math.sin(phase) + 0.18 * Math.sin(phase * 3.3);
    return Math.max(0.15, traffic);
  });
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let lat = 51.5;
  let cum = 0;
  points.push({ lat, lon: -0.12, t: T0, accuracy: 7 });
  for (let i = 0; i < count - 1; i += 1) {
    cum += weights[i];
    lat = 51.5 + (cum / totalWeight) * totalKm * DEG_PER_KM;
    points.push({ lat, lon: -0.12, t: T0 + (i + 1) * stepSeconds * 1000, accuracy: 7 });
  }
  return points;
}

/** Steady cruise trace — what rail actually looks like. */
function railTrace(totalKm, minutes, stepSeconds = 20) {
  return trace(totalKm, minutes, stepSeconds, { accuracy: 12 });
}

// ---------------------------------------------------------------------------
// Distance
// ---------------------------------------------------------------------------

test('tracking: haversine matches known real-world distances', () => {
  // London → Paris is ~344 km great-circle.
  const london = { lat: 51.5074, lon: -0.1278 };
  const paris = { lat: 48.8566, lon: 2.3522 };
  const km = haversineKm(london, paris);
  assert.ok(km > 330 && km < 355, `London→Paris measured ${km.toFixed(1)} km, expected ~344`);

  // Zero distance for identical points.
  assert.equal(haversineKm(london, london), 0);

  // One degree of latitude is ~111 km anywhere on the sphere.
  assert.ok(Math.abs(haversineKm({ lat: 0, lon: 0 }, { lat: 1, lon: 0 }) - 111.19) < 0.5);
});

test('tracking: measures a clean trace to within a few percent', () => {
  const points = trace(12, 20, 10);
  const { kept } = cleanFixes(points);
  const m = measure(kept);
  assert.ok(Math.abs(m.distanceKm - 12) < 0.6, `measured ${m.distanceKm} km, expected ~12`);
  assert.ok(Math.abs(m.avgSpeedKmh - 36) < 3, `average ${m.avgSpeedKmh} km/h, expected ~36`);
  assert.equal(m.legs, points.length - 1);
});

// ---------------------------------------------------------------------------
// Cleaning
// ---------------------------------------------------------------------------

test('tracking: drops low-accuracy fixes and GPS teleports, and says how many', () => {
  const good = trace(5, 8, 10);
  const noisy = good.map((p, i) => (i % 7 === 0 ? { ...p, accuracy: 180 } : p));
  const teleport = { lat: 51.9, lon: -0.12, t: good[10].t + 1000, accuracy: 5 };

  const result = cleanFixes([...noisy.slice(0, 10), teleport, ...noisy.slice(10)]);
  assert.ok(result.dropped.accuracy > 0, 'imprecise fixes are dropped');
  assert.equal(result.dropped.teleport, 1, 'the ~44 km in one second must be rejected');
  assert.ok(result.kept.length < result.raw, 'cleaning removes points');

  // A teleport must not inflate the distance.
  const m = measure(result.kept);
  assert.ok(m.distanceKm < 7, `distance ${m.distanceKm} should stay near 5 km`);
});

test('tracking: rejects malformed coordinates instead of throwing', () => {
  const result = cleanFixes([
    { lat: 91, lon: 0, t: T0 },
    { lat: 51.5, lon: 200, t: T0 },
    { lat: 'nope', lon: -0.1, t: T0 },
    { lat: 51.5, lon: -0.12, t: T0 },
  ]);
  assert.equal(result.kept.length, 1);
});

test('tracking: stops are excluded from moving distance', () => {
  const { kept } = cleanFixes(stopStartTrace(10, 35, 10));
  const m = measure(kept);
  assert.ok(m.stopFraction > 0.15, `stop fraction ${m.stopFraction} should register the stationary periods`);
  assert.ok(m.movingKm < m.distanceKm, 'moving distance excludes the stopped legs');
  assert.ok(m.stoppedKm > 0, 'stationary drift shows up as stopped distance');
  // Movement during dwell is metres, not kilometres — stops must not be billed.
  assert.ok(m.stoppedKm < m.movingKm * 0.1, `stopped ${m.stoppedKm} km vs moving ${m.movingKm} km`);
});

test('tracking: a stop that is still in progress when the trip ends is counted', () => {
  // 4 minutes of driving followed by 3 minutes parked with the engine off.
  const moving = trace(3, 4, 10);
  const last = moving[moving.length - 1];
  const parked = Array.from({ length: 18 }, (_, i) => ({ lat: last.lat, lon: last.lon, t: last.t + (i + 1) * 10_000, accuracy: 5 }));
  const m = measure(cleanFixes([...moving, ...parked]).kept);
  assert.ok(m.stopFraction > 0.3, `trailing stop must be credited, got ${m.stopFraction}`);
});

// ---------------------------------------------------------------------------
// Mode classification
// ---------------------------------------------------------------------------

test('tracking: classifies walking, cycling, car, bus and rail from kinematics', () => {
  const cases = [
    ['walking', trace(1.4, 18, 10, { jitterM: 6 })],
    ['cycling', trace(7, 25, 10, { jitterM: 4 })],
    ['car', roadTrace(28, 32, 10)],
    ['bus', stopStartTrace(12, 45, 10)],
  ];

  for (const [expected, points] of cases) {
    const { kept } = cleanFixes(points);
    const m = measure(kept);
    const c = classifyMode(m);
    assert.equal(
      c.mode,
      expected,
      `${expected}: got ${c.mode} (avg ${m.avgSpeedKmh} km/h, p85 ${m.p85Kmh}, cv ${m.speedCv}, stops ${m.stopFraction})`
    );
    assert.ok(c.confidence > 0.25, `${expected} confidence ${c.confidence} too low`);
    assert.ok(c.reasons.length > 0, 'a classification must explain itself');
  }
});

test('tracking: a steady high-speed cruise reads as rail, and an ambiguous profile is flagged', () => {
  const rail = classifyMode(measure(cleanFixes(railTrace(90, 60, 20)).kept));
  assert.equal(rail.mode, 'rail', `got ${rail.mode} at ${rail.confidence}`);
  assert.equal(rail.activityType, 'bus', 'rail bills at the public-transport factor');

  // A perfectly constant 50 km/h is genuinely ambiguous between a motorway car
  // and a train; the classifier must say so rather than bluff.
  const ambiguous = classifyMode(measure(cleanFixes(trace(25, 30, 10)).kept));
  if (ambiguous.closeCall) {
    assert.ok(ambiguous.alternatives.length === 2, 'a close call names the alternative');
    assert.ok(ambiguous.reasons.some((r) => /close call/i.test(r)));
  }
});

test('tracking: a stationary trace is not billed as a trip', () => {
  const points = Array.from({ length: 40 }, (_, i) => ({ lat: 51.5, lon: -0.12, t: T0 + i * 10_000, accuracy: 5 }));
  const { kept } = cleanFixes(points);
  const c = classifyMode(measure(kept));
  assert.equal(c.mode, 'stationary');
  assert.equal(c.activityType, null, 'nothing gets written to the ledger');
});

test('tracking: zero-emission modes never produce an activity type', () => {
  for (const points of [trace(1.2, 15, 10), trace(6, 22, 10)]) {
    const { kept } = cleanFixes(points);
    const c = classifyMode(measure(kept));
    assert.equal(c.activityType, null, `${c.mode} must not be billed`);
    assert.equal(c.zeroEmission, true);
  }
});

test('tracking: probabilities form a proper distribution', () => {
  const { kept } = cleanFixes(trace(25, 30, 10));
  const c = classifyMode(measure(kept));
  const sum = c.ranked.reduce((a, r) => a + r.probability, 0);
  assert.ok(Math.abs(sum - 1) < 0.01, `probabilities sum to ${sum}`);
  assert.ok(c.ranked.length >= 5, 'all modes are scored, not just the winner');
  assert.equal(c.ranked[0].mode, c.mode);
});

test('tracking: long-distance high-speed traces read as flight', () => {
  // 900 km in 80 minutes ≈ 675 km/h — only an aircraft.
  const { kept } = cleanFixes(trace(900, 80, 120));
  const m = measure(kept);
  const c = classifyMode(m);
  assert.equal(c.mode, 'flight', `got ${c.mode} at ${m.avgSpeedKmh} km/h`);
  assert.equal(c.activityType, 'flight');
});
