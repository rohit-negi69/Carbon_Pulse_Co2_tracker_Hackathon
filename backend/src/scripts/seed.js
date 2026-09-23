// ---------------------------------------------------------------------------
// Demo seed — one command fills the ledger with ~6 weeks of realistic data so
// the dashboard, charts, weekly target, nudges and the copilot all have
// something to show immediately (e.g. right after a fresh deploy, or before a
// demo on an empty database).
//
//   npm run seed            # add demo data (skips if activities exist)
//   npm run seed -- --force # wipe activities first, then seed
//   npm run seed -- --days 42
//
// It goes through the real activity service (validate → calculate → persist →
// audit → nudge), so seeded rows are indistinguishable from hand-logged ones —
// factors, tiers and the audit trail all behave exactly as in production.
// ---------------------------------------------------------------------------

import * as activities from '../modules/activities/service.js';
import * as activityRepository from '../db/repositories/activityRepository.js';
import * as targetRepository from '../db/repositories/targetRepository.js';
import * as historyRepository from '../db/repositories/historyRepository.js';
import * as nudges from '../modules/nudges/service.js';
import { connectDB, dbMode } from '../db/index.js';
import { toDateStr, fromDateStr, weekStart } from '../domain/week.js';

// ---------------------------------------------------------------------------
// Realistic weekly routines. Quantities are sampled around a weekday/weekend
// profile so charts show a believable weekday-vs-weekend shape, weekly totals
// hover near the default 50 kg target, and every category appears at least a
// few times (so the donut, the scope split and the top-contributor panel all
// have data).
// ---------------------------------------------------------------------------

// [type, weekday mean, weekday jitter, weekend mean, weekend jitter, unit]
const ROUTINES = [
  { type: 'car',           weekday: [14, 8],  weekend: [28, 15], unit: 'km' },
  { type: 'bus',           weekday: [9, 6],   weekend: [6, 5],   unit: 'km' },
  { type: 'flight',        weekly: [1, 400],  p: 0.15,           unit: 'km' }, // occasional trip, ~1 in 7 weeks
  { type: 'electricity',   weekday: [6, 2.5], weekend: [9, 3.5], unit: 'kWh' },
  { type: 'veg_meal',      weekday: [2, 0.8], weekend: [2.2, 0.9], unit: 'meals' },
  { type: 'non_veg_meal',  weekday: [1, 0.7], weekend: [1.2, 0.8], unit: 'meals' },
];

// A light improvement trend: the *current* week emits ~8% less than the
// earliest seeded week (past weeks carry a compounded surcharge), so the
// 14-day trend and the week-over-week delta tell a positive story.
const IMPROVEMENT_PER_WEEK = 0.92;

