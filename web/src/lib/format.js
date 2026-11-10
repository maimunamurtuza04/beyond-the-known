const integer = new Intl.NumberFormat('en-US');
const compact = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function fmtInt(value) {
  return integer.format(Math.round(value || 0));
}

export function fmtCompact(value) {
  return compact.format(value || 0);
}

export function fmtPct(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  return `${(value * 100).toFixed(digits)}%`;
}

export function fmtSignedPct(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(digits)}%`;
}

export function fmtNumber(value, digits = 1) {
  if (value == null || Number.isNaN(value)) return '—';
  return Number(value).toFixed(digits);
}

export function fmtDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
    ...options,
  });
}

export function fmtShortDate(value) {
  if (!value) return '—';
  const date = new Date(`${value.slice(0, 10)}T00:00:00Z`);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dayOfYear(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / 86400000) + 1;
}

export function dateFromDayOfYear(year, doy) {
  return new Date(Date.UTC(year, 0, doy)).toISOString().slice(0, 10);
}
