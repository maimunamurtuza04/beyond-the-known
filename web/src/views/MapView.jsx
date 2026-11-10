import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { api } from '../lib/api.js';
import { useApi } from '../lib/useApi.js';
import { useFilters } from '../state/Filters.jsx';
import { Panel, SectionHeader } from '../components/Panel.jsx';
import { ErrorState, EmptyState } from '../components/States.jsx';
import { LocationDetail, LocationQuickCard, useLocationRecord } from '../components/LocationPanel.jsx';
import { Icon } from '../components/Icons.jsx';
import { SENSOR_COLORS } from '../lib/colors.js';
import { fmtCoords, fmtInt, fmtNumber, fmtPct, MONTH_NAMES } from '../lib/format.js';

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
      paint: { 'raster-opacity': 1, 'raster-brightness-max': 0.95, 'raster-contrast': 0.08 },
    },
    {
      id: 'basemap-labels',
      type: 'raster',
      source: 'esri-labels',
      paint: { 'raster-opacity': 0.72 },
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

function toGeoJSON(points) {
  return {
    type: 'FeatureCollection',
    features: points.map((point) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
      properties: { id: point.id },
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
  const [selection, setSelection] = useState(null);

  const params = {
    year,
    month,
    mode,
    region: filters.region,
    sensor: filters.sensor,
  };
  const { data, loading, error, reload } = useApi(api.map, params);
  const location = useLocationRecord(selection, {
    from: filters.from,
    to: filters.to,
    sensor: filters.sensor,
  });

  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const fitKeyRef = useRef('');

  const clearSelection = () => setSelection(null);

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
        id: 'fire-points',
        type: 'circle',
        source: 'fires',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2, 3, 2.8, 6, 4.2],
          'circle-color': '#FF7A2F',
          'circle-opacity': 0.85,
          'circle-stroke-color': 'rgba(10,9,8,0.65)',
          'circle-stroke-width': 0.5,
        },
      });

      // Any click pins a coordinate. The location panel then reads the local
      // record around that point via GET /api/location.
      map.getCanvas().style.cursor = 'crosshair';
      map.on('click', (event) => {
        setSelection((previous) => ({
          lat: Number(event.lngLat.lat.toFixed(4)),
          lon: Number(event.lngLat.lng.toFixed(4)),
          radiusKm: previous?.radiusKm ?? 600,
        }));
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
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return undefined;
    if (!selection) {
      markerRef.current?.remove();
      markerRef.current = null;
      return undefined;
    }
    if (!markerRef.current) {
      const element = document.createElement('div');
      element.className = 'map-pin';
      element.innerHTML = '<span class="map-pin-ring"></span><span class="map-pin-dot"></span>';
      markerRef.current = new maplibregl.Marker({ element, anchor: 'center' })
        .setLngLat([selection.lon, selection.lat])
        .addTo(map);
    } else {
      markerRef.current.setLngLat([selection.lon, selection.lat]);
    }
    return undefined;
  }, [selection, mapReady]);

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
        description="Every dot is one sampled detection, in a single colour so the geography stays readable. Click anywhere on the map to pin that coordinate and read the local record around it. Each dot is a sampled draw, not the complete set of pixels."
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
              <div className="map-legend-row">
                <span className="map-legend-dot" />
                <span>Sampled detection</span>
              </div>
              <div className="map-legend-row">
                <span className="map-legend-cross" />
                <span>Pinned point · click map</span>
              </div>
            </div>
            <div className="map-corner-note mono">
              {data ? `${fmtInt(data.summary.shown)} sampled points` : '—'}
            </div>
            {selection && (
              <div className="map-coord-chip">
                <Icon name="pin" size={13} />
                <div className="map-coord-text">
                  <span>Pinned coordinate</span>
                  <b className="mono">{fmtCoords(selection.lat, selection.lon)}</b>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={clearSelection}
                  aria-label="Clear pinned coordinate"
                >
                  <Icon name="close" size={12} />
                </button>
              </div>
            )}
            {basemapDown && (
              <div className="map-basemap-note">
                Basemap tiles are unavailable. The 30° grid and fire layer still work.
              </div>
            )}
          </div>

          <div className="map-side">
            <LocationQuickCard selection={selection} record={location} onClear={clearSelection} />

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

      <LocationDetail
        selection={selection}
        record={location}
        onRadius={(radiusKm) =>
          setSelection((previous) => (previous ? { ...previous, radiusKm } : previous))
        }
        onClear={clearSelection}
      />
    </div>
  );
}
