# Data drop zone

Put cleaned fire data here **locally**. Everything in this folder is
git-ignored except this README and `.gitkeep`, so large CSV/Parquet files never
reach GitHub.

The app does not read these files directly. They are loaded into Postgres, and
the API adapter reads the database. This folder is where they live between
exports.

```
data/
├── raw/           # untouched FIRMS / MODIS / VIIRS downloads
├── cleaned/       # harmonized CSV, one row per detection
├── parquet/       # the same rows as Parquet, partitioned by year
└── README.md
```

---

## 1. What one row means

The target table is `fire_detections` in
[`server/sql/schema.sql`](../server/sql/schema.sql). One row = one cleaned
detection (one MODIS pixel or one VIIRS pixel) at a UTC timestamp.

| Column | Type | Notes |
| --- | --- | --- |
| `observed_at` | `TIMESTAMPTZ` | UTC acquisition time, e.g. `2024-08-29 18:42:00+00` |
| `acquired_date` | `DATE` | UTC date, used for every daily roll-up |
| `sensor` | `TEXT` | FK to `sensors`: `terra`, `aqua`, `snpp`, `noaa20`, `noaa21` |
| `latitude`, `longitude` | `DOUBLE PRECISION` | WGS84, decimal degrees |
| `frp_mw` | `REAL` | fire radiative power in MW; the intensity palette is built from this |
| `brightness_k` | `REAL` | brightness temperature, optional |
| `confidence_raw` | `TEXT` | what the sensor reported: `78` or `L` / `N` / `H` |
| `confidence_pct` | `REAL` | harmonized 0–100 |
| `confidence_class` | `TEXT` | `low` / `nominal` / `high` after harmonization |
| `region_id` | `TEXT` | FK to `regions`; assign it in your cleaning step |
| `record_type` | `TEXT` | `matched`, `modis_only`, or `viirs_only` |
| `match_group_id` | `BIGINT` | matched MODIS/VIIRS rows share one id |
| `qc_flags` | `TEXT[]` | e.g. `{cloud,glint}` — keep the flags you filtered on |
| `source_file` | `TEXT` | provenance, e.g. `VNP14IMG.A2024241.001` |

Two things to keep straight:

- **VIIRS pixels are 375 m. MODIS pixels are 1 km.** The 1.5 km / 60 min
  window in the UI is the *matching* rule, not a pixel size.
- **Confidence means different things.** MODIS reports 0–100; VIIRS reports
  Low / Nominal / High. The calibration step learns a 0–100 anchor for each
  VIIRS class so both sensors share one scale.

---

## 2. Load a cleaned CSV

Create the schema once:

```bash
psql "$DATABASE_URL" -f server/sql/schema.sql
```

Then load the file. `\copy` is a psql command (not SQL), so run it inside
`psql`:

```
\copy fire_detections (observed_at, acquired_date, sensor, latitude, longitude, frp_mw, brightness_k, confidence_raw, confidence_pct, confidence_class, region_id, record_type, match_group_id, qc_flags, source_file) FROM 'data/cleaned/fire_detections.csv' WITH (FORMAT csv, HEADER true)
```

UTF-8, comma-separated, one header row. Empty values become `NULL`. For an
array column, write `{cloud,glint}` or leave it empty.

---

## 3. Load Parquet

Parquet is usually the better hand-off from a cleaning notebook. Use DuckDB —
it reads Parquet natively and writes straight into Postgres.

Install DuckDB, then from the repo root:

```sql
INSTALL postgres;
LOAD postgres;

ATTACH 'host=localhost port=5432 dbname=firerecord user=postgres password=...'
  AS firerecord (TYPE postgres);

INSERT INTO firerecord.fire_detections
  (observed_at, acquired_date, sensor, latitude, longitude, frp_mw,
   confidence_pct, confidence_class, region_id, record_type, match_group_id)
SELECT
  observed_at,
  CAST(observed_at AS DATE) AS acquired_date,
  sensor,
  latitude,
  longitude,
  frp_mw,
  confidence_pct,
  confidence_class,
  region_id,
  record_type,
  match_group_id
FROM read_parquet('data/parquet/**/*.parquet');
```

If your Parquet is partitioned by year (`data/parquet/year=2024/...`), the glob
still works. For a first smoke test, add `LIMIT 100000`.

---

## 4. Refresh the dashboard roll-up

Every chart reads `daily_region`, the materialized view at the bottom of the
schema. Refresh it after each load:

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_region;
```

`CONCURRENTLY` needs the unique index that the schema already creates. If you
have just created the view and it is still empty, use it without `CONCURRENTLY`
the first time.

---

## 5. Check that it landed

```sql
SELECT min(acquired_date), max(acquired_date), count(*) FROM fire_detections;
SELECT sensor, count(*) FROM fire_detections GROUP BY 1 ORDER BY 2 DESC;
SELECT region_id, sum(detections) FROM daily_region GROUP BY 1 ORDER BY 2 DESC;
```

Then compare the API against the mock shape:

```bash
curl http://localhost:8787/api/overview | jq .
```

---

## 6. Calibration tables (optional but honest)

The Calibration screen needs two extra pieces if you want to replace every
number:

- `calibration_pairs` — one row per candidate MODIS/VIIRS pair, with distance,
  time offset, both confidences, FRP delta, and `matched`.
- `calibration_anchors` — the learned L / N / H → 0–100 mapping per calibration
  run.

Both tables are already in the schema. Point your matching notebook at them,
then implement `getCalibration()` in
[`server/data/postgres.example.js`](../server/data/postgres.example.js).

---

## 7. Coordinate record (`/api/location`)

The map's click-to-pin panel needs no extra table: it is a radius query over
`fire_detections`. The mock implementation is `getLocation()` in
[`server/data/source.js`](../server/data/source.js); a worked haversine query is
in [`server/data/postgres.example.js`](../server/data/postgres.example.js).

```
GET /api/location?lat=..&lon=..&radiusKm=600&from=..&to=..&sensor=..
```

Keep the response shape (`summary`, `monthly`, `intensityMix`, `sensorMix`,
`nearbyRegions`, `nearest`) and the pinned-point panel in the browser keeps
working. If your coordinates are indexed, add a GiST index on a `geography`
column or a bounding-box prefilter; the example shows the portable version.

---

## 8. Connect the app

1. Copy `.env.example` to `.env` and set `DATABASE_URL`.
2. Copy `server/data/postgres.example.js` to `server/data/postgres.js`.
3. Implement the functions you need. Keep each response shape identical to the
   mock function of the same name.
4. In `server/data/source.js`, switch the export:

```js
// export const source = mockSource;
import { source as postgresSource } from './postgres.js';
export const source = postgresSource;
```

5. Restart the API and reload the UI. The header badge changes from **MOCK
   DATA** to **LIVE DATA** once `getMeta()` returns `mock: false`.

Nothing in `web/src` needs to change. That is the seam.
