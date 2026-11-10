import { Icon } from './Icons.jsx';
import { NAV_BY_ID } from '../lib/nav.js';
import { useFilters } from '../state/Filters.jsx';

export function Topbar({ route }) {
  const { meta, filters, update, reset, defaults } = useFilters();
  const page = NAV_BY_ID[route] || NAV_BY_ID.overview;
  const isDefault =
    filters.from === defaults.from &&
    filters.to === defaults.to &&
    filters.region === 'all' &&
    filters.sensor === 'all';

  const maxYear = Number((meta?.range?.max || '2025').slice(0, 4));
  const minYear = Number((meta?.range?.min || '2018').slice(0, 4));

  const setQuickRange = (kind) => {
    if (!meta?.range) return;
    if (kind === 'all') update({ from: meta.range.min, to: meta.range.max });
    if (kind === 'two') update({ from: `${maxYear - 1}-01-01`, to: meta.range.max });
    if (kind === 'year') update({ from: `${maxYear}-01-01`, to: meta.range.max });
  };

  return (
    <header className="app-header">
      <div className="title-row">
        <div className="title-block">
          <div className="crumb">
            <span>FIRE RECORD</span>
            <Icon name="chevronDown" size={11} className="crumb-sep" />
            <span className="crumb-current">{page.label}</span>
          </div>
          <div className="title-line">
            <h1>{page.title}</h1>
            <span className="title-sub">{page.subtitle}</span>
          </div>
        </div>
        <div className="title-status">
          <a className="mock-badge" href="#/methods" title="Open Methods to see how to connect real data">
            <span className="pulse-dot" />
            {meta?.mock ? 'MOCK DATA' : 'LIVE DATA'}
          </a>
          <button
            type="button"
            className="icon-btn"
            onClick={reset}
            title="Reset all filters"
            aria-label="Reset all filters"
            disabled={isDefault}
          >
            <Icon name="refresh" size={16} />
          </button>
        </div>
      </div>

      <div className="filter-row">
        <div className="filter-group">
          <span className="filter-label">Date range</span>
          <div className="date-range">
            <input
              type="date"
              value={filters.from}
              min={meta?.range?.min}
              max={filters.to}
              onChange={(event) => update({ from: event.target.value })}
              aria-label="Start date"
            />
            <span className="range-dash">→</span>
            <input
              type="date"
              value={filters.to}
              min={filters.from}
              max={meta?.range?.max}
              onChange={(event) => update({ to: event.target.value })}
              aria-label="End date"
            />
          </div>
          <div className="quick-ranges">
            <button type="button" onClick={() => setQuickRange('all')}>All</button>
            <button type="button" onClick={() => setQuickRange('two')}>2 yr</button>
            <button type="button" onClick={() => setQuickRange('year')}>{maxYear}</button>
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label" htmlFor="region-filter">Region</label>
          <div className="select-wrap">
            <select
              id="region-filter"
              value={filters.region}
              onChange={(event) => update({ region: event.target.value })}
            >
              <option value="all">All regions</option>
              {meta?.regions?.map((region) => (
                <option key={region.id} value={region.id}>{region.name}</option>
              ))}
            </select>
            <Icon name="chevronDown" size={13} />
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label" htmlFor="sensor-filter">Sensor</label>
          <div className="select-wrap">
            <select
              id="sensor-filter"
              value={filters.sensor}
              onChange={(event) => update({ sensor: event.target.value })}
            >
              <option value="all">All sensors</option>
              {meta?.sensors?.map((sensor) => (
                <option key={sensor.id} value={sensor.id}>{sensor.name}</option>
              ))}
            </select>
            <Icon name="chevronDown" size={13} />
          </div>
        </div>

        <div className="filter-meta">
          <span className="mono">{minYear}–{maxYear}</span>
          <span>UTC days</span>
        </div>
      </div>
    </header>
  );
}
