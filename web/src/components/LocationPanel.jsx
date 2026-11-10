import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import { Panel } from './Panel.jsx';
import { Chart } from './Chart.jsx';
import { Icon } from './Icons.jsx';
import { Sparkline } from './Sparkline.jsx';
import { SENSOR_COLORS } from '../lib/colors.js';
import { fmtCoords, fmtInt, fmtNumber, fmtPct, MONTH_SHORT } from '../lib/format.js';
import { areaGradient, axisLabel, baseOption, splitLine, tooltipStyle } from '../lib/chartTheme.js';

/**
 * ─────────────────────────────────────────────────────────────
 *  COORDINATE RECORD · skeleton feature
 * ─────────────────────────────────────────────────────────────
 * Clicking the map pins a latitude/longitude and asks the API
 * for the record around that point:
 *
 *      GET /api/location?lat=&lon=&radiusKm=&from=&to=&sensor=
 *
 * The mock implementation is in server/data/source.js
 * (getLocation), and the real-query example is in
 * server/data/postgres.example.js. Keep the response shape and
 * this panel keeps working.
 *
 * This panel is deliberately a skeleton: the summary, monthly
 * trend, mixes and nearby-region table are real renders fed by
 * whichever numbers the endpoint returns.
 * ─────────────────────────────────────────────────────────────
 */

