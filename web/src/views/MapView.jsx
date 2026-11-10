import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useFilters } from '../state/Filters.jsx';
import { Panel, SectionHeader } from '../components/Panel.jsx';
import { ErrorState, EmptyState } from '../components/States.jsx';
import { IntensityLegend } from '../components/IntensityLegend.jsx';
import { Icon } from '../components/Icons.jsx';
import { SENSOR_COLORS } from '../lib/colors.js';
import { fmtDate, fmtInt, fmtNumber, fmtPct, MONTH_NAMES } from '../lib/format.js';

// Keyless dark basemap. CARTO's hosted dark tiles now require an API key, so we
// use Esri's public Dark Gray Canvas instead. Swap the URLs here if you later
// move to MapTiler, Stadia, or your own tiles.
const STYLE = {
  version: 8,
  sources: {
    'esri-dark': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 16,
      attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors',
    },
    'esri-labels': {
      type: 'raster',
      tiles: [
        'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 16,
      attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors',
    },
  },
  layers: [
    { id: 'ocean', type: 'background', paint: { 'background-color': '#0A0908' } },
    {
      id: 'basemap',
      type: 'raster',
      source: 'esri-dark',
      paint: { 'raster-opacity': 0.9, 'raster-brightness-max': 0.75, 'raster-contrast': 0.15 },
    },
    {
      id: 'basemap-labels',
      type: 'raster',
      source: 'esri-labels',
      paint: { 'raster-opacity': 0.5 },
    },
  ],
};

const EMPTY = { type: 'FeatureCollection', features: [] };

// A faint 30° grid keeps the map navigable even if the basemap tiles are
// blocked by a network or an ad blocker.
function buildGraticule() {
  const features = [];
  for (let lon = -180; lon <= 180; lon += 30) {
    const coordinates = [];
    for (let lat = -85; lat <= 85; lat += 5) coordinates.push([lon, lat]);
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates } });
  }
  for (let lat = -60; lat <= 60; lat += 30) {
    const coordinates = [];
    for (let lon = -180; lon <= 180; lon += 5) coordinates.push([lon, lat]);
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates } });
  }
  return { type: 'FeatureCollection', features };
}

const GRATICULE = buildGraticule();

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function toGeoJSON(points) {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
      properties: {
        id: point.id,
        frp: point.frp,
        color: point.intensity?.color || '#F97316',
        intensity: point.intensity?.label || '—',
        sensor: point.sensor?.name || '—',
        confidence: point.confidence?.label || '—',
        confidenceValue: point.confidence?.value ?? null,
        region: point.region?.name || '—',
        date: point.date,
      },
    })),
  };
}

