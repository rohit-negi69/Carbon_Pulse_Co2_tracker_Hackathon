// Shared presentational primitives for the CarbonPulse design system.
// Everything here is dependency-free: motion is CSS keyframes from
// tailwind.config.js plus requestAnimationFrame for the numerals.
import { useEffect, useRef, useState } from 'react';

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
  sparkles: 'M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8zM5 2l.7 1.8L7.5 4.5l-1.8.7L5 7l-.7-1.8L2.5 4.5l1.8-.7z',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM21 21l-4.3-4.3',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  reset: 'M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6',
  close: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  menu: 'M3 6h18M3 12h18M3 18h18',
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
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z',
  command: 'M18 3a3 3 0 0 0-3 3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 0 0 0-6Z',
  arrowRight: 'M5 12h14M13 6l6 6-6 6',
  arrowUpRight: 'M7 17 17 7M8 7h9v9',
  arrowDownRight: 'M7 7l10 10M17 8v9H8',
  layers: 'M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  database: 'M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3ZM3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H5a2 2 0 0 0 0 4h2M17 6h2a2 2 0 0 1 0 4h-2',
  rocket: 'M5 13c-1.5 1.5-2 5-2 5s3.5-.5 5-2M14.5 4.5C16.5 2.5 21 2 21 2s.5 4.5-1.5 6.5L13 15l-4-4zM9 11l-4 1 1-4M13 15l-1 4 4-1',
  wifi: 'M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M12 20h.01M2 9a15 15 0 0 1 20 0',
  cpu: 'M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3M6 6h12v12H6zM10 10h4v4h-4z',
  clock: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 6v6l4 2',
  filter: 'M22 3H2l8 9.5V19l4 2v-8.5z',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20ZM12 16v-4M12 8h.01',
  flower: 'M12 7.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5ZM12 21.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5ZM7.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM21.5 12a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0ZM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  train: 'M6 3h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM4 10h16M9 19l-2 3M15 19l2 3M9 13h.01M15 13h.01M7 19h10',
  bike: 'M6 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM18 19a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM9 16l2.5-8M6 16l1.5-5h6l2.5 5M14 8h3M11.5 8 12 7',
  route: 'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM8 17h6a4 4 0 0 0 0-8H9a3 3 0 0 1 0-6',
  play: 'M6 3l14 9-14 9z',
  stop: 'M6 6h12v12H6z',
};

export function Icon({ name, size = 16, className = '', strokeWidth = 1.9, style }) {
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
      style={style}
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

export const TIER_STYLE = {
  low: { chip: 'bg-emerald-soft text-emerald', dot: '#10b981', label: 'Low' },
  med: { chip: 'bg-amber-soft text-amber', dot: '#f59e0b', label: 'Med' },
  high: { chip: 'bg-rose-soft text-rose', dot: '#e11d48', label: 'High' },
};

export function TierPill({ co2 }) {
  const t = tierOf(co2);
  const s = TIER_STYLE[t];
  return (
    <span className={`pill ${s.chip}`}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.dot }} />
      {s.label}
    </span>
  );
}

/** Animated integer/decimal counter. Respects prefers-reduced-motion. */
export function CountUp({ value = 0, decimals = 0, duration = 900, className = '' }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const raf = useRef(0);

  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    const a = from.current;
    const b = Number(value) || 0;
    if (reduce || a === b) {
      setShown(b);
      from.current = b;
      return undefined;
    }
    const tick = (now) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = a + (b - a) * eased;
      setShown(v);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else from.current = b;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);

  const text = Number(shown).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return <span className={`tabular ${className}`}>{text}</span>;
}

export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`card ${className}`} {...rest}>
      {children}
    </div>
  );
}

