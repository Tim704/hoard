'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * useState that mirrors its value into localStorage under `key`. The first
 * render always uses `initial` (so server and client HTML match); the stored
 * value is applied right after mount. Storage failures (private mode, blocked
 * site data) silently fall back to plain in-memory state.
 */
export function usePersistentState<T>(
  key: string,
  initial: T,
  isValid?: (v: unknown) => v is T,
): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return;
      const parsed: unknown = JSON.parse(raw);
      if (!isValid || isValid(parsed)) setValue(parsed as T);
    } catch {
      /* ignore unreadable storage */
    }
    // Re-read only when the key changes (e.g. navigating between categories).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved =
          typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* ignore */
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, update];
}
