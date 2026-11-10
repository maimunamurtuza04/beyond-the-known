import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

/**
 * Thin ECharts wrapper. Handles resize, disposal and avoids
 * re-applying an identical option on every parent render.
 */
export function Chart({ option, height = 280, className = '', onEvents }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const lastOption = useRef('');
  const optionRef = useRef(option);
  const eventsRef = useRef(onEvents);
  optionRef.current = option;
  eventsRef.current = onEvents;

  useEffect(() => {
    const chart = echarts.init(containerRef.current, null, { renderer: 'canvas' });
    chartRef.current = chart;

    // StrictMode mounts, cleans up, then mounts again. Re-apply the
    // current option and listeners so the fresh instance is never blank.
    if (optionRef.current) {
      chart.setOption(optionRef.current, { notMerge: true });
      lastOption.current = JSON.stringify(optionRef.current);
    }
    if (eventsRef.current) {
      for (const [event, handler] of Object.entries(eventsRef.current)) {
        chart.on(event, handler);
      }
    }

    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
      lastOption.current = '';
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !option) return;
    const serialized = JSON.stringify(option);
    if (serialized === lastOption.current) return;
    lastOption.current = serialized;
    chart.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onEvents) return undefined;
    const entries = Object.entries(onEvents);
    entries.forEach(([event, handler]) => chart.on(event, handler));
    return () => entries.forEach(([event, handler]) => chart.off(event, handler));
  }, [onEvents]);

  return (
    <div
      ref={containerRef}
      className={`chart ${className}`}
      style={{ height }}
      role="img"
      aria-label="Data chart"
    />
  );
}
