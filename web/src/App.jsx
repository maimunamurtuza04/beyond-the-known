import { useEffect, useState } from 'react';
import { api } from './lib/api.js';
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
    setError(null);
    api
      .meta(controller.signal)
      .then(setMeta)
      .catch((reason) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      });
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    const page = NAV_BY_ID[route];
    document.title = page ? `Beyond the Known · ${page.title}` : 'Beyond the Known';
  }, [route]);

  if (error && !meta) {
    return (
      <div className="boot-screen">
        <span className="boot-mark"><FlameMark size={54} /></span>
        <h1>Beyond the Known</h1>
        <p className="boot-error-title">The API is not answering.</p>
        <p className="boot-error-text">{error}</p>
        <div className="boot-hint">
          Start both servers from the project root:
          <code>npm run dev</code>
          <span>The UI is on <b>localhost:5180</b>, the API on <b>localhost:8787</b>.</span>
        </div>
        <button type="button" className="btn" onClick={() => setAttempt((value) => value + 1)}>
          <Icon name="refresh" size={14} /> Try again
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
