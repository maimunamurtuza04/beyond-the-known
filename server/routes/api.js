import { Router } from 'express';
import { source } from '../data/source.js';
import { handle } from './handler.js';

const router = Router();

/**
 * ─────────────────────────────────────────────────────────────
 *  API ROUTES
 * ─────────────────────────────────────────────────────────────
 * Each route is intentionally thin: parse the query, call a
 * source function, return JSON. To connect your cleaned record,
 * implement the same functions in server/data/postgres.js and
 * swap the export at the bottom of server/data/source.js.
 *
 * Route map:
 *   GET /api/meta        → vocabulary, date range, channel paths
 *   GET /api/overview    → KPIs, monthly series, region ranking
 *   GET /api/timeseries  → monthly or annual series
 *   GET /api/calendar    → daily / month-day / year-month matrices
 *   GET /api/trends      → annual, climatology, sensor comparison
 *   GET /api/anomalies   → flagged days, timeline, summary
 *   GET /api/calibration → matched pairs, anchors, reliability
 *   GET /api/map         → sampled fire points for a month
 *
 * Common query params: from=YYYY-MM-DD, to=YYYY-MM-DD,
 * region=<region id>, sensor=<sensor id>.
 */
router.get('/meta', handle(() => source.getMeta()));
router.get('/overview', handle((query) => source.getOverview(query)));
router.get('/timeseries', handle((query) => source.getTimeseries(query)));
router.get('/calendar', handle((query) => source.getCalendar(query)));
router.get('/trends', handle((query) => source.getTrends(query)));
router.get('/anomalies', handle((query) => source.getAnomalies(query)));
router.get('/calibration', handle((query) => source.getCalibration(query)));
router.get('/map', handle((query) => source.getMap(query)));

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    mode: source.mode,
    disclaimer: source.disclaimer,
    uptimeSeconds: Math.round(process.uptime()),
  });
});

export default router;
