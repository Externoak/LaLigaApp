import { useState, useDeferredValue, useMemo } from 'react';

/**
 * useSearch — generic debounced/deferred search helper.
 *
 * Usage:
 *   const { query, setQuery, deferredQuery, results } = useSearch({
 *     items,
 *     filterFn: (item, q) => item.name.toLowerCase().includes(q),
 *   });
 *
 * - `query`        : current input value
 * - `deferredQuery`: useDeferredValue version (low priority updates)
 * - `results`      : memoized filtered list
 *
 * If `filterFn` is omitted, falls back to a case-insensitive substring
 * match on the stringified item.
 */
const defaultFilter = (item, q) => {
  try {
    return String(
      typeof item === 'object' && item !== null ? JSON.stringify(item) : item
    )
      .toLowerCase()
      .includes(q);
  } catch {
    return false;
  }
};

export default function useSearch({ items = [], filterFn } = {}) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const results = useMemo(() => {
    const trimmed = (deferredQuery || '').trim().toLowerCase();
    if (!trimmed) return items;
    const fn = filterFn || defaultFilter;
    return items.filter((item) => fn(item, trimmed));
  }, [items, deferredQuery, filterFn]);

  return { query, setQuery, deferredQuery, results };
}
