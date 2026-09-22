import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Card, Icon, Progress } from './ui.jsx';

export default function WeeklyTarget({ week, refreshKey, onSaved, onToast }) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState(null);

  useEffect(() => {
    api.audit().then(setAudit).catch(() => {});
  }, [refreshKey]);

  if (!week) return <Card className="p-6 text-on-surface-variant">Loading weekly telemetry…</Card>;

  const { pct, exceeded, pace, daysElapsed, daysRemaining, used, target, elapsedPct } = week;
  const tone = exceeded ? 'rose' : pct > 80 ? 'amber' : 'primary';
  const ringColor = exceeded ? '#e11d48' : pct > 80 ? '#d97706' : '#006948';

  const r = 54;
  const circ = 2 * Math.PI * r;
  const dash = (Math.min(pct, 100) / 100) * circ;

  const paceCopy = {
    behind: "You're spending budget faster than the week is passing — a small course-correction now is easier than a big one on Sunday.",
    'on-track': 'You are exactly on pace for where the week stands. Keep going as you are.',
    ahead: "You're running under budget for this point in the week. Whatever you're doing, it's working.",
  }[pace];

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    try {
      const res = await api.setTarget(Number(value));
      setStatus({ ok: true, text: `Weekly target updated to ${res.weeklyTarget} kg CO₂.` });
      onToast?.(`Target set to ${res.weeklyTarget} kg CO₂`);
      setValue('');
      onSaved?.();
    } catch (err) {
      setStatus({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col">
      <div className="mb-4">
        <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
          <span className="h-2 w-2 rounded-full bg-primary" />
          Weekly budget · Monday 00:00 → Sunday
        </div>
        <h1 className="font-headline text-[26px] font-bold tracking-tight text-on-surface md:text-[30px]">Weekly target</h1>
        <p className="text-[13px] text-on-surface-variant">
          Set the CO₂ budget you want to live within. CarbonPulse tracks progress live and tells you how the pace compares to
          the week.
        </p>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        <Card className="p-6 xl:col-span-7">
          <div className="flex flex-col items-center gap-6 md:flex-row">
            <div className="relative h-36 w-36 flex-shrink-0">
              <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90">
                <circle cx="64" cy="64" r={r} fill="none" stroke="#e2e7ff" strokeWidth="11" />
                <circle
                  cx="64"
                  cy="64"
                  r={r}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="11"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${circ}`}
                  className="transition-all duration-700"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="tabular font-headline text-[26px] font-bold" style={{ color: ringColor }}>
                  {pct}%
                </span>
                <span className="text-[11px] text-on-surface-variant">of target</span>
              </div>
            </div>

            <div className="flex-1 text-center md:text-left">
              <div className="tabular font-headline text-[30px] font-bold text-primary">
                {used.toFixed(1)} kg
                <span className="ml-1 text-[13px] font-medium text-on-surface-variant">used of {target} kg</span>
              </div>
              <p className="mt-1 text-[12.5px] text-on-surface-variant">
                Week {week.start} → {week.end} · day {daysElapsed} of 7 · {daysRemaining} day(s) remaining
              </p>

              <div className="mt-3 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-surface-container-low p-2.5 text-left">
                  <div className="muted-label">Status</div>
                  <div className={`text-[13px] font-semibold ${exceeded ? 'text-rose' : 'text-primary'}`}>
                    {exceeded ? 'Exceeded' : 'Within budget'}
                  </div>
                </div>
                <div className="rounded-lg bg-surface-container-low p-2.5 text-left">
                  <div className="muted-label">Pace</div>
                  <div className="text-[13px] font-semibold capitalize text-on-surface">{pace.replace('-', ' ')}</div>
                </div>
                <div className="rounded-lg bg-surface-container-low p-2.5 text-left">
                  <div className="muted-label">Week elapsed</div>
                  <div className="tabular text-[13px] font-semibold text-on-surface">{elapsedPct}%</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-1.5 flex items-center justify-between text-[12px] font-medium">
              <span className="text-on-surface-variant">
                Budget used {pct}% · week elapsed {elapsedPct}%
              </span>
              <span className={`tabular font-semibold ${exceeded ? 'text-rose' : 'text-primary'}`}>
                {exceeded ? `over by ${(used - target).toFixed(1)} kg` : `${(target - used).toFixed(1)} kg left`}
              </span>
            </div>
            <Progress pct={pct} tone={tone} height={12} />
            <p className="mt-3 text-[12.5px] leading-snug text-on-surface-variant">{paceCopy}</p>
          </div>

          {exceeded && (
            <div className="mt-4 rounded-lg border border-amber/25 bg-amber-soft p-3.5 text-[12.5px] leading-snug text-[#92400e]">
              <strong>You've passed the weekly target — and that's genuinely okay.</strong> We nudge, we don't block or shame:
              logging stays open, your history is untouched, and the point is that you can now see exactly which category moved
              the number. {audit?.nextBestAction ? `Suggested next move: ${audit.nextBestAction}` : ''}
            </div>
          )}
          {!exceeded && daysRemaining === 0 && (
            <div className="mt-4 rounded-lg bg-emerald-soft p-3.5 text-[12.5px] text-[#065f46]">
              Week complete and within budget — a fresh allocation starts Monday 00:00.
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-5 xl:col-span-5">
          <Card className="p-5">
            <h2 className="mb-3 font-headline text-[15px] font-semibold text-on-surface">Set your weekly budget</h2>
            <form onSubmit={save} className="flex items-end gap-2">
              <div className="flex-1">
                <label htmlFor="target" className="field-label">
                  Weekly CO₂ target (kg)
                </label>
                <div className="relative">
                  <input
                    id="target"
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={String(target)}
                    className="input tabular pr-14"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-outline">
                    kg
                  </span>
                </div>
              </div>
              <button type="submit" disabled={busy} className="btn-primary disabled:opacity-50">
                {busy ? 'Saving…' : 'Save'}
              </button>
            </form>
            {status && (
              <p className={`mt-3 rounded-lg px-3 py-2 text-[12.5px] font-medium ${status.ok ? 'bg-emerald-soft text-[#065f46]' : 'bg-error-container text-on-error-container'}`}>
                {status.text}
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[25, 50, 100, 150].map((p) => (
                <button key={p} onClick={() => setValue(String(p))} className="rounded-full bg-surface-container-low px-2.5 py-1 text-[11px] font-medium text-on-surface-variant hover:bg-surface-container-high">
                  {p} kg
                </button>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-headline text-[15px] font-semibold text-on-surface">Why it works this way</h2>
            <div className="space-y-3 text-[12.5px] leading-snug text-on-surface-variant">
              <div className="flex gap-2">
                <Icon name="pulse" size={15} className="mt-0.5 flex-shrink-0 text-primary" />
                <span>
                  <strong className="text-on-surface">The nudge (DP1):</strong> crossing the target produces an encouraging,
                  non-blocking message with one concrete swap — never a lockout or a scolding.
                </span>
              </div>
              <div className="flex gap-2">
                <Icon name="calendar" size={15} className="mt-0.5 flex-shrink-0 text-primary" />
                <span>
                  <strong className="text-on-surface">The week (DP3):</strong> Monday 00:00 → Sunday, in your local timezone,
                  because that's how most people picture a week's budget.
                </span>
              </div>
              <div className="flex gap-2">
                <Icon name="target" size={15} className="mt-0.5 flex-shrink-0 text-primary" />
                <span>
                  <strong className="text-on-surface">Mid-week signal:</strong> we compare budget used against week elapsed
                  (±10 points) instead of a bare percentage, so an early-week spike isn't misread as failure.
                </span>
              </div>
            </div>
          </Card>

          {audit?.projection != null && (
            <Card className="p-5">
              <h2 className="mb-2 font-headline text-[15px] font-semibold text-on-surface">Week-end projection</h2>
              <div className="tabular font-headline text-[24px] font-bold text-on-surface">
                {audit.projection} kg <span className="text-[12px] font-medium text-on-surface-variant">at current pace</span>
              </div>
              <p className="mt-2 text-[12.5px] leading-snug text-on-surface-variant">
                {audit.projection > target
                  ? `That's ${(audit.projection - target).toFixed(1)} kg over your ${target} kg target with ${daysRemaining} day(s) left. ${audit.nextBestAction}`
                  : `Comfortably under your ${target} kg target. ${audit.nextBestAction}`}
              </p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
