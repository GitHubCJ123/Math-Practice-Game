import { useCallback, useEffect, useState } from 'react';

/**
 * Generic React hook that mirrors `useState` but persists the value to
 * `localStorage` under the given key. Parsing errors fall back to the initial
 * value silently.
 */
export function useLocalStorageState<T>(
  key: string,
  initial: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const stored = window.localStorage.getItem(key);
      if (stored === null) return initial;
      return JSON.parse(stored) as T;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore quota / unavailable storage errors
    }
  }, [key, value]);

  const update = useCallback((next: T | ((prev: T) => T)) => {
    setValue(prev =>
      typeof next === 'function' ? (next as (p: T) => T)(prev) : next
    );
  }, []);

  return [value, update];
}
