// Builds client/preview.html: a single self-contained file with the app's JS/CSS
// inlined — photos included — and a fetch shim mocking the backend API (including
// the AI audit). One file, zero requests: it opens straight off the filesystem.
// UI preview only — the real app talks to the Express + MongoDB backend.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';

const dist = new URL('./dist/', import.meta.url).pathname;
const jsFile = readdirSync(dist + 'assets').find((f) => f.endsWith('.js'));
const cssFile = readdirSync(dist + 'assets').find((f) => f.endsWith('.css'));
let js = readFileSync(dist + 'assets/' + jsFile, 'utf8');
let css = readFileSync(dist + 'assets/' + cssFile, 'utf8');

// ---------------------------------------------------------------------------
// Inline the photo set. The bundle references photos by absolute URL
// (`/img/hero-canopy.jpg`), which resolves on the Vite dev server but is dead
// once the page is opened from `file://`. Swapping each reference for a base64
// data URI keeps the "single self-contained file" promise, and the surrounding
// quotes/url() wrapper are preserved so the literal stays valid JS/CSS.
// ---------------------------------------------------------------------------
const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', avif: 'image/avif', svg: 'image/svg+xml',
};
const imgDir = existsSync(dist + 'img/') ? dist + 'img/' : new URL('./public/img/', import.meta.url).pathname;
const dataUris = {};
for (const file of readdirSync(imgDir)) {
  const ext = file.split('.').pop().toLowerCase();
  if (!MIME[ext]) continue;
  dataUris[file] = `data:${MIME[ext]};base64,${readFileSync(imgDir + file).toString('base64')}`;
}

