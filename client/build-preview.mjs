// Builds client/preview.html: a single self-contained file with the app's JS/CSS
// inlined and a fetch shim mocking the backend API (including the AI audit).
// UI preview only — the real app talks to the Express + MongoDB backend.
import { readFileSync, writeFileSync, readdirSync } from 'fs';

const dist = new URL('./dist/', import.meta.url).pathname;
const jsFile = readdirSync(dist + 'assets').find((f) => f.endsWith('.js'));
const cssFile = readdirSync(dist + 'assets').find((f) => f.endsWith('.css'));
const js = readFileSync(dist + 'assets/' + jsFile, 'utf8');
const css = readFileSync(dist + 'assets/' + cssFile, 'utf8');

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
  function json(body, status) {
    return Promise.resolve(new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } }));
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
    if (base === '/api/chat' && opts.method === 'POST') {
      const t = body.message.toLowerCase();
      const m = t.match(/(?:drove|flew|flight|bus)\\s*(\\d+(?:\\.\\d+)?)|(\\d+(?:\\.\\d+)?)\\s*km/);
      if (m && /drove|km|flight|flew|bus/.test(t)) {
        const qty = parseFloat(m[1] || m[2]);
        const type = /flight|flew/.test(t) ? 'flight' : /bus/.test(t) ? 'bus' : 'car';
        const f = FACTORS[type];
        const co2 = +(qty * f.factor).toFixed(2);
        acts.push({ _id: String(nextId++), type, quantity: qty, date: d(0), co2, notes: 'logged via chat' });
        return json({ reply: 'Got it \\u2014 logged ' + qty + ' ' + f.unit + ' of ' + f.label + ' (~' + co2 + ' kg CO\\u2082). I refreshed your dashboard, and the audit now includes it.', engine: 'rules', logged: true });
      }
      if (/analyse|analyze|audit|reduction opportunity/.test(t)) return json({ reply: auditData().insights.map((i) => '\\u2022 ' + i.title + ' \\u2014 ' + i.detail).join('\\n'), engine: 'rules' });
      if (/total|footprint|how much/.test(t)) {
        const total = +acts.reduce((n, a) => n + a.co2, 0).toFixed(2);
        const w = weekMeta();
        return json({ reply: 'Your all-time footprint is ' + total + ' kg CO\\u2082. This week you are at ' + w.used + ' kg \\u2014 ' + w.pct + '% of your ' + target + ' kg target.', engine: 'rules' });
      }
      if (/worst|category|breakdown/.test(t)) {
        const ranked = Object.entries(byCat(acts)).sort((a, b) => b[1] - a[1]).filter(([, v]) => v > 0);
        return json({ reply: ranked.map(([k, v]) => '\\u2022 ' + FACTORS[k].label + ': ' + v.toFixed(1) + ' kg').join('\\n') + '\\n\\nBiggest contributor: ' + FACTORS[ranked[0][0]].label + '.', engine: 'rules' });
      }
      if (/tip|reduce/.test(t)) return json({ reply: 'Biggest levers: 1) fewer flights, 2) swap non-veg for veg meals (1.5 kg each), 3) bus instead of car for short trips (60% less per km).', engine: 'rules' });
      return json({ reply: 'Try: "I drove 15 km", "what is my footprint?", or "analyse my history".', engine: 'rules' });
    }
    if (base === '/api/health') return json({ ok: true, db: 'memory (preview mock)', llm: 'off', realtime: 'sse', clients: 1 });
    return json({ error: 'not found' }, 404);
  };

  // No SSE server in the static preview — the app falls back to polling.
  window.EventSource = undefined;
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
console.log('preview.html built:', (html.length / 1024).toFixed(0) + ' KB');
