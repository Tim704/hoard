// ───────────────────────────────────────────────────────────────────────────
//  Per-request memoisation for server reads (final review 15), via React's
//  `cache()`. Safe by construction: React only memoises inside a server
//  component render (one cache per request); outside one — server actions,
//  route handlers, jobs, tests — `cache` passes every call straight through,
//  so an action that changes prefs and then reads them sees the new value.
//  The stable `react` package (tests) has no `cache`: then it is a no-op.
// ───────────────────────────────────────────────────────────────────────────

import * as React from 'react';

type AnyFn = (...args: any[]) => any;

export function perRequest<F extends AnyFn>(fn: F): F {
  const cache = (React as unknown as { cache?: (f: F) => F }).cache;
  return typeof cache === 'function' ? cache(fn) : fn;
}
