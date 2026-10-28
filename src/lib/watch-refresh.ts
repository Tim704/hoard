// ───────────────────────────────────────────────────────────────────────────
//  The TMDB half of a Where-to-stream lookup (5.1), with its I/O injected so
//  the failure handling is tested without the network or the database.
//
//  TMDB has no batch endpoint, so stale titles are fetched one by one. The
//  first failure (timeout, 5xx, network) stops the loop: that title and every
//  one after it report "failed" (the caller serves stale cache or
//  "unavailable"), and a backoff keeps the next calls from trying again for
//  10 minutes. So a hanging TMDB costs one 8 s timeout, not 20 of them.
// ───────────────────────────────────────────────────────────────────────────

import { mapTmdbWatchProviders, type WatchProviders } from '@/lib/streaming';

/** How long lookups skip a provider after it failed. */
export const PROVIDER_BACKOFF_MS = 10 * 60 * 1000;

/** A provider's backoff state (module-level in the server, fresh in tests). */
export interface Backoff {
  until: number;
}

export type TmdbOutcome = { status: 'ok'; providers: WatchProviders } | { status: 'failed' | 'not-configured' };

export interface TmdbRefreshDeps {
  configured: boolean;
  /** The raw `/watch/providers` answer, null on 404; throws on failure. */
  fetchJson: (kind: 'movie' | 'tv', id: string) => Promise<unknown | null>;
  /** Cache a fresh answer (must not throw). */
  save: (key: string, providers: WatchProviders) => Promise<void>;
  backoff: Backoff;
  now: () => number;
}

/** True while a provider is backing off after a failure. */
export function inBackoff(backoff: Backoff, now: number): boolean {
  return backoff.until > now;
}

/** Fetch stale `movie:<id>:<REGION>` / `tv:…` keys in order; see the rules at the top. */
export async function refreshTmdbKeys(keys: string[], deps: TmdbRefreshDeps): Promise<Map<string, TmdbOutcome>> {
  const out = new Map<string, TmdbOutcome>();
  if (!deps.configured) {
    for (const key of keys) out.set(key, { status: 'not-configured' });
    return out;
  }
  let failed = inBackoff(deps.backoff, deps.now());
  for (const key of keys) {
    if (failed) {
      out.set(key, { status: 'failed' });
      continue;
    }
    const [kind, id, region] = key.split(':');
    try {
      const json = await deps.fetchJson(kind as 'movie' | 'tv', id);
      const providers = json
        ? mapTmdbWatchProviders(json, region)
        : { source: 'tmdb' as const, link: null, stream: [], rent: [], buy: [] };
      await deps.save(key, providers);
      out.set(key, { status: 'ok', providers });
    } catch {
      failed = true;
      deps.backoff.until = deps.now() + PROVIDER_BACKOFF_MS;
      out.set(key, { status: 'failed' });
    }
  }
  return out;
}
