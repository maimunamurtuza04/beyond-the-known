import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tiny fetch hook: one request per parameter change, aborts the
 * previous request, and exposes loading / error / reload.
 */
export function useApi(fetcher, params = {}) {
  const key = JSON.stringify(params);
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    fetcherRef
      .current(params, controller.signal)
      .then((data) => {
        if (active) setState({ data, loading: false, error: null });
      })
      .catch((error) => {
        if (!active || error.name === 'AbortError') return;
        setState({ data: null, loading: false, error: error.message });
      });
    return () => {
      active = false;
      controller.abort();
    };
    // `key` captures params; fetcher is read through a ref on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  const reload = useCallback(() => setTick((value) => value + 1), []);
  return { ...state, reload };
}
