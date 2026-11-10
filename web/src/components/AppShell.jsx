import { useEffect } from 'react';
import { Sidebar } from './Sidebar.jsx';
import { Topbar } from './Topbar.jsx';

export function AppShell({ route, meta, children }) {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  }, [route]);

  return (
    <div className="app-shell">
      <Sidebar route={route} meta={meta} />
      <div className="main-column">
        <Topbar route={route} />
        <main className="page" key={route}>{children}</main>
        <footer className="page-foot">
          <span>BEYOND THE KNOWN</span>
          <span className="foot-sep">/</span>
          <span>{meta?.mock ? 'Illustrative mock record' : 'Connected record'}</span>
          <span className="foot-sep">/</span>
          <a href="#/methods">Connect your data</a>
          <span className="foot-right mono">v0.1 · MODIS + VIIRS</span>
        </footer>
      </div>
    </div>
  );
}
