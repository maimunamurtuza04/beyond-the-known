import { fireColor, withAlpha } from './colors.js';

export const CHART_TEXT = '#A8A29C';
export const CHART_DIM = '#6F6862';
export const GRID_LINE = 'rgba(255, 255, 255, 0.055)';
export const SURFACE = '#12100E';

export const tooltipStyle = {
  backgroundColor: 'rgba(20, 16, 13, 0.96)',
  borderColor: 'rgba(249, 115, 22, 0.28)',
  borderWidth: 1,
  padding: [10, 12],
  textStyle: { color: '#F5F1EA', fontSize: 12, fontFamily: 'Inter, sans-serif' },
  extraCssText: 'backdrop-filter: blur(8px); border-radius: 10px; box-shadow: 0 12px 32px rgba(0,0,0,.45);',
};

export const axisLabel = {
  color: CHART_TEXT,
  fontSize: 10.5,
  fontFamily: 'IBM Plex Mono, monospace',
};

export const splitLine = {
  lineStyle: { color: GRID_LINE, type: 'dashed' },
};

export function baseOption({ grid, legend, ...rest } = {}) {
  return {
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'Inter, sans-serif', color: CHART_TEXT },
    animationDuration: 550,
    animationEasing: 'cubicOut',
    grid: { left: 46, right: 18, top: 28, bottom: 34, containLabel: false, ...grid },
    legend: legend
      ? {
          top: 0,
          right: 0,
          icon: 'roundRect',
          itemWidth: 8,
          itemHeight: 8,
          itemGap: 14,
          textStyle: { color: CHART_TEXT, fontSize: 11 },
          ...legend,
        }
      : undefined,
    tooltip: {
      trigger: 'axis',
      ...tooltipStyle,
      axisPointer: { type: 'line', lineStyle: { color: 'rgba(249,115,22,.35)' } },
    },
    ...rest,
  };
}

/** A soft vertical gradient for area charts. */
export function areaGradient(hex, top = 0.55, bottom = 0.02) {
  return {
    type: 'linear',
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: withAlpha(hex, top) },
      { offset: 1, color: withAlpha(hex, bottom) },
    ],
  };
}

export const FIRE_GRADIENT = {
  type: 'linear',
  x: 0,
  y: 0,
  x2: 1,
  y2: 0,
  colorStops: [
    { offset: 0, color: fireColor(0.05) },
    { offset: 0.45, color: fireColor(0.45) },
    { offset: 0.75, color: fireColor(0.75) },
    { offset: 1, color: fireColor(1) },
  ],
};
