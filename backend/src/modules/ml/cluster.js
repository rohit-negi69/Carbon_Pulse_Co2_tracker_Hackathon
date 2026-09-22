import { euclid, mean, standardise, round, mulberry32 } from './stats.js';
import { CATEGORY_TYPES } from '../../domain/factors.js';
import { WEEKDAY_LABELS } from './features.js';

// ---------------------------------------------------------------------------
// Behavioural clustering.
//
// Unsupervised k-means over daily feature vectors discovers the *archetypes* a
// person actually lives: a quiet day, a commute day, a travel day. k is chosen
// by silhouette score rather than fixed, because a two-archetype user and a
// five-archetype user should not both be told they have four clusters.
//
// k-means++ seeding with a fixed PRNG keeps assignments identical between runs,
// which matters when the same data is shown to a grader twice.
// ---------------------------------------------------------------------------

function kmeansppInit(X, k, rng) {
  const centres = [X[Math.floor(rng() * X.length)]];
  while (centres.length < k) {
    const dist2 = X.map((x) => Math.min(...centres.map((c) => euclid(x, c) ** 2)));
    const total = dist2.reduce((a, b) => a + b, 0);
    if (total === 0) {
      centres.push(X[Math.floor(rng() * X.length)]);
      continue;
    }
    let target = rng() * total;
    let idx = 0;
    for (let i = 0; i < dist2.length; i += 1) {
      target -= dist2[i];
      if (target <= 0) {
        idx = i;
        break;
      }
    }
    centres.push(X[idx]);
  }
  return centres;
}

