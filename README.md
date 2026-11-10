# Beyond the Known

A public window into a harmonized **MODIS + VIIRS** fire record — seven screens,
one data seam, and a fire palette that runs from pale yellow to deep red.

> **This repository ships with synthetic data.** The numbers are generated so
> the design can be reviewed before a real pipeline exists. Every screen says
> so. Swap the adapter (see below) and the same UI shows your record.

Built for the NASA Space Apps hackathon. The intended real source is
[NASA FIRMS](https://firms.modaps.eosdis.nasa.gov/) active-fire detections —
MODIS Terra/Aqua (1 km) and VIIRS Suomi NPP / NOAA-20 / NOAA-21 (375 m).

---

## What is inside

| Screen | What it answers |
| --- | --- |
| **Overview** | How much fire, how strong, where, and how confidence is distributed |
| **Fire map** | Where a chosen month burned, point by point, with a heat layer and playback |
| **Calendar** | Year strip, years × months, months × days, and seasonal cycles |
| **Trends** | Long arcs, regional season heatmap, intensity mix, platform mix |
| **Anomalies** | Days outside the 2018–2022 seasonal baseline, ranked by severity |
| **Calibration** | How VIIRS and MODIS were matched, how confident the match is, where it is weakest |
| **Methods** | The pipeline, the file map, and the four steps to connect real data |

The palette is reserved: **yellow → amber → orange → red → dark red** only ever
means fire radiative power (FRP). Everything else — sensors, confidence, sample
counts — uses a sand/neutral scale, so the eye never confuses "trust" with
"intensity".

| FRP | Class | Colour |
| --- | --- | --- |
| 0–10 MW | Low | `#FACC15` |
| 10–25 MW | Moderate | `#F59E0B` |
| 25–50 MW | High | `#F97316` |
| 50–100 MW | Very high | `#EF4444` |
| 100+ MW | Extreme | `#B91C1C` |

---

## Quickstart

Requirements: **Node.js 18+** and npm. No database is needed for the demo.

```bash
npm install
npm run dev
```

- UI → <http://localhost:5180>
- API → <http://localhost:8787/api/health>

`npm run dev` starts the Express API and the Vite dev server together. The Vite
server proxies `/api` to Express, so there is no CORS setup in development.

Production build:

```bash
npm run build   # writes dist/
npm start       # Express serves the UI and the API on :8787
```

Override ports with `PORT` (API) and `WEB_PORT` (Vite). See
[`.env.example`](.env.example).

---

## Connect your cleaned data

Use the **Data** page in the app, or read
[`data/README.md`](data/README.md) for the full walkthrough. The short version:

1. **Create the tables**
   ```bash
   psql "$DATABASE_URL" -f server/sql/schema.sql
   ```
2. **Load the rows** — CSV with psql `\copy`, or Parquet with DuckDB. Both
   paths are written out in `data/README.md`.
3. **Refresh the roll-up**
   ```sql
   REFRESH MATERIALIZED VIEW CONCURRENTLY daily_region;
   ```
4. **Implement the adapter** — copy `server/data/postgres.example.js` to
   `server/data/postgres.js`, fill in the functions, then flip the export at the
   bottom of `server/data/source.js`:

   ```js
   // export const source = mockSource;
   import { source as postgresSource } from './postgres.js';
   export const source = postgresSource;
   ```

Keep each response shape identical to the mock function of the same name. The
React app never changes.

`postgres.example.js` contains a complete `getMeta()` and `getOverview()` plus a
map query. The remaining functions follow the same pattern and carry TODO
comments.

---

## The one seam

```
web/src/views/*  ──►  web/src/lib/api.js  ──►  /api/*  ──►  server/data/source.js
                         (only HTTP here)              (mock | postgres adapter)
```

- **The UI** only calls `api.js`. No component knows about SQL.
- **The API** only calls `source.js`. Routes are thin.
- **`source.js`** is the switch. Change one export to go from mock to Postgres.
- **`server/sql/schema.sql`** describes the tables the adapter expects.

If you host the UI and API on different origins, set `VITE_API_BASE` (for
example `https://api.example.org`) at build time.

---

## API contract

All endpoints accept `from`, `to`, `region`, and `sensor` where they make sense.
Dates are `YYYY-MM-DD` (UTC). Region and sensor ids come from `/api/meta`.

| Endpoint | Extra params | Returns |
| --- | --- | --- |
| `GET /api/meta` | — | Range, years, regions, sensors, intensity classes, channel paths |
| `GET /api/overview` | — | KPIs, monthly series, region ranking, confidence, calibration snapshot |
| `GET /api/timeseries` | `grain=month\|year` | Monthly or annual series with intensity split |
| `GET /api/calendar` | `year` | Day strip, year × month, month × day, seasonal cycles |
| `GET /api/trends` | — | Annual totals, region × month climatology, per-sensor series |
| `GET /api/anomalies` | `severity` | Episodes, observed vs baseline, severity mix |
| `GET /api/calibration` | — | Matched pairs, anchors, reliability, histograms, region agreement |
| `GET /api/map` | `year`, `month`, `mode=raw\|harmonized` | Sampled points, bounds, monthly summary |
| `GET /api/health` | — | Data mode and disclaimer |

Responses are JSON and are never cached (`Cache-Control: no-store`).

---

## How the demo record is made

`server/mock/` builds a deterministic 2018–2025 record: seasonal Gaussian
curves per region, lognormal fire sizes, year factors, glint/cloud dropouts, and
per-sensor availability (NOAA-21 joins in 2022). It is seeded, so the same
inputs produce the same screens.

The anomaly baseline is **2018–2022**: for each region and day of year, the mock
computes the mean and spread of detections, detrends later years by the annual
factor, and flags |z| ≥ 2.5 with a minimum effect size. Episodes separated by
fewer than three quiet days are merged.

The calibration screen's matching rule is **1.5 km and 60 minutes**. VIIRS is
375 m; MODIS is 1 km. Confidence is harmonized by learning a 0–100 anchor for
each VIIRS class (L / N / H) from matched MODIS pairs. All of these values are
illustrative until you connect `calibration_pairs` and `calibration_anchors`.

---

## Project structure

```
server/
  index.js               Express app + static dist/
  config.js              PORT, DATABASE_URL, NODE_ENV
  routes/api.js          Eight thin routes
  data/source.js         THE SWITCH (mock ⇄ postgres)
  data/postgres.example.js  Worked adapter example (not imported)
  mock/                  Seeded synthetic record
  sql/schema.sql         Tables, indexes, daily_region, calibration, anomalies
web/
  src/lib/api.js         The only HTTP client in the UI
  src/views/             Seven screens
  src/components/        Charts, panels, calendar grids, map chrome
  src/styles/global.css  Design tokens and responsive rules
data/                    Local drop zone (git-ignored) + loading guide
```

---

## Deployment notes

- The build is a static `dist/` plus a small Node server. Any Node host works:
  `npm ci && npm run build && npm start`.
- Set `PORT` if the platform requires one. Express serves the SPA and the API
  from the same origin.
- The basemap is Esri's keyless Dark Gray Canvas. If tiles are blocked, the map
  hides the basemap and keeps the graticule and fire layer visible.
- There is no authentication and no write endpoint. If you add uploads or a
  private dataset, put authentication in front of the API first.

---

## Credits

- Concept inspired by [Fire Calendar](https://firecalendar.onrender.com/).
- Real ingestion is designed around NASA FIRMS MODIS and VIIRS products.
- Basemap © Esri, HERE, Garmin, © OpenStreetMap contributors.
- Typefaces: Inter, Sora, IBM Plex Mono (Google Fonts).
- Icons are inline SVG drawn for this project.

The mock record is not a NASA product and must not be cited as one.
