/**
 * ─────────────────────────────────────────────────────────────
 *  DATA CHANNEL · frontend
 * ─────────────────────────────────────────────────────────────
 * Every panel in this app talks to the backend through these
 * functions and nowhere else. That is deliberate: it gives you
 * one small file to change.
 *
 * Today the calls go to `/api`, which Express serves from
 * server/data/source.js (illustrative mock).
 *
 * If you host the API somewhere else, either:
 *   - set VITE_API_BASE in a `.env` file, e.g.
 *       VITE_API_BASE=https://api.your-domain.org
 *   - or edit the fallback below.
 *
 * Keep the response shapes (documented in server/data/source.js)
 * and the UI will keep working.
 */
const BASE = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

async function get(path, params = {}, signal) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, value);
  }
  const query = search.toString();
  const response = await fetch(`${BASE}${path}${query ? `?${query}` : ''}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.message || body.error || message;
    } catch {
      // keep the status message
    }
    throw new Error(message);
  }
  return response.json();
}

export const api = {
  meta: (signal) => get('/meta', {}, signal),
  overview: (params, signal) => get('/overview', params, signal),
  timeseries: (params, signal) => get('/timeseries', params, signal),
  calendar: (params, signal) => get('/calendar', params, signal),
  trends: (params, signal) => get('/trends', params, signal),
  anomalies: (params, signal) => get('/anomalies', params, signal),
  calibration: (params, signal) => get('/calibration', params, signal),
  map: (params, signal) => get('/map', params, signal),
  // Local record around a clicked coordinate. Skeleton endpoint:
  // implement the same response shape in your Postgres adapter.
  location: (params, signal) => get('/location', params, signal),
};

export { BASE as API_BASE };
