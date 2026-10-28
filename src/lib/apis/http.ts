// Shared fetch settings for every provider call (spec G4): no caching, and an
// 8 s timeout so one hung upstream can never stall a search, an add or a job.

export const PROVIDER_TIMEOUT_MS = 8000;

/** fetch with `cache: 'no-store'` and the provider timeout (unless one is given). */
export function providerFetch(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    cache: 'no-store',
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    ...init,
  });
}