export function useLocationRecord(selection, scope) {
  const [state, setState] = useState({ data: null, loading: false, error: null });
  const [tick, setTick] = useState(0);
  const lat = selection?.lat ?? null;
  const lon = selection?.lon ?? null;
  const radiusKm = selection?.radiusKm ?? 600;

  useEffect(() => {
    if (lat == null || lon == null) {
      setState({ data: null, loading: false, error: null });
      return undefined;
    }
    const controller = new AbortController();
    let active = true;
    setState({ data: null, loading: true, error: null });
    api
      .location(
        {
          lat,
          lon,
          radiusKm,
          from: scope.from,
          to: scope.to,
          sensor: scope.sensor === 'all' ? undefined : scope.sensor,
        },
        controller.signal,
      )
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (!active || error.name === 'AbortError') return;
        setState({ data: null, loading: false, error: error.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [lat, lon, radiusKm, scope.from, scope.to, scope.sensor, tick]);

  return { ...state, reload: () => setTick((value) => value + 1) };
}

function Stat({ label, value, unit }) {
  return (
    <div>
      <span>{label}</span>
      <strong>
        {value}
        {unit ? <small> {unit}</small> : null}
      </strong>
    </div>
  );
}

/** Compact card that lives in the right-hand column on the map page. */
export function LocationQuickCard({ selection, record, onClear }) {
  const data = record.data;
  const values = useMemo(
    () => (data?.monthly || []).map((row) => row.detections),
    [data],
  );

  return (
    <Panel
      kicker="POINT RECORD"
      title={selection ? fmtCoords(selection.lat, selection.lon) : 'Pick a point'}
      className="tight"
      action={
        selection ? (
          <button type="button" className="icon-btn" onClick={onClear} aria-label="Clear pinned point">
            <Icon name="close" size={14} />
          </button>
        ) : null
      }
    >
      {!selection && (
        <div className="point-empty">
          <Icon name="pin" size={18} />
          <p>Click anywhere on the map to pin a coordinate.</p>
          <span>The local record and trend below follow the pin.</span>
        </div>
      )}

      {selection && record.loading && !data && (
        <div className="inline-loading small"><span className="pulse-dot" /> Reading local record…</div>
      )}

      {selection && record.error && !data && (
        <div className="point-error">
          <p>{record.error}</p>
          <button type="button" className="btn btn-quiet small" onClick={record.reload}>
            <Icon name="refresh" size={12} /> Retry
          </button>
        </div>
      )}

      {selection && data && (
        <>
          <Sparkline values={values} height={38} />
          <div className="map-stats point-stats">
            <Stat label="Detections" value={fmtInt(data.summary.detections)} />
            <Stat label="Mean FRP" value={fmtNumber(data.summary.meanFrp)} unit="MW" />
            <Stat label="Radius" value={fmtInt(data.radiusKm)} unit="km" />
            <Stat label="Regions inside" value={fmtInt(data.nearbyRegions.length)} />
          </div>
          <p className="panel-footnote">
            {data.summary.peakMonth
              ? `Peak month ${data.summary.peakMonth.label}. Full local trend sits below the map.`
              : 'No detections inside this window. Widen the radius below the map.'}
          </p>
        </>
      )}
    </Panel>
  );
}

/** Full-width record below the map. This is the main skeleton surface. */
export function LocationDetail({ selection, record, onRadius, onClear }) {
  const data = record.data;

  const trend = useMemo(() => {
    if (!data) return {};
    const months = data.monthly;
    return baseOption({
      grid: { left: 52, right: 54, top: 40, bottom: 34 },
      legend: { show: true, top: 0, right: 0, data: ['Detections', 'Mean FRP'] },
      tooltip: {
        ...tooltipStyle,
        trigger: 'axis',
        formatter: (items) => {
          const first = items?.[0];
          if (!first) return '';
          const row = months[first.dataIndex];
          if (!row) return '';
          return `<div style="color:#A8A29C;font-size:11px">${row.label}</div>
            <div style="margin-top:5px;display:flex;justify-content:space-between;gap:20px">
              <span style="color:#F97316">● Detections</span><b>${fmtInt(row.detections)}</b>
            </div>
            <div style="margin-top:3px;display:flex;justify-content:space-between;gap:20px">
              <span style="color:#A8A29C">● Fires</span><span>${fmtInt(row.fires)}</span>
            </div>
            <div style="margin-top:3px;display:flex;justify-content:space-between;gap:20px">
              <span style="color:#D3B595">● Mean FRP</span><span>${fmtNumber(row.frp)} MW</span>
            </div>`;
        },
      },
      xAxis: {
        type: 'category',
        data: months.map((row) => row.period),
        boundaryGap: false,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,.08)' } },
        axisTick: { show: false },
        axisLabel: {
          ...axisLabel,
          hideOverlap: true,
          formatter: (value) => {
            const [year, month] = value.split('-');
            return `${MONTH_SHORT[Number(month) - 1]} ${year.slice(2)}`;
          },
        },
      },
      yAxis: [
        {
          type: 'value',
          name: 'detections',
          nameTextStyle: { color: '#6F6862', fontSize: 9, align: 'left' },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine,
          axisLabel: { ...axisLabel, formatter: (value) => fmtInt(value) },
        },
        {
          type: 'value',
          name: 'FRP · MW',
          nameTextStyle: { color: '#6F6862', fontSize: 9, align: 'right' },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { ...axisLabel, formatter: (value) => fmtNumber(value, 0) },
        },
      ],
      series: [
        {
          name: 'Detections',
          type: 'line',
          smooth: 0.2,
          showSymbol: false,
          sampling: 'lttb',
          lineStyle: { width: 1.7, color: '#F97316' },
          itemStyle: { color: '#F97316' },
          areaStyle: { color: areaGradient('#F97316', 0.34, 0.01) },
          data: months.map((row) => row.detections),
        },
        {
          name: 'Mean FRP',
          type: 'line',
          yAxisIndex: 1,
          smooth: 0.25,
          showSymbol: false,
          lineStyle: { width: 1.3, color: '#D3B595', type: 'dashed' },
          itemStyle: { color: '#D3B595' },
          data: months.map((row) => row.frp),
        },
      ],
    });
  }, [data]);

  if (!selection) return null;

  const title = fmtCoords(selection.lat, selection.lon);
  const subtitle = data
    ? `${data.window.from} → ${data.window.to} · within ${fmtInt(data.radiusKm)} km · ${data.sensor === 'all' ? 'all sensors' : data.sensor}`
    : 'Reading the record around this coordinate…';

  return (
    <Panel
      kicker="LOCAL RECORD · SKELETON"
      title={title}
      subtitle={subtitle}
      className="location-detail"
      action={
        <div className="location-actions">
          <div className="segmented radius-picker" role="group" aria-label="Radius">
            {[250, 600, 1200].map((radius) => (
              <button
                key={radius}
                type="button"
                className={selection.radiusKm === radius ? 'active' : ''}
                onClick={() => onRadius(radius)}
              >
                {radius} km
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-quiet small" onClick={onClear}>
            <Icon name="close" size={12} /> Clear
          </button>
        </div>
      }
    >
      {record.loading && !data && (
        <div className="location-loading">
          <span className="pulse-dot" /> Reading the record around {title}…
        </div>
      )}

      {record.error && !data && (
        <div className="location-error">
          <Icon name="alert" size={16} />
          <p>{record.error}</p>
          <button type="button" className="btn btn-quiet small" onClick={record.reload}>
            <Icon name="refresh" size={12} /> Try again
          </button>
        </div>
      )}

      {data && !data.hasData && (
        <div className="location-empty">
          <Icon name="pin" size={18} />
          <div>
            <strong>No detections inside {fmtInt(data.radiusKm)} km.</strong>
            <p>
              {data.nearest
                ? `The nearest monitored region is ${data.nearest.name}, ${fmtInt(data.nearest.distanceKm)} km away.`
                : 'Try another point.'}{' '}
              Widen the radius or click closer to a region.
            </p>
          </div>
        </div>
      )}

      {data && data.hasData && (
        <>
          <div className="location-kpis">
            <Stat label="Detections" value={fmtInt(data.summary.detections)} />
            <Stat label="Harmonized fires" value={fmtInt(data.summary.fires)} />
            <Stat label="Mean FRP" value={fmtNumber(data.summary.meanFrp)} unit="MW" />
            <Stat label="High confidence" value={fmtPct(data.summary.highConfidenceShare, 0)} />
            <Stat label="Active days" value={fmtInt(data.summary.activeDays)} />
            <Stat
              label="Peak month"
              value={data.summary.peakMonth ? data.summary.peakMonth.label : '—'}
            />
          </div>

          <div className="location-grid">
            <div className="location-chart">
              <div className="location-block-head">
                <span>Monthly record at this point</span>
                <span className="mono muted">detections · FRP</span>
              </div>
              <Chart option={trend} height={286} />
            </div>

            <div className="location-mixes">
              <div className="location-block-head">
                <span>Intensity mix</span>
                <span className="mono muted">FRP bands</span>
              </div>
              <div className="mix-list">
                {data.intensityMix.map((row) => {
                  const share = data.summary.detections
                    ? row.count / data.summary.detections
                    : 0;
                  return (
                    <div className="mix-row" key={row.id}>
                      <span className="mix-label">
                        <span className="sensor-dot" style={{ background: row.color }} />
                        {row.label}
                      </span>
                      <div className="mix-track">
                        <span style={{ width: `${Math.max(2, share * 100)}%`, background: row.color }} />
                      </div>
                      <span className="mono">{fmtInt(row.count)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="location-block-head sensor-head">
                <span>Sensor mix</span>
                <span className="mono muted">share</span>
              </div>
              <div className="mix-list">
                {data.sensorMix.map((row) => (
                  <div className="mix-row" key={row.id}>
                    <span className="mix-label">
                      <span className="sensor-dot" style={{ background: SENSOR_COLORS[row.id] }} />
                      {row.name}
                    </span>
                    <div className="mix-track">
                      <span
                        style={{
                          width: `${Math.max(2, row.share * 100)}%`,
                          background: SENSOR_COLORS[row.id] || '#B8916A',
                        }}
                      />
                    </div>
                    <span className="mono">{fmtPct(row.share, 0)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="location-nearby">
            <div className="location-block-head">
              <span>Nearby monitored regions</span>
              <span className="mono muted">distance · share of local record</span>
            </div>
            <div className="nearby-list">
              {data.nearbyRegions.map((region) => (
                <div className="nearby-row" key={region.id}>
                  <span className="nearby-name">{region.name}</span>
                  <span className="mono dim">{fmtInt(region.distanceKm)} km</span>
                  <div className="nearby-bar">
                    <span style={{ width: `${Math.max(2, region.share * 100)}%` }} />
                  </div>
                  <span className="mono">{fmtPct(region.share, 0)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <p className="panel-footnote location-footnote">
        <Icon name="info" size={13} />
        <span>
          Data seam: this panel reads <code>GET /api/location</code> through{' '}
          <code>web/src/lib/api.js</code>. The mock uses a distance-weighted regional model;
          replace <code>getLocation()</code> in <code>server/data/source.js</code> (or your
          Postgres adapter) with a radius query over cleaned detections. Keep the response shape
          and this screen keeps working. The region filter does not apply to pinned points.
        </span>
      </p>
    </Panel>
  );
}
