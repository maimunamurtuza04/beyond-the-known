import { Panel, SectionHeader } from '../components/Panel.jsx';
import { Icon } from '../components/Icons.jsx';

const PIPELINE = [
  {
    step: '01',
    name: 'Clean',
    icon: 'spark',
    text: 'Remove glint, cloud, water and low-quality pixels. Keep the QC flags so a review can reverse any drop.',
    path: 'server/sql/schema.sql · qc_flags',
  },
  {
    step: '02',
    name: 'Unify',
    icon: 'layers',
    text: 'One row per detection: UTC date, latitude, longitude, FRP in MW, confidence on a 0–100 scale.',
    path: 'server/sql/schema.sql · fire_detections',
  },
  {
    step: '03',
    name: 'Match',
    icon: 'pin',
    text: 'Pair VIIRS with MODIS inside 1.5 km and 60 minutes. Duplicates share a match group before harmonization.',
    path: 'server/data/source.js · getMap',
  },
  {
    step: '04',
    name: 'Calibrate',
    icon: 'target',
    text: 'Average MODIS confidence behind each VIIRS class to freeze Low / Nominal / High anchors. Trust means the same everywhere.',
    path: 'server/data/source.js · getCalibration',
  },
  {
    step: '05',
    name: 'Aggregate',
    icon: 'grid',
    text: 'Roll detections up to one row per date and region: counts, fires, mean FRP, confidence and intensity classes.',
    path: 'server/sql/schema.sql · daily_region',
  },
  {
    step: '06',
    name: 'Publish',
    icon: 'trend',
    text: 'Serve JSON from the source adapter. The browser only ever calls the API channel, never the database.',
    path: 'server/data/source.js → web/src/lib/api.js',
  },
];

const ENDPOINTS = [
  { path: '/api/meta', params: '—', view: 'All views', returns: 'Range, regions, sensors, intensity classes, channel paths' },
  { path: '/api/overview', params: 'from, to, region, sensor', view: 'Overview', returns: 'KPIs, monthly series, region ranking, confidence bands, calibration snapshot' },
  { path: '/api/timeseries', params: 'from, to, region, sensor, grain', view: 'Export ready', returns: 'Monthly or annual series with intensity split' },
  { path: '/api/calendar', params: 'year, region, sensor', view: 'Calendar', returns: 'Daily strip, year × month and month × day matrices, seasonal cycles' },
  { path: '/api/trends', params: 'from, to, region, sensor', view: 'Trends', returns: 'Annual totals, region × month climatology, per-sensor series' },
  { path: '/api/anomalies', params: 'from, to, region, sensor, severity', view: 'Anomalies', returns: 'Episodes, observed vs baseline series, severity mix' },
  { path: '/api/calibration', params: 'from, to, region, sensor', view: 'Calibration', returns: 'Matched pairs, anchors, reliability, histograms, region agreement' },
  { path: '/api/map', params: 'year, month, mode, region, sensor', view: 'Fire map', returns: 'Sampled points, bounds, monthly summary' },
  { path: '/api/location', params: 'lat, lon, radiusKm, from, to, sensor', view: 'Fire map · clicked point', returns: 'Local summary, monthly trend, intensity/sensor mix, nearby regions' },
];

const COPY_EXAMPLE =
  "\\copy fire_detections (observed_at, acquired_date, sensor, latitude, longitude, frp_mw, confidence_pct, confidence_class, region_id, record_type, qc_flags) FROM 'data/cleaned/fire_detections.csv' WITH (FORMAT csv, HEADER true);";

