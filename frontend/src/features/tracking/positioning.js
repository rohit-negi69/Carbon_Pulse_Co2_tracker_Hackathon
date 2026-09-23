// ---------------------------------------------------------------------------
// Positioning algorithm.
//
// Raw GPS on a phone is a noisy sensor: a fix that claims 8 m accuracy can be
// 40 m away from where you actually are, and standing still produces a cluster
// of points that wander by a few metres. Feeding that straight onto a map makes
// a stationary phone look like it is teleporting, and inflates distance.
//
// So the device runs a real filter before it draws anything:
//
//   1. Gate — drop fixes whose reported accuracy is hopeless, whose implied
//      speed is impossible (> 300 km/h, i.e. a receiver glitch rather than
//      travel), or that disagree with the filter's own prediction by more than
//      the innovation gate (a Mahalanobis distance test: 3σ of the *combined*
//      state and measurement uncertainty).
//
//   2. Filter — a 2D constant-velocity Kalman filter in a local east/north
//      plane. State is [x, y, vx, vy]; the transition adds v·dt, and process
//      noise grows with dt³ so long gaps between fixes widen the covariance
//      instead of being trusted. Measurement noise comes from the accuracy the
//      receiver reports (R = σ_acc²), which is exactly the number the OS gives
//      the app, so a bad fix automatically carries less weight.
//
//   3. Derive — speed and heading come from the *filtered* velocity, not from a
//      difference of consecutive raw fixes, so a single outlier cannot swing
//      the direction arrow. Distance accumulates along the filtered path and
//      only while the filter believes you are moving, so standing at a bus stop
//      does not bill you for jitter.
//
// The local plane (equirectangular about an anchor point) keeps the maths in
// metres; coordinates are converted back to WGS84 lat/lon on the way out, so
// nothing downstream needs to know a filter was involved.
// ---------------------------------------------------------------------------

export const R_EARTH_M = 6371008.8;

/** Bounding box (with a small margin) used for the India-centred live view. */
export const INDIA = {
  center: [22.3511, 78.6677], // roughly the geographic centre of the country
  zoom: 5,
  bounds: { north: 35.9, south: 6.4, west: 67.9, east: 97.6 },
};

export function inIndia(lat, lon) {
  const { north, south, west, east } = INDIA.bounds;
  return lat >= south && lat <= north && lon >= west && lon <= east;
}

export function haversineM(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Compass bearing from a → b in degrees. */
export function bearingDeg(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(b.lon - a.lon)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lon - a.lon));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const compassPoint = (deg) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

/** "28.6139° N" style formatting, plus a DMS form for the coordinate readout. */
export function formatLat(lat) {
  return `${Math.abs(lat).toFixed(5)}° ${lat >= 0 ? 'N' : 'S'}`;
}
export function formatLon(lon) {
  return `${Math.abs(lon).toFixed(5)}° ${lon >= 0 ? 'E' : 'W'}`;
}
export function formatDMS(value, axis) {
  const positive = value >= 0;
  const abs = Math.abs(value);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = ((minFloat - min) * 60).toFixed(1);
  const hemi = axis === 'lat' ? (positive ? 'N' : 'S') : positive ? 'E' : 'W';
  return `${deg}°${String(min).padStart(2, '0')}'${String(sec).padStart(4, '0')}"${hemi}`;
}

/** Innovation gate: reject a fix whose residual exceeds this many σ. */
const INNOVATION_SIGMA = 3.2;
/** Absolute residual that is never acceptable, however small the σ is. */
const MAX_RESIDUAL_M = 250;
/** Implied speed above which a fix is a receiver glitch, not travel. */
const TELEPORT_KMH = 300;
/** Reported accuracy worse than this is discarded outright. */
const MAX_ACCURACY_M = 120;
/** Below this speed the filter considers the receiver stationary (walking is ≥3 km/h). */
const STATIONARY_KMH = 1.8;
/** Process noise (acceleration σ, m/s²). A phone in a car rarely exceeds this. */
const ACCEL_SIGMA = 0.9;

export class PositionSmoother {
  constructor({ maxAccuracyM = MAX_ACCURACY_M, accelSigma = ACCEL_SIGMA } = {}) {
    this.maxAccuracyM = maxAccuracyM;
    this.accelSigma = accelSigma;
    this.reset();
  }

