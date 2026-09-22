import { useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { Card, Icon, StatCard, CATEGORY_META, TierPill, tierOf } from '../../components/ui/index.jsx';

const CATEGORIES = [
  { key: '', label: 'All activities', icon: 'dashboard' },
  { key: 'car', label: 'Car travel', icon: 'car' },
  { key: 'bus', label: 'Bus travel', icon: 'bus' },
  { key: 'flight', label: 'Flights', icon: 'flight' },
  { key: 'electricity', label: 'Electricity', icon: 'bolt' },
  { key: 'veg_meal', label: 'Veg meal', icon: 'salad' },
  { key: 'non_veg_meal', label: 'Non-veg meal', icon: 'meal' },
];

const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: '7d', label: 'Last 7 days' },
  { key: 'mtd', label: 'Month to date' },
  { key: 'all', label: 'All history' },
];

function fmt(d) {
  return d.toLocaleDateString('en-CA');
}

function rangeFor(preset) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'today') return { from: fmt(start), to: fmt(start) };
  if (preset === 'week') {
    const s = new Date(start);
    s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); // Monday
    return { from: fmt(s), to: fmt(now) };
  }
  if (preset === '7d') {
    const s = new Date(start);
    s.setDate(s.getDate() - 6);
    return { from: fmt(s), to: fmt(now) };
  }
  if (preset === 'mtd') return { from: fmt(new Date(now.getFullYear(), now.getMonth(), 1)), to: fmt(now) };
  return { from: '', to: '' };
}