export default function MethodsView({ meta }) {
  return (
    <div className="view reveal methods-view">
      <SectionHeader
        kicker="METHODS & DATA"
        title="A finished skeleton with one clean seam"
        description="The screens, charts, palette and API shapes are real. The numbers are not. Everything enters through a single adapter, so connecting your cleaned record is an implementation job — not a rewrite."
        action={
          <a className="btn btn-quiet" href="#/overview">
            Back to the record <Icon name="arrowRight" size={14} />
          </a>
        }
      />

      <div className="callout">
        <span className="callout-icon"><Icon name="alert" size={18} /></span>
        <div>
          <strong>Every value on screen is synthetic.</strong>
          <p>
            The mock generator writes deterministic, plausible days so the design can be reviewed without
            your data. Do not cite these figures. When your adapter is connected, the same screens will
            display the real record.
          </p>
        </div>
      </div>

      <div className="pipeline-grid">
        {PIPELINE.map((item) => (
          <article className="pipeline-step" key={item.step}>
            <div className="pipeline-top">
              <span className="pipeline-icon"><Icon name={item.icon} size={16} /></span>
              <span className="pipeline-num mono">{item.step}</span>
            </div>
            <h3>{item.name}</h3>
            <p>{item.text}</p>
            <span className="pipeline-path mono">{item.path}</span>
          </article>
        ))}
      </div>

      <div className="grid methods-main">
        <Panel kicker="CONNECT YOUR DATA" title="Four steps from CSV to live screen">
          <ol className="steps-list">
            <li>
              <div className="step-head">
                <span className="step-num mono">01</span>
                <h4>Create the tables</h4>
              </div>
              <p>
                The schema keeps raw detections, regions, sensors, calibration pairs and anomalies.
                It creates the daily roll-up the dashboard reads from.
              </p>
              <pre className="code-block"><code>{'psql "$DATABASE_URL" -f server/sql/schema.sql'}</code></pre>
            </li>
            <li>
              <div className="step-head">
                <span className="step-num mono">02</span>
                <h4>Load your cleaned rows</h4>
              </div>
              <p>
                Export your cleaned Parquet or CSV to a table shaped like <code>fire_detections</code>,
                then refresh the materialized view. For Parquet, read it with DuckDB and insert into
                Postgres, or use an Arrow/Parquet extension.
              </p>
              <pre className="code-block"><code>{COPY_EXAMPLE}</code></pre>
              <pre className="code-block"><code>{'REFRESH MATERIALIZED VIEW daily_region;'}</code></pre>
            </li>
            <li>
              <div className="step-head">
                <span className="step-num mono">03</span>
                <h4>Implement the adapter</h4>
              </div>
              <p>
                Copy the worked example and fill in the remaining functions. Each one must return the
                same JSON shape as its mock twin. Keep the mock open in another terminal and compare.
              </p>
              <pre className="code-block"><code>{'cp server/data/postgres.example.js server/data/postgres.js\ncurl http://localhost:8787/api/overview | jq .'}</code></pre>
            </li>
            <li>
              <div className="step-head">
                <span className="step-num mono">04</span>
                <h4>Flip the switch</h4>
              </div>
              <p>
                Point the app at your database, then change the export in the data source. Nothing in
                the React app changes.
              </p>
              <pre className="code-block"><code>{'# .env\nDATABASE_URL=postgres://user:pass@host:5432/fire\n\n# server/data/source.js\nimport { source as postgresSource } from "./postgres.js";\nexport const source = postgresSource; // was mockSource'}</code></pre>
            </li>
          </ol>
        </Panel>

        <div className="stack">
          <Panel kicker="WHERE TO LOOK" title="The five files that matter">
            <div className="file-list">
              <a className="file-row" href="#/methods">
                <span className="file-icon"><Icon name="grid" size={15} /></span>
                <div><strong>Frontend channel</strong><span className="mono">{meta?.channels?.api || 'web/src/lib/api.js'}</span></div>
              </a>
              <a className="file-row" href="#/methods">
                <span className="file-icon"><Icon name="layers" size={15} /></span>
                <div><strong>Response shapes & switch</strong><span className="mono">{meta?.channels?.source || 'server/data/source.js'}</span></div>
              </a>
              <a className="file-row" href="#/methods">
                <span className="file-icon"><Icon name="book" size={15} /></span>
                <div><strong>Worked SQL adapter</strong><span className="mono">{meta?.channels?.postgresExample || 'server/data/postgres.example.js'}</span></div>
              </a>
              <a className="file-row" href="#/methods">
                <span className="file-icon"><Icon name="target" size={15} /></span>
                <div><strong>Tables, views, indexes</strong><span className="mono">{meta?.channels?.schema || 'server/sql/schema.sql'}</span></div>
              </a>
              <a className="file-row" href="#/methods">
                <span className="file-icon"><Icon name="info" size={15} /></span>
                <div><strong>Loading guide</strong><span className="mono">data/README.md</span></div>
              </a>
            </div>
            <p className="panel-footnote">
              Keep response shapes intact. That is the contract between your science pipeline and this UI.
            </p>
          </Panel>

          <Panel kicker="COMMANDS" title="Beginner quickstart">
            <pre className="code-block"><code>{'npm install\nnpm run dev\n# web  → http://localhost:5180\n# api  → http://localhost:8787/api/health'}</code></pre>
            <div className="quick-facts">
              <span><b>Vite</b> serves the UI</span>
              <span><b>Express</b> serves JSON</span>
              <span><b>DATABASE_URL</b> is optional today</span>
            </div>
          </Panel>
        </div>
      </div>

      <Panel
        kicker="API CONTRACT"
        title="Every panel has one door"
        subtitle="All nine endpoints share the same filters. Add a view without touching the database; add a data source without touching a chart."
        action={<span className="mono muted">JSON · no-store</span>}
      >
        <div className="table-wrap">
          <table className="data-table contract-table">
            <thead>
              <tr>
                <th>Endpoint</th>
                <th>Query parameters</th>
                <th>View</th>
                <th>Returns</th>
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((row) => (
                <tr key={row.path}>
                  <td className="mono strong">{row.path}</td>
                  <td className="mono dim">{row.params}</td>
                  <td>{row.view}</td>
                  <td className="contract-returns">{row.returns}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="panel-footnote">
          <code>GET /api/location</code> is the skeleton behind map clicks: it returns the local
          record within a radius of one coordinate. Implement the same response shape in your
          adapter and the pinned-point panel keeps working.
        </p>
      </Panel>

      <div className="grid methods-bottom">
        <Panel kicker="HONESTY CHECK" title="What is real right now">
          <ul className="check-list">
            <li className="yes"><Icon name="check" size={14} /><span>Interface, navigation, charts and the fire intensity palette</span></li>
            <li className="yes"><Icon name="check" size={14} /><span>API contract, SQL schema and Postgres example</span></li>
            <li className="yes"><Icon name="check" size={14} /><span>Harmonization and anomaly <em>logic</em>, ready to swap</span></li>
            <li className="no"><Icon name="slash" size={14} /><span>Detections, FRP, calibration and anomaly counts <em>are not real</em></span></li>
            <li className="no"><Icon name="slash" size={14} /><span>Anomaly thresholds are placeholders, not a science decision</span></li>
            <li className="no"><Icon name="slash" size={14} /><span>No database is connected in this build</span></li>
          </ul>
          <p className="panel-footnote">
            The anomaly rule is deliberately conservative and documented. Have your science lead approve
            the final thresholds before publishing.
          </p>
        </Panel>

        <Panel kicker="DATA & CREDITS" title="Where the real record will come from">
          <div className="credit-list">
            <div>
              <strong>Fire detections</strong>
              <p>
                NASA FIRMS active fire products: MODIS on Terra and Aqua, and VIIRS on Suomi NPP,
                NOAA-20 and NOAA-21. Use the quality flags your team has cleaned.
              </p>
            </div>
            <div>
              <strong>Basemap</strong>
              <p>© OpenStreetMap contributors, tiles © Esri, HERE, Garmin. Attribution stays visible on the map.</p>
            </div>
            <div>
              <strong>Built with</strong>
              <p>React, ECharts, MapLibre GL, Express and Postgres. No affiliation or endorsement by NASA is implied.</p>
            </div>
          </div>
          <p className="panel-footnote">
            Product details, match windows and confidence anchors should be restated in any public release.
          </p>
        </Panel>
      </div>
    </div>
  );
}