const missing = new Set();
let inlined = 0;
const inlineImages = (source) =>
  source.replace(/(["'`])?\/img\/([A-Za-z0-9._-]+)\1/g, (match, quote, file) => {
    if (!dataUris[file]) {
      missing.add(file);
      return match;
    }
    inlined += 1;
    return `${quote || ''}${dataUris[file]}${quote || ''}`;
  });

js = inlineImages(js);
css = inlineImages(css);

const mockApi = `<script>
(function () {
  const FACTORS = {
    car: { label: 'Car travel', unit: 'km', factor: 0.2 },
    bus: { label: 'Bus travel', unit: 'km', factor: 0.08 },
    flight: { label: 'Flight', unit: 'km', factor: 0.25 },
    electricity: { label: 'Electricity', unit: 'kWh', factor: 0.8 },
    veg_meal: { label: 'Veg meal', unit: 'meals', factor: 0.5 },
    non_veg_meal: { label: 'Non-veg meal', unit: 'meals', factor: 2.0 },
  };
  const THRESHOLDS = { car: 1000, bus: 2000, flight: 5000, electricity: 100, veg_meal: 10, non_veg_meal: 10 };
  const fmt = (x) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  const today = new Date();
  const d = (offset) => { const t = new Date(today); t.setDate(t.getDate() - offset); return fmt(t); };

  let acts = [
    { _id: '1', type: 'car', quantity: 10, date: d(0), co2: 2, notes: 'Commute to campus' },
    { _id: '2', type: 'flight', quantity: 500, date: d(0), co2: 125, notes: 'Domestic return leg' },
    { _id: '3', type: 'electricity', quantity: 8, date: d(1), co2: 6.4, notes: 'HVAC + server rack' },
    { _id: '4', type: 'veg_meal', quantity: 2, date: d(1), co2: 1, notes: 'Falafel bowl' },
    { _id: '5', type: 'non_veg_meal', quantity: 1, date: d(2), co2: 2, notes: 'Team dinner' },
    { _id: '6', type: 'bus', quantity: 12, date: d(3), co2: 0.96, notes: 'Rapid line transfer' },
  ];
  let target = 50;
  let nextId = 7;

  function weekMeta() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start); end.setDate(end.getDate() + 6);
    const s = fmt(start), e = fmt(end);
    const used = +acts.filter((a) => a.date >= s && a.date <= e).reduce((n, a) => n + a.co2, 0).toFixed(2);
    const daysElapsed = Math.min(((now.getDay() + 6) % 7) + 1, 7);
    const pct = target > 0 ? Math.round((used / target) * 100) : 0;
    const elapsedPct = Math.round((daysElapsed / 7) * 100);
    return { start: s, end: e, daysElapsed, daysRemaining: Math.max(7 - daysElapsed, 0), elapsedPct, used, target, pct,
      exceeded: used > target, pace: pct > elapsedPct + 10 ? 'behind' : pct < elapsedPct - 10 ? 'ahead' : 'on-track' };
  }
  function byCat(rows) {
    const out = {}; Object.keys(FACTORS).forEach((k) => (out[k] = 0));
    rows.forEach((a) => (out[a.type] = +(out[a.type] + a.co2).toFixed(2)));
    return out;
  }
  function auditData() {
    const w = weekMeta();
    const cats = byCat(acts.filter((a) => a.date >= w.start && a.date <= w.end));
    const ranked = Object.entries(cats).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const insights = [];
    if (ranked.length) {
      const [type, value] = ranked[0];
      const share = w.used > 0 ? Math.round((value / w.used) * 100) : 0;
      insights.push({ severity: share >= 50 ? 'high' : 'med', icon: type,
        title: FACTORS[type].label + ' dominates your week',
        detail: value.toFixed(1) + ' kg CO\\u2082 (' + share + '% of this week). Replacing the next short-haul flight with rail saves roughly 0.25 kg per km.' });
    }
    const rate = w.daysElapsed > 0 ? w.used / w.daysElapsed : 0;
    const projection = +(rate * 7).toFixed(2);
    insights.push({ severity: projection > target ? 'high' : 'low', icon: 'target',
      title: projection > target ? 'On track to finish the week at ' + projection + ' kg' : 'On track to finish under target (' + projection + ' kg)',
      detail: projection > target
        ? 'At todays pace you would end ' + (projection - target).toFixed(1) + ' kg over your ' + target + ' kg target, with ' + w.daysRemaining + ' day(s) left.'
        : 'Your current pace lands ' + (target - projection).toFixed(1) + ' kg under target.' });
    insights.push({ severity: 'med', icon: 'non_veg_meal', title: 'Dietary pivot available',
      detail: 'Swapping one non-veg meal a week for plant-based saves 1.5 kg CO\\u2082 per swap.' });
    return { generatedAt: new Date().toISOString(), engine: 'rules', weekStart: w.start, weekEnd: w.end, weekUsed: w.used,
      target, projection, daysRemaining: w.daysRemaining, insights, byCategory: cats,
      nextBestAction: 'Replace one 30 km car trip with the bus this week to save about 3.6 kg CO\\u2082.' };
  }
  // ---- ML / intelligence layer (mirrors the real endpoint shapes) ----------
  var ML_LABELS = ['car', 'bus', 'flight', 'electricity', 'veg_meal', 'non_veg_meal', 'unknown'];
  var ML_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var ML_KEYWORDS = {
    car: ['drove', 'drive', 'car', 'uber', 'taxi', 'commute', 'road', 'petrol'],
    bus: ['bus', 'coach', 'shuttle', 'metro', 'tube', 'train', 'transit', 'subway', 'rail'],
    flight: ['flight', 'flew', 'fly', 'airport', 'plane', 'airline'],
    electricity: ['kwh', 'electricity', 'power', 'heater', 'dishwasher', 'washing', 'lights', 'charge', 'ac'],
    veg_meal: ['vegan', 'vegetarian', 'salad', 'lentil', 'veggie', 'plant', 'veg', 'curry'],
    non_veg_meal: ['chicken', 'beef', 'mutton', 'pork', 'fish', 'meat', 'burger', 'steak'],
    unknown: ['what', 'how', 'why', 'total', 'footprint', 'show', 'help', 'should'],
  };
  var ML_META = {
    car: 'Car travel', bus: 'Bus travel', flight: 'Flight', electricity: 'Electricity',
    veg_meal: 'Veg meal', non_veg_meal: 'Non-veg meal', unknown: 'Not an activity',
  };
  function mlClassify(text) {
    var t = String(text).toLowerCase();
    var tokens = t.split(' ').filter(function (x) { return x.length > 1; });
    var raw = {};
    ML_LABELS.forEach(function (label) {
      var hits = ML_KEYWORDS[label].filter(function (k) {
        return tokens.some(function (w) { return w.indexOf(k) === 0 || k.indexOf(w) === 0; });
      });
      raw[label] = hits.length * 1.4 + 0.02;
    });
    var sum = ML_LABELS.reduce(function (a, l) { return a + raw[l]; }, 0) || 1;
    var ranked = ML_LABELS.map(function (l) { return { label: l, probability: +(raw[l] / sum).toFixed(4) }; })
      .sort(function (a, b) { return b.probability - a.probability; });
    var top = ranked[0], second = ranked[1];
    var confident = top.probability >= 0.42 && top.label !== 'unknown';
    var evidence = ML_KEYWORDS[top.label].filter(function (k) {
      return tokens.some(function (w) { return w.indexOf(k) === 0 || k.indexOf(w) === 0; });
    }).slice(0, 5).map(function (k, i) { return { term: k, weight: +(1.8 - i * 0.27).toFixed(4) }; });
    return {
      category: confident ? top.label : null, label: top.label,
      confidence: +(confident ? top.probability : Math.min(top.probability, 0.31)).toFixed(4),
      margin: +(top.probability - second.probability).toFixed(4),
      ranked: ranked.slice(0, 4), evidence: evidence, tokens: tokens, temperature: 1.34,
      needsConfirmation: !confident,
    };
  }
  function mlConfusion() {
    var c = {};
    ML_LABELS.forEach(function (a) { c[a] = {}; ML_LABELS.forEach(function (b) { c[a][b] = 0; }); });
    var seed = [[18, 5, 1, 0, 0, 0, 1], [4, 19, 0, 1, 0, 0, 1], [1, 0, 20, 1, 0, 2, 1],
      [0, 1, 0, 19, 1, 1, 3], [0, 0, 0, 0, 22, 3, 0], [0, 0, 1, 0, 2, 20, 1], [2, 1, 2, 3, 0, 0, 17]];
    ML_LABELS.forEach(function (a, i) { ML_LABELS.forEach(function (b, j) { c[a][b] = seed[i][j]; }); });
    return c;
  }
  function mlReport() {
    var now = new Date();
    var w = weekMeta();
    var cats = byCat(acts);
    var dailyRate = w.daysElapsed > 0 ? w.used / w.daysElapsed : 0;
    var shape = { 1: 1.12, 2: 1.02, 3: 0.96, 4: 1.08, 5: 1.21, 6: 0.74, 7: 0.62 };
    var q80 = +Math.max(dailyRate * 0.34, 0.35).toFixed(2), q95 = +(q80 * 2.05).toFixed(2);
    var fwd = [], rest = 0;
    for (var i = 1; i <= 7; i += 1) {
      var dt = new Date(now); dt.setDate(dt.getDate() + i);
      var wd = ((dt.getDay() + 6) % 7) + 1;
      var p = +(dailyRate * shape[wd]).toFixed(2);
      if (i <= w.daysRemaining) rest += p;
      fwd.push({ date: fmt(dt), weekday: ML_WEEK[wd - 1], isWeekend: wd >= 6, predicted: p,
        low80: +Math.max(p - q80, 0).toFixed(2), high80: +(p + q80).toFixed(2),
        low95: +Math.max(p - q95, 0).toFixed(2), high95: +(p + q95).toFixed(2) });
    }
    var projected = +(w.used + rest).toFixed(2);
    var flagged = acts.filter(function (a) { return a.co2 > 20; });
    return {
      generatedAt: now.toISOString(),
      window: { days: 90, from: d(89), to: d(0), activeDays: 41 },
      models: [
        { key: 'forecast', name: 'Footprint forecaster', algorithm: 'Holt-Winters + seasonal-naive + weekday profile + damped Holt in an inverse-error ensemble' },
        { key: 'anomaly', name: 'Input integrity detector', algorithm: 'Local Outlier Factor (k=5) + per-category robust z' },
        { key: 'classify', name: 'Activity text classifier', algorithm: 'Complement Naive Bayes over sublinear TF (uni + bigrams), temperature-calibrated' },
        { key: 'cluster', name: 'Day-archetype discovery', algorithm: 'k-means++ with k chosen by mean silhouette' },
        { key: 'recommend', name: 'Intervention ranker', algorithm: 'brief factors x your typical quantities, weighted by feasibility' },
      ],
      forecast: {
        horizon: 7, status: 'ok', confidence: 'moderate',
        seasonality: shape, intervals: { q80: q80, q95: q95, method: 'empirical residual quantiles (walk-forward)' },
        selectedModel: 'ensemble',
        accuracy: { grade: 'moderate', mae: 3.14, smape: 23.6, sampleSize: 90,
          note: 'Ensemble one-step MAE 3.14 kg over the last 20 days (walk-forward).' },
        backtest: { method: 'walk-forward, expanding window', holdoutDays: 20, selected: 'ensemble', models: [
          { name: 'holt-winters', label: 'Holt-Winters (weekly seasonality)', mae: 3.62, rmse: 5.11, smape: 27.4, note: 'Grid-searched alpha/beta/gamma.' },
          { name: 'seasonal-naive', label: 'Seasonal naive (same day last week)', mae: 4.08, rmse: 5.94, smape: 31.2, note: 'The baseline every model must beat.' },
          { name: 'weekday-profile', label: 'Weighted weekday profile', mae: 3.44, rmse: 4.72, smape: 25.8, note: 'Multiplicative weekday shape.' },
          { name: 'damped-holt', label: 'Damped Holt trend', mae: 3.71, rmse: 5.02, smape: 28.9, note: 'Level + damped trend, no seasonality.' },
          { name: 'ensemble', label: 'Inverse-error ensemble', mae: 3.14, rmse: 4.31, smape: 23.6, note: 'Weighted 1/MAE blend of every model above.' },
        ] },
        trend: { slope: -0.04, direction: 'falling', r2: 0.31, changePerWeek: -0.28 },
        forecast: fwd,
        currentWeek: { start: w.start, end: w.end, daysElapsed: w.daysElapsed, daysRemaining: w.daysRemaining,
          actualToDate: w.used, forecastRemaining: +rest.toFixed(2), projectedTotal: projected,
          target: target, willExceed: projected > target, overBy: +Math.max(projected - target, 0).toFixed(2),
          settledFraction: +(w.daysElapsed / 7).toFixed(2) },
      },
      anomalies: {
        stats: { sampleSize: acts.length, medianLof: 1.04, lofThreshold: 1.75, flagged: flagged.length,
          flaggedShare: acts.length ? +((flagged.length / acts.length) * 100).toFixed(1) : 0,
          note: flagged.length ? flagged.length + ' of ' + acts.length + ' entries sit outside the learned normal range.' : 'No entries look inconsistent with this ledger.' },
        threshold: 1.75,
        top: flagged.slice(0, 5).map(function (a, i) {
          return { id: a._id, type: a.type, date: a.date, co2: a.co2, quantity: a.quantity, notes: a.notes,
            lof: +(3.1 - i * 0.4).toFixed(3), robustZ: +(6.4 - i).toFixed(2), score: +(4.1 - i * 0.5).toFixed(3), isOutlier: true,
            reasons: ['6.4x the scaled MAD above your typical ' + ML_META[a.type].toLowerCase() + ' entry',
              'unusual in context (LOF 3.10) - size, category and weekday rarely co-occur'] };
        }),
      },
      thresholds: Object.keys(FACTORS).reduce(function (acc, t) {
        acc[t] = { samples: 6, usableSamples: 6, advisoryRange: +(THRESHOLDS[t] * (t === 'flight' ? 0.35 : 0.22)).toFixed(2),
          effectiveThreshold: THRESHOLDS[t], exceedsBrief: false, source: 'brief default (learned range shown as advisory)',
          note: 'Advisory only - the confirmation step always uses the brief ceiling.' };
        return acc;
      }, {}),
      clusters: {
        status: 'ok', k: 3, silhouette: 0.52, activeDays: 41,
        sweep: [{ k: 2, silhouette: 0.41, inertia: 88.2 }, { k: 3, silhouette: 0.52, inertia: 61.4 },
          { k: 4, silhouette: 0.47, inertia: 52.1 }, { k: 5, silhouette: 0.44, inertia: 46.8 }],
        note: 'Your 3 day archetypes are led by "Commute-heavy weekday" - 61% of days but 71% of total emissions.',
        clusters: [
          { id: 0, key: 'commute', label: 'Commute-heavy weekday', icon: 'car', blurb: 'A workday dominated by road travel with steady electricity use.',
            dayCount: 25, share: 61, contribution: 71, meanTotal: 6.42, meanKgByCategory: { car: 4.1, bus: 0.2, electricity: 1.6, veg_meal: 0.5 } },
          { id: 1, key: 'travel', label: 'Travel & flight day', icon: 'flight', blurb: 'Rare but dominant: a single flight outweighs a whole week of commuting.',
            dayCount: 3, share: 7.3, contribution: 21.4, meanTotal: 62.8, meanKgByCategory: { flight: 61.2, car: 1.1, non_veg_meal: 0.5 } },
          { id: 2, key: 'lowimpact', label: 'Low-impact weekend', icon: 'leaf', blurb: 'Light days built from plant meals and minimal travel.',
            dayCount: 13, share: 31.7, contribution: 7.6, meanTotal: 1.28, meanKgByCategory: { veg_meal: 0.9, bus: 0.3 } },
        ],
      },
      recommendations: {
        horizon: 'week', note: 'Ranked by kg saved per week against your own typical quantities.',
        summary: { weeklyFootprint: +(w.used / Math.max(w.daysElapsed / 7, 1)).toFixed(2), weeklyTarget: target,
          gapToTarget: +Math.max(w.used / Math.max(w.daysElapsed / 7, 1) - target, 0).toFixed(2),
          achievableWeeklySaving: 8.4, achievableFromTopThree: 8.4,
          closesGap: projected - 8.4 <= target, projectedWeekEnd: projected },
        bestNext: null,
        recommendations: [
          { id: 'car-to-bus', label: 'Take the bus instead of driving', detail: 'Your shortest repeated car trips are the easiest swap to keep - the bus emits 60% less per km.',
            effort: 'low', from: 'car', to: 'bus', unit: 'km', displacedPerEvent: 10, savingPerEventKg: 1.2, eventsPerWeek: 4.5,
            savingPerWeekKg: 5.4, savingPerMonthKg: 23.46, annualKg: 280.8, shareOfFootprint: 16.4, confidence: 'high', confidenceScore: 0.82,
            evidence: '6 logged occurrences', efficiency: 5.4, maths: '10 km x (0.2 - 0.08) kg/km = 1.2 kg per event' },
          { id: 'veg-swap', label: 'Swap two non-veg meals for plant-based', detail: 'A non-veg meal costs 4x a veg meal, so this is the cheapest change per unit of effort.',
            effort: 'low', from: 'non_veg_meal', to: 'veg_meal', unit: 'meals', displacedPerEvent: 1, savingPerEventKg: 1.5, eventsPerWeek: 1.9,
            savingPerWeekKg: 2.85, savingPerMonthKg: 12.38, annualKg: 148.2, shareOfFootprint: 8.7, confidence: 'moderate', confidenceScore: 0.55,
            evidence: '4 logged occurrences', efficiency: 2.85, maths: '1 meals x (2 - 0.5) kg/meals = 1.5 kg per event' },
          { id: 'electricity-shift', label: 'Shift heavy appliance use off-peak', detail: 'Running the dishwasher and laundry outside the evening peak cuts the carbon intensity of the same kWh.',
            effort: 'moderate', from: 'electricity', to: null, unit: 'kWh', displacedPerEvent: 8, savingPerEventKg: 0.24, eventsPerWeek: 3.5,
            savingPerWeekKg: 0.84, savingPerMonthKg: 3.65, annualKg: 43.7, shareOfFootprint: 2.6, confidence: 'low', confidenceScore: 0.33,
            evidence: '3 logged occurrences', efficiency: 0.42, maths: '8 kWh x (0.8 - 0.77) kg/kWh = 0.24 kg per event' },
        ],
      },
      seasonality: shape,
      classifier: {
        trained: true, version: 'cnb-tf-412', algorithm: 'Complement Naive Bayes over sublinear TF (uni+bigrams), length-normalised, temperature-calibrated',
        sampleCount: 412, vocabularySize: 986, userExamples: 0, trainRuns: 1, lastTrainMs: 148.3, trainedAt: now.toISOString(),
        metrics: {
          accuracy: 0.846, macroF1: 0.838, testSize: 103, meanConfidence: 0.71, temperature: 1.34, logLoss: 0.612,
          perClass: ML_LABELS.map(function (l, i) {
            var seed = [0.88, 0.85, 0.91, 0.9, 0.87, 0.86, 0.77];
            return { label: l, support: 24 - i, precision: +(seed[i] + 0.01).toFixed(3), recall: seed[i], f1: seed[i] };
          }),
          confusion: mlConfusion(),
        },
      },
      health: { ledgerSize: acts.length, activeDays: 41, coverage: 45.6, confidence: 'moderate', grade: 'moderate',
        weekStart: w.start, weeklyTarget: target, projectedWeekEnd: projected },
    };
  }

  function json(body, status) {
    return Promise.resolve(new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } }));
  }
  function sse(events) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for (const ev of events) {
          controller.enqueue(encoder.encode('event: ' + ev.event + '\\ndata: ' + JSON.stringify(ev.data) + '\\n\\n'));
          if (ev.delay) await new Promise((r) => setTimeout(r, ev.delay));
        }
        controller.close();
      },
    });
    return Promise.resolve(new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }));
  }
  // Shared copilot logic for both the buffered and streaming endpoints.
  function chatReply(message) {
    const t = String(message).toLowerCase();
    const m = t.match(/(?:drove|flew|flight|bus)\\s*(\\d+(?:\\.\\d+)?)|(\\d+(?:\\.\\d+)?)\\s*km/);
    if (m && /drove|km|flight|flew|bus/.test(t)) {
      const qty = parseFloat(m[1] || m[2]);
      const type = /flight|flew/.test(t) ? 'flight' : /bus/.test(t) ? 'bus' : 'car';
      const f = FACTORS[type];
      const co2 = +(qty * f.factor).toFixed(2);
      const rec = { _id: String(nextId++), type, quantity: qty, date: d(0), co2, notes: 'logged via copilot' };
      acts.push(rec);
      return { text: 'Got it \u2014 logged ' + qty + ' ' + f.unit + ' of ' + f.label + ' (~' + co2 + ' kg CO\u2082). The dashboard and audit refreshed the moment it landed.', logged: rec };
    }
    if (/analyse|analyze|audit|reduction opportunity/.test(t)) {
      return { text: auditData().insights.map((i) => '\u2022 ' + i.title + ' \u2014 ' + i.detail).join('\\n'), logged: null };
    }
    if (/total|footprint|how much/.test(t)) {
      const w = weekMeta();
      const total = +acts.reduce((n, a) => n + a.co2, 0).toFixed(2);
      return { text: 'Your all-time footprint is ' + total + ' kg CO\u2082. This week you are at ' + w.used + ' kg \u2014 ' + w.pct + '% of your ' + target + ' kg target.', logged: null };
    }
    if (/worst|category|breakdown/.test(t)) {
      const ranked = Object.entries(byCat(acts)).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0);
      return { text: ranked.map(([k, v]) => '\u2022 ' + FACTORS[k].label + ': ' + v.toFixed(1) + ' kg').join('\\n') + '\\n\\nBiggest contributor: ' + FACTORS[ranked[0][0]].label + '.', logged: null };
    }
    if (/tip|reduce/.test(t)) {
      return { text: 'Biggest levers: 1) fewer flights, 2) swap non-veg for veg meals (1.5 kg each), 3) bus instead of car for short trips (60% less per km).', logged: null };
    }
    return { text: 'Try: "I drove 15 km", "what is my footprint?", or "analyses my history".', logged: null };
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = function (url, opts) {
    opts = opts || {};
    const path = String(url).replace(/^https?:\\/\\/[^/]+/, '');
    if (path.indexOf('/api/') !== 0) return realFetch(url, opts);
    const body = opts.body ? JSON.parse(opts.body) : {};
    const parts = path.split('?');
    const base = parts[0];
    const qs = new URLSearchParams(parts[1] || '');

    if (base === '/api/factors') return json({ factors: FACTORS, thresholds: THRESHOLDS });
    if (base === '/api/ml/report') return json(mlReport());
    if (base === '/api/ml/classify' && opts.method === 'POST') return json(mlClassify(body.text || ''));
    if (base === '/api/ml/models') return json({ models: mlReport().models, classifier: mlReport().classifier });

    if (base === '/api/activities' && (!opts.method || opts.method === 'GET')) {
      let rows = acts.slice();
      const type = qs.get('type'), from = qs.get('from'), to = qs.get('to'), q = qs.get('q'), tier = qs.get('tier');
      if (type) rows = rows.filter((a) => a.type === type);
      if (from) rows = rows.filter((a) => a.date >= from);
      if (to) rows = rows.filter((a) => a.date <= to);
      if (q) rows = rows.filter((a) => ((a.notes || '') + ' ' + a.type).toLowerCase().includes(q.toLowerCase()));
      if (tier) rows = rows.filter((a) => (tier === 'high' ? a.co2 > 10 : tier === 'med' ? a.co2 >= 2 && a.co2 <= 10 : a.co2 < 2));
      return json({ activities: rows, count: rows.length });
    }
    if (base === '/api/activities' && opts.method === 'POST') {
      const f = FACTORS[body.type];
      if (!f) return json({ error: 'Unknown type' }, 400);
      const co2 = +(body.quantity * f.factor).toFixed(2);
      if (!body.confirmed && THRESHOLDS[body.type] && body.quantity > THRESHOLDS[body.type]) {
        return json({ needsConfirmation: true, message: "That's " + body.quantity + ' ' + f.unit + ' \\u2248 ' + co2.toLocaleString() + ' kg CO\\u2082 \\u2014 that looks like it might be a typo. Confirm or edit the value.', computedCo2: co2 }, 422);
      }
      const rec = { _id: String(nextId++), type: body.type, quantity: body.quantity, date: body.date || d(0), co2, notes: body.notes || '' };
      acts.push(rec);
      return json({ activity: rec, co2: co2 }, 201);
    }
    if (base.indexOf('/api/activities/') === 0 && opts.method === 'DELETE') {
      const id = base.split('/').pop();
      acts = acts.filter((a) => a._id !== id);
      return json({ ok: true });
    }
    if (base === '/api/dashboard') {
      const cats = byCat(acts);
      const total = +acts.reduce((n, a) => n + a.co2, 0).toFixed(2);
      const ranked = Object.entries(cats).sort((a, b) => b[1] - a[1]);
      const days = new Set(acts.map((a) => a.date)).size || 1;
      return json({ total, byCategory: cats, activityCount: acts.length, dailyAverage: +(total / days).toFixed(2), activeDays: days,
        topCategory: ranked.length && ranked[0][1] > 0 ? { type: ranked[0][0], label: FACTORS[ranked[0][0]].label, co2: ranked[0][1], share: Math.round((ranked[0][1] / total) * 100) } : null,
        week: weekMeta() });
    }
    if (base === '/api/week') return json(weekMeta());
    if (base === '/api/target' && (!opts.method || opts.method === 'GET')) return json({ weeklyTarget: target });
    if (base === '/api/target' && opts.method === 'PUT') { target = body.weeklyTarget; return json({ weeklyTarget: target }); }
    if (base === '/api/ai/audit') return json(auditData());
    if (base === '/api/simulate' && opts.method === 'POST') {
      const before = +(body.quantity * FACTORS[body.fromType].factor).toFixed(2);
      const after = +(body.quantity * FACTORS[body.toType].factor).toFixed(2);
      const saving = +(before - after).toFixed(2);
      return json({ fromType: body.fromType, toType: body.toType, quantity: body.quantity, before, after, saving,
        savingPct: before > 0 ? Math.round((saving / before) * 100) : 0, monthlySaving: +(saving * 4).toFixed(2) });
    }
    if (base === '/api/nudges') {
      const w = weekMeta();
      const items = [];
      if (w.exceeded) items.push({ _id: 'n1', kind: 'exceeded', severity: 'high', read: false,
        title: 'Weekly target exceeded — ' + w.used + ' kg of ' + target + ' kg',
        body: 'Awareness is the win. Pick one category to trim rather than fixing everything at once.', createdAt: new Date().toISOString() });
      else if (w.pct >= 80) items.push({ _id: 'n1', kind: 'warn', severity: 'med', read: false,
        title: w.pct + '% of your weekly budget used', body: 'You have ' + (target - w.used).toFixed(1) + ' kg left for the rest of the week.', createdAt: new Date().toISOString() });
      items.push({ _id: 'n2', kind: 'insight', severity: 'low', read: true,
        title: 'Pace check: ' + w.pace.replace('-', ' '), body: w.pct + '% of budget used with ' + w.elapsedPct + '% of the week elapsed.', createdAt: new Date().toISOString() });
      return json({ notifications: items, unread: items.filter((i) => !i.read).length });
    }
    if (base === '/api/nudges/read') return json({ notifications: [], unread: 0 });
    if (base === '/api/insights') {
      const cats = byCat(acts);
      const total = +acts.reduce((n, a) => n + a.co2, 0).toFixed(2);
      const mix = Object.entries(cats).filter(([, kg]) => kg > 0).map(([type, kg]) => ({ type, label: FACTORS[type].label, kg, share: Math.round((kg / total) * 100) })).sort((a, b) => b.kg - a.kg);
      const trend = [];
      for (let i = 13; i >= 0; i--) { const day = d(i); trend.push({ date: day, label: day.slice(5), kg: +acts.filter((a) => a.date === day).reduce((n, a) => n + a.co2, 0).toFixed(2), isCurrentWeek: i < 7 }); }
      const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const weekdayTotals = names.map((name, idx) => {
        const rows = acts.filter((a) => (new Date(a.date + 'T00:00:00').getDay() + 6) % 7 === idx);
        return { name, kg: +rows.reduce((n, a) => n + a.co2, 0).toFixed(2), count: rows.length };
      });
      return json({ weekStart: weekMeta().start, weekEnd: weekMeta().end, thisWeekTotal: weekMeta().used,
        lastWeekTotal: 41.2, deltaPct: 12, projection: +(weekMeta().used / 2 * 7).toFixed(2), target,
        trend, weekdayTotals, mix,
        scopeBreakdown: { 'scope-1': cats.car || 0, 'scope-2': cats.electricity || 0, 'scope-3': +((cats.flight || 0) + (cats.bus || 0) + (cats.veg_meal || 0) + (cats.non_veg_meal || 0)).toFixed(2) },
        summaries: [{ period: '2026-W38', total: 41.2, target, exceeded: false, activityCount: 9 }, { period: '2026-W39', total: weekMeta().used, target, exceeded: weekMeta().exceeded, activityCount: acts.length }] });
    }
    if (base === '/api/stream/state') {
      const cats = byCat(acts);
      const w = weekMeta();
      const total = +acts.reduce((n, a) => n + a.co2, 0).toFixed(2);
      const ranked = Object.entries(cats).sort((a, b) => b[1] - a[1]);
      const days = new Set(acts.map((a) => a.date)).size || 1;
      return json({
        metrics: metricsPayload(),
        presence: presenceList().length ? presenceList() : [{ id: 'p1', transport: 'polling', joinedAt: new Date().toISOString(), connectedSeconds: 180, page: 'dashboard' }],
        snapshot: {
          total, byCategory: cats, activityCount: acts.length, dailyAverage: +(total / days).toFixed(2), activeDays: days,
          topCategory: ranked.length && ranked[0][1] > 0 ? { type: ranked[0][0], label: FACTORS[ranked[0][0]].label, co2: ranked[0][1], share: Math.round((ranked[0][1] / total) * 100) } : null,
          scopeBreakdown: { 'scope-1': cats.car || 0, 'scope-2': cats.electricity || 0, 'scope-3': +((cats.flight || 0) + (cats.bus || 0) + (cats.veg_meal || 0) + (cats.non_veg_meal || 0)).toFixed(2) },
          week: w,
          projection: +(w.used / Math.max(w.daysElapsed, 1) * 7).toFixed(2),
          recent: acts.slice(0, 6).map((a) => ({ id: a._id, type: a.type, label: FACTORS[a.type].label, quantity: a.quantity, unit: FACTORS[a.type].unit, co2: a.co2, date: a.date, notes: a.notes || '' })),
          at: new Date().toISOString(),
        },
      });
    }
    if (base === '/api/telemetry') return json(Object.assign(metricsPayload(), { presence: presenceList(), transport: 'server-sent-events',
      ticker: { running: true, ticks: grid.history.length, intervalMs: 3500, grid: { intensity: grid.intensity, trend: 'flat', source: 'modelled (no provider key)', region: 'IN' }, history: grid.history.slice() } }));
    if (base === '/api/services') return json({ services: [
      { key: 'email', label: 'Email notifications (Resend)', enabled: false, note: 'Set RESEND_API_KEY + NOTIFY_EMAIL to enable digests' },
      { key: 'carbonData', label: 'Carbon data API', enabled: false, note: 'Optional — fixed brief factors are used' },
      { key: 'geo', label: 'Geo / distance API', enabled: false, note: 'Optional' },
      { key: 'ai', label: 'LLM copilot (OpenAI)', enabled: false, note: 'Optional — rule-based copilot always available' }] });
    if (base === '/api/docs') return json({ name: 'CarbonPulse API', version: '2.0.0', routes: [] });
    if (base === '/api/chat' && opts.method === 'POST') {
      const result = chatReply(body.message);
      return json({ reply: result.text, engine: 'rules', logged: result.logged });
    }
    if (base === '/api/chat/stream' && opts.method === 'POST') {
      const result = chatReply(body.message);
      const words = result.text.split(' ');
      const events = [];
      for (let i = 0; i < words.length; i += 3) {
        events.push({ event: 'chunk', data: { text: words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '') }, delay: 16 });
      }
      if (result.logged) events.push({ event: 'action', data: { logged: result.logged } });
      events.push({ event: 'done', data: { engine: 'rules', full: result.text } });
      return sse(events);
    }
    if (base === '/api/health') return json({ ok: true, db: 'memory (preview mock)', llm: 'off', realtime: { primary: 'websocket', fallbacks: ['server-sent-events', 'polling'], socket: '/api/ws' }, clients: 1 });
    if (base === '/api/realtime') return json({
      transports: [
        { name: 'websocket', url: '/api/ws', direction: 'bidirectional', primary: true },
        { name: 'sse', url: '/api/stream', direction: 'server → client', primary: false },
        { name: 'polling', url: '/api/stream/state', direction: 'client → server', primary: false }],
      socketCommands: [
        { cmd: 'ping', describe: 'Round-trip latency probe' },
        { cmd: 'stats.get', describe: 'Live snapshot + telemetry + presence' },
        { cmd: 'activity.log', describe: 'Log an activity (DP2 confirmation aware)' },
        { cmd: 'chat.ask', describe: 'Hybrid copilot reply, streamed' },
        { cmd: 'simulate', describe: 'What-if swap simulation' }],
      events: ['hello', 'snapshot', 'activity', 'deleted', 'target', 'nudge', 'presence', 'typing', 'telemetry', 'grid'],
      metrics: metricsPayload(),
    });
    return json({ error: 'not found' }, 404);
  };

  // ---------------------------------------------------------------------
  // Live channel mock.
  // The static preview has no server, so the WebSocket transport and the
  // ticker are emulated here over exactly the same frame set the real backend
  // emits. This lets the preview exercise the bidirectional path (commands +
  // acks) and the telemetry/grid ticks. The real app talks to the Express
  // server, whose socket is covered by backend/test/websocket.test.js.
  // ---------------------------------------------------------------------
  const bootAt = Date.now();
  const grid = { intensity: 0.712, history: [0.702, 0.706, 0.699, 0.709, 0.712] };
  let seq = 42;
  let lastBroadcastId = 6;
  const sockets = [];
  const nowIso = () => new Date().toISOString();

  function metricsPayload() {
    const count = Math.max(sockets.length, 1);
    return { subscribers: count, eventsTotal: seq, eventsLastMinute: 3, replayBuffer: 42,
      byTransport: { websocket: count }, commands: { ping: 2, 'stats.get': 2, 'activity.log': 1 }, commandsHandled: 5,
      transports: ['websocket'], uptimeSeconds: Math.floor((Date.now() - bootAt) / 1000), lastEventId: seq };
  }
  function presenceList() {
    return sockets.map((s) => ({ id: s.socketId, transport: 'websocket', page: s.page, joinedAt: s.joinedAt,
      connectedSeconds: Math.floor((Date.now() - s.openedAt) / 1000), sent: s.sent, typing: false }));
  }
  function broadcast(event, data) {
    seq += 1;
    const frame = { event: event, data: Object.assign({}, data, { seq: seq, at: nowIso() }) };
    sockets.forEach((s) => s.deliver(frame));
    return frame;
  }
  async function callMock(path, method, body) {
    const res = await window.fetch(path, { method: method || 'GET', headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return res.json();
  }
  function tierOf(co2) { return co2 > 10 ? 'high' : co2 >= 2 ? 'med' : 'low'; }

  async function runCommand(cmd, payload) {
    payload = payload || {};
    if (cmd === 'ping') return { serverTime: Date.now(), echo: payload.echo === undefined ? null : payload.echo };
    if (cmd === 'stats.get') {
      const state = await callMock('/api/stream/state');
      return { snapshot: state.snapshot, metrics: metricsPayload(), presence: state.presence };
    }
    if (cmd === 'activity.log') {
      const created = await callMock('/api/activities', 'POST', payload);
      if (created.error || created.needsConfirmation) {
        const err = new Error(created.message || created.error || 'needs confirmation');
        err.data = created;
        throw err;
      }
      const label = FACTORS[payload.type] ? FACTORS[payload.type].label : payload.type;
      broadcast('activity', { activity: created.activity, co2: created.co2, label: label, tier: tierOf(created.co2), source: 'socket' });
      lastBroadcastId = Math.max(lastBroadcastId, Number(created.activity._id) || 0);
      const state = await callMock('/api/stream/state');
      broadcast('snapshot', state.snapshot);
      return { activity: created.activity, co2: created.co2, factor: FACTORS[payload.type] };
    }
    if (cmd === 'activity.delete') {
      await callMock('/api/activities/' + payload.id, 'DELETE');
      broadcast('deleted', { id: String(payload.id), activity: { co2: 0 } });
      const state = await callMock('/api/stream/state');
      broadcast('snapshot', state.snapshot);
      return { deleted: String(payload.id) };
    }
    if (cmd === 'activity.list') {
      const qs = new URLSearchParams(Object.entries(payload).filter(([, v]) => v !== '' && v != null)).toString();
      const res = await callMock('/api/activities' + (qs ? '?' + qs : ''));
      return { activities: res.activities, count: res.count };
    }
    if (cmd === 'target.set') {
      const res = await callMock('/api/target', 'PUT', payload);
      broadcast('target', { weeklyTarget: res.weeklyTarget });
      const state = await callMock('/api/stream/state');
      broadcast('snapshot', state.snapshot);
      return { weeklyTarget: res.weeklyTarget };
    }
    if (cmd === 'insights.get') return callMock('/api/insights');
    if (cmd === 'audit.get') return auditData();
    if (cmd === 'nudges.get') { const res = await callMock('/api/nudges'); return { nudges: res.notifications }; }
    if (cmd === 'simulate') return callMock('/api/simulate', 'POST', payload);
    if (cmd === 'session.describe') return { clientId: 'preview', commands: ['ping', 'stats.get', 'activity.log', 'chat.ask', 'simulate'] };
    if (cmd === 'presence.typing') {
      broadcast('typing', { clientId: 'preview', page: payload.page, typing: Boolean(payload.typing) });
      return { typing: Boolean(payload.typing) };
    }
    throw new Error('unknown command "' + cmd + '"');
  }

  // Emulated WebSocket: acks every command, streams chat chunks, pushes frames.
  class MockWebSocket {
    constructor(url) {
      this.url = String(url);
      this.readyState = 0;
      this.socketId = 'mock-' + Math.random().toString(36).slice(2, 8);
      this.page = (this.url.split('page=')[1] || 'dashboard').split('&')[0];
      this.joinedAt = nowIso();
      this.openedAt = Date.now();
      this.sent = 0;
      this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null;
      setTimeout(() => {
        if (this.readyState !== 0) return;
        this.readyState = 1;
        sockets.push(this);
        if (this.onopen) this.onopen({});
        this.emit({ kind: 'hello', data: { clientId: this.socketId, transport: 'websocket', protocol: 'carbonpulse.v1',
          db: 'memory (preview mock)', clients: sockets.length, presence: presenceList(), metrics: metricsPayload(), serverTime: Date.now() } });
        callMock('/api/stream/state').then((state) => this.emit({ kind: 'snapshot', data: state.snapshot }));
        broadcast('presence', { presence: presenceList(), clients: sockets.length, joined: this.socketId });
      }, 80);
    }
    emit(payload) { this.sent += 1; if (this.onmessage) this.onmessage({ data: JSON.stringify(payload) }); }
    deliver(frame) { this.emit({ kind: 'event', event: frame.event, seq: frame.data.seq, at: frame.data.at, data: frame.data }); }
    send(raw) {
      let message;
      try { message = JSON.parse(raw); } catch (e) { return; }
      const id = message.id; const cmd = message.cmd; const payload = message.payload || {};
      if (cmd === 'ping') this.emit({ kind: 'pong', id: id, data: { serverTime: Date.now() } });
      const finish = (ok, data) => this.emit(ok ? { kind: 'ack', id: id, ok: true, data: data } : { kind: 'ack', id: id, ok: false, error: data });
      if (cmd === 'chat.ask') {
        const result = chatReply(payload.message);
        const words = result.text.split(' ');
        let i = 0;
        const pump = () => {
          if (i >= words.length) {
            if (result.logged) {
              broadcast('activity', { activity: result.logged, co2: result.logged.co2, label: FACTORS[result.logged.type].label, tier: tierOf(result.logged.co2) });
              lastBroadcastId = Math.max(lastBroadcastId, Number(result.logged._id) || 0);
            }
            finish(true, { text: result.text, logged: result.logged, engine: 'rules', streaming: true });
            return;
          }
          this.emit({ kind: 'stream', id: id, chunk: words.slice(i, i + 3).join(' ') + (i + 3 < words.length ? ' ' : '') });
          i += 3;
          setTimeout(pump, 24);
        };
        pump();
        return;
      }
      runCommand(cmd, payload).then((data) => finish(true, data), (err) => finish(false, Object.assign({ error: err.message }, err.data || {})));
    }
    close() {
      if (this.readyState === 3) return;
      this.readyState = 3;
      const index = sockets.indexOf(this);
      if (index > -1) sockets.splice(index, 1);
      broadcast('presence', { presence: presenceList(), clients: sockets.length, left: this.socketId });
      if (this.onclose) this.onclose({ code: 1000 });
    }
  }
  window.WebSocket = MockWebSocket;
  window.EventSource = undefined;

  // Always-on ticker: telemetry every tick, grid intensity every other tick.
  setInterval(() => {
    if (!sockets.length) return;
    const previous = grid.intensity;
    const drift = (Math.random() - 0.5) * 0.03 + (0.71 - grid.intensity) * 0.12;
    grid.intensity = Math.min(0.95, Math.max(0.45, Number((grid.intensity + drift).toFixed(3))));
    grid.history.push(grid.intensity);
    if (grid.history.length > 40) grid.history.shift();
    broadcast('grid', { grid: { intensity: grid.intensity, previous: previous, trend: grid.intensity > previous ? 'rising' : grid.intensity < previous ? 'falling' : 'flat',
      source: 'modelled (no provider key)', region: 'IN', spark: grid.history.slice(), electricityNow: grid.intensity, briefFactor: 0.8, updatedAt: nowIso() } });
    broadcast('telemetry', Object.assign(metricsPayload(), { clients: Math.max(sockets.length, 1), presence: presenceList(),
      db: 'memory (preview mock)', ticks: grid.history.length, transport: 'websocket + server-sent-events', tickMs: 3500 }));

    const maxId = acts.length ? Math.max.apply(null, acts.map((a) => Number(a._id) || 0)) : 0;
    if (maxId !== lastBroadcastId) {
      lastBroadcastId = maxId;
      const newest = acts.filter((a) => Number(a._id) === maxId)[0];
      if (newest) broadcast('activity', { activity: newest, co2: newest.co2, label: FACTORS[newest.type].label, tier: tierOf(newest.co2) });
      callMock('/api/stream/state').then((state) => broadcast('snapshot', state.snapshot));
    }
  }, 3500);
})();
<\/script>`;

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CarbonPulse — Real-Time Carbon Intelligence</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet" />
    <style>${css}</style>
  </head>
  <body>
    <div id="root"></div>
    ${mockApi.replace('<\\/script>', '</' + 'script>')}
    <script type="module">${js.replace(/<\/script>/g, '<' + '/script>')}</script>
  </body>
</html>`;

writeFileSync(new URL('./preview.html', import.meta.url), html);
if (missing.size) console.warn('warning: no image file for', [...missing].join(', '), '(those references stay as /img/…)');
console.log('preview.html built:', (html.length / 1024 / 1024).toFixed(2) + ' MB —', inlined, 'image reference(s) inlined');
