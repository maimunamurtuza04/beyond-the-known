import { useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useFilters } from '../state/Filters.jsx';
import { Panel, SectionHeader } from '../components/Panel.jsx';
import { Chart } from '../components/Chart.jsx';
import { ErrorState, EmptyState, PageLoading } from '../components/States.jsx';
import { Icon } from '../components/Icons.jsx';
import { maxOf, severityColor } from '../lib/colors.js';
import {
  fmtDate,
  fmtInt,
  fmtNumber,
  fmtPct,
  fmtShortDate,
  fmtSignedPct,
} from '../lib/format.js';
import { areaGradient, axisLabel, baseOption, splitLine, tooltipStyle } from '../lib/chartTheme.js';

const SEVERITIES = [
  { id: 'all', label: 'All' },
  { id: 'critical', label: 'Critical' },
  { id: 'advisory', label: 'Advisory' },
  { id: 'watch', label: 'Watch' },
];

export default function AnomaliesView() {
  const { filters } = useFilters();
  const [severity, setSeverity] = useState('all');
  const params = {
    from: filters.from,
    to: filters.to,
    region: filters.region,
    sensor: filters.sensor,
    severity,
  };
  const { data, loading, error, reload } = useApi(api.anomalies, params);

  const chartOption = useMemo(() => {
    if (!data) return {};
    const series = data.series;
    const countMarkers = data.items
      .filter((item) => item.kind === 'count')
      .map((item) => ({
        value: [item.date, item.observed],
        itemStyle: { color: severityColor(item.severity) },
      }));

    return baseOption({
      grid: { left: 54, right: 18, top: 42, bottom: 62 },
      legend: { show: true, top: 0, right: 0, data: ['Observed', 'Seasonal baseline'] },
      tooltip: {
        ...tooltipStyle,
        trigger: 'axis',
        formatter: (items) => {
          const first = items?.[0];
          if (!first) return '';
          const observed = items.find((item) => item.seriesName === 'Observed')?.value ?? 0;
          const expected = items.find((item) => item.seriesName === 'Seasonal baseline')?.value ?? 0;
          const diff = expected ? (observed - expected) / expected : 0;
          return `<div style="color:#A8A29C;font-size:11px">${fmtDate(first.axisValue)}</div>
            <div style="margin-top:5px;display:flex;justify-content:space-between;gap:20px">
              <span style="color:#F97316">● Observed</span><b>${fmtInt(observed)}</b>
            </div>
            <div style="margin-top:3px;display:flex;justify-content:space-between;gap:20px">
              <span style="color:#A8A29C">● Baseline</span><span>${fmtInt(expected)}</span>
            </div>
            <div style="margin-top:3px;color:${diff >= 0 ? '#F87171' : '#A8A29C'}">${fmtSignedPct(diff)} vs baseline</div>`;
        },
      },
      xAxis: {
        type: 'category',
        data: series.map((point) => point.date),
        boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } },
        axisTick: { show: false },
        axisLabel: { ...axisLabel, formatter: (value) => fmtShortDate(value), hideOverlap: true },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine,
        axisLabel: { ...axisLabel, formatter: (value) => fmtCompactTick(value) },
      },
      dataZoom:
        series.length > 400
          ? [
              { type: 'inside', start: 70, end: 100 },
              {
                type: 'slider',
                start: 70,
                end: 100,
                height: 16,
                bottom: 10,
                borderColor: 'rgba(255,255,255,.08)',
                backgroundColor: 'rgba(255,255,255,.02)',
                fillerColor: 'rgba(249,115,22,.14)',
                handleStyle: { color: '#F97316', borderColor: '#F97316' },
                textStyle: { color: '#6F6862', fontSize: 9 },
                dataBackground: { lineStyle: { color: '#3A2E27' }, areaStyle: { color: '#241B16' } },
              },
            ]
          : undefined,
      series: [
        {
          name: 'Observed',
          type: 'line',
          smooth: 0.2,
          showSymbol: false,
          sampling: 'lttb',
          lineStyle: { width: 1.6, color: '#F97316' },
          itemStyle: { color: '#F97316' },
          areaStyle: { color: areaGradient('#F97316', 0.3, 0.01) },
          data: series.map((point) => point.observed),
        },
        {
          name: 'Seasonal baseline',
          type: 'line',
          smooth: 0.25,
          showSymbol: false,
          lineStyle: { width: 1.2, color: '#8F8378', type: 'dashed' },
          itemStyle: { color: '#8F8378' },
          data: series.map((point) => point.expected),
        },
        {
          name: 'Flagged',
          type: 'scatter',
          symbolSize: 6,
          itemStyle: { borderColor: '#0A0908', borderWidth: 1 },
          tooltip: { show: false },
          data: countMarkers,
          z: 5,
        },
      ],
    });
  }, [data]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data && loading) return <PageLoading />;

  const { summary, items, severityMix, byRegion, totalItems } = data;
  const severityMax = maxOf(severityMix.map((row) => row.count)) || 1;
  const regionMax = maxOf(byRegion.map((row) => row.count)) || 1;
  const chartEmpty = !data?.series?.length;

  return (
    <div className={`view reveal ${loading ? 'is-loading' : ''}`}>
      <SectionHeader
        kicker="OUT OF RANGE"
        title="What broke the pattern"
        description="A day is unusual when it departs from the same seasonal window in 2018–2022. Consecutive days merge into one episode, so the table reads like events, not noise."
        action={
          <div className="segmented">
            {SEVERITIES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={severity === option.id ? 'active' : ''}
                onClick={() => setSeverity(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="rule-strip">
        <span><Icon name="target" size={14} /> Baseline {data?.baselineYears?.[0]}–{data?.baselineYears?.[1]}</span>
        <span><Icon name="alert" size={14} /> Threshold |z| ≥ {data?.threshold ?? 2.5}</span>
        <span><Icon name="layers" size={14} /> 3-day gap merges episodes</span>
        <span className="rule-note">Count anomalies require a meaningful fire signal, not an off-season wobble.</span>
      </div>

      <div className="stat-grid anomaly-stats">
        <article className="stat-card">
          <div className="stat-top"><span className="stat-label">Anomaly episodes</span><span className="stat-icon"><Icon name="alert" size={15} /></span></div>
          <div className="stat-value">{fmtInt(summary.flagged)}</div>
          <div className="stat-foot"><span className="stat-hint">{fmtInt(summary.critical)} critical · {fmtInt(summary.advisory)} advisory</span></div>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span className="stat-label">Days affected</span><span className="stat-icon"><Icon name="calendar" size={15} /></span></div>
          <div className="stat-value">{fmtInt(summary.flaggedDays)}</div>
          <div className="stat-foot"><span className="stat-hint">{fmtPct(summary.shareOfActiveDays, 1)} of active days</span></div>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span className="stat-label">Critical episodes</span><span className="stat-icon"><Icon name="flame" size={15} /></span></div>
          <div className="stat-value">{fmtInt(summary.critical)}</div>
          <div className="stat-foot"><span className="stat-hint">|z| ≥ 4.0</span></div>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span className="stat-label">Peak departure</span><span className="stat-icon"><Icon name="trend" size={15} /></span></div>
          <div className="stat-value">{fmtNumber(summary.maxZ, 1)}</div>
          <div className="stat-foot"><span className="stat-hint">absolute z-score</span></div>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span className="stat-label">Most affected</span><span className="stat-icon"><Icon name="pin" size={15} /></span></div>
          <div className="stat-value small">{summary.mostAffectedRegion?.name || '—'}</div>
          <div className="stat-foot"><span className="stat-hint">{summary.mostAffectedRegion ? `${summary.mostAffectedRegion.count} episodes` : 'no region'}</span></div>
        </article>
      </div>

      <div className="grid anomaly-main">
        <Panel
          kicker="OBSERVED VS BASELINE"
          title="When the record left its range"
          subtitle="Orange is the observed daily count; the dashed line is the seasonal expectation. Dots mark flagged count episodes."
        >
          {chartEmpty ? (
            <EmptyState title="No daily series in this window" description="Widen the date range." />
          ) : (
            <Chart option={chartOption} height={356} />
          )}
        </Panel>

        <div className="stack">
          <Panel kicker="SEVERITY" title="How strong" className="tight">
            <div className="severity-list">
              {severityMix.map((row) => (
                <div className="severity-row" key={row.id}>
                  <span className="severity-name">
                    <i style={{ background: severityColor(row.id) }} />
                    {row.label}
                  </span>
                  <div className="severity-track">
                    <span
                      style={{
                        width: `${Math.max(2, (row.count / severityMax) * 100)}%`,
                        background: severityColor(row.id),
                      }}
                    />
                  </div>
                  <span className="mono">{fmtInt(row.count)}</span>
                </div>
              ))}
            </div>
            <p className="panel-footnote">Severity is set at the episode's peak |z|.</p>
          </Panel>

          <Panel kicker="BY REGION" title="Where they cluster" className="tight">
            {byRegion.length === 0 ? (
              <EmptyState title="Nothing flagged" icon="check" description="This filter is clean." />
            ) : (
              <div className="region-anom-list">
                {byRegion.slice(0, 6).map((row) => (
                  <div className="region-anom-row" key={row.id}>
                    <span className="region-anom-name">{row.name}</span>
                    <div className="region-anom-track">
                      <span style={{ width: `${Math.max(3, (row.count / regionMax) * 100)}%` }} />
                    </div>
                    <span className="mono">{fmtInt(row.count)}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>

      <Panel
        kicker="EPISODE LOG"
        title="The record's outliers"
        subtitle={`Ranked by peak departure. Showing ${Math.min(items.length, totalItems)} of ${fmtInt(totalItems)} episodes for this filter.`}
        action={<span className="mono muted">|z| · days</span>}
      >
        {items.length === 0 ? (
          <EmptyState title="No episodes match" description="Try All or widen the date range." icon="check" />
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th>Region</th>
                  <th>Signal</th>
                  <th className="num">Observed</th>
                  <th className="num">Baseline</th>
                  <th className="num">Deviation</th>
                  <th className="num">|z|</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="cell-date">{fmtDate(item.startDate, { year: 'numeric' })}</div>
                      {item.days > 1 && (
                        <div className="cell-sub">
                          → {fmtDate(item.endDate, { year: 'numeric' })} · {item.days}d
                        </div>
                      )}
                    </td>
                    <td>{item.region}</td>
                    <td>
                      <span className="signal-tag">
                        {item.kind === 'count' ? 'Detections' : 'Mean FRP'}
                      </span>
                      <span className={`direction ${item.direction}`}>
                        <Icon name={item.direction === 'above' ? 'arrowUp' : 'arrowDown'} size={10} />
                      </span>
                    </td>
                    <td className="num mono">{item.kind === 'count' ? fmtInt(item.observed) : fmtNumber(item.observed)}</td>
                    <td className="num mono dim">{item.kind === 'count' ? fmtNumber(item.expected, 0) : fmtNumber(item.expected)}</td>
                    <td className={`num mono ${item.deviationPct >= 0 ? 'hot' : 'cool'}`}>{fmtSignedPct(item.deviationPct / 100, 0)}</td>
                    <td className="num mono strong">{Math.abs(item.z).toFixed(1)}</td>
                    <td>
                      <span className={`sev-pill ${item.severity}`}>
                        <i style={{ background: severityColor(item.severity) }} />
                        {item.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <p className="method-note">
        <Icon name="info" size={14} />
        Flagging uses a detrended seasonal baseline and a meaningful-deviation gate. It is a skeleton method:
        replace it with the detection rule your science team signs off on. The API contract stays the same.
      </p>
    </div>
  );
}

function fmtCompactTick(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(value));
}