  reset() {
    this.anchor = null; // { lat, lon } — origin of the local plane
    this.state = null; // [x, y, vx, vy] in metres / (m/s)
    this.P = null; // 4×4 covariance
    this.lastT = null;
    this.heading = null;
    this.trail = [];
    this.distanceM = 0;
    this.movingMs = 0;
    this.stoppedMs = 0;
    this.accepted = 0;
    this.stillMs = 0;
    this.recent = [];
    this.rejected = { accuracy: 0, teleport: 0, innovation: 0 };
    this.raw = null;
    this.quality = 'unknown';
  }

  // -- local plane -------------------------------------------------------

  toLocal(lat, lon) {
    const latScale = (Math.PI / 180) * R_EARTH_M;
    const lonScale = latScale * Math.cos((this.anchor.lat * Math.PI) / 180);
    return { x: (lon - this.anchor.lon) * lonScale, y: (lat - this.anchor.lat) * latScale };
  }

  toGeographic(x, y) {
    const latScale = (Math.PI / 180) * R_EARTH_M;
    const lonScale = latScale * Math.cos((this.anchor.lat * Math.PI) / 180);
    return { lat: this.anchor.lat + y / latScale, lon: this.anchor.lon + x / lonScale };
  }

  // -- filtering ---------------------------------------------------------

