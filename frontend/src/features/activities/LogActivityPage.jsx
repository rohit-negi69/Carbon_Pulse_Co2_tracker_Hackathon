import { useState } from 'react';
import { api } from '../../lib/api.js';
import { Card, Icon, CATEGORY_META, TierPill, SectionHeading, Badge } from '../../components/ui/index.jsx';

const TYPES = Object.keys(CATEGORY_META);

export default function LogActivity({ onLogged, onToast }) {
  const [type, setType] = useState('car');
  const [quantity, setQuantity] = useState('');
  const [date, setDate] = useState(new Date().toLocaleDateString('en-CA'));
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState(null);
  const [confirming, setConfirming] = useState(null); // DP2 pending payload
  const [busy, setBusy] = useState(false);

  const meta = CATEGORY_META[type];
  const qty = Number(quantity);
  const projected = Number.isFinite(qty) && qty > 0 ? qty * meta.factor : 0;

  async function submit(e) {
    e.preventDefault();
    setStatus(null);
    setBusy(true);
    try {
      const res = await api.addActivity({ type, quantity: qty, date, notes });
      setStatus({ ok: true, text: `Committed — ${res.co2} kg CO₂ added to the ledger.` });
      onToast?.(`Logged ${meta.label} · ${res.co2} kg CO₂`);
      setQuantity('');
      setNotes('');
      onLogged?.(res);
    } catch (err) {
      if (err.status === 422 && err.data?.needsConfirmation) {
        // DP2: never silently clamp — ask the user to confirm or fix.
        setConfirming({ type, quantity: qty, date, notes, message: err.data.message, co2: err.data.computedCo2 });
      } else {
        setStatus({ ok: false, text: err.message });
      }
    } finally {
      setBusy(false);
    }
  }

  async function confirmAbsurd() {
    setBusy(true);
    try {
      const res = await api.addActivity({ ...confirming, confirmed: true });
      setStatus({ ok: true, text: `Committed with confirmation — ${res.co2} kg CO₂.` });
      onToast?.(`Confirmed extreme entry · ${res.co2} kg CO₂`);
      setConfirming(null);
      setQuantity('');
      setNotes('');
      onLogged?.(res);
    } catch (err) {
      setStatus({ ok: false, text: err.message });
      setConfirming(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <SectionHeading
        className="animate-fade-up"
        eyebrow={
          <>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            Activity intake · real-time ledger write
          </>
        }
        title="Log an activity"
        subtitle="Choose a category, enter the quantity, and the CO₂ engine applies the fixed factor instantly — then it broadcasts to every open session."
      />

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        <Card className="p-5 xl:col-span-7">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <span className="field-label">Activity category</span>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {TYPES.map((t) => {
                  const m = CATEGORY_META[t];
                  const active = type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-all ${
                        active
                          ? 'border-primary bg-emerald-soft'
                          : 'border-outline-variant/60 bg-surface-container-lowest hover:bg-surface-container-low'
                      }`}
                    >
                      <Icon name={m.icon} size={17} className={active ? 'text-primary' : 'text-on-surface-variant'} />
                      <span className="text-[12.5px] font-semibold text-on-surface">{m.label}</span>
                      <span className="tabular text-[10.5px] text-on-surface-variant">
                        {m.factor} kg / {m.unit}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="qty" className="field-label">
                  Quantity ({meta.unit})
                </label>
                <div className="relative">
                  <input
                    id="qty"
                    type="number"
                    min="0"
                    step="any"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder={meta.unit === 'meals' ? '2' : meta.unit === 'kWh' ? '8' : '10'}
                    className="input tabular pr-14"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-outline">
                    {meta.unit}
                  </span>
                </div>
              </div>
              <div>
                <label htmlFor="date" className="field-label">
                  Date
                </label>
                <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
              </div>
            </div>

            <div>
              <label htmlFor="notes" className="field-label">
                Notes / destination (optional)
              </label>
              <input
                id="notes"
                value={notes}
                maxLength={160}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. client meeting in Manchester, dishwasher cycle…"
                className="input"
              />
            </div>

            {/* Live CO2 preview */}
            <div className="flex items-center justify-between rounded-lg bg-surface-container-low p-3">
              <div>
                <div className="muted-label">Projected impact</div>
                <div className="tabular font-headline text-[22px] font-bold text-primary">
                  {projected.toFixed(2)} <span className="text-[12px] font-medium text-on-surface-variant">kg CO₂</span>
                </div>
              </div>
              <div className="text-right">
                <span className="block text-[11px] text-outline">Factor applied</span>
                <span className="tabular text-[12px] font-semibold text-on-surface">{meta.factor} kg/{meta.unit}</span>
              </div>
            </div>

            {status && (
              <div
                className={`rounded-lg px-3 py-2 text-[12.5px] font-medium ${
                  status.ok ? 'bg-emerald-soft text-emerald' : 'bg-error-container text-on-error-container'
                }`}
              >
                {status.text}
              </div>
            )}

            <div className="flex items-center gap-2">
              <button type="submit" disabled={busy} className="btn-primary flex-1 disabled:opacity-50">
                {busy ? 'Committing…' : 'Commit activity'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuantity('');
                  setNotes('');
                  setStatus(null);
                }}
                className="btn-secondary"
              >
                Clear
              </button>
            </div>
            <p className="flex items-center gap-1.5 text-[11px] text-outline">
              <Icon name="verified" size={13} className="text-primary" />
              Entries above a per-category sanity threshold trigger a confirmation step rather than being clamped.
            </p>
          </form>
        </Card>

        {/* Reference + live context */}
        <div className="flex flex-col gap-5 xl:col-span-5">
          <Card className="p-5">
            <h2 className="mb-3 font-headline text-[15px] font-semibold text-on-surface">Fixed emission factors</h2>
            <div className="space-y-2">
              {TYPES.map((t) => {
                const m = CATEGORY_META[t];
                return (
                  <div key={t} className="flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-2">
                    <span className="flex items-center gap-2 text-[12.5px] font-medium text-on-surface">
                      <Icon name={m.icon} size={15} className="text-on-surface-variant" />
                      {m.label}
                    </span>
                    <span className="tabular text-[12px] font-semibold text-on-surface-variant">
                      {m.factor} kg/{m.unit}
                    </span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 font-headline text-[15px] font-semibold text-on-surface">Impact tiers</h2>
            <p className="mb-3 text-[12.5px] leading-snug text-on-surface-variant">
              Every entry is banded automatically so the history view can be filtered by intensity.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <TierPill co2={1} />
              <span className="text-[11px] text-on-surface-variant">below 2 kg</span>
              <TierPill co2={5} />
              <span className="text-[11px] text-on-surface-variant">2–10 kg</span>
              <TierPill co2={25} />
              <span className="text-[11px] text-on-surface-variant">above 10 kg</span>
            </div>
          </Card>
        </div>
      </div>

      {/* DP2 confirmation modal */}
      {confirming && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-inverse-surface/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl border border-outline-variant/50 bg-surface-container-lowest p-5 shadow-raised">
            <div className="mb-2 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-soft text-amber">
                <Icon name="alert" size={17} />
              </span>
              <h3 className="font-headline text-[17px] font-semibold text-on-surface">That looks like a lot</h3>
            </div>
            <p className="mb-4 text-[13px] leading-snug text-on-surface-variant">{confirming.message}</p>
            <div className="mb-4 rounded-lg bg-surface-container-low p-3 text-[12px]">
              <div className="flex justify-between">
                <span className="text-on-surface-variant">Entry</span>
                <span className="tabular font-semibold text-on-surface">
                  {confirming.quantity} {CATEGORY_META[confirming.type].unit} · {CATEGORY_META[confirming.type].label}
                </span>
              </div>
              <div className="mt-1 flex justify-between">
                <span className="text-on-surface-variant">Computed footprint</span>
                <span className="tabular font-semibold text-on-surface">{confirming.co2.toLocaleString()} kg CO₂</span>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirming(null)} className="btn-secondary">
                Edit the value
              </button>
              <button onClick={confirmAbsurd} disabled={busy} className="btn-primary disabled:opacity-50">
                It's correct — log it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
