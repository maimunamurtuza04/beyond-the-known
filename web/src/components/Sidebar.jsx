import { Icon, FlameMark } from './Icons.jsx';
import { NAV_ITEMS } from '../lib/nav.js';

export function Sidebar({ route, meta }) {
  return (
    <aside className="sidebar">
      <a className="brand" href="#/overview" aria-label="Beyond the Known home">
        <span className="brand-mark"><FlameMark size={28} /></span>
        <span className="brand-text">
          <strong>BEYOND THE KNOWN</strong>
          <span>Fire record explorer</span>
        </span>
      </a>

      <nav className="nav" aria-label="Sections">
        <div className="nav-label">Explore</div>
        {NAV_ITEMS.map((item) => (
          <a
            key={item.id}
            href={`#/${item.id}`}
            className={`nav-item ${route === item.id ? 'active' : ''} ${item.accent ? 'accent' : ''}`}
            aria-current={route === item.id ? 'page' : undefined}
          >
            <span className="nav-icon"><Icon name={item.icon} size={17} /></span>
            <span className="nav-text">{item.label}</span>
            {item.accent && <span className="nav-dot" />}
          </a>
        ))}
      </nav>

      <div className="sidebar-foot">
        <div className="source-pill">
          <span className="source-dot" />
          <div>
            <strong>{meta?.mock ? 'Illustrative record' : 'Connected record'}</strong>
            <span>{meta?.range ? `${meta.range.min.slice(0, 4)}–${meta.range.max.slice(0, 4)}` : '—'}</span>
          </div>
        </div>
        <p className="sidebar-note">
          Two sensors. One record. Built to show its work.
        </p>
      </div>
    </aside>
  );
}
