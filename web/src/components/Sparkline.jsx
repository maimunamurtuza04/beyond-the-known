import { useId } from 'react';

export function Sparkline({ values = [], color = '#F97316', height = 34 }) {
  const id = useId().replace(/:/g, '');
  if (!values.length) return <div className="sparkline-empty" />;
  const width = 120;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / Math.max(1, values.length - 1);
  const points = values.map((value, index) => {
    const x = index * step;
    const y = height - 3 - ((value - min) / span) * (height - 8);
    return [x, y];
  });
  const line = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `M0,${height} L${line.replace(/ /g, ' L')} L${width},${height} Z`;

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.38" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#spark-${id})`} stroke="none" />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
