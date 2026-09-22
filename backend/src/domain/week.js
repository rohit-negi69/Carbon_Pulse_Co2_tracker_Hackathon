// Week semantics (DP3): a week runs Monday 00:00 → Sunday 23:59 in local time.
// All dates cross the wire as YYYY-MM-DD strings to avoid UTC off-by-one bugs.

export function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function weekStart(d = new Date()) {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
  return dt;
}

export function currentWeekRange(now = new Date()) {
  const start = weekStart(now);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: toDateStr(start), end: toDateStr(end) };
}

export function previousWeekRange(now = new Date()) {
  const start = weekStart(now);
  start.setDate(start.getDate() - 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: toDateStr(start), end: toDateStr(end) };
}

export function weekProgress(now = new Date()) {
  const start = weekStart(now);
  const elapsed = Math.floor((now - start) / 86_400_000) + 1;
  return { daysElapsed: Math.min(elapsed, 7), daysRemaining: Math.max(7 - elapsed, 0) };
}

// Pace compares budget consumed against how much of the week has passed.
export function paceOf(pct, elapsedPct) {
  if (pct > elapsedPct + 10) return 'behind';
  if (pct < elapsedPct - 10) return 'ahead';
  return 'on-track';
}
