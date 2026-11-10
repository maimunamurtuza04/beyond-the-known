import { createContext, useContext, useMemo, useState } from 'react';

const FilterContext = createContext(null);

export function FiltersProvider({ meta, children }) {
  const defaults = useMemo(
    () => ({
      from: '2019-01-01',
      to: meta?.range?.max ?? '2025-12-31',
      region: 'all',
      sensor: 'all',
    }),
    [meta?.range?.max],
  );
  const [filters, setFilters] = useState(defaults);

  const value = useMemo(
    () => ({
      meta,
      filters,
      update: (patch) => setFilters((previous) => ({ ...previous, ...patch })),
      reset: () => setFilters(defaults),
      defaults,
    }),
    [filters, meta, defaults],
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useFilters() {
  const context = useContext(FilterContext);
  if (!context) throw new Error('useFilters must be used inside FiltersProvider');
  return context;
}