export default function History({ onToast, refreshKey, live }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [preset, setPreset] = useState('all');
  const [tier, setTier] = useState('');
  const [sortBy, setSortBy] = useState('date-desc');
  const [error, setError] = useState(null);

  const range = useMemo(() => rangeFor(preset), [preset]);

  async function load() {
    try {
      const res = await api.activities({ type: category, from: range.from, to: range.to, q, tier });
      setRows(res.activities);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, range.from, range.to, q, tier, refreshKey, live?.lastEvent?.at]);

  const sorted = useMemo(() => {
    if (!rows) return [];
    const copy = [...rows];
    const by = {
      'date-desc': (a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0),
      'date-asc': (a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0),
      'co2-desc': (a, b) => b.co2 - a.co2,
      'co2-asc': (a, b) => a.co2 - b.co2,
      'qty-desc': (a, b) => b.quantity - a.quantity,
    };
    return copy.sort(by[sortBy] || by['date-desc']);
  }, [rows, sortBy]);

  const filteredTotal = sorted.reduce((s, a) => s + a.co2, 0);
  const days = new Set(sorted.map((a) => a.date)).size || 1;
  const hasFilters = q || category || tier || preset !== 'all';

  function reset() {
    setQ('');
    setCategory('');
    setTier('');
    setPreset('all');
    setSortBy('date-desc');
  }

  async function remove(id) {
    try {
      await api.deleteActivity(id);
      onToast?.('Entry removed from the ledger');
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  function exportCsv() {
    const header = ['date', 'type', 'label', 'quantity', 'unit', 'co2_kg', 'tier', 'notes'];
    const lines = sorted.map((a) => {
      const m = CATEGORY_META[a.type] || {};
      return [a.date, a.type, m.label || a.type, a.quantity, m.unit || '', a.co2, tierOf(a.co2), (a.notes || '').replace(/,/g, ';')].join(',');
    });
    const blob = new Blob([header.join(',') + '\n' + lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `carbonpulse-ledger-${fmt(new Date())}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    onToast?.('CSV audit ledger exported');
  }

  return (
    <div className="flex w-full flex-col">
      {/* Header */}
      <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">
            <span className="h-2 w-2 rounded-full bg-primary" />
            <span>Audit trail · continuous ledger</span>
            <span className="text-outline">•</span>
            <span className="text-secondary">{live?.status === 'live' ? 'streaming live' : 'sync mode'}</span>
          </div>
          <h1 className="font-headline text-[26px] font-bold tracking-tight text-on-surface md:text-[30px]">
            Activity History &amp; Filters
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportCsv} className="btn-secondary">
            <Icon name="download" size={15} className="text-primary" /> Export CSV
          </button>
        </div>
      </div>

      {/* Stat ribbon */}
      <div className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Filtered activities"
          icon="history"
          value={sorted.length}
          unit="entries"
          footer={
            <>
              <Icon name="verified" size={13} className="text-primary" /> 100% factor verified
            </>
          }
        />
        <StatCard
          label="Filtered carbon mass"
          icon="scale"
          value={filteredTotal.toFixed(2)}
          unit="kg CO₂"
          footer={
            <>
              <Icon name="trend" size={13} className="text-primary" /> across {days} logged day{days === 1 ? '' : 's'}
            </>
          }
        />
        <StatCard
          label="Daily mean (filtered)"
          icon="calendar"
          value={(filteredTotal / days).toFixed(2)}
          unit="kg CO₂ / day"
          footer={
            <>
              <Icon name="pulse" size={13} className="text-primary" /> updated in real time
            </>
          }
        />
        <StatCard label="Live sessions" icon="globe" value={live?.clients ?? 1} unit="connected" footer={
          <>
            <Icon name="verified" size={13} className="text-primary" /> Server-Sent Events
          </>
        } />
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        <div className="flex flex-col gap-5 xl:col-span-8">
          {/* Filter control center */}
          <Card className="flex flex-col gap-4 p-4">
            <div className="flex flex-col items-stretch justify-between gap-3 md:flex-row md:items-center">
              <div className="relative flex-1">
                <Icon name="search" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-outline" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search notes, routes or categories…"
                  className="input pl-10"
                  aria-label="Search activities"
                />
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-lg bg-surface-container-low px-2.5 py-1.5">
                  <Icon name="scale" size={15} className="text-outline" />
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="bg-transparent text-[12px] font-medium text-on-surface focus:outline-none"
                    aria-label="Sort activities"
                  >
                    <option value="date-desc">Date (newest)</option>
                    <option value="date-asc">Date (oldest)</option>
                    <option value="co2-desc">Carbon (highest)</option>
                    <option value="co2-asc">Carbon (lowest)</option>
                    <option value="qty-desc">Quantity (highest)</option>
                  </select>
                </div>
                {hasFilters && (
                  <button onClick={reset} className="btn-ghost" title="Reset all filters">
                    <Icon name="reset" size={15} /> Reset
                  </button>
                )}
              </div>
            </div>

            {/* Category pills */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="muted-label">Activity category</span>
                <span className="text-[11px] text-outline">
                  Viewing: {CATEGORIES.find((c) => c.key === category)?.label || 'All'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key || 'all'}
                    onClick={() => setCategory(c.key)}
                    className={`flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-[12px] font-medium transition-all ${
                      category === c.key
                        ? 'bg-primary-container font-semibold text-on-primary-container'
                        : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    <Icon name={c.icon} size={14} />
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Date presets + impact tiers */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <span className="muted-label">Date horizon</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {DATE_PRESETS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => setPreset(p.key)}
                      className={`rounded px-2.5 py-1 text-[11.5px] font-medium transition-all ${
                        preset === p.key
                          ? 'bg-secondary-container font-semibold text-on-secondary-container'
                          : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container-high'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="muted-label">Emission intensity</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { key: '', label: 'All' },
                    { key: 'low', label: 'Low (< 2 kg)', dot: '#10b981' },
                    { key: 'med', label: 'Med (2–10 kg)', dot: '#f59e0b' },
                    { key: 'high', label: 'High (> 10 kg)', dot: '#e11d48' },
                  ].map((t) => (
                    <button
                      key={t.key || 'all'}
                      onClick={() => setTier(t.key)}
                      className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-[11.5px] font-medium transition-all ${
                        tier === t.key
                          ? 'bg-primary font-semibold text-on-primary'
                          : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'
                      }`}
                    >
                      {t.dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.dot }} />}
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Ledger table */}
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between bg-surface-container-low px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[12px] font-semibold text-on-surface">Registered carbon events</span>
                <span className="text-[11px] text-outline">Showing {sorted.length} record{sorted.length === 1 ? '' : 's'}</span>
              </div>
              <span className="flex items-center gap-1 text-[11px] text-on-surface-variant">
                <Icon name="verified" size={14} className="text-primary" />
                Fixed-factor compliant
              </span>
            </div>

            {error && <div className="px-4 py-3 text-[12.5px] text-error">{error}</div>}

            <div className="w-full overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-surface-container-lowest text-outline">
                    {['Activity', 'Date', 'Logged amount', 'Factor used', 'Mass (kg CO₂)', 'Impact tier', ''].map((h, i) => (
                      <th key={h + i} className={`px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider ${i === 4 ? 'text-right' : ''}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-[13px]">
                  {!sorted.length && (
                    <tr>
                      <td colSpan="7" className="px-4 py-10 text-center">
                        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-low text-outline">
                          <Icon name="search" size={22} />
                        </div>
                        <p className="font-headline text-[15px] font-semibold text-on-surface">No activities match your filters</p>
                        <p className="mx-auto mb-3 max-w-sm text-[12.5px] text-on-surface-variant">
                          Widen the date horizon, clear the search, or reset the intensity band.
                        </p>
                        <button onClick={reset} className="btn-primary mx-auto">
                          Reset filters
                        </button>
                      </td>
                    </tr>
                  )}
                  {sorted.map((a) => {
                    const m = CATEGORY_META[a.type] || {};
                    return (
                      <tr key={a._id} className="border-b border-surface-container last:border-0 hover:bg-surface-container-low/60">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant">
                              <Icon name={m.icon || 'leaf'} size={14} />
                            </span>
                            <div>
                              <div className="font-medium text-on-surface">{m.label || a.type}</div>
                              {a.notes && <div className="text-[11px] text-on-surface-variant">{a.notes}</div>}
                            </div>
                          </div>
                        </td>
                        <td className="tabular px-4 py-2.5 text-on-surface-variant">{a.date}</td>
                        <td className="tabular px-4 py-2.5 text-on-surface">
                          {a.quantity} {m.unit}
                        </td>
                        <td className="tabular px-4 py-2.5 text-on-surface-variant">
                          {m.factor} kg/{m.unit}
                        </td>
                        <td className="tabular px-4 py-2.5 text-right font-semibold text-on-surface">{Number(a.co2).toFixed(2)}</td>
                        <td className="px-4 py-2.5">
                          <TierPill co2={a.co2} />
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => remove(a._id)}
                            className="rounded p-1.5 text-outline transition-colors hover:bg-error-container hover:text-error"
                            title="Delete entry"
                            aria-label={`Delete ${m.label} entry`}
                          >
                            <Icon name="trash" size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right column: quick context */}
        <div className="flex flex-col gap-5 xl:col-span-4">
          <Card className="p-5">
            <h2 className="mb-3 font-headline text-[15px] font-semibold text-on-surface">Filtered distribution</h2>
            {sorted.length === 0 ? (
              <p className="text-[12.5px] text-on-surface-variant">No entries in this view.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(
                  sorted.reduce((acc, a) => {
                    acc[a.type] = (acc[a.type] || 0) + a.co2;
                    return acc;
                  }, {})
                )
                  .sort((a, b) => b[1] - a[1])
                  .map(([type, value]) => {
                    const m = CATEGORY_META[type] || {};
                    const share = Math.round((value / filteredTotal) * 100);
                    return (
                      <div key={type}>
                        <div className="mb-1 flex items-center justify-between text-[12px]">
                          <span className="flex items-center gap-1.5 font-medium text-on-surface">
                            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: m.color }} />
                            {m.label || type}
                          </span>
                          <span className="tabular text-on-surface-variant">
                            {value.toFixed(1)} kg · {share}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high">
                          <div className="h-full rounded-full" style={{ width: `${share}%`, background: m.color }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-2 font-headline text-[15px] font-semibold text-on-surface">Filter reference</h2>
            <ul className="space-y-2 text-[12.5px] text-on-surface-variant">
              <li className="flex gap-2">
                <Icon name="calendar" size={15} className="mt-0.5 flex-shrink-0 text-primary" />
                Weeks are Monday → Sunday in local time, so “This week” matches your weekly target.
              </li>
              <li className="flex gap-2">
                <Icon name="scale" size={15} className="mt-0.5 flex-shrink-0 text-primary" />
                Impact tiers are derived from the computed mass: low &lt; 2 kg, med 2–10 kg, high &gt; 10 kg.
              </li>
              <li className="flex gap-2">
                <Icon name="download" size={15} className="mt-0.5 flex-shrink-0 text-primary" />
                Export produces a CSV of exactly what you see — filters, sort order, and computed factors included.
              </li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
