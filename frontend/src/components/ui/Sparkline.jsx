// Minimal SVG sparkline — used for live series (grid intensity, event rate,
// latency) so the real-time widgets need no charting dependency.

export default function Sparkline({
  values = [],
  height = 34,
  stroke = 'rgb(var(--primary))',
  fill = 'rgb(var(--primary) / 0.14)',
  className = '',
  strokeWidth = 1.8,
  suffix,
}) {
  const series = values.filter((v) => Number.isFinite(v));
  if (series.length < 2) {
    return (
      <div className={`flex items-center text-[11px] text-outline ${className}`} style={{ height }}>
        collecting live samples…
      </div>
    );
  }

  const width = 100;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;

  const points = series.map((value, i) => {
    const x = (i / (series.length - 1)) * width;
    const y = height - ((value - min) / span) * (height - 6) - 3;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const line = `M${points.join(' L')}`;
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <div className={className}>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
        <path d={area} fill={fill} stroke="none" />
        <path d={line} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {suffix && <div className="tabular mt-0.5 text-right text-[10px] text-outline">{suffix}</div>}
    </div>
  );
}
