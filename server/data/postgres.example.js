import { config } from '../config.js';
import { INTENSITY_CLASSES, REGIONS, SENSORS } from '../mock/catalog.js';

/**
 * ─────────────────────────────────────────────────────────────
 *  POSTGRES ADAPTER · worked example (not imported yet)
 * ─────────────────────────────────────────────────────────────
 * This file shows the intended pattern. It is NOT loaded by the
 * app, so the demo stays runnable without a database.
 *
 * To use it:
 *   1. Load your cleaned detections (see server/sql/schema.sql).
 *   2. Copy this file to server/data/postgres.js.
 *   3. Implement the remaining functions by following the same
 *      pattern: run SQL, return the SAME shape as the mock
 *      function of the same name.
 *   4. In server/data/source.js change:
 *
 *        export const source = mockSource;
 *      to
 *        export const source = postgresSource;
 *
 * `daily_region` is a materialized view with one row per
 * (date, region). Most panels are aggregations of that view.
 * =============================================================
 */
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

const DAY_MS = 86_400_000;

function iso(value) {
  return value.toISOString().slice(0, 10);
}

function scope(query = {}) {
  const from = /^\d{4}-\d{2}-\d{2}$/.test(query.from || '') ? query.from : '2018-01-01';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(query.to || '') ? query.to : iso(new Date());
  return {
    from,
    to,
    region: query.region && query.region !== 'all' ? query.region : null,
    sensor: query.sensor && query.sensor !== 'all' ? query.sensor : null,
  };
}

/** Returns the vocabulary and available date range for the UI. */
export async function getMeta() {
  const [{ rows: range }, { rows: years }] = await Promise.all([
    pool.query('SELECT min(observed_date) AS min, max(observed_date) AS max FROM daily_region'),
    pool.query('SELECT DISTINCT extract(year FROM observed_date)::int AS year FROM daily_region ORDER BY 1'),
  ]);

  return {
    mode: 'database',
    mock: false,
    sourceLabel: 'Connected Postgres record',
    generatedAt: new Date().toISOString(),
    range: { min: iso(range[0].min), max: iso(range[0].max) },
    years: years.map((row) => row.year),
    baselineYears: [2018, 2022],
    regions: REGIONS.map(({ id, name, country, lat, lon }) => ({ id, name, country, lat, lon })),
    sensors: SENSORS.map(({ id, name, short, family, pixel, confidence, since, dataFrom }) => ({
      id, name, short, family, pixel, confidence, since, dataFrom: dataFrom ?? null,
    })),
    intensityClasses: INTENSITY_CLASSES,
    channels: {
      api: 'web/src/lib/api.js',
      source: 'server/data/source.js',
      postgresExample: 'server/data/postgres.example.js',
      schema: 'server/sql/schema.sql',
    },
  };
}

/**
 * OVERVIEW — the SQL version of getOverview() in source.js.
 * The `WHERE` clause accepts an optional region. Sensor filtering
 * is applied through the `sensors` JSON column for the per-sensor
 * panels; for a first pass you can ignore the sensor filter and
 * document that limitation.
 */
