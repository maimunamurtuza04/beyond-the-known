import { useEffect, useState } from 'react';
import { api, API_BASE } from './lib/api.js';
import { useRoute } from './lib/useRoute.js';
import { NAV_BY_ID } from './lib/nav.js';
import { FiltersProvider } from './state/Filters.jsx';
import { AppShell } from './components/AppShell.jsx';
import { FlameMark, Icon } from './components/Icons.jsx';
import Overview from './views/Overview.jsx';
import MapView from './views/MapView.jsx';
import CalendarView from './views/CalendarView.jsx';
import TrendsView from './views/TrendsView.jsx';
import AnomaliesView from './views/AnomaliesView.jsx';
import CalibrationView from './views/CalibrationView.jsx';
import MethodsView from './views/MethodsView.jsx';

const VIEWS = {
  overview: Overview,
  map: MapView,
  calendar: CalendarView,
  trends: TrendsView,
  anomalies: AnomaliesView,
  calibration: CalibrationView,
  methods: MethodsView,
};

export default function App() {
  const route = useRoute();
  const [meta, setMeta] = useState(null);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    api
      .meta(controller.signal)
      .then(setMeta)
      .catch((reason) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    if (meta || !error) return undefined;
    const timer = setInterval(() => setAttempt((value) => value + 1), 5000);
    return () => clearInterval(timer);
  }, [error, meta]);

  useEffect(() => {
    const page = NAV_BY_ID[route];
    document.title = page ? `Beyond the Known · ${page.title}` : 'Beyond the Known';
  }, [route]);

  if (error && !meta) {
    return (
      <div className="boot-screen">
        <span className="boot-mark"><FlameMark size={54} /></span>
        <h1>Beyond the Known</h1>
        <p className="boot-error-title">The local API is not answering.</p>
        <p className="boot-error-text">{error}</p>
        <div className="boot-hint">
          <span>
            This app runs on generated mock data served by its own Express API. It does not need
            Postgres or your cleaned dataset to start — this screen only means the browser could
            not reach the API at <b>{API_BASE}</b>.
          </span>
          <code>npm run dev</code>
          <span>
            UI <b>localhost:5180</b> · API <b>localhost:8787</b>. Retrying automatically every
            5 seconds.
          </span>
        </div>
        <button type="button" className="btn" onClick={() => setAttempt((value) => value + 1)}>
          <Icon name="refresh" size={14} /> Try again now
        </button>
      </div>
    );
  }

  if (!meta) {
    return (
      <div className="boot-screen">
        <span className="boot-mark"><FlameMark size={54} /></span>
        <h1>Beyond the Known</h1>
        <p className="boot-sub">Reading the fire record…</p>
        <div className="boot-line"><span /></div>
      </div>
    );
  }

  const View = VIEWS[route] || Overview;

  return (
    <FiltersProvider meta={meta}>
      <AppShell route={route} meta={meta}>
        <View meta={meta} />
      </AppShell>
    </FiltersProvider>
  );
}