/** Card with a soft gradient wash in the corner — used for hero/feature panels. */
export function AuroraCard({ className = '', children, tone = 'primary', ...rest }) {
  const wash = {
    primary: 'from-primary/12',
    tertiary: 'from-tertiary/12',
    amber: 'from-amber/12',
    rose: 'from-rose/12',
  }[tone];
  return (
    <div className={`card overflow-hidden ${className}`} {...rest}>
      <div
        aria-hidden
        className={`pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-gradient-to-br ${wash} to-transparent blur-2xl`}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  icon,
  value,
  decimals = 0,
  unit,
  footer,
  children,
  tone = 'default',
  accent,
  delay = 0,
}) {
  const isMuted = tone === 'muted';
  return (
    <div
      className={`group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-outline-variant/50 p-4 shadow-card transition-all duration-300 ease-spring hover:-translate-y-0.5 hover:shadow-raised animate-fade-up ${
        isMuted ? 'bg-surface-container-low' : 'bg-surface-container-lowest'
      }`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-24 h-32 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        style={{ background: `linear-gradient(180deg, ${accent || 'rgb(var(--primary))'}33, transparent)` }}
      />
      <div className="relative flex items-center justify-between text-on-surface-variant">
        <span className="muted-label">{label}</span>
        <span
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors duration-300"
          style={{ background: `${accent || 'rgb(var(--primary))'}1f`, color: accent || 'rgb(var(--primary))' }}
        >
          <Icon name={icon} size={15} />
        </span>
      </div>
      <div className="relative mt-2 flex items-baseline gap-1.5">
        <span className="display-num text-[30px] text-on-surface">
          {/* Numbers animate; labels like "Sat" render as-is. */}
          {typeof value === 'number' && Number.isFinite(value) ? <CountUp value={value} decimals={decimals} /> : value}
        </span>
        {unit && <span className="text-[12px] font-medium text-on-surface-variant">{unit}</span>}
      </div>
      {children ||
        (footer && (
          <div className="relative mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-on-surface-variant">{footer}</div>
        ))}
    </div>
  );
}

/** SVG progress ring. `pct` may exceed 100 — the overflow arc switches to `over` tone. */
let gaugeSeq = 0;

export function RadialGauge({
  pct = 0,
  size = 168,
  stroke = 13,
  label,
  sublabel,
  tone = 'primary',
  over = false,
  center,
}) {
  // SVG paint ids must be URL-safe — derive one rather than using the label.
  const [gid] = useState(() => `rg-${(gaugeSeq += 1)}`);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(pct, 100));
  const dash = (clamped / 100) * circ;
  const strokeColor = over ? 'rgb(var(--rose))' : tone === 'amber' ? 'rgb(var(--amber))' : 'rgb(var(--primary))';

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={strokeColor} stopOpacity="0.55" />
            <stop offset="100%" stopColor={strokeColor} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--surface-container-high))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray 0.9s cubic-bezier(0.22,1,0.36,1)' }}
        />
        {over && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r - stroke - 5}
            fill="none"
            stroke="rgb(var(--rose))"
            strokeOpacity="0.35"
            strokeWidth={3}
            strokeDasharray="3 7"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {center || (
          <>
            <span className="display-num text-[34px]" style={{ color: strokeColor }}>
              <CountUp value={pct} />%
            </span>
            {label && <span className="muted-label mt-1.5">{label}</span>}
            {sublabel && <span className="mt-0.5 text-[11px] text-on-surface-variant">{sublabel}</span>}
          </>
        )}
      </div>
    </div>
  );
}

/** Gradient area sparkline — no chart library needed. */
export function AreaSparkline({ points = [], height = 56, color = 'rgb(var(--primary))', className = '' }) {
  if (points.length < 2) return <div className={className} style={{ height }} />;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || 1;
  const w = 100;
  const coords = points.map((p, i) => [(i / (points.length - 1)) * w, height - ((p - min) / span) * (height - 8) - 4]);
  const line = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `${line} L${w},${height} L0,${height} Z`;
  const id = `sp-${Math.round(color.length * 7 + points.length)}`;

  return (
    <svg className={className} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" style={{ height, width: '100%' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="1.8"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        style={{ strokeDasharray: 1, strokeDashoffset: 1, pathLength: 1, animation: 'draw-line 1.4s cubic-bezier(0.22,1,0.36,1) forwards' }}
      />
      <circle cx={coords[coords.length - 1][0]} cy={coords[coords.length - 1][1]} r="2.4" fill={color} />
    </svg>
  );
}

export function Progress({ pct, tone = 'primary', height = 12, glow = false }) {
  const colors = {
    primary: 'bg-sheen',
    amber: 'bg-amber',
    rose: 'bg-rose',
    tertiary: 'bg-tertiary-container',
  };
  return (
    <div className="w-full overflow-hidden rounded-full bg-surface-container-high" style={{ height }}>
      <div
        className={`h-full rounded-full transition-all duration-700 ease-spring ${colors[tone]} ${glow ? 'shadow-glow-sm' : ''}`}
        style={{ width: `${Math.max(0, Math.min(pct, 100))}%` }}
      />
    </div>
  );
}

