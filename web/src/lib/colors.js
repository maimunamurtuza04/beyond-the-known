/**
 * The only scale that carries meaning in this UI: fire intensity.
 * Yellow (least intense) → orange → deep red (most intense).
 */
export const FIRE_STOPS = ['#FACC15', '#F59E0B', '#F97316', '#EF4444', '#B91C1C'];

export const EMPTY_CELL = 'rgba(255, 255, 255, 0.045)';

export const SEVERITY_COLORS = {
  watch: '#FACC15',
  advisory: '#F97316',
  critical: '#EF4444',
};

/** Non-fire data (sensors, categories) uses sand, so colour stays meaningful. */
export const SAND_STOPS = ['#EAD7BF', '#D3B595', '#B8916A', '#8F6A4A', '#644832'];

export const SENSOR_COLORS = {
  terra: '#EAD7BF',
  aqua: '#D3B595',
  snpp: '#F4A261',
  noaa20: '#B8916A',
  noaa21: '#8F6A4A',
};

export const REGION_COLORS = [
  '#FACC15',
  '#F59E0B',
  '#F97316',
  '#EF4444',
  '#FCD34D',
  '#D97706',
  '#B91C1C',
  '#A16207',
];

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function withAlpha(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Interpolate across an arbitrary list of hex stops. */
export function mixStops(stops, t) {
  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const from = hexToRgb(stops[index]);
  const to = hexToRgb(stops[index + 1]);
  const rgb = from.map((channel, i) => Math.round(channel + (to[i] - channel) * local));
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

/** Fire colour for a normalised 0–1 value. */
export function fireColor(t) {
  return mixStops(FIRE_STOPS, t);
}

/** Heatmap cell colour; perceptual curve keeps small values visible. */
export function heatColor(value, maxValue, stops = FIRE_STOPS) {
  if (!value || value <= 0 || !maxValue) return EMPTY_CELL;
  const t = Math.pow(Math.min(1, value / maxValue), 0.55);
  return mixStops(stops, 0.08 + t * 0.92);
}

export function maxOf(values) {
  return values.reduce((max, value) => (value != null && value > max ? value : max), 0);
}

export function severityColor(severity) {
  return SEVERITY_COLORS[severity] || SEVERITY_COLORS.watch;
}