  /**
   * Feed one raw fix.
   * @returns {object|null} the filtered fix, or null when the fix was rejected
   *   (check `smoother.rejected` and `smoother.lastRejectReason`).
   */
  push(fix) {
    const lat = Number(fix.lat);
    const lon = Number(fix.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

    const t = Number(fix.t) || Date.now();
    const accuracy = Number.isFinite(Number(fix.accuracy)) && Number(fix.accuracy) > 0 ? Number(fix.accuracy) : 30;

    if (accuracy > this.maxAccuracyM) {
      this.rejected.accuracy += 1;
      this.lastRejectReason = 'accuracy';
      return null;
    }

    if (!this.anchor) {
      // First fix defines the plane and the initial state (at rest).
      this.anchor = { lat, lon };
      this.state = [0, 0, 0, 0];
      // Velocity starts genuinely unknown but bounded — a wide prior makes the
    // very first fixes look like motion, which would bill a standing phone.
    const v0 = 2.5 ** 2;
    this.P = [
        [accuracy ** 2, 0, 0, 0],
        [0, accuracy ** 2, 0, 0],
        [0, 0, v0, 0],
        [0, 0, 0, v0],
      ];
      this.trail.push({ lat, lon });
      this.lastT = t;
      this.raw = { lat, lon, accuracy, t };
      return this.#snapshot(fix, 0);
    }

    let dt = (t - this.lastT) / 1000;
    if (!(dt > 0)) dt = 0.5;
    // A long gap (phone slept, tunnel, no signal) must not be treated as
    // smooth motion: clamp the step and let process noise inflate instead.
    if (dt > 30) dt = 5;

    // ---- predict
    const [x, y, vx, vy] = this.state;
    const px = x + vx * dt;
    const py = y + vy * dt;
    const q = this.accelSigma ** 2;
    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const dt4 = dt2 * dt2;
    const P = this.P;
    // F P Fᵗ for F = [[1,0,dt,0],[0,1,0,dt],[0,0,1,0],[0,0,0,1]]
    const FP = [
      [P[0][0] + dt * P[2][0], P[0][1] + dt * P[2][1], P[0][2] + dt * P[2][2], P[0][3] + dt * P[2][3]],
      [P[1][0] + dt * P[3][0], P[1][1] + dt * P[3][1], P[1][2] + dt * P[3][2], P[1][3] + dt * P[3][3]],
      [P[2][0], P[2][1], P[2][2], P[2][3]],
      [P[3][0], P[3][1], P[3][2], P[3][3]],
    ];
    const Ft = (r, c) => (c === 2 ? (r === 0 ? 1 : 0) : c === 3 ? (r === 1 ? 1 : 0) : c === r ? 1 : 0);
    const Ppred = [
      [0, 1, 2, 3].map((j) => [0, 1, 2, 3].reduce((acc, k) => acc + FP[0][k] * Ft(k, j), 0)),
      [0, 1, 2, 3].map((j) => [0, 1, 2, 3].reduce((acc, k) => acc + FP[1][k] * Ft(k, j), 0)),
      [0, 1, 2, 3].map((j) => [0, 1, 2, 3].reduce((acc, k) => acc + FP[2][k] * Ft(k, j), 0)),
      [0, 1, 2, 3].map((j) => [0, 1, 2, 3].reduce((acc, k) => acc + FP[3][k] * Ft(k, j), 0)),
    ];
    Ppred[0][0] += q * (dt4 / 4);
    Ppred[1][1] += q * (dt4 / 4);
    Ppred[2][2] += q * dt2;
    Ppred[3][3] += q * dt2;
    Ppred[0][2] += q * (dt3 / 2);
    Ppred[2][0] += q * (dt3 / 2);
    Ppred[1][3] += q * (dt3 / 2);
    Ppred[3][1] += q * (dt3 / 2);

    const local = this.toLocal(lat, lon);
    const rzx = local.x - px;
    const rzy = local.y - py;

    // Implied speed from the last raw fix — a glitch, not travel.
    if (this.raw) {
      const jumpM = haversineM(this.raw, { lat, lon });
      const impliedKmh = (jumpM / 1000) / Math.max(dt / 3600, 1 / 3600);
      if (impliedKmh > TELEPORT_KMH) {
        this.rejected.teleport += 1;
        this.lastRejectReason = 'teleport';
        this.lastT = t;
        this.state = [px, py, vx, vy];
        this.P = Ppred;
        return null;
      }
    }

    // ---- innovation gate (Mahalanobis distance with S = Ppos + R)
    const rVar = accuracy ** 2;
    const sxx = Ppred[0][0] + rVar;
    const syy = Ppred[1][1] + rVar;
    const det = sxx * syy || 1;
    const d2 = (rzx * rzx * syy + rzy * rzy * sxx) / det;
    const gate = Math.max(INNOVATION_SIGMA ** 2, (MAX_RESIDUAL_M ** 2) / Math.max(sxx, 1));
    if (d2 > gate && Math.hypot(rzx, rzy) > 12) {
      this.rejected.innovation += 1;
      this.lastRejectReason = 'innovation';
      this.lastT = t;
      this.state = [px, py, vx, vy];
      this.P = Ppred;
      return null;
    }

    // ---- update: K = P Hᵗ S⁻¹, with H = [[1,0,0,0],[0,1,0,0]]
    const k00 = Ppred[0][0] / sxx;
    const k01 = 0;
    const k10 = 0;
    const k11 = Ppred[1][1] / syy;
    const k20 = Ppred[2][0] / sxx;
    const k21 = Ppred[2][1] / syy;
    const k30 = Ppred[3][0] / sxx;
    const k31 = Ppred[3][1] / syy;

    const nx = px + k00 * rzx + k01 * rzy;
    const ny = py + k10 * rzx + k11 * rzy;
    const nvx = vx + k20 * rzx + k21 * rzy;
    const nvy = vy + k30 * rzx + k31 * rzy;

    // P = (I - K H) P  → only the first two columns are touched by K H.
    const Pn = Ppred.map((row) => row.slice());
    for (let i = 0; i < 4; i += 1) {
      const kx = [k00, k10, k20, k30][i];
      const ky = [k01, k11, k21, k31][i];
      for (let j = 0; j < 4; j += 1) {
        Pn[i][j] = Ppred[i][j] - kx * Ppred[0][j] - ky * Ppred[1][j];
      }
    }

    // ---- derive motion
    const speedMs = Math.hypot(nvx, nvy);
    const speedKmh = speedMs * 3.6;
    const moving = speedKmh >= STATIONARY_KMH;
    const dtMs = dt * 1000;
    if (moving) this.movingMs += dtMs;
    else this.stoppedMs += dtMs;

    // Distance is measured along the *filtered* path: differencing raw fixes
    // would add the receiver's own noise as travel (a stationary phone can
    // drift tens of metres a minute purely on fix scatter).
    const prev = this.trail[this.trail.length - 1];
    const geo = this.toGeographic(nx, ny);
    if (moving && prev) {
      const stepM = haversineM(prev, geo);
      // Overshoot guard: one absurd leg must not land in the total.
      if (stepM < 500) this.distanceM += stepM;
    }
    this.trail.push(geo);
    if (this.trail.length > 4000) this.trail.shift();
    if (moving && speedKmh > 2) this.heading = ((Math.atan2(nvx, nvy) * 180) / Math.PI + 360) % 360;

    this.state = [nx, ny, nvx, nvy];
    this.P = Pn;
    this.lastT = t;
    this.raw = { lat, lon, accuracy, t };
    this.moving = moving;
    this.speedKmh = speedKmh;

    // Zero-velocity update (ZUPT), borrowed from inertial navigation: hold a
    // stationary phone still so receiver noise cannot accumulate as "travel".
    //
    // It must be driven by the *raw* fixes, not by the filter's own speed
    // estimate — a self-referential ZUPT deadlocks the filter (velocity is
    // pinned, its covariance collapses, gain goes to zero, and a walker can
    // never escape). So: was there real measured movement over the last few
    // seconds? If not, and the filter also thinks we are still, then pin it.
    this.recent.push({ lat, lon, t });
    if (this.recent.length > 30) this.recent.shift();
    const cutoff = t - 5000;
    let anchorWindow = this.recent[0];
    for (let i = this.recent.length - 1; i >= 0; i -= 1) {
      if (this.recent[i].t <= cutoff) { anchorWindow = this.recent[i]; break; }
    }
    const windowM = haversineM(anchorWindow, { lat, lon });
    const noRecentTravel = windowM < Math.max(4, accuracy * 0.6);

    if (moving) {
      this.stillMs = 0;
    } else if (noRecentTravel) {
      this.stillMs += dtMs;
      if (this.stillMs > 3000) {
        this.state = [nx, ny, 0, 0];
        for (const i of [2, 3]) {
          for (let j = 0; j < 4; j += 1) {
            Pn[i][j] *= 0.3;
            Pn[j][i] *= 0.3;
          }
        }
        this.speedKmh = 0;
      }
    } else {
      // Measured movement exists but the filter has not picked it up yet:
      // let the velocity covariance grow so the model can start moving.
      this.stillMs = Math.max(0, this.stillMs - dtMs);
      Pn[2][2] += 4;
      Pn[3][3] += 4;
    }

    return this.#snapshot({ ...fix, altitude: fix.altitude, t }, d2);
  }

  /** Build the outward-facing view of the current filtered state. */
  #snapshot(rawFix, d2) {
    const [x, y, vx, vy] = this.state;
    const geo = this.toGeographic(x, y);
    const variance = this.P[0][0] + this.P[1][1];
    // Reported accuracy and the filter's own uncertainty are combined: the
    // honest "where am I" figure is at least as good as either alone.
    const accuracy = Math.sqrt(Math.max(variance / 2, 0) + (this.raw?.accuracy ?? 30) ** 2 / 3);
    const speedKmh = Math.hypot(vx, vy) * 3.6;
    const moving = speedKmh >= STATIONARY_KMH;
    const quality =
      accuracy < 8 ? 'excellent' : accuracy < 18 ? 'good' : accuracy < 45 ? 'fair' : 'poor';

    this.accepted += 1;
    this.quality = quality;

    const correctionM = rawFix && Number.isFinite(rawFix.lat)
      ? haversineM({ lat: rawFix.lat, lon: rawFix.lon }, geo)
      : 0;

    return {
      lat: geo.lat,
      lon: geo.lon,
      accuracy,
      rawAccuracy: this.raw?.accuracy ?? null,
      speedKmh: moving ? speedKmh : 0,
      altitude: Number.isFinite(Number(rawFix?.altitude)) ? Number(rawFix.altitude) : null,
      heading: this.heading,
      compass: this.heading == null ? null : compassPoint(this.heading),
      moving,
      distanceKm: this.distanceM / 1000,
      movingMinutes: this.movingMs / 60000,
      stoppedMinutes: this.stoppedMs / 60000,
      quality,
      correctionM,
      innovation: Number.isFinite(d2) ? Math.sqrt(Math.max(d2, 0)) : 0,
      fixes: this.accepted,
      rejected: { ...this.rejected },
      t: rawFix?.t ?? Date.now(),
    };
  }

  /** Accept a fix only if it survives the gates, and return the filtered point. */
  ingest(fix) {
    return this.push(fix);
  }
}

/**
 * Convenience wrapper for a stream of fixes: returns the filtered trail.
 * Handy for offline replay of a recorded trace.
 */
export function filterTrace(fixes, options) {
  const smoother = new PositionSmoother(options);
  const out = [];
  for (const fix of fixes) {
    const filtered = smoother.push(fix);
    if (filtered) out.push(filtered);
  }
  return { points: out, smoother };
}
