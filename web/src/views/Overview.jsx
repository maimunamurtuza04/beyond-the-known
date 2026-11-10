import { useMemo } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useFilters } from '../state/Filters.jsx';
import { Panel } from '../components/Panel.jsx';
import { StatCard } from '../components/StatCard.jsx';
import { Chart } from '../components/Chart.jsx';
import { IntensityLegend } from '../components/IntensityLegend.jsx';
import { ErrorState, PageLoading, EmptyState } from '../components/States.jsx';
import { Icon } from '../components/Icons.jsx';
import {
  SENSOR_COLORS,
  maxOf,
  severityColor,
} from '../lib/colors.js';
import {
  fmtCompact,
  fmtDate,
  fmtInt,
  fmtNumber,
  fmtPct,
  fmtSignedPct,
  MONTH_SHORT,
} from '../lib/format.js';
import {
  axisLabel,
  baseOption,
  splitLine,
  tooltipStyle,
} from '../lib/chartTheme.js';

function shortMonth(period) {
  const [year, month] = period.split('-');
  return `${MONTH_SHORT[Number(month) - 1]} ${year.slice(2)}`;
}

export default function Overview({ meta }) {
  const { filters, update } = useFilters();
  const params = {
    from: filters.from,
    to: filters.to,
    region: filters.region,
    sensor: filters.sensor,
  };
  const { data, loading, error, reload } = useApi(api.overview, params);

  const chartOptions = useMemo(() => {
    if (!data) return {};
    const months = data.monthly;
    const step = Math.max(0, Math.floor(months.length / 9));
    const classes = data.intensityMix;

    const trend = baseOption({
      grid: { left: 52, right: 16, top: 34, bottom: 30 },
      legend: { show: false },
      tooltip: {
        ...tooltipStyle,
        trigger: 'axis',
        axisPointer: { type: 'line', lineStyle: { color: 'rgba(249,115,22,.3)' } },
        formatter: (items) => {
          if (!items?.length) return '';
          const total = items.reduce((sum, item) => sum + (item.value || 0), 0);
          const lines = items
            .slice()
            .reverse()
            .map(
              (item) =>
                `<div style="display:flex;justify-content:space-between;gap:18px;margin-top:4px">
                  <span style="color:${item.color}">● ${item.seriesName}</span>
                  <span style="font-family:'IBM Plex Mono',monospace">${fmtInt(item.value)}</span>
                </div>`,
            )
            .join('');
          return `<div style="font-size:11px;color:#A8A29C;letter-spacing:.08em;text-transform:uppercase">${items[0].axisValueLabel}</div>
            <div style="margin-top:6px;font-weight:600">${fmtInt(total)} detections</div>${lines}`;
        },
      },
      xAxis: {
        type: 'category',
        data: months.map((month) => month.period),
        boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } },
        axisTick: { show: false },
        axisLabel: {
          ...axisLabel,
          interval: step,
          formatter: (value) => shortMonth(value),
        },
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
        type: 'line',
        stack: 'total',
        smooth: 0.22,
        showSymbol: false,
        symbol: 'none',
        lineStyle: { width: 0 },
        areaStyle: { color: item.color, opacity: 0.88 },
        emphasis: { focus: 'series' },
        data: months.map((month) => month.classes[item.id] || 0),
      })),
    });

    const donut = {
      backgroundColor: 'transparent',
      animationDuration: 600,
      tooltip: {
        ...tooltipStyle,
        trigger: 'item',
        formatter: (item) =>
          `<div style="font-size:12px">${item.name}</div>
           <div style="margin-top:4px;color:${item.color};font-weight:600">${fmtInt(item.value)} · ${fmtPct(
             item.value / Math.max(1, data.kpis.detections),
             1,
           )}</div>`,
      },
      series: [
        {
          type: 'pie',
          radius: ['63%', '86%'],
          center: ['50%', '50%'],
          padAngle: 2,
          itemStyle: { borderRadius: 5, borderColor: '#12100E', borderWidth: 2 },
          label: { show: false },
          labelLine: { show: false },
          data: data.sensorMix.map((sensor) => ({
            name: sensor.short,
            value: sensor.count,
            itemStyle: { color: SENSOR_COLORS[sensor.id] || '#B8916A' },
          })),
        },
      ],
    };

    return { trend, donut };
  }, [data]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data && loading) return <PageLoading />;
  if (!data) return <EmptyState title="No overview available" />;

  const { kpis, monthly, topRegions, recentAnomalies, calibration, confidence } = data;
  const sparkDetections = monthly.slice(-24).map((month) => month.detections);
  const sparkFires = monthly.slice(-24).map((month) => month.fires);
  const sparkFrp = monthly.slice(-24).map((month) => month.frp);
  const calibrationDeg = Math.round((calibration.matchRate || 0) * 360);
  const regionMax = maxOf(topRegions.map((region) => region.detections)) || 1;
  const selectedRegion = filters.region === 'all' ? null : topRegions[0];

  return (
    <div className={`view reveal ${loading ? 'is-loading' : ''}`}>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> MODIS + VIIRS · HARMONIZED FIRE RECORD</div>
          <h2>
            One planet.<br />
            <span className="fire-text">One fire record.</span>
          </h2>
          <p>
            Terra, Aqua and three VIIRS platforms reconciled into a single daily record.
            Colour carries intensity: pale yellow for low fire radiative power, deep red for extreme.
          </p>
          <div className="hero-facts">
            <span><strong>{meta?.years?.length || '—'}</strong> years</span>
            <span><strong>{meta?.sensors?.length || 5}</strong> satellites</span>
            <span><strong>{meta?.regions?.length || 8}</strong> regions</span>
          </div>
        </div>
        <div className="hero-side">
          <div className="hero-legend">
            <IntensityLegend classes={meta?.intensityClasses || []} />
          </div>
          <div className="hero-note">
            <Icon name="info" size={14} />
            <span>
              {meta?.mock
                ? 'Illustrative record — every number is synthetic until you plug in your cleaned data.'
                : 'Connected to your cleaned fire record.'}
            </span>
          </div>
        </div>
      </section>

      <div className="stat-grid">
        <StatCard
          label="Detections"
          value={fmtCompact(kpis.detections)}
          delta={kpis.detectionsDelta}
          hint={`${fmtPct(kpis.coverage, 0)} day coverage`}
          spark={sparkDetections}
          icon="spark"
        />
        <StatCard
          label="Harmonized fires"
          value={fmtCompact(kpis.fires)}
          delta={kpis.firesDelta}
          hint="duplicates removed"
          spark={sparkFires}
          sparkColor="#EF4444"
          icon="flame"
        />
        <StatCard
          label="Mean intensity"
          value={fmtNumber(kpis.meanFrp)}
          unit="MW"
          delta={kpis.frpDelta}
          hint="fire radiative power"
          spark={sparkFrp}
          sparkColor="#FACC15"
          icon="target"
        />
        <StatCard
          label="High confidence"
          value={fmtPct(kpis.highConfidenceShare, 0)}
          delta={kpis.highConfidenceDelta}
          hint="of weighted detections"
          spark={monthly.slice(-24).map((month) => month.confidence)}
          sparkColor="#EAD7BF"
          icon="check"
        />
        <StatCard
          label="Anomaly episodes"
          value={fmtInt(kpis.anomalies)}
          delta={kpis.anomalyDelta}
          hint="out of seasonal range"
          icon="alert"
        />
        <StatCard
          label="Active days"
          value={fmtInt(kpis.activeDays)}
          hint={`${kpis.regionsActive} regions reporting`}
          icon="calendar"
        />
      </div>

      <div className="grid overview-main">
        <Panel
          kicker="THE LONG ARC"
          title="Detections, coloured by intensity"
          subtitle="Monthly totals, stacked from low to extreme fire radiative power."
          action={<div className="class-legend">
            {data.intensityMix.map((item) => (
              <span key={item.id}><i style={{ background: item.color }} />{item.label}</span>
            ))}
          </div>}
          className="chart-panel"
        >
          <Chart option={chartOptions.trend} height={408} />
        </Panel>

        <div className="stack">
          <Panel
            kicker="TWO SENSORS · FIVE PLATFORMS"
            title="Who saw the fire"
            subtitle="Share of detections by platform."
            className="donut-panel"
          >
            <div className="donut-wrap">
              <Chart option={chartOptions.donut} height={184} />
              <div className="donut-center">
                <strong>{fmtCompact(kpis.detections)}</strong>
                <span>detections</span>
              </div>
            </div>
            <div className="sensor-list">
              {data.sensorMix.map((sensor) => (
                <div className="sensor-row" key={sensor.id}>
                  <span className="sensor-dot" style={{ background: SENSOR_COLORS[sensor.id] }} />
                  <span className="sensor-name">{sensor.name}</span>
                  <span className="sensor-share mono">{fmtPct(sensor.share, 1)}</span>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            kicker="TRUST"
            title="Confidence mix"
            subtitle={`Weighted mean ${fmtNumber(confidence.mean)}% after harmonization.`}
          >
            <div className="confidence-list">
              {confidence.bands.map((band) => (
                <div className="confidence-row" key={band.id}>
                  <span className={`conf-dot ${band.id}`} />
                  <span className="conf-label">{band.label}</span>
                  <div className="conf-track">
                    <span
                      className={`conf-fill ${band.id}`}
                      style={{ width: `${Math.max(2, band.value * 100)}%` }}
                    />
                  </div>
                  <span className="conf-value mono">{fmtPct(band.value, 1)}</span>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid overview-bottom">
        <Panel
          kicker="HOTSPOTS"
          title="Where the record burns"
          subtitle={
            selectedRegion
              ? `Filtered to ${selectedRegion.name}. Click another region below to switch.`
              : 'Click a region to filter the whole dashboard.'
          }
          action={<a className="link-quiet" href="#/map">Open map <Icon name="arrowRight" size={13} /></a>}
        >
          <div className="rank-list">
            {topRegions.slice(0, 8).map((region, index) => (
              <button
                type="button"
                key={region.id}
                className={`rank-row ${filters.region === region.id ? 'selected' : ''}`}
                onClick={() => update({ region: filters.region === region.id ? 'all' : region.id })}
              >
                <span className="rank-index mono">{String(index + 1).padStart(2, '0')}</span>
                <div className="rank-main">
                  <div className="rank-title">
                    <span className="rank-name">{region.name}</span>
                    <span className="rank-country">{region.country}</span>
                  </div>
                  <div className="rank-track">
                    <span
                      className="rank-bar"
                      style={{ width: `${Math.max(1, (region.detections / regionMax) * 100)}%` }}
                    />
                  </div>
                </div>
                <span className="rank-value mono">{fmtCompact(region.detections)}</span>
                <span className="rank-share mono">{fmtPct(region.share, 0)}</span>
                <span className={`rank-delta ${region.delta >= 0 ? 'up' : 'down'} mono`}>
                  {region.delta == null ? '—' : fmtSignedPct(region.delta, 0)}
                </span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel
          kicker="CALIBRATION SNAPSHOT"
          title="Agreement between sensors"
          subtitle="How often VIIRS and MODIS saw the same fire."
          action={<a className="link-quiet" href="#/calibration">Details <Icon name="arrowRight" size={13} /></a>}
        >
          <div className="calib-card">
            <div
              className="gauge"
              style={{
                background: `conic-gradient(#F97316 ${calibrationDeg}deg, rgba(255,255,255,.06) ${calibrationDeg}deg)`,
              }}
            >
              <div className="gauge-inner">
                <strong>{fmtPct(calibration.matchRate, 1)}</strong>
                <span>match rate</span>
              </div>
            </div>
            <div className="calib-rows">
              <div><span>Matched pairs</span><strong className="mono">{fmtCompact(calibration.matchedPairs)}</strong></div>
              <div><span>FRP bias</span><strong className="mono">{fmtSignedPct(calibration.frpBias / 100, 1)}</strong></div>
              <div><span>Median offset</span><strong className="mono">{calibration.timingOffset} min</strong></div>
              <div><span>High anchor</span><strong className="mono">{fmtNumber(calibration.highAnchor)}%</strong></div>
            </div>
          </div>
          <p className="panel-footnote">Window: {calibration.window}. Anchors are frozen globally.</p>
        </Panel>
      </div>

      <Panel
        kicker="OUT OF THE ORDINARY"
        title="Recent anomaly episodes"
        subtitle="Consecutive days that broke their 2018–2022 seasonal baseline."
        action={<a className="link-quiet" href="#/anomalies">All anomalies <Icon name="arrowRight" size={13} /></a>}
      >
        {recentAnomalies.length === 0 ? (
          <EmptyState title="Nothing flagged in this window" description="Try widening the date range." icon="check" />
        ) : (
          <div className="anomaly-strip">
            {recentAnomalies.map((item) => (
              <article className="anomaly-preview" key={item.id}>
                <div className="anomaly-preview-top">
                  <span className={`sev-pill ${item.severity}`}>
                    <i style={{ background: severityColor(item.severity) }} />
                    {item.severity}
                  </span>
                  <span className="anomaly-z mono">z {item.z.toFixed(1)}</span>
                </div>
                <h4>{item.region}</h4>
                <p className="anomaly-range mono">
                  {fmtDate(item.startDate, { year: 'numeric' })}
                  {item.days > 1 ? ` → ${fmtDate(item.endDate, { year: 'numeric' })}` : ''}
                  <span> · {item.days}d</span>
                </p>
                <p className="anomaly-desc">
                  {item.kind === 'count' ? 'Detections' : 'Mean FRP'}{' '}
                  {item.direction === 'above' ? 'above' : 'below'} baseline ({fmtSignedPct(item.deviationPct / 100, 0)})
                </p>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
