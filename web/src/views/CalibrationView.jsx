import { useMemo } from 'react';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useFilters } from '../state/Filters.jsx';
import { Panel, SectionHeader } from '../components/Panel.jsx';
import { Chart } from '../components/Chart.jsx';
import { ErrorState, PageLoading } from '../components/States.jsx';
import { Icon } from '../components/Icons.jsx';
import { SAND_STOPS, withAlpha } from '../lib/colors.js';
import {
  fmtCompact,
  fmtInt,
  fmtNumber,
  fmtPct,
  fmtSignedPct,
} from '../lib/format.js';
import { axisLabel, baseOption, splitLine, tooltipStyle } from '../lib/chartTheme.js';

function fmtAxisPct(value) {
  return `${Math.round(value * 100)}%`;
}

export default function CalibrationView() {
  const { filters } = useFilters();
  const params = {
    from: filters.from,
    to: filters.to,
    region: filters.region,
    sensor: filters.sensor,
  };
  const { data, loading, error, reload } = useApi(api.calibration, params);

  const options = useMemo(() => {
    if (!data) return {};

    const pairs = baseOption({
      grid: { left: 52, right: 46, top: 46, bottom: 30 },
      legend: { show: true, top: 0, right: 0 },
      tooltip: {
        ...tooltipStyle,
        trigger: 'axis',
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(255,255,255,.03)' } },
        formatter: (items) => {
          if (!items?.length) return '';
          const row = data.pairsByYear[items[0].dataIndex];
          return `<div style="color:#A8A29C;font-size:11px">${row.year}</div>
            <div style="margin-top:5px;display:flex;justify-content:space-between;gap:20px">
              <span style="color:#D3B595">● MODIS detections</span><b>${fmtInt(row.modis)}</b>
            </div>
            <div style="margin-top:3px;display:flex;justify-content:space-between;gap:20px">
              <span style="color:#F97316">● VIIRS detections</span><span>${fmtInt(row.viirs)}</span>
            </div>
            <div style="margin-top:3px;display:flex;justify-content:space-between;gap:20px">
              <span style="color:#FACC15">● Match rate</span><span>${fmtPct(row.rate, 1)}</span>
            </div>`;
        },
      },
      xAxis: {
        type: 'category',
        data: data.pairsByYear.map((row) => row.year),
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
          min: 0.5,
          max: 1,
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { ...axisLabel, formatter: (value) => fmtAxisPct(value) },
        },
      ],
      series: [
        {
          name: 'MODIS',
          type: 'bar',
          barWidth: '30%',
          itemStyle: { color: withAlpha(SAND_STOPS[1], 0.85), borderRadius: [3, 3, 0, 0] },
          data: data.pairsByYear.map((row) => row.modis),
        },
        {
          name: 'VIIRS',
          type: 'bar',
          barWidth: '30%',
          itemStyle: { color: '#F97316', borderRadius: [3, 3, 0, 0] },
          data: data.pairsByYear.map((row) => row.viirs),
        },
        {
          name: 'Match rate',
          type: 'line',
          yAxisIndex: 1,
          smooth: 0.25,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { width: 1.6, color: '#FACC15' },
          itemStyle: { color: '#FACC15', borderColor: '#0A0908', borderWidth: 1 },
          data: data.pairsByYear.map((row) => row.rate),
        },
      ],
    });

    const reliability = baseOption({
      grid: { left: 46, right: 16, top: 38, bottom: 34 },
      legend: { show: true, top: 0, right: 0 },
      tooltip: {
        ...tooltipStyle,
        trigger: 'item',
        formatter: (item) => {
          if (item.seriesName === 'Perfect calibration') return '';
          const row = data.reliability[item.dataIndex];
          return `<div style="color:#A8A29C;font-size:11px">Reliability bin</div>
            <div style="margin-top:4px;display:flex;justify-content:space-between;gap:18px">
              <span>Predicted confidence</span><b>${fmtPct(row.predicted, 0)}</b>
            </div>
            <div style="margin-top:3px;display:flex;justify-content:space-between;gap:18px">
              <span>Observed agreement</span><b>${fmtPct(row.observed, 1)}</b>
            </div>
            <div style="margin-top:3px;color:#A8A29C">${fmtInt(row.n)} matched pairs</div>`;
        },
      },
      xAxis: {
        type: 'value',
        min: 0.25,
        max: 0.95,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } },
        axisTick: { show: false },
        splitLine,
        axisLabel: { ...axisLabel, formatter: (value) => fmtAxisPct(value) },
      },
      yAxis: {
        type: 'value',
        min: 0.25,
        max: 0.95,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine,
        axisLabel: { ...axisLabel, formatter: (value) => fmtAxisPct(value) },
      },
      series: [
        {
          name: 'Observed agreement',
          type: 'line',
          smooth: 0.2,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { width: 1.6, color: SAND_STOPS[1] },
          itemStyle: { color: SAND_STOPS[1], borderColor: '#0A0908', borderWidth: 1 },
          data: data.reliability.map((row) => [row.predicted, row.observed]),
        },
        {
          name: 'Perfect calibration',
          type: 'line',
          showSymbol: false,
          silent: true,
          lineStyle: { width: 1, type: 'dashed', color: 'rgba(255,255,255,.22)' },
          data: [
            [0.25, 0.25],
            [0.95, 0.95],
          ],
        },
      ],
    });

    const uncertaintyYears = data.uncertainty.map((row) => row.year);
    const uncertainty = baseOption({
      grid: { left: 46, right: 18, top: 36, bottom: 30 },
      legend: { show: true, top: 0, right: 0, data: ['80% band', 'Median gap'] },
      tooltip: {
        ...tooltipStyle,
        trigger: 'axis',
        formatter: (items) => {
          const index = items?.[0]?.dataIndex;
          const row = data.uncertainty[index];
          if (!row) return '';
          return `<div style="color:#A8A29C;font-size:11px">${row.year}</div>
            <div style="margin-top:4px;display:flex;justify-content:space-between;gap:18px">
              <span>80% interval</span><b>${fmtPct(row.p10, 1)} – ${fmtPct(row.p90, 1)}</b>
            </div>
            <div style="margin-top:3px;display:flex;justify-content:space-between;gap:18px">
              <span style="color:#F97316">● Median gap</span><b>${fmtPct(row.p50, 1)}</b>
            </div>`;
        },
      },
      xAxis: {
        type: 'category',
        data: uncertaintyYears,
        boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } },
        axisTick: { show: false },
        axisLabel: { ...axisLabel },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine,
        axisLabel: { ...axisLabel, formatter: (value) => `${value}%` },
      },
      series: [
        {
          name: 'p10 floor',
          type: 'line',
          stack: 'band',
          symbol: 'none',
          silent: true,
          lineStyle: { width: 0, opacity: 0 },
          areaStyle: { opacity: 0 },
          data: data.uncertainty.map((row) => row.p10 * 100),
        },
        {
          name: '80% band',
          type: 'line',
          stack: 'band',
          symbol: 'none',
          silent: true,
          lineStyle: { width: 0, opacity: 0 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: withAlpha(SAND_STOPS[2], 0.42) },
                { offset: 1, color: withAlpha(SAND_STOPS[2], 0.06) },
              ],
            },
          },
          data: data.uncertainty.map((row) => (row.p90 - row.p10) * 100),
        },
        {
          name: 'p90 edge',
          type: 'line',
          symbol: 'none',
          silent: true,
          lineStyle: { width: 1, color: withAlpha(SAND_STOPS[2], 0.6), type: 'dashed' },
          data: data.uncertainty.map((row) => row.p90 * 100),
        },
        {
          name: 'p10 edge',
          type: 'line',
          symbol: 'none',
          silent: true,
          lineStyle: { width: 1, color: withAlpha(SAND_STOPS[2], 0.28), type: 'dashed' },
          data: data.uncertainty.map((row) => row.p10 * 100),
        },
        {
          name: 'Median gap',
          type: 'line',
          smooth: 0.25,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { width: 1.8, color: '#F97316' },
          itemStyle: { color: '#F97316', borderColor: '#0A0908', borderWidth: 1 },
          data: data.uncertainty.map((row) => row.p50 * 100),
        },
      ],
    });

    return { pairs, reliability, uncertainty };
  }, [data]);

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data && loading) return <PageLoading />;

  const { summary, anchors, histograms, regionAgreement } = data;
  const maxShare = (hist) => Math.max(...hist.shares) || 1;

  return (
    <div className={`view reveal ${loading ? 'is-loading' : ''}`}>
      <SectionHeader
        kicker="TWO SENSORS · ONE HONEST SCALE"
        title="How the record was calibrated"
        description="VIIRS sees smaller fires at 375 m; MODIS offers a long, well-understood 1 km record. Matching them in space and time lets one sensor anchor the other's confidence — and tells us where agreement is weakest."
        action={<span className="mono muted">illustrative calibration</span>}
      />

      <div className="rule-strip">
        <span><Icon name="target" size={14} /> Match window {summary.window}</span>
        <span><Icon name="layers" size={14} /> MODIS anchors L / N / H confidence</span>
        <span><Icon name="clock" size={14} /> UTC acquisition times</span>
        <span className="rule-note">Anchors are frozen globally so confidence means the same thing in every region.</span>
      </div>

      <div className="stat-grid calibration-stats">
        <article className="stat-card">
          <div className="stat-top"><span className="stat-label">Matched pairs</span><span className="stat-icon"><Icon name="layers" size={15} /></span></div>
          <div className="stat-value">{fmtInt(summary.matchedPairs)}</div>
          <div className="stat-foot"><span className="stat-hint">of {fmtInt(summary.viirsTotal)} VIIRS detections</span></div>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span className="stat-label">Match rate</span><span className="stat-icon"><Icon name="target" size={15} /></span></div>
          <div className="stat-value">{fmtPct(summary.matchRate, 1)}</div>
          <div className="stat-foot"><span className="stat-hint">VIIRS found inside a MODIS pixel</span></div>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span className="stat-label">FRP bias</span><span className="stat-icon"><Icon name="flame" size={15} /></span></div>
          <div className="stat-value">{fmtSignedPct(summary.frpBias / 100, 1)}</div>
          <div className="stat-foot"><span className="stat-hint">VIIRS minus MODIS, matched pairs</span></div>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span className="stat-label">Timing offset</span><span className="stat-icon"><Icon name="clock" size={15} /></span></div>
          <div className="stat-value">{fmtNumber(summary.timingOffset, 0)}<span className="stat-unit">min</span></div>
          <div className="stat-foot"><span className="stat-hint">median overpass gap</span></div>
        </article>
        <article className="stat-card">
          <div className="stat-top"><span className="stat-label">Spatial overlap</span><span className="stat-icon"><Icon name="pin" size={15} /></span></div>
          <div className="stat-value">{fmtPct(summary.iou, 0)}</div>
          <div className="stat-foot"><span className="stat-hint">intersection over union · {summary.window}</span></div>
        </article>
      </div>

      <div className="grid calib-main">
        <Panel
          kicker="MATCH LEDGER"
          title="Pairs found each year"
          subtitle="Bars are raw detections per sensor. The yellow line is the share of VIIRS detections that found a MODIS partner inside the window."
          className="chart-panel"
        >
          <Chart option={options.pairs} height={334} />
        </Panel>

        <Panel
          kicker="CONFIDENCE ANCHORS"
          title="MODIS teaches VIIRS"
          subtitle="Each VIIRS class is mapped to the mean MODIS confidence of its matched pairs."
        >
          <div className="anchor-list">
            {anchors.map((anchor) => (
              <div className="anchor-row" key={anchor.code}>
                <span className="anchor-code mono">{anchor.code}</span>
                <div className="anchor-body">
                  <div className="anchor-head">
                    <span>{anchor.label}</span>
                    <span className="mono">{fmtInt(anchor.n)} pairs</span>
                  </div>
                  <div className="anchor-track">
                    <span className="anchor-fill" style={{ width: `${anchor.mean}%` }} />
                    <span className="anchor-marker" style={{ left: `${anchor.mean}%` }} />
                  </div>
                  <div className="anchor-range mono">
                    <span>{fmtNumber(anchor.low)}%</span>
                    <span>mean {fmtNumber(anchor.mean)}%</span>
                    <span>{fmtNumber(anchor.high)}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="panel-footnote">
            Range is the interquartile spread around each anchor. New VIIRS data inherits these values.
          </p>
        </Panel>
      </div>

      <div className="grid calib-mid">
        <Panel
          kicker="RELIABILITY"
          title="Does confidence mean what it says?"
          subtitle="Predicted confidence against observed agreement on matched pairs. A well-calibrated sensor tracks the dashed diagonal."
        >
          <Chart option={options.reliability} height={300} />
        </Panel>

        <Panel
          kicker="CONFIDENCE DISTRIBUTION"
          title="Two different confidence languages"
          subtitle="MODIS reports 0–100%; VIIRS reports Low / Nominal / High. Harmonization puts both on one scale."
        >
          <div className="hist-stack">
            {histograms.map((hist) => (
              <div className="hist-block" key={hist.id}>
                <div className="hist-head">
                  <span>{hist.name}</span>
                  <span className="mono">{fmtCompact(hist.count)} · {hist.bins.length} bins</span>
                </div>
                <div className="hist-bars" style={{ gridTemplateColumns: `repeat(${hist.shares.length}, minmax(0, 1fr))` }}>
                  {hist.shares.map((share, index) => {
                    const height = Math.max(3, (share / maxShare(hist)) * 100);
                    return (
                      <div className="hist-col" key={`${hist.id}-${hist.bins[index]}`}>
                        <span
                          className="hist-bar"
                          style={{
                            height: `${height}%`,
                            background: SAND_STOPS[Math.min(SAND_STOPS.length - 1, Math.round((index / Math.max(1, hist.shares.length - 1)) * 3) + 1)],
                          }}
                          title={`${hist.bins[index]} · ${fmtPct(share, 1)}`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="hist-axis">
                  <span>{hist.bins[0]}</span>
                  <span>{hist.bins[hist.bins.length - 1]}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="panel-footnote">
            Sand carries trust, not fire intensity. Fire colours stay reserved for FRP.
          </p>
        </Panel>
      </div>

      <Panel
        kicker="UNCERTAINTY OVER TIME"
        title="The gap is shrinking"
        subtitle="Median relative difference between matched FRP values, with an 80% interval. Narrower bands mean the two sensors are converging."
      >
        <Chart option={options.uncertainty} height={260} />
      </Panel>

      <Panel
        kicker="REGION BY REGION"
        title="Where agreement is strongest"
        subtitle="Calibration is not uniform. Sparse regions and persistent cloud cover make matching harder."
        action={<span className="mono muted">matched pairs · match rate · bias · offset</span>}
      >
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Region</th>
                <th className="num">Pairs</th>
                <th>Match rate</th>
                <th className="num">FRP bias</th>
                <th className="num">Timing offset</th>
                <th>Agreement</th>
              </tr>
            </thead>
            <tbody>
              {regionAgreement.map((row) => (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td className="num mono dim">{fmtInt(row.pairs)}</td>
                  <td className="mono strong">{fmtPct(row.matchRate, 1)}</td>
                  <td className={`num mono ${row.frpBias >= 0 ? 'hot' : 'cool'}`}>
                    {fmtSignedPct(row.frpBias / 100, 1)}
                  </td>
                  <td className="num mono">{Math.round(row.timingOffset)} min</td>
                  <td>
                    <div className="agreement-track">
                      <span style={{ width: `${Math.max(4, row.matchRate * 100)}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <p className="method-note">
        <Icon name="info" size={14} />
        {summary.method} These values are synthetic in the skeleton. Replace them with your calibration
        run in <code>server/data/source.js</code> — the view and API shape stay unchanged.
      </p>
    </div>
  );
}
