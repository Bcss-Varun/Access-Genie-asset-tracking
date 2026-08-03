import { useEffect, useState } from 'react';

/**
 * Debounce a rapidly-changing value (a search box, typically) so it drives one
 * request per pause rather than one per keystroke.
 */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