const NOTES = {
  car: ['Commute to office', 'Grocery run', 'Weekend errands', 'Drop-off + return'],
  bus: ['Metro + bus combo', 'Bus to downtown', 'Evening bus home'],
  flight: ['Work trip — round trip', 'Family visit'],
  electricity: ['Home meter reading', 'AC + appliances', 'Evening heating'],
  veg_meal: ['Lunch at home', 'Salad bowl', 'Dal + rice'],
  non_veg_meal: ['Dinner out', 'Chicken curry', 'Grill night'],
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const jitter = (mean, spread) => Math.max(0.2, mean + (Math.random() - 0.5) * 2 * spread);
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

function planDay(date, weeksAgo, isWeekend, routine) {
  if (routine.weekly) {
    if (Math.random() >= routine.p) return null;
    const [mean, spread] = routine.weekly;
    return round(jitter(mean, spread), 0);
  }
  const [mean, spread] = isWeekend ? routine.weekend : routine.weekday;
  return round(jitter(mean, spread) / IMPROVEMENT_PER_WEEK ** weeksAgo, 1);
}

async function seed({ days = 42, force = false } = {}) {
  await connectDB();

  const existing = await activityRepository.count();
  if (existing > 0 && !force) {
    console.log(`[seed] ${existing} activities already present — nothing to do (use --force to reseed).`);
    return;
  }
  if (force && existing > 0) {
    // Wipe the ledger through the repositories so Mongo and the in-memory
    // fallback stay consistent with what the repositories expose.
    for (const a of await activityRepository.find({})) {
      await activityRepository.remove(String(a._id));
    }
    console.log(`[seed] --force: removed ${existing} existing activities and their audit rows.`);
    await historyRepository.record('seed-reset', 'singleton', { removed: existing });
  }

  const today = new Date();
  const start = fromDateStr(toDateStr(today));
  start.setDate(start.getDate() - (days - 1));

  // Today's own week should be partially filled (only days up to today), so
  // the weekly pace gauge shows realistic mid-week progress.
  const monday = weekStart(today);
  let created = 0;
  let skipped = 0;

  for (let d = 0; d < days; d += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + d);
    const dayStr = toDateStr(date);
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const weeksAgo = Math.max(0, Math.round((monday - date) / (7 * 86_400_000)));
    const dow = date.getDay();

    for (const routine of ROUTINES) {
      // Electricity is logged once a day; meals skip some days; transport
      // skips more on weekends (people stay home).
      const baseSkip = routine.type === 'electricity' ? 0.05
        : routine.type.startsWith('veg') || routine.type === 'non_veg_meal' ? 0.25
        : isWeekend ? 0.35 : 0.15;
      if (Math.random() < baseSkip) { skipped += 1; continue; }

      // Sunday is quieter across the board.
      const dowFactor = dow === 0 ? 0.6 : 1;
      const quantityRaw = planDay(date, weeksAgo, isWeekend, routine);
      if (quantityRaw == null) { skipped += 1; continue; }
      const quantity = round(quantityRaw * dowFactor, 1);
      if (quantity <= 0.1) { skipped += 1; continue; }

      const result = await activities.create({
        type: routine.type,
        quantity,
        date: dayStr,
        notes: Math.random() < 0.5 ? pick(NOTES[routine.type] || []) : '',
        source: 'seed',
        confirmed: true,
      });
      if (result.ok) created += 1;
      else { skipped += 1; console.warn(`[seed] skipped ${routine.type} on ${dayStr}: ${result.error || 'rejected'}`); }
    }
  }

  // A weekly target makes the pace gauge, exceed flag and nudges meaningful.
  // Rather than a fixed number, set it just above the mean of the *complete*
  // seeded weeks: most weeks land on-track, flight-heavy weeks cross the
  // budget, and slow weeks read "ahead" — the gauge tells a varied story.
  const byWeek = new Map();
  for (const a of await activityRepository.find({})) {
    const d = fromDateStr(a.date);
    const monday = weekStart(d);
    const key = toDateStr(monday);
    byWeek.set(key, (byWeek.get(key) || 0) + a.co2);
  }
  const currentMonday = weekStart(new Date());
  const complete = [...byWeek.entries()].filter(([k]) => k < toDateStr(currentMonday));
  const meanKg = complete.length ? complete.reduce((acc, [, kg]) => acc + kg, 0) / complete.length : 50;
  const weeklyTarget = Math.max(20, Math.round((meanKg * 1.05) / 10) * 10);
  await targetRepository.set(weeklyTarget);

  await nudges.evaluate();

  console.log(`[seed] done — ${created} activities created, ${skipped} samples skipped, db mode: ${dbMode()}`);
  console.log(`[seed] weekly target set to ${weeklyTarget} kg CO₂ (mean complete week: ${meanKg.toFixed(1)} kg). Open the dashboard to see the demo data.`);
}

// ---------------------------------------------------------------------------
// CLI — only auto-runs when invoked directly, so tests and other scripts can
// `import { seed } from './seed.js'` and drive it in-process.
// ---------------------------------------------------------------------------
export { seed };

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const args = process.argv.slice(2);
  const force = args.includes('--force') || args.includes('-f');
  const daysArg = args.find((a) => /^--days=\d+$/.test(a));
  const days = daysArg ? Number(daysArg.split('=')[1]) : 42;

  seed({ days, force })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed] failed:', err);
      process.exit(1);
    });
}
