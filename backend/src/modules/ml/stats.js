// ---------------------------------------------------------------------------
// Numerical primitives shared by every model in the ML module.
//
// Deliberately dependency-free: these are the exact estimators the models need
// (robust location/scale, OLS, quantiles), implemented once and unit-tested,
// rather than pulled in as a library that would add weight and hide the maths.
// ---------------------------------------------------------------------------

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

export const sum = (xs) => xs.reduce((a, b) => a + b, 0);

export const mean = (xs) => (xs.length ? sum(xs) / xs.length : 0);

export function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Sample standard deviation (n-1). */
export function stdev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (xs.length - 1));
}

/**
 * Median absolute deviation — the robust analogue of standard deviation.
 * `MAD * 1.4826` is a consistent estimator of σ for normal data, so we scale it
 * to stay comparable with `stdev` while remaining immune to single outliers.
 */
export function mad(xs) {
  if (!xs.length) return 0;
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m))) * 1.4826;
}

/** Linear-interpolated quantile (type 7, the R/NumPy default). */
export function quantile(xs, p) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = (s.length - 1) * Math.min(Math.max(p, 0), 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

/** Robust z-score: how many scaled MADs a point sits from the median. */
export function robustZ(value, xs) {
  const scale = mad(xs) || stdev(xs);
  if (!scale) return 0;
  return (value - median(xs)) / scale;
}

/** Tukey fences. Returns [lower, upper]; points outside are candidate outliers. */
export function iqrFences(xs, k = 1.5) {
  const q1 = quantile(xs, 0.25);
  const q3 = quantile(xs, 0.75);
  const iqr = q3 - q1;
  return [q1 - k * iqr, q3 + k * iqr];
}

/** Ordinary least squares y = a + b·x. Returns slope, intercept and R². */
export function ols(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 };
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i += 1) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = my - slope * mx;
  const ssTot = sum(ys.slice(0, n).map((y) => (y - my) ** 2));
  const ssRes = sum(ys.slice(0, n).map((y, i) => (y - (intercept + slope * xs[i])) ** 2));
  return { slope, intercept, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

/**
 * Exponential weights, newest last. `halflife` is in samples: a sample
 * `halflife` steps old carries half the weight of the newest one. This is what
 * makes the models track recent behaviour instead of averaging a user's whole
 * history.
 */
export function expWeights(n, halflife = 7) {
  const decay = Math.log(2) / Math.max(halflife, 0.5);
  const w = Array.from({ length: n }, (_, i) => Math.exp(-decay * (n - 1 - i)));
  const total = sum(w) || 1;
  return w.map((x) => x / total);
}

/** Weighted mean. */
export function weightedMean(xs, w) {
  const total = sum(w) || 1;
  return sum(xs.map((x, i) => x * (w[i] ?? 0))) / total;
}

/** Euclidean distance between two equal-length vectors. */
export function euclid(a, b) {
  let acc = 0;
  for (let i = 0; i < a.length; i += 1) acc += (a[i] - b[i]) ** 2;
  return Math.sqrt(acc);
}

/** Standardise columns to zero mean / unit variance. Returns the transform too. */
export function standardise(matrix) {
  if (!matrix.length) return { data: [], centre: [], scale: [] };
  const dims = matrix[0].length;
  const centre = Array.from({ length: dims }, (_, d) => mean(matrix.map((r) => r[d])));
  const scale = Array.from({ length: dims }, (_, d) => stdev(matrix.map((r) => r[d])) || 1);
  return {
    data: matrix.map((r) => r.map((v, d) => (v - centre[d]) / scale[d])),
    centre,
    scale,
  };
}

/**
 * Clamp a value into a range — used to keep derived rates physically plausible
 * so a model can never emit a negative footprint.
 */
export const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

// Defensive on purpose: this is a shared numeric helper called from every
// model, and a single non-numeric value reaching it must not 500 the request.
// Anything not finite is reported as 0 rather than NaN or a thrown TypeError.
export const round = (v, dp = 2) => {
  const n = Number(v);
  return Number.isFinite(n) ? Number(n.toFixed(dp)) : 0;
};

// ---------------------------------------------------------------------------
// Error metrics. Reported for every backtest so a claim of "accurate" is
// backed by a number the reader can check.
// ---------------------------------------------------------------------------

export function mae(actual, predicted) {
  if (!actual.length) return 0;
  return mean(actual.map((a, i) => Math.abs(a - predicted[i])));
}

export function rmse(actual, predicted) {
  if (!actual.length) return 0;
  return Math.sqrt(mean(actual.map((a, i) => (a - predicted[i]) ** 2)));
}

/** Mean absolute percentage error, guarding zero actuals. */
export function mape(actual, predicted) {
  const pairs = actual.map((a, i) => [a, predicted[i]]).filter(([a]) => Math.abs(a) > 1e-9);
  if (!pairs.length) return null;
  return mean(pairs.map(([a, p]) => Math.abs((a - p) / a))) * 100;
}

/** Symmetric MAPE — defined even when the actual is zero. Preferred in reports. */
export function smape(actual, predicted) {
  if (!actual.length) return null;
  const terms = actual.map((a, i) => {
    const p = predicted[i];
    const denom = Math.abs(a) + Math.abs(p);
    return denom < 1e-9 ? 0 : (2 * Math.abs(p - a)) / denom;
  });
  return mean(terms) * 100;
}

/** Deterministic PRNG so every training run is reproducible run-to-run. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
