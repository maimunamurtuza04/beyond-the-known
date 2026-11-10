import { useMemo } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useFilters } from '../state/Filters.jsx';
import { Panel, SectionHeader } from '../components/Panel.jsx';
import { Chart } from '../components/Chart.jsx';
import { ErrorState, PageLoading } from '../components/States.jsx';
import { Icon } from '../components/Icons.jsx';
import { FIRE_STOPS, SENSOR_COLORS, maxOf } from '../lib/colors.js';
import {
  fmtCompact,
  fmtInt,
  fmtPct,
  fmtSignedPct,
  MONTH_SHORT,
} from '../lib/format.js';
import {
  FIRE_GRADIENT,
  axisLabel,
  baseOption,
  splitLine,
  tooltipStyle,
} from '../lib/chartTheme.js';

export default function TrendsView({ meta }) {
  const { filters } = useFilters();
  const params = {
    from: filters.from,
    to: filters.to,
    region: filters.region,
    sensor: filters.sensor,
  };
  const { data, loading, error, reload } = useApi(api.trends, params);

  const options = useMemo(() => {
    if (!data) return {};
    const years = data.annual.map((row) => row.year);
    const classes = meta?.intensityClasses || [];

    const annual = baseOption({
      grid: { left: 52, right: 52, top: 44, bottom: 30 },
      legend: { show: true, top: 0, right: 0 },
      xAxis: {
        type: 'category',
        data: years,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } },
        axisTick: { show: false },
        axisLabel: { ...axisLabel },
      },
      yAxis: [
        {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine,
          axisLabel: { ...axisLabel, formatter: (value) => fmtCompact(value) },
        },
        {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { ...axisLabel, formatter: (value) => `${value} MW` },
        },
      ],
      series: [
        {
          name: 'Detections',
          type: 'bar',
          barWidth: '46%',
          itemStyle: {
            borderRadius: [4, 4, 0, 0],
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: FIRE_STOPS.slice(1, 3).map((color, index) => ({ offset: index, color })) },
          },
          data: data.annual.map((row) => row.detections),
        },
        {
          name: 'Harmonized fires',
          type: 'line',
          smooth: 0.25,
          showSymbol: false,
          lineStyle: { width: 1.8, color: '#EF4444' },
          itemStyle: { color: '#EF4444' },
          data: data.annual.map((row) => row.fires),
        },
        {
          name: 'Mean FRP',
          type: 'line',
          yAxisIndex: 1,
          smooth: 0.25,
          showSymbol: false,
          lineStyle: { width: 1.4, color: '#FACC15', type: 'dashed' },
          itemStyle: { color: '#FACC15' },
          data: data.annual.map((row) => row.frp),
        },
      ],
    });

    const intensity = baseOption({
      grid: { left: 52, right: 18, top: 44, bottom: 30 },
      legend: { show: false },
      xAxis: {
        type: 'category',
        data: years,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } },
        axisTick: { show: false },
        axisLabel: { ...axisLabel },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine,
        axisLabel: { ...axisLabel, formatter: (value) => fmtCompact(value) },
      },
      series: classes.map((item) => ({
        name: item.label,
        type: 'bar',
        stack: 'intensity',
        barWidth: '54%',
        itemStyle: { color: item.color },
        emphasis: { focus: 'series' },
        data: data.annual.map((row) => row.classes[item.id] || 0),
      })),
    });

    const regionNames = data.climatology.map((row) => row.name);
    const heatValues = [];
    data.climatology.forEach((row, regionIndex) => {
      row.values.forEach((value, monthIndex) => {
        heatValues.push([monthIndex, regionIndex, value]);
      });
    });
    const heatMax = maxOf(data.climatology.flatMap((row) => row.values)) || 1;

    const heatmap = baseOption({
      grid: { left: 168, right: 18, top: 16, bottom: 58 },
      legend: { show: false },
      tooltip: {
        ...tooltipStyle,
        trigger: 'item',
        formatter: (item) =>
          `<div style="color:#A8A29C;font-size:11px">${regionNames[item.value[1]]} · ${MONTH_SHORT[item.value[0]]}</div>
           <div style="margin-top:4px;font-weight:600">${fmtInt(item.value[2])} detections</div>`,
      },
      xAxis: {
        type: 'category',
        data: MONTH_SHORT,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...axisLabel },
        splitArea: { show: false },
      },
      yAxis: {
        type: 'category',
        data: regionNames,
        inverse: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...axisLabel, fontSize: 10.5 },
      },
      visualMap: {
        min: 0,
        max: heatMax,
        orient: 'horizontal',
        left: 'center',
        bottom: 4,
        itemWidth: 220,
        itemHeight: 8,
        textStyle: { color: '#A8A29C', fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' },
        inRange: { color: ['#1C1714', '#FACC15', '#F59E0B', '#F97316', '#EF4444', '#B91C1C'] },
        text: ['dense', 'quiet'],
      },
      series: [
        {
          name: 'Detections',
          type: 'heatmap',
          data: heatValues,
          itemStyle: { borderColor: '#12100E', borderWidth: 1, borderRadius: 2 },
          emphasis: { itemStyle: { borderColor: '#F5F1EA', borderWidth: 1 } },
        },
      ],
    });

    const sensorTrend = baseOption({
      grid: { left: 52, right: 18, top: 46, bottom: 30 },
      legend: { type: 'scroll', top: 0, left: 0, right: 0, itemWidth: 8, itemHeight: 8, textStyle: { color: '#A8A29C', fontSize: 10.5 }, pageIconColor: '#F97316', pageTextStyle: { color: '#A8A29C' } },
      xAxis: {
        type: 'category',
        data: data.sensorTrend.map((row) => row.year),
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } },
        axisTick: { show: false },
        axisLabel: { ...axisLabel },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine,
        axisLabel: { ...axisLabel, formatter: (value) => fmtCompact(value) },
      },
      series: (meta?.sensors || []).map((sensor) => ({
        name: sensor.short,
        type: 'line',
        smooth: 0.25,
        showSymbol: false,
        lineStyle: { width: 1.6, color: SENSOR_COLORS[sensor.id] },
        itemStyle: { color: SENSOR_COLORS[sensor.id] },
        data: data.sensorTrend.map((row) => row.sensors[sensor.id] || 0),
      })),
    });

    const ranking = data.regionRanking.slice(0, 8);
    const rankingChart = baseOption({
      grid: { left: 168, right: 64, top: 10, bottom: 20 },
      legend: { show: false },
      tooltip: {
        ...tooltipStyle,
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(255,255,255,.03)' } },
        formatter: (items) => {
          const item = items?.[0];
          return `<div style="font-weight:600">${item.name}</div>
            <div style="margin-top:4px;color:#F97316">${fmtInt(item.value)} detections</div>`;
        },
      },
      xAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine,
        axisLabel: { ...axisLabel, formatter: (value) => fmtCompact(value) },
      },
      yAxis: {
        type: 'category',
        inverse: true,
        data: ranking.map((row) => row.name),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { ...axisLabel, fontSize: 10.5 },
      },
      series: [
        {
          type: 'bar',
          data: ranking.map((row) => row.detections),
          barWidth: 11,
          itemStyle: { borderRadius: [0, 3, 3, 0], color: FIRE_GRADIENT },
          label: {
            show: true,
            position: 'right',
            color: '#A8A29C',
            fontSize: 10,
            fontFamily: 'IBM Plex Mono, monospace',
            formatter: (item) => fmtCompact(item.value),
          },
        },
      ],
    });

    return { annual, intensity, heatmap, sensorTrend, rankingChart, heatRows: data.climatology.length };
  }, [data, meta]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data && loading) return <PageLoading />;

  const monthSums = Array(12).fill(0);
  data?.monthly?.forEach((row) => {
    const month = Number(row.period.slice(5, 7)) - 1;
    if (month >= 0) monthSums[month] += row.detections;
  });
  const peakMonthIndex = monthSums.indexOf(Math.max(...monthSums));
  const peakYear = data?.summary?.peakYear;
  const topRegion = data?.regionRanking?.[0];
  const insight = [
    {
      label: 'Peak year',
      value: peakYear ? String(peakYear.year) : '—',
      sub: peakYear ? `${fmtCompact(peakYear.detections)} detections` : '',
      icon: 'trend',
    },
    {
      label: 'Latest year change',
      value: data?.summary?.yoy == null ? '—' : fmtSignedPct(data.summary.yoy),
      sub: data?.summary?.latestYear ? `vs ${data.summary.latestYear - 1}` : '',
      icon: data?.summary?.yoy >= 0 ? 'arrowUp' : 'arrowDown',
    },
    {
      label: 'Season peak',
      value: data?.monthly?.length ? MONTH_SHORT[peakMonthIndex] : '—',
      sub: 'all years combined',
      icon: 'calendar',
    },
    {
      label: 'Most active region',
      value: topRegion?.name || '—',
      sub: topRegion ? `${fmtPct(topRegion.detections / Math.max(1, data.summary.detections), 0)} of detections` : '',
      icon: 'pin',
    },
  ];

  return (
    <div className={`view reveal ${loading ? 'is-loading' : ''}`}>
      <SectionHeader
        kicker="LONG VIEW"
        title="Seven years of fire, in one frame"
        description="Annual totals, intensity composition, and the regional season heatmap. Sensor comparison is shown across all platforms even when a sensor filter is active."
      />

      <div className="insight-grid">
        {insight.map((item) => (
          <article className="insight-card" key={item.label}>
            <span className="insight-icon"><Icon name={item.icon} size={15} /></span>
            <span className="insight-label">{item.label}</span>
            <strong>{item.value}</strong>
            <span className="insight-sub">{item.sub}</span>
          </article>
        ))}
      </div>

      <div className="grid trends-main">
        <Panel
          kicker="YEAR OVER YEAR"
          title="Detections and harmonized fires"
          subtitle="Bars are detections; lines are harmonized fires and mean fire radiative power."
        >
          <Chart option={options.annual} height={324} />
        </Panel>
        <Panel
          kicker="COMPOSITION"
          title="Intensity mix by year"
          subtitle="Each year split into five fire-power classes. Watch the red bands change."
          action={
            <div className="class-legend">
              {(meta?.intensityClasses || []).map((item) => (
                <span key={item.id}><i style={{ background: item.color }} />{item.label}</span>
              ))}
            </div>
          }
        >
          <Chart option={options.intensity} height={324} />
        </Panel>
      </div>

      <Panel
        kicker="REGION × MONTH"
        title="Where each season lives"
        subtitle="Monthly detections per region. The diagonal pattern is the global fire year, with southern regions peaking early."
      >
        <Chart option={options.heatmap} height={Math.max(260, 96 + (options.heatRows || 8) * 30)} />
      </Panel>

      <div className="grid trends-bottom">
        <Panel
          kicker="PLATFORM MIX"
          title="Five satellites, one record"
          subtitle="Detections per platform by year. NOAA-21 enters the record in 2022."
        >
          <Chart option={options.sensorTrend} height={310} />
        </Panel>
        <Panel
          kicker="RANKING"
          title="Regions by detection volume"
          subtitle="Fire is concentrated: a handful of regions carry most of the record."
        >
          <Chart option={options.rankingChart} height={310} />
        </Panel>
      </div>
    </div>
  );
}