export function SegmentedBar({ segments, height = 12 }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return <div className="w-full rounded-full bg-surface-container-high" style={{ height }} />;
  return (
    <div className="flex w-full overflow-hidden rounded-full bg-surface-container-high" style={{ height }}>
      {segments.map((s) => (
        <div
          key={s.key}
          title={`${s.label}: ${s.value.toFixed(2)} kg (${Math.round((s.value / total) * 100)}%)`}
          className="h-full origin-left animate-bar-grow transition-all duration-500"
          style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
        />
      ))}
    </div>
  );
}

export function Badge({ children, tone = 'neutral', className = '' }) {
  const tones = {
    neutral: 'bg-surface-container-high text-on-surface-variant',
    primary: 'bg-primary/12 text-primary',
    live: 'bg-emerald-soft text-emerald',
    warn: 'bg-amber-soft text-amber',
    danger: 'bg-rose-soft text-rose',
    info: 'bg-tertiary/12 text-tertiary',
  };
  return <span className={`pill ${tones[tone]} ${className}`}>{children}</span>;
}

/** Pulsing dot used for live/connected indicators. */
export function LiveDot({ tone = 'primary', size = 8, className = '' }) {
  const color = { primary: 'rgb(var(--primary))', amber: 'rgb(var(--amber))', rose: 'rgb(var(--rose))' }[tone];
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size * 2, height: size * 2 }}>
      <span className="absolute inset-0 animate-pulse-ring rounded-full" style={{ background: color, opacity: 0.5 }} />
      <span className="relative rounded-full" style={{ width: size, height: size, background: color }} />
    </span>
  );
}

export function SectionHeading({ eyebrow, title, subtitle, actions, className = '' }) {
  return (
    <div className={`flex flex-col justify-between gap-3 md:flex-row md:items-end ${className}`}>
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1.5 flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.11em] text-on-surface-variant">
            {eyebrow}
          </div>
        )}
        <h2 className="font-headline text-[22px] font-bold tracking-[-0.02em] text-on-surface md:text-[25px]">{title}</h2>
        {subtitle && <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-on-surface-variant">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon = 'flower', title, body, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}>
      <div className="relative mb-4">
        <div className="absolute inset-0 animate-breathe rounded-full bg-primary/25 blur-xl" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary">
          <Icon name={icon} size={24} />
        </div>
      </div>
      <h3 className="font-headline text-[16px] font-semibold text-on-surface">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-[12.5px] leading-relaxed text-on-surface-variant">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Toast({ message, tone = 'ok', onClose }) {
  return (
    <div className="animate-scale-in flex items-center gap-2 rounded-2xl border border-outline-variant/40 bg-inverse-surface px-4 py-2.5 text-[13px] font-semibold text-inverse-on-surface shadow-pop">
      <Icon
        name={tone === 'ok' ? 'check' : tone === 'warn' ? 'alert' : 'info'}
        size={16}
        className={tone === 'ok' ? 'text-primary-fixed' : tone === 'warn' ? 'text-amber' : 'text-tertiary'}
      />
      <span className="max-w-[70vw] truncate">{message}</span>
      {onClose && (
        <button onClick={onClose} className="ml-1 opacity-60 transition-opacity hover:opacity-100" aria-label="Dismiss">
          <Icon name="close" size={13} />
        </button>
      )}
    </div>
  );
}

export function ToastStack({ items = [], onDismiss }) {
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <Toast message={t.message} tone={t.tone} onClose={() => onDismiss?.(t.id)} />
        </div>
      ))}
    </div>
  );
}

export function Skeleton({ h = 16, className = '' }) {
  return <div className={`shimmer rounded-lg bg-surface-container-high ${className}`} style={{ height: h }} />;
}

/** Fade + slide shell for overlays (drawers and modals share it). */
export function Modal({ open, onClose, children, className = '', align = 'center', labelledBy }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const position = {
    center: 'items-center justify-center p-4',
    right: 'items-stretch justify-end',
    top: 'items-start justify-center p-4 pt-[12vh]',
  }[align];

  return (
    <div className={`fixed inset-0 z-[80] flex ${position}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
      <button
        aria-label="Close overlay"
        onClick={onClose}
        className="absolute inset-0 animate-fade-in cursor-default bg-inverse-surface/45 backdrop-blur-sm"
      />
      <div className={`relative animate-scale-in ${className}`}>{children}</div>
    </div>
  );
}

export function KeyValue({ label, value, mono = false, className = '' }) {
  return (
    <div className={className}>
      <div className="muted-label">{label}</div>
      <div className={`mt-0.5 text-[13.5px] font-semibold text-on-surface ${mono ? 'font-mono' : 'tabular'}`}>{value}</div>
    </div>
  );
}