export default function MapView({ meta }) {
  const { filters } = useFilters();
  const maxYear = Number((meta?.range?.max || '2025').slice(0, 4));
  const minYear = Number((meta?.range?.min || '2018').slice(0, 4));
  const [year, setYear] = useState(maxYear);
  const [month, setMonth] = useState(8);
  const [mode, setMode] = useState('raw');
  const [playing, setPlaying] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(null);
  const [basemapDown, setBasemapDown] = useState(false);

  const params = {
    year,
    month,
    mode,
    region: filters.region,
    sensor: filters.sensor,
  };
  const { data, loading, error, reload } = useApi(api.map, params);

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const popupRef = useRef(null);
  const fitKeyRef = useRef('');
  const dataRef = useRef(null);
  dataRef.current = data;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return undefined;
    let map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: STYLE,
        center: [12, 12],
        zoom: 1.4,
        minZoom: 1,
        maxZoom: 9,
        attributionControl: false,
        dragRotate: false,
      });
    } catch (error) {
      setMapError(error.message || 'WebGL is unavailable in this browser.');
      return undefined;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    let tileFailures = 0;
    let basemapHidden = false;

    map.on('load', () => {
      // Ignore a load callback from a map instance that has already been replaced.
      if (mapRef.current !== map) return;

      map.addSource('graticule', { type: 'geojson', data: GRATICULE });
      map.addLayer(
        {
          id: 'graticule',
          type: 'line',
          source: 'graticule',
          paint: { 'line-color': 'rgba(255,255,255,0.085)', 'line-width': 0.6 },
        },
        'basemap-labels',
      );

      map.addSource('fires', { type: 'geojson', data: EMPTY });

      map.addLayer({
        id: 'fire-heat',
        type: 'heatmap',
        source: 'fires',
        maxzoom: 7,
        paint: {
          'heatmap-weight': [
            'interpolate', ['linear'], ['get', 'frp'],
            0, 0.04, 20, 0.25, 60, 0.62, 150, 1,
          ],
          'heatmap-intensity': 0.85,
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 1, 8, 3, 18, 6, 32],
          'heatmap-opacity': 0.55,
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0,0,0,0)',
            0.12, 'rgba(250,204,21,0.18)',
            0.3, 'rgba(245,158,11,0.36)',
            0.55, 'rgba(249,115,22,0.52)',
            0.78, 'rgba(239,68,68,0.66)',
            1, 'rgba(185,28,28,0.82)',
          ],
        },
      });

      map.addLayer({
        id: 'fire-points',
        type: 'circle',
        source: 'fires',
        paint: {
          'circle-radius': [
            'interpolate', ['linear'], ['get', 'frp'],
            0, 2.2, 25, 3.6, 60, 5.4, 120, 8, 200, 11,
          ],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.92,
          'circle-stroke-color': 'rgba(10,9,8,0.8)',
          'circle-stroke-width': 0.6,
        },
      });

      map.on('click', 'fire-points', (event) => {
        const feature = event.features?.[0];
        if (!feature) return;
        const p = feature.properties;
        const coords = feature.geometry.coordinates.slice();
        const html = `
          <div class="map-popup">
            <div class="map-popup-kicker">${escapeHtml(p.region)} · ${fmtDate(p.date)}</div>
            <div class="map-popup-frp">${fmtNumber(p.frp)} <span>MW</span></div>
            <div class="map-popup-grid">
              <span>Sensor</span><b>${escapeHtml(p.sensor)}</b>
              <span>Confidence</span><b>${escapeHtml(p.confidence)}${
                p.confidenceValue != null ? ` · ${p.confidenceValue}%` : ''
              }</b>
              <span>Intensity</span><b>${escapeHtml(p.intensity)}</b>
            </div>
          </div>`;
        popupRef.current?.remove();
        popupRef.current = new maplibregl.Popup({ closeButton: true, offset: 10, maxWidth: '280px' })
          .setLngLat(coords)
          .setHTML(html)
          .addTo(map);
      });

      map.on('mouseenter', 'fire-points', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'fire-points', () => {
        map.getCanvas().style.cursor = '';
      });

      const observer = new ResizeObserver(() => map.resize());
      observer.observe(containerRef.current);
      map.once('remove', () => observer.disconnect());
      setMapReady(true);
    });

    map.on('error', (event) => {
      if (!event?.error || mapRef.current !== map) return;
      const message = String(event.error.message || '');

      if (message.includes('WebGL')) {
        setMapError(message);
        return;
      }

      // Tile failures are non-fatal. After a few of them, hide the basemap so
      // the graticule and fire layers read cleanly instead of stitching
      // error placeholders together.
      if (basemapHidden) return;
      tileFailures += 1;
      if (tileFailures >= 5) {
        basemapHidden = true;
        for (const id of ['basemap', 'basemap-labels']) {
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
        }
        setBasemapDown(true);
      }
    });

    return () => {
      popupRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    if (!data) return;
    const map = mapRef.current;
    if (!map || !mapReady) return;
    const source = map.getSource('fires');
    if (!source) return;
    source.setData(toGeoJSON(data.points));
    map.triggerRepaint();
    const fitKey = `${year}-${month}-${filters.region}`;
    if (fitKeyRef.current !== fitKey) {
      fitKeyRef.current = fitKey;
      map.fitBounds(data.bounds, { padding: 64, maxZoom: 3.8, duration: 900 });
    }
  }, [data, mapReady, year, month, filters.region]);

  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => {
      setMonth((current) => {
        if (current >= 12) {
          setPlaying(false);
          return 12;
        }
        return current + 1;
      });
    }, 1100);
    return () => clearInterval(timer);
  }, [playing]);

  const regionBreakdown = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    for (const point of data.points) {
      const entry = map.get(point.region.id) || {
        id: point.region.id,
        name: point.region.name,
        count: 0,
        frpSum: 0,
      };
      entry.count += 1;
      entry.frpSum += point.frp;
      map.set(point.region.id, entry);
    }
    return [...map.values()]
      .map((entry) => ({
        ...entry,
        share: data.points.length ? entry.count / data.points.length : 0,
        frp: entry.count ? entry.frpSum / entry.count : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [data]);

  const sensorKey = useMemo(() => {
    if (!data) return [];
    const map = new Map();
    for (const point of data.points) {
      const id = point.sensor.id;
      map.set(id, (map.get(id) || 0) + 1);
    }
    return [...map.entries()]
      .map(([id, count]) => ({
        id,
        name: meta?.sensors?.find((sensor) => sensor.id === id)?.short || id,
        count,
      }))
      .sort((a, b) => b.count - a.count);
  }, [data, meta]);

  return (
    <div className="view reveal map-view">
      <SectionHeader
        kicker="SPATIAL VIEW"
        title="A month of fire, one point per sample"
        description="Points are coloured by fire radiative power. The heat layer shows where those points concentrate. Every point is a sampled draw from the recorded detections, not the complete set of pixels."
      />

      <div className="map-controls panel">
        <div className="map-control-block">
          <span className="filter-label">Year</span>
          <div className="select-wrap compact">
            <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
              {(meta?.years || []).map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
            <Icon name="chevronDown" size={12} />
          </div>
        </div>

        <div className="map-control-block month-control">
          <span className="filter-label">Month</span>
          <button
            type="button"
            className={`play-btn ${playing ? 'active' : ''}`}
            onClick={() => setPlaying((value) => !value)}
            aria-label={playing ? 'Pause month playback' : 'Play month playback'}
          >
            <Icon name={playing ? 'pause' : 'play'} size={13} />
          </button>
          <input
            type="range"
            min="1"
            max="12"
            step="1"
            value={month}
            onChange={(event) => {
              setPlaying(false);
              setMonth(Number(event.target.value));
            }}
            aria-label="Month"
          />
          <span className="month-readout mono">{MONTH_NAMES[month - 1]}</span>
        </div>

        <div className="map-control-block">
          <span className="filter-label">Record</span>
          <div className="segmented">
            <button
              type="button"
              className={mode === 'raw' ? 'active' : ''}
              onClick={() => setMode('raw')}
            >
              Raw detections
            </button>
            <button
              type="button"
              className={mode === 'harmonized' ? 'active' : ''}
              onClick={() => setMode('harmonized')}
            >
              Harmonized fires
            </button>
          </div>
        </div>

        <div className="map-control-meta">
          {loading ? (
            <span className="inline-loading small"><span className="pulse-dot" /> Updating</span>
          ) : (
            <span className="mono">{minYear}–{maxYear} · UTC</span>
          )}
        </div>
      </div>

      {error && !data ? (
        <ErrorState error={error} onRetry={reload} />
      ) : (
        <div className="map-layout">
          <div className="map-panel">
            <div className="map-canvas" ref={containerRef} />
            {!mapReady && !mapError && (
              <div className="map-overlay">
                <span className="pulse-dot" /> Preparing the map…
              </div>
            )}
            {mapError && (
              <div className="map-overlay error">
                <Icon name="alert" size={18} />
                <p>Map unavailable: {mapError}</p>
                <p className="muted">The data panels still work. Try a WebGL-enabled browser.</p>
              </div>
            )}
            {data && data.points.length === 0 && !loading && (
              <div className="map-overlay">
                <Icon name="info" size={18} />
                <p>No sampled points for this month and filter.</p>
              </div>
            )}
            <div className="map-legend">
              <IntensityLegend classes={meta?.intensityClasses || []} compact />
            </div>
            <div className="map-corner-note mono">
              {data ? `${fmtInt(data.summary.shown)} sampled points` : '—'}
            </div>
            {basemapDown && (
              <div className="map-basemap-note">
                Basemap tiles are unavailable. The 30° grid and fire layer still work.
              </div>
            )}
          </div>

          <div className="map-side">
            <Panel kicker={`${MONTH_NAMES[month - 1]} ${year}`} title="Month at a glance" className="tight">
              {data ? (
                <div className="map-stats">
                  <div>
                    <span>{mode === 'harmonized' ? 'Harmonized fires' : 'Raw detections'}</span>
                    <strong>{fmtInt(data.summary.detections)}</strong>
                  </div>
                  <div>
                    <span>Sampled points</span>
                    <strong>{fmtInt(data.summary.shown)}</strong>
                  </div>
                  <div>
                    <span>Deduplication</span>
                    <strong>{fmtPct(data.summary.dedupRate, 1)}</strong>
                  </div>
                  <div>
                    <span>Mean FRP</span>
                    <strong>{fmtNumber(data.summary.avgFrp)} <small>MW</small></strong>
                  </div>
                </div>
              ) : (
                <div className="map-stats loading" />
              )}
              <div className="map-dedup-note">
                <Icon name="layers" size={14} />
                <span>
                  Harmonized mode applies cross-sensor deduplication. The gap between raw detections and
                  fires is the duplicate signal your pipeline removes.
                </span>
              </div>
            </Panel>

            <Panel kicker="TOP REGIONS" title="Where the points landed" className="tight">
              {regionBreakdown.length === 0 ? (
                <EmptyState title="No points" description="Pick another month." icon="pin" />
              ) : (
                <div className="map-region-list">
                  {regionBreakdown.map((region) => (
                    <div className="map-region-row" key={region.id}>
                      <span className="map-region-name">{region.name}</span>
                      <div className="map-region-bar">
                        <span style={{ width: `${Math.max(3, region.share * 100)}%` }} />
                      </div>
                      <span className="mono">{fmtPct(region.share, 0)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>

            <Panel kicker="PLATFORMS" title="Sampled sensor share" className="tight">
              <div className="map-sensor-list">
                {sensorKey.map((sensor) => (
                  <div key={sensor.id} className="map-sensor-row">
                    <span className="sensor-dot" style={{ background: SENSOR_COLORS[sensor.id] }} />
                    <span>{sensor.name}</span>
                    <span className="mono">{fmtInt(sensor.count)}</span>
                  </div>
                ))}
              </div>
              <p className="panel-footnote">
                Sampling favours the sensor mix of each day. Use the sensor filter for a single platform.
              </p>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
