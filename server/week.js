// Week helpers (DP3): a "week" starts Monday 00:00 local time.
// Matches the common mental model of a weekly budget resetting at the
// start of the work week. All dates handled as YYYY-MM-DD strings in
// local time to avoid UTC off-by-one bugs.

export function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Monday 00:00 of the week containing `d`
export function weekStart(d = new Date()) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (dt.getDay() + 6) % 7; // 0 = Monday
  dt.setDate(dt.getDate() - dow);
  return dt;
}

export function currentWeekRange(now = new Date()) {
  const start = weekStart(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 6); // Sunday
  return { start: toDateStr(start), end: toDateStr(end) };
}

// Days elapsed in the week (1..7) and days remaining
export function weekProgress(now = new Date()) {
  const start = weekStart(now);
  const msPerDay = 24 * 60 * 60 * 1000;
  const elapsed = Math.floor((now - start) / msPerDay) + 1; // 1..7
  return { daysElapsed: Math.min(elapsed, 7), daysRemaining: Math.max(7 - elapsed, 0) };
}
