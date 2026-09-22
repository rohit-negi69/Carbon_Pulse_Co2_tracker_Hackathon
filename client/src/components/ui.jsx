// Shared presentational primitives for the CarbonPulse design system.

const PATHS = {
  leaf: 'M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z M2 21c0-3 1.85-5.36 5.08-6',
  dashboard: 'M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z',
  plus: 'M12 5v14M5 12h14',
  history: 'M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8M12 7v5l4 2',
  target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12ZM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  car: 'M5 17h14M6 17v2M18 17v2M4 13l1.5-4.5A2 2 0 0 1 7.4 7h9.2a2 2 0 0 1 1.9 1.5L20 13v4H4zM7 13h1M16 13h1',
  bus: 'M4 17V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v11M4 11h16M7 17v2M17 17v2M8 14h.01M16 14h.01',
  flight: 'M17.8 19.2 16 11l3.5-3.5a2.1 2.1 0 0 0-3-3L13 8 4.8 6.2a1 1 0 0 0-1 1.7l5.4 3.6-2 4-2.6.4a1 1 0 0 0-.5 1.7l2.4 1.4 1.4 2.4a1 1 0 0 0 1.7-.5l.4-2.6 4-2 3.6 5.4a1 1 0 0 0 1.7-1',
  bolt: 'M13 2 4.5 13.5H11l-1 8.5L19.5 10H13z',
  meal: 'M4 3v7a3 3 0 0 0 6 0V3M7 10v11M15 3c-1 2-1 4 0 6v12M17 3c1 2 1 4 0 6v12',
  salad: 'M7 21h10M12 21v-6M8 9c0-2 1.8-4 4-4s4 2 4 4zM4 12c0-1.7 1.5-3 3.5-3M20 12c0-1.7-1.5-3-3.5-3M5 15h14',
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.8 2.8M14.9 14.9l2.8 2.8M6.3 17.7l2.8-2.8M14.9 9.1l2.8-2.8',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  reset: 'M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6',
  close: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z',
  chat: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 4 11.5a8.4 8.4 0 0 1 8.5-8.4 8.4 8.4 0 0 1 8.5 8.4Z',
  pulse: 'M22 12h-4l-3 8-4-16-3 8H2',
  trend: 'M22 7 13.5 15.5l-4-4L2 19M16 7h6v6',
  verified: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10ZM9 12l2 2 4-4',
  money: 'M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  calendar: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z',
  scale: 'M12 3v18M7 7l-4 8a4 4 0 0 0 8 0zM17 7l-4 8a4 4 0 0 0 8 0zM5 7h14',
  globe: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20Z',
  user: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
};

export function Icon({ name, size = 16, className = '', strokeWidth = 1.9 }) {
  const d = PATHS[name] || PATHS.spark;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {d.split('M').filter(Boolean).map((seg, i) => (
        <path key={i} d={'M' + seg} />
      ))}
    </svg>
  );
}

// Fixed emission factors from the brief — the single source of truth in the UI.
export const CATEGORY_META = {
  car: { label: 'Car travel', unit: 'km', factor: 0.2, icon: 'car', color: '#006948' },
  bus: { label: 'Bus travel', unit: 'km', factor: 0.08, icon: 'bus', color: '#0284c7' },
  flight: { label: 'Flight', unit: 'km', factor: 0.25, icon: 'flight', color: '#e11d48' },
  electricity: { label: 'Electricity', unit: 'kWh', factor: 0.8, icon: 'bolt', color: '#d97706' },
  veg_meal: { label: 'Veg meal', unit: 'meals', factor: 0.5, icon: 'salad', color: '#10b981' },
  non_veg_meal: { label: 'Non-veg meal', unit: 'meals', factor: 2.0, icon: 'meal', color: '#7c3aed' },
};

export function tierOf(co2) {
  if (co2 > 10) return 'high';
  if (co2 >= 2) return 'med';
  return 'low';
}

export function TierPill({ co2 }) {
  const tier = tierOf(co2);
  const map = {
    low: 'bg-emerald-soft text-[#065f46]',
    med: 'bg-amber-soft text-[#92400e]',
    high: 'bg-rose-soft text-[#9f1239]',
  };
  const dot = { low: '#10b981', med: '#f59e0b', high: '#e11d48' };
  const label = { low: 'Low', med: 'Med', high: 'High' };
  return (
    <span className={`pill ${map[tier]}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: dot[tier] }} />
      {label[tier]}
    </span>
  );
}

export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

export function StatCard({ label, icon, value, unit, footer, children, tone = 'default' }) {
  const isMuted = tone === 'muted';
  return (
    <div className={`${isMuted ? 'bg-surface-container-low' : 'bg-surface-container-lowest'} rounded-xl border border-outline-variant/40 p-4 shadow-card flex flex-col justify-between`}>
      <div className="flex items-center justify-between text-on-surface-variant mb-1">
        <span className="muted-label">{label}</span>
        <Icon name={icon} size={17} className="text-outline" />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="tabular font-headline text-[30px] font-bold leading-none text-on-surface">{value}</span>
        {unit && <span className="text-[12px] font-medium text-on-surface-variant">{unit}</span>}
      </div>
      {children || (footer && <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant">{footer}</div>)}
    </div>
  );
}

export function Progress({ pct, tone = 'primary', height = 12 }) {
  const colors = {
    primary: 'bg-primary',
    amber: 'bg-amber',
    rose: 'bg-rose',
    tertiary: 'bg-tertiary-container',
  };
  return (
    <div className="w-full overflow-hidden rounded-full bg-surface-container-high" style={{ height }}>
      <div
        className={`h-full rounded-full transition-all duration-500 ${colors[tone]}`}
        style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }}
      />
    </div>
  );
}

export function SegmentedBar({ segments, height = 12 }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <div className="h-3 w-full rounded-full bg-surface-container-high" />;
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-surface-container-high" style={{ height }}>
      {segments.map((s) => (
        <div
          key={s.key}
          title={`${s.label}: ${s.value.toFixed(2)} kg (${Math.round((s.value / total) * 100)}%)`}
          className="h-full transition-all duration-500"
          style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
        />
      ))}
    </div>
  );
}

export function Toast({ message, tone = 'ok' }) {
  return (
    <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 translate-y-0 opacity-100 transition-all duration-300">
      <div className="flex items-center gap-2 rounded-full bg-inverse-surface px-4 py-2 text-[13px] font-semibold text-inverse-on-surface shadow-raised">
        <Icon name={tone === 'ok' ? 'check' : 'alert'} size={16} className={tone === 'ok' ? 'text-primary-fixed' : 'text-amber'} />
        <span>{message}</span>
      </div>
    </div>
  );
}

export function Skeleton({ h = 16, className = '' }) {
  return <div className={`animate-pulse rounded-md bg-surface-container-high ${className}`} style={{ height: h }} />;
}
