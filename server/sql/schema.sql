-- ============================================================
--  BEYOND THE KNOWN · suggested Postgres schema
-- ============================================================
-- This is a starting point, not a requirement. Your pipeline can
-- keep its own table names as long as the data adapter returns the
-- response shapes described in server/data/source.js.
--
-- Load order:
--   1. schema.sql
--   2. your cleaned detections (CSV / Parquet)
--   3. refresh daily_region
-- ============================================================

CREATE TABLE IF NOT EXISTS regions (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  country     TEXT,
  lat         DOUBLE PRECISION,
  lon         DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS sensors (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  family      TEXT NOT NULL,          -- MODIS | VIIRS
  pixel       TEXT,                    -- '1 km' | '375 m'
  data_from   INT
);

INSERT INTO regions (id, name, country, lat, lon) VALUES
  ('amazon',    'Amazon Basin',          'Brazil · Peru · Bolivia', -5.5,  -63.0),
  ('cerrado',   'Cerrado',               'Brazil',                 -13.5,  -48.0),
  ('congo',     'Congo Basin',           'DR Congo · Angola',       -2.0,   22.5),
  ('seasia',    'Maritime SE Asia',      'Indonesia · Malaysia',     0.6,  112.0),
  ('med',       'Mediterranean',         'Greece · Spain · Italy',  39.2,   19.5),
  ('wna',       'Western North America', 'United States · Canada',  41.5, -121.0),
  ('siberia',   'Boreal Siberia',        'Russia',                  60.0,  100.0),
  ('australia', 'Northern Australia',    'Australia',              -16.0,  133.0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sensors (id, name, family, pixel, data_from) VALUES
  ('terra',  'MODIS · Terra',    'MODIS', '1 km',  2000),
  ('aqua',   'MODIS · Aqua',     'MODIS', '1 km',  2002),
  ('snpp',   'VIIRS · Suomi NPP','VIIRS', '375 m', 2011),
  ('noaa20', 'VIIRS · NOAA-20',  'VIIRS', '375 m', 2017),
  ('noaa21', 'VIIRS · NOAA-21',  'VIIRS', '375 m', 2022)
ON CONFLICT (id) DO NOTHING;

-- One row per cleaned detection that enters the harmonized record.
-- Matched MODIS/VIIRS pairs share a match_group_id, so fire counts
-- use COUNT(DISTINCT match_group_id) instead of COUNT(*).
CREATE TABLE IF NOT EXISTS fire_detections (
  id               BIGSERIAL PRIMARY KEY,
  observed_at      TIMESTAMPTZ NOT NULL,   -- UTC
  acquired_date    DATE NOT NULL,          -- UTC date
  sensor           TEXT NOT NULL REFERENCES sensors(id),
  latitude         DOUBLE PRECISION NOT NULL,
  longitude        DOUBLE PRECISION NOT NULL,
  frp_mw           REAL,                   -- fire radiative power
  brightness_k     REAL,
  confidence_raw   TEXT,                   -- '78' or 'N' / 'L' / 'H'
  confidence_pct   REAL,                   -- harmonized 0–100
  confidence_class TEXT,                   -- low | nominal | high
  region_id        TEXT NOT NULL REFERENCES regions(id),
  record_type      TEXT NOT NULL,          -- matched | modis_only | viirs_only
  match_group_id   BIGINT,
  qc_flags         TEXT[] DEFAULT '{}',
  source_file      TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fire_detections_date_idx
  ON fire_detections (acquired_date);
CREATE INDEX IF NOT EXISTS fire_detections_region_date_idx
  ON fire_detections (region_id, acquired_date);
CREATE INDEX IF NOT EXISTS fire_detections_sensor_date_idx
  ON fire_detections (sensor, acquired_date);
CREATE INDEX IF NOT EXISTS fire_detections_match_idx
  ON fire_detections (match_group_id)
  WHERE match_group_id IS NOT NULL;

-- Daily aggregate that most endpoints read from.
-- Refresh after each load:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY daily_region;
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_region AS
WITH base AS (
  SELECT
    acquired_date                         AS observed_date,
    region_id,
    count(*)::int                         AS detections,
    count(DISTINCT match_group_id)::int   AS fires,
    round(avg(frp_mw)::numeric, 1)        AS mean_frp,
    round(avg(confidence_pct)::numeric, 1) AS mean_confidence,
    count(*) FILTER (WHERE confidence_pct >= 75)::int AS high_confidence,
    count(*) FILTER (WHERE frp_mw < 10)::int          AS cls_low,
    count(*) FILTER (WHERE frp_mw >= 10 AND frp_mw < 25)::int AS cls_moderate,
    count(*) FILTER (WHERE frp_mw >= 25 AND frp_mw < 50)::int AS cls_high,
    count(*) FILTER (WHERE frp_mw >= 50 AND frp_mw < 100)::int AS cls_very_high,
    count(*) FILTER (WHERE frp_mw >= 100)::int        AS cls_extreme
  FROM fire_detections
  GROUP BY acquired_date, region_id
),
sensor_counts AS (
  SELECT observed_date, region_id, jsonb_object_agg(sensor, n) AS sensors
  FROM (
    SELECT acquired_date AS observed_date, region_id, sensor, count(*)::int AS n
    FROM fire_detections
    GROUP BY acquired_date, region_id, sensor
  ) s
  GROUP BY observed_date, region_id
)
SELECT b.*, coalesce(sc.sensors, '{}'::jsonb) AS sensors
FROM base b
LEFT JOIN sensor_counts sc USING (observed_date, region_id);

CREATE UNIQUE INDEX IF NOT EXISTS daily_region_key
  ON daily_region (observed_date, region_id);
CREATE INDEX IF NOT EXISTS daily_region_region_idx
  ON daily_region (region_id, observed_date);

-- Calibration artefacts written by your pipeline.
CREATE TABLE IF NOT EXISTS calibration_anchors (
  id          SERIAL PRIMARY KEY,
  label       TEXT NOT NULL,               -- L / N / H
  mean_pct    REAL NOT NULL,
  p25_pct     REAL,
  p75_pct     REAL,
  pair_count  BIGINT,
  valid_from  DATE,
  valid_to    DATE
);

CREATE TABLE IF NOT EXISTS calibration_pairs (
  id                BIGSERIAL PRIMARY KEY,
  pair_date         DATE NOT NULL,
  region_id         TEXT REFERENCES regions(id),
  modis_sensor      TEXT REFERENCES sensors(id),
  viirs_sensor      TEXT REFERENCES sensors(id),
  distance_m        REAL,
  time_offset_min   REAL,
  modis_confidence  REAL,
  viirs_label       TEXT,                  -- L / N / H
  frp_delta_pct     REAL,
  matched           BOOLEAN
);

CREATE INDEX IF NOT EXISTS calibration_pairs_date_idx
  ON calibration_pairs (pair_date);

-- Anomalies computed by the pipeline (or the view below).
CREATE TABLE IF NOT EXISTS anomalies (
  id            BIGSERIAL PRIMARY KEY,
  anomaly_date  DATE NOT NULL,
  region_id     TEXT REFERENCES regions(id),
  kind          TEXT NOT NULL,             -- count | intensity
  observed      REAL NOT NULL,
  expected      REAL NOT NULL,
  z_score       REAL NOT NULL,
  severity      TEXT NOT NULL,             -- watch | advisory | critical
  direction     TEXT,                      -- above | below
  note          TEXT,
  UNIQUE (anomaly_date, region_id, kind)
);

CREATE INDEX IF NOT EXISTS anomalies_date_idx ON anomalies (anomaly_date);

-- Optional: derive flagged days directly from daily_region.
CREATE OR REPLACE VIEW anomaly_candidates AS
WITH baseline AS (
  SELECT
    region_id,
    extract(doy FROM observed_date)::int AS doy,
    avg(detections)                       AS mean_detections,
    stddev_samp(detections)               AS sd_detections
  FROM daily_region
  WHERE extract(year FROM observed_date) BETWEEN 2018 AND 2022
  GROUP BY 1, 2
)
SELECT
  d.observed_date,
  d.region_id,
  d.detections AS observed,
  round(b.mean_detections::numeric, 1) AS expected,
  round(
    ((d.detections - b.mean_detections) /
      greatest(b.sd_detections, b.mean_detections * 0.15))::numeric,
    2
  ) AS z_score
FROM daily_region d
JOIN baseline b
  ON b.region_id = d.region_id
 AND b.doy = extract(doy FROM d.observed_date)::int
WHERE extract(year FROM d.observed_date) > 2022;