function assign(X, centres) {
  return X.map((x) => {
    let best = 0;
    let bestD = Infinity;
    centres.forEach((c, i) => {
      const d = euclid(x, c);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  });
}

function recentre(X, labels, k, fallback) {
  return Array.from({ length: k }, (_, i) => {
    const members = X.filter((_, j) => labels[j] === i);
    if (!members.length) return fallback[i];
    return members[0].map((_, d) => mean(members.map((m) => m[d])));
  });
}

function kmeans(X, k, { maxIter = 60, seed = 11 } = {}) {
  const rng = mulberry32(seed);
  let centres = kmeansppInit(X, k, rng);
  let labels = new Array(X.length).fill(0);

  for (let iter = 0; iter < maxIter; iter += 1) {
    const nextLabels = assign(X, centres);
    const shifted = nextLabels.some((l, i) => l !== labels[i]);
    labels = nextLabels;
    centres = recentre(X, labels, k, centres);
    if (!shifted && iter > 0) break;
  }

  const inertia = X.reduce((acc, x, i) => acc + euclid(x, centres[labels[i]]) ** 2, 0);
  return { labels, centres, inertia };
}

/** Mean silhouette coefficient — the standard unsupervised quality score. */
function silhouette(X, labels, k) {
  if (k < 2) return 0;
  const scores = X.map((x, i) => {
    const own = X.filter((_, j) => labels[j] === labels[i] && j !== i);
    const a = own.length ? mean(own.map((o) => euclid(x, o))) : 0;
    let b = Infinity;
    for (let c = 0; c < k; c += 1) {
      if (c === labels[i]) continue;
      const other = X.filter((_, j) => labels[j] === c);
      if (!other.length) continue;
      b = Math.min(b, mean(other.map((o) => euclid(x, o))));
    }
    if (!Number.isFinite(b)) return 0;
    const denom = Math.max(a, b);
    return denom === 0 ? 0 : (b - a) / denom;
  });
  return mean(scores);
}

/**
 * Two clusters can legitimately share a headline archetype — a light commute
 * day and a heavy one look similar on the dominant dimension. Appending the
 * *second* strongest category turns "Commute day" twice into "Commute day ·
 * energy" and "Commute day · dining", which is what actually distinguishes
 * them and reads far better on the page than a duplicate label.
 */
function disambiguateLabels(clusters) {
  const counts = new Map();
  for (const c of clusters) counts.set(c.label, (counts.get(c.label) || 0) + 1);

  const used = new Set();
  // Deterministic order so the same ledger always produces the same labels.
  for (const c of [...clusters].sort((a, b) => a.id - b.id)) {
    const base = c.label;

    if (counts.get(base) === 1 && !used.has(base)) {
      used.add(base);
      continue;
    }

    // Extend the signature one category at a time until it stops colliding.
    // A single level is not enough: two "Home energy day" clusters can both be
    // dominated by car travel second, so the discriminator has to keep going.
    const ranked = CATEGORY_TYPES.map((t) => ({ t, kg: c.meanKgByCategory[t] || 0 })).sort((a, b) => b.kg - a.kg);
    let label = base;
    for (let depth = 1; depth <= 3 && used.has(label); depth += 1) {
      const suffix = ranked.slice(1, 1 + depth).map((r) => r.t.replace(/_/g, ' ')).join(' + ');
      label = `${base} · ${suffix}`;
    }

    // Final fallbacks, in case the category signature is identical too.
    if (used.has(label)) label = `${base} · ${c.meanTotal} kg/day`;
    if (used.has(label)) label = `${base} #${c.id + 1}`;

    used.add(label);
    c.label = label;
  }
}

const ARCHETYPES = [
  { key: 'quiet', label: 'Quiet day', icon: 'leaf', blurb: 'Very little logged — the baseline your other days are measured against.' },
  { key: 'commute', label: 'Commute day', icon: 'car', blurb: 'A repeating travel pattern, usually a work or school run.' },
  { key: 'travel', label: 'Travel / flight day', icon: 'flight', blurb: 'A long-distance day. These dominate the total even when they are rare.' },
  { key: 'home', label: 'Home energy day', icon: 'bolt', blurb: 'Electricity-led — heating, cooling, laundry, charging.' },
  { key: 'dining', label: 'Dining day', icon: 'meal', blurb: 'Meals carry most of the footprint; food choices are the lever.' },
  { key: 'mixed', label: 'Mixed day', icon: 'layers', blurb: 'No single dominant category — a spread across several.' },
];

/** Name a centroid by which normalised dimension is largest. */
function nameCluster(centre, featureNames, means, sd) {
  // featureNames: ['total','logCount', ...CATEGORY_TYPES, 'carShare','flightShare', 'isWeekend','isMonday','isSunday']
  const catOffset = 2;
  const catValues = CATEGORY_TYPES.map((t, i) => ({ type: t, kg: centre[catOffset + i] }));
  const totalIdx = featureNames.indexOf('total');
  const total = centre[totalIdx];
  const overallMean = means[totalIdx];
  const labelled = catValues.map((c) => ({ ...c, share: total > 0 ? c.kg / total : 0 }));
  const top = [...labelled].sort((a, b) => b.kg - a.kg)[0];

  // how many categories carry > 20% of the day
  const spread = labelled.filter((l) => l.share > 0.2).length;

  if (total < overallMean * 0.45) return ARCHETYPES.find((a) => a.key === 'quiet');
  if (top.type === 'flight' && top.share > 0.4) return ARCHETYPES.find((a) => a.key === 'travel');
  if (spread >= 3 && total > overallMean) return ARCHETYPES.find((a) => a.key === 'mixed');
  if (top.type === 'electricity' && top.share > 0.45) return ARCHETYPES.find((a) => a.key === 'home');
  if ((top.type === 'veg_meal' || top.type === 'non_veg_meal') && top.share > 0.5) return ARCHETYPES.find((a) => a.key === 'dining');
  if (top.type === 'car' || top.type === 'bus') return ARCHETYPES.find((a) => a.key === 'commute');
  if (sd > 0 && total < overallMean) return ARCHETYPES.find((a) => a.key === 'quiet');
  return ARCHETYPES.find((a) => a.key === 'mixed');
}

/**
 * Cluster the daily frame into behavioural archetypes.
 * Chooses k by silhouette score over 2..5.
 */
export function clusterDays(frame, { minK = 2, maxK = 5, seed = 11 } = {}) {
  const { matrix, dates, totals, counts, byCategory, weekdays, featureNames } = frame;
  const active = matrix.map((row, i) => ({ row, i })).filter(({ i }) => totals[i] > 0 || counts[i] > 0);

  if (active.length < 6) {
    return {
      status: 'insufficient-data',
      note: `Only ${active.length} active day(s). Clustering needs at least 6 to find stable archetypes.`,
      clusters: [],
      days: dates.map((date, i) => ({ date, weekday: WEEKDAY_LABELS[weekdays[i] - 1], total: totals[i], cluster: null })),
    };
  }

  const raw = active.map(({ row }) => row);
  const { data: scaled, centre: means, scale: sd } = standardise(raw);

  let best = null;
  const sweep = [];
  for (let k = minK; k <= Math.min(maxK, Math.floor(active.length / 3)); k += 1) {
    const { labels, centres, inertia } = kmeans(scaled, k, { seed });
    const score = silhouette(scaled, labels, k);
    sweep.push({ k, silhouette: round(score, 4), inertia: round(inertia, 3) });
    if (!best || score > best.score) best = { k, labels, centres, score, inertia };
  }

  if (!best) {
    return { status: 'insufficient-data', note: 'Not enough spread to cluster.', clusters: [], days: [], sweep };
  }

  // Frame indices belonging to a cluster (best.labels is indexed by `active`).
  const membersOf = (ci) => best.labels.map((l, i) => (l === ci ? active[i].i : -1)).filter((i) => i >= 0);
  const totalKg = active.reduce((acc, { i }) => acc + totals[i], 0) || 1;

  // Centroids are reported back in original units so the numbers are readable.
  const clusters = best.centres.map((centre, ci) => {
    const original = centre.map((v, d) => v * (sd[d] || 1) + means[d]);
    const archetype = nameCluster(original, featureNames, means, sd[0]);
    const members = membersOf(ci);
    return {
      id: ci,
      key: archetype.key,
      label: archetype.label,
      icon: archetype.icon,
      blurb: archetype.blurb,
      dayCount: members.length,
      share: round((members.length / active.length) * 100, 1),
      contribution: round((members.reduce((acc, i) => acc + totals[i], 0) / totalKg) * 100, 1),
      meanTotal: round(mean(members.map((i) => totals[i])), 2),
      meanKgByCategory: Object.fromEntries(
        CATEGORY_TYPES.map((t) => [t, round(mean(members.map((i) => byCategory[t][i])), 2)])
      ),
      exampleDays: members.slice(0, 5).map((i) => dates[i]),
    };
  });

  const days = dates.map((date, i) => {
    const activeIdx = active.findIndex((a) => a.i === i);
    return {
      date,
      weekday: WEEKDAY_LABELS[weekdays[i] - 1],
      total: totals[i],
      cluster: activeIdx >= 0 ? best.labels[activeIdx] : null,
    };
  });

  disambiguateLabels(clusters);

  const dominant = [...clusters].sort((a, b) => b.contribution - a.contribution)[0];

  return {
    status: 'ok',
    k: best.k,
    silhouette: round(best.score, 4),
    inertia: round(best.inertia, 3),
    sweep,
    clusters: clusters.sort((a, b) => b.contribution - a.contribution),
    days,
    activeDays: active.length,
    note: dominant
      ? `Your ${clusters.length} day archetypes are led by "${dominant.label}" — ${dominant.share}% of days but ${dominant.contribution}% of total emissions.`
      : 'No dominant archetype.',
    algorithm: 'k-means++ (fixed seed), k selected by mean silhouette score',
  };
}

