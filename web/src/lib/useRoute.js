import { useEffect, useState } from 'react';
import { NAV_ITEMS } from './nav.js';

const IDS = new Set(NAV_ITEMS.map((item) => item.id));

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return IDS.has(raw) ? raw : 'overview';
}

export function useRoute() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}

export function navigate(id) {
  window.location.hash = `#/${id}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
