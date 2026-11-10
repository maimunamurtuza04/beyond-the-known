import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useFilters } from '../state/Filters.jsx';
import { Panel, SectionHeader } from '../components/Panel.jsx';
import { Chart } from '../components/Chart.jsx';
import { DayStrip, MonthDayHeatmap, YearMonthHeatmap } from '../components/CalendarHeat.jsx';
import { ErrorState, PageLoading } from '../components/States.jsx';
import { Icon } from '../components/Icons.jsx';
import { REGION_COLORS, maxOf } from '../lib/colors.js';
import { fmtCompact, fmtDate, fmtInt, fmtNumber, fmtPct, MONTH_SHORT } from '../lib/format.js';
import { areaGradient, axisLabel, baseOption, splitLine, tooltipStyle } from '../lib/chartTheme.js';

function doyToLabel(value) {
  const date = new Date(Date.UTC(2023, 0, Math.max(1, Math.round(value))));
  return `${MONTH_SHORT[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

function doyToMonth(value) {
  const date = new Date(Date.UTC(2023, 0, Math.max(1, Math.round(value))));
  return MONTH_SHORT[date.getUTCMonth()];
}

export default function CalendarView({ meta }) {
  const { filters } = useFilters();
  const years = meta?.years || [];
  const defaultYear = years[years.length - 1] || 2025;
  const [year, setYear] = useState(defaultYear);

  const params = {
    year,
    region: filters.region,
    sensor: filters.sensor,
  };
  const { data, loading, error, reload } = useApi(api.calendar, params);

  const options = useMemo(() => {
    if (!data) return {};
    const peak = data.climatology.reduce(
      (best, row) => (!best || row.detections > best.detections ? row : best),
      null,
    );

    const cycle = baseOption({
      grid: { left: 52, right: 18, top: 30, bottom: 30 },
      legend: { show: false },
      tooltip: {
        ...tooltipStyle,
        trigger: 'axis',
        formatter: (items) => {
          const item = items?.[0];
          if (!item) return '';
          const doy = Math.round(item.value[0]);
          return `<div style="color:#A8A29C;font-size:11px">${doyToLabel(doy)}</div>
            <div style="margin-top:4px;font-weight:600">${fmtInt(item.value[1])} detections / day</div>`;
        },
      },
      xAxis: {
        type: 'value',
        min: 1,
        max: 366,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { ...axisLabel, formatter: (value) => doyToMonth(value) },
        splitNumber: 8,
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine,
        axisLabel: { ...axisLabel, formatter: (value) => fmtCompact(value) },
      },
      series: [
        {
          name: 'Detections',
          type: 'line',
          smooth: 0.3,
          showSymbol: false,
          lineStyle: { width: 2, color: '#F97316' },
          areaStyle: { color: areaGradient('#F97316', 0.5, 0.02) },
          data: data.climatology.map((row) => [row.doy, row.detections]),
          markPoint: peak
            ? {
                symbol: 'circle',
                symbolSize: 7,
                itemStyle: { color: '#EF4444', borderColor: '#0A0908', borderWidth: 2 },
                label: {
                  show: true,
                  formatter: 'peak',
                  position: 'top',
                  color: '#F5F1EA',
                  fontSize: 10,
                  fontFamily: 'IBM Plex Mono, monospace',
                  backgroundColor: 'rgba(20,16,13,.9)',
                  padding: [3, 6],
                  borderRadius: 4,
                },
                data: [{ coord: [peak.doy, peak.detections] }],
              }
            : undefined,
        },
      ],
    });

    const cycles = baseOption({
      grid: { left: 52, right: 18, top: 58, bottom: 30 },
      legend: {
        type: 'scroll',
        top: 0,
        left: 0,
        right: 0,
        itemWidth: 8,
        itemHeight: 8,
        itemGap: 12,
        textStyle: { color: '#A8A29C', fontSize: 10.5 },
        pageIconColor: '#F97316',
        pageIconInactiveColor: '#57534E',
        pageTextStyle: { color: '#A8A29C' },
      },
      tooltip: {
        ...tooltipStyle,
        trigger: 'axis',
        formatter: (items) => {
          if (!items?.length) return '';
          const doy = Math.round(items[0].value[0]);
          const rows = items
            .slice()
            .sort((a, b) => b.value[1] - a.value[1])
            .map(
              (item) =>
                `<div style="display:flex;justify-content:space-between;gap:16px;margin-top:4px">
                  <span style="color:${item.color}">● ${item.seriesName}</span>
                  <span style="font-family:'IBM Plex Mono',monospace">${fmtNumber(item.value[1])}</span>
                </div>`,
            )
            .join('');
          return `<div style="color:#A8A29C;font-size:11px">${doyToLabel(doy)}</div>${rows}`;
        },
      },
      xAxis: {
        type: 'value',
        min: 1,
        max: 366,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { ...axisLabel, formatter: (value) => doyToMonth(value) },
        splitNumber: 8,
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine,
        axisLabel: { ...axisLabel, formatter: (value) => fmtNumber(value, 0) },
      },
      series: data.cycles.map((region, index) => ({
        name: region.name,
        type: 'line',
        smooth: 0.3,
        showSymbol: false,
        lineStyle: { width: 1.6, color: REGION_COLORS[index % REGION_COLORS.length], opacity: 0.9 },
        emphasis: { focus: 'series', lineStyle: { width: 2.4 } },
        data: region.values.map((value, doyIndex) => [doyIndex + 1, value]),
      })),
    });

    return { cycle, cycles };
  }, [data]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data && loading) return <PageLoading />;

  const ymMax = maxOf((data?.yearsMonths || []).map((cell) => cell.detections)) || 1;
  const mdMax = maxOf((data?.monthDay || []).map((cell) => cell.detections)) || 1;
  const peakMonth = data?.monthly?.reduce(
    (best, row) => (!best || row.detections > best.detections ? row : best),
    null,
  );

  return (
    <div className={`view reveal ${loading ? 'is-loading' : ''}`}>
      <SectionHeader
        kicker="SEASONAL VIEW"
        title="Every month, every day, every cycle"
        description="Read the record at three scales: a single year day by day, months across the full record, and the average shape of a fire season."
        action={
          <div className="year-picker">
            <span className="filter-label">Year</span>
            <div className="year-pills">
              {(data?.years || years).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={value === year ? 'active' : ''}
                  onClick={() => setYear(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div className="year-summary">
        <div><span>Detections</span><strong>{fmtCompact(data?.totals?.detections)}</strong></div>
        <div><span>Harmonized fires</span><strong>{fmtCompact(data?.totals?.fires)}</strong></div>
        <div><span>Peak day</span><strong>{data?.peak ? fmtDate(data.peak.date, { year: 'numeric' }) : '—'}</strong></div>
        <div><span>Peak month</span><strong>{peakMonth ? `${MONTH_SHORT[peakMonth.month - 1]} · ${fmtCompact(peakMonth.detections)}` : '—'}</strong></div>
        <div><span>Flagged episodes</span><strong>{fmtInt(data?.totals?.anomalies)}</strong></div>
        <div className="year-summary-note"><Icon name="info" size={14} /> UTC days · selected filters apply</div>
      </div>

      <Panel
        kicker={`${year} · DAY BY DAY`}
        title="The year strip"
        subtitle="Each cell is one day. Colour scales with how many detections were recorded, not the strength of any single fire. Small rings mark flagged days."
        action={<span className="mono muted">{fmtPct((data?.totals?.activeDays || 0) / 365, 0)} active</span>}
      >
        {data && <DayStrip year={data.year} days={data.days} />}
      </Panel>

      <div className="grid calendar-grid">
        <Panel
          kicker="MONTHS ACROSS YEARS"
          title="Which seasons ran hot"
          subtitle="Monthly detections for every year in the record. Click a row or cell to inspect that year."
        >
          {data && (
            <YearMonthHeatmap
              years={data.years}
              cells={data.yearsMonths}
              selectedYear={data.year}
              onSelectYear={setYear}
            />
          )}
          <div className="heat-scale">
            <span>0</span>
            <div className="heat-scale-bar" />
            <span>{fmtCompact(ymMax)} detections</span>
          </div>
        </Panel>

        <Panel
          kicker="DAYS ACROSS MONTHS"
          title="The shape of a calendar"
          subtitle="Average detections per calendar day across every year. This is the seasonal fingerprint."
        >
          {data && <MonthDayHeatmap cells={data.monthDay} max={mdMax} />}
        </Panel>
      </div>

      <div className="grid calendar-cycles">
        <Panel
          kicker="ANNUAL CYCLE"
          title="The average fire year"
          subtitle="Detections per day, averaged across all years and smoothed over nine days."
        >
          <Chart option={options.cycle} height={300} />
        </Panel>

        <Panel
          kicker="REGIONAL CYCLES"
          title="Seasons do not line up"
          subtitle="The same average day-of-year curve, split by region. Note the southern-hemisphere offset."
        >
          <Chart option={options.cycles} height={334} />
        </Panel>
      </div>
    </div>
  );
}