export async function getOverview(query) {
  const { from, to, region } = scope(query);
  const params = [from, to];
  const regionClause = region ? 'AND region_id = $3' : '';
  if (region) params.push(region);

  const totalsSql = `
    SELECT
      coalesce(sum(detections), 0)::bigint              AS detections,
      coalesce(sum(fires), 0)::bigint                   AS fires,
      round((sum(mean_frp * detections) /
        nullif(sum(detections), 0))::numeric, 1)        AS mean_frp,
      coalesce(sum(high_confidence), 0)::bigint         AS high_confidence,
      coalesce(sum(cls_low), 0)::bigint                 AS low,
      coalesce(sum(cls_moderate), 0)::bigint            AS moderate,
      coalesce(sum(cls_high), 0)::bigint                AS high,
      coalesce(sum(cls_very_high), 0)::bigint           AS very_high,
      coalesce(sum(cls_extreme), 0)::bigint             AS extreme,
      count(DISTINCT observed_date)                     AS active_days
    FROM daily_region
    WHERE observed_date BETWEEN $1 AND $2 ${regionClause};
  `;

  const monthlySql = `
    SELECT
      to_char(date_trunc('month', observed_date), 'YYYY-MM') AS period,
      sum(detections)::bigint AS detections,
      sum(fires)::bigint AS fires,
      round((sum(mean_frp * detections) /
        nullif(sum(detections), 0))::numeric, 1) AS frp
    FROM daily_region
    WHERE observed_date BETWEEN $1 AND $2 ${regionClause}
    GROUP BY 1
    ORDER BY 1;
  `;

  const [{ rows: totalRows }, { rows: monthlyRows }] = await Promise.all([
    pool.query(totalsSql, params),
    pool.query(monthlySql, params),
  ]);

  const total = totalRows[0];
  return {
    range: { from, to, days: Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS) + 1 },
    filters: { region: region ?? 'all', sensor: query.sensor ?? 'all' },
    kpis: {
      detections: Number(total.detections),
      fires: Number(total.fires),
      meanFrp: Number(total.mean_frp || 0),
      highConfidenceShare: total.detections
        ? Number(total.high_confidence) / Number(total.detections)
        : 0,
      activeDays: Number(total.active_days),
    },
    monthly: monthlyRows.map((row) => ({
      period: row.period,
      label: row.period,
      detections: Number(row.detections),
      fires: Number(row.fires),
      frp: Number(row.frp || 0),
    })),
    intensityMix: [
      { id: 'low', label: 'Low', color: '#FACC15', count: Number(total.low) },
      { id: 'moderate', label: 'Moderate', color: '#F59E0B', count: Number(total.moderate) },
      { id: 'high', label: 'High', color: '#F97316', count: Number(total.high) },
      { id: 'veryHigh', label: 'Very high', color: '#EF4444', count: Number(total.very_high) },
      { id: 'extreme', label: 'Extreme', color: '#B91C1C', count: Number(total.extreme) },
    ],
    // TODO: topRegions, sensorMix, confidence bands, calibration snapshot.
    // Follow the same pattern, or import getCalibration from the mock while
    // you migrate one panel at a time.
  };
}

/**
 * MAP — pull sampled points for one month. If your detections table
 * is very large, aggregate to a grid first, or return a capped
 * random sample:
 *
 *   SELECT ... FROM fire_detections
 *   WHERE acquired_date >= $1 AND acquired_date < $2
 *   ORDER BY random() LIMIT 3500;
 */
export async function getMap(query) {
  const year = Number(query.year) || new Date().getUTCFullYear();
  const month = Number(query.month) || 1;
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to = iso(new Date(Date.UTC(year, month, 1)));

  const { rows } = await pool.query(
    `SELECT id, acquired_date AS date, latitude AS lat, longitude AS lon,
            frp_mw, confidence_pct, sensor, region_id
       FROM fire_detections
      WHERE acquired_date >= $1 AND acquired_date < $2
        AND ($3::text IS NULL OR region_id = $3)
        AND ($4::text IS NULL OR sensor = $4)
      ORDER BY frp_mw DESC
      LIMIT 3500`,
    [from, to, scope(query).region, scope(query).sensor],
  );

  return {
    year,
    month,
    mode: query.mode === 'harmonized' ? 'harmonized' : 'raw',
    points: rows.map((row) => ({
      id: String(row.id),
      date: iso(row.date),
      lat: row.lat,
      lon: row.lon,
      frp: row.frp_mw,
      confidence: { value: row.confidence_pct, label: null },
      sensor: { id: row.sensor, name: row.sensor, family: null },
      intensity: null, // classify with INTENSITY_CLASSES in the adapter
    })),
    summary: { shown: rows.length },
  };
}

// TODO: getTimeseries, getCalendar, getTrends, getAnomalies, getCalibration.
// Each one is a SELECT ... GROUP BY against daily_region (or anomalies /
// calibration_pairs) returning the shape documented in source.js.
//
// Tip: keep the mock response open in a second terminal:
//   curl http://localhost:8787/api/overview | jq .
// and make the SQL response match it field for field.
