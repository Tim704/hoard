// ───────────────────────────────────────────────────────────────────────────
//  Where to stream (5.1), server side: provider lookups behind the 7-day
//  `WatchProviderCache`. Only ever called lazily for a small batch of titles
//  (≤ WATCH_BATCH_LIMIT, from a server action), never for a whole library.
//
//  Fails softly (spec G4): no TMDB key → TMDB titles report "not configured";
//  a failed call falls back to a stale cached answer, else "unavailable".
//  Failures are never cached; a 404 / unknown title is (as "nowhere").
// ───────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';

import { fetchAniListExternalLinks } from '@/lib/apis/anilist';
import { fetchProviderListJson, fetchWatchProvidersJson, tmdbConfigured } from '@/lib/apis/tmdb';
import type { CategorySlug } from '@/lib/categories';
import { prisma } from '@/lib/prisma';
import {
  FALLBACK_PROVIDERS,
  WATCH_BATCH_LIMIT,
  isCacheFresh,
  mapAniListStreaming,
  mapProviderList,
  mapTmdbWatchProviders,
  providerListKey,
  watchCacheKey,
  type ProviderOption,
  type WatchProviders,
} from '@/lib/streaming';

export type WatchLookup =
  | { status: 'ok'; providers: WatchProviders }
  | { status: 'not-configured' | 'no-region' | 'unavailable' | 'none' };

export interface WatchTitle {
  slug: CategorySlug;
  externalId: string;
}

const EMPTY = (source: WatchProviders['source']): WatchProviders => ({
  source,
  link: null,
  stream: [],
  rent: [],
  buy: [],
});

async function writeCache(key: string, data: unknown): Promise<void> {
  const json = data as Prisma.InputJsonValue;
  await prisma.watchProviderCache
    .upsert({ where: { key }, create: { key, data: json, fetchedAt: new Date() }, update: { data: json, fetchedAt: new Date() } })
    .catch(() => undefined); // a cache write failure must never fail the lookup
}

function asProviders(data: unknown): WatchProviders | null {
  const d = data as WatchProviders | null;
  return d && Array.isArray(d.stream) && Array.isArray(d.rent) && Array.isArray(d.buy) ? d : null;
}

/**
 * Providers for a batch of titles in `region`, keyed by the input index.
 * At most WATCH_BATCH_LIMIT titles are looked up; the rest report "unavailable".
 */
export async function lookupWatchProviders(titles: WatchTitle[], region: string | null): Promise<WatchLookup[]> {
  const out: WatchLookup[] = titles.map(() => ({ status: 'none' }));
  const keys = titles.map((t, i) => (i < WATCH_BATCH_LIMIT ? watchCacheKey(t.slug, t.externalId, region) : null));

  const wanted = [...new Set(keys.filter((k): k is string => k !== null))];
  const rows = wanted.length
    ? await prisma.watchProviderCache.findMany({ where: { key: { in: wanted } } })
    : [];
  const cached = new Map(rows.map((r) => [r.key, r]));
  const now = new Date();
  const resolved = new Map<string, WatchLookup>();

  const stale: string[] = [];
  for (const key of wanted) {
    const row = cached.get(key);
    const data = row ? asProviders(row.data) : null;
    if (row && data && isCacheFresh(row.fetchedAt, now)) resolved.set(key, { status: 'ok', providers: data });
    else stale.push(key);
  }
  const fallback = (key: string): WatchLookup => {
    const data = asProviders(cached.get(key)?.data);
    return data ? { status: 'ok', providers: data } : { status: 'unavailable' };
  };

  // TMDB: one request per title (no batch endpoint), sequential to be polite.
  for (const key of stale.filter((k) => !k.startsWith('anime:'))) {
    if (!tmdbConfigured()) {
      resolved.set(key, cached.get(key) ? fallback(key) : { status: 'not-configured' });
      continue;
    }
    const [kind, id, reg] = key.split(':');
    try {
      const json = await fetchWatchProvidersJson(kind as 'movie' | 'tv', id);
      const providers = json ? mapTmdbWatchProviders(json, reg) : EMPTY('tmdb');
      await writeCache(key, providers);
      resolved.set(key, { status: 'ok', providers });
    } catch {
      resolved.set(key, fallback(key));
    }
  }

  // AniList: one batched query for every stale anime.
  const animeKeys = stale.filter((k) => k.startsWith('anime:'));
  if (animeKeys.length) {
    try {
      const links = await fetchAniListExternalLinks(animeKeys.map((k) => k.slice('anime:'.length)));
      for (const key of animeKeys) {
        const providers = mapAniListStreaming(links.get(key.slice('anime:'.length)) ?? []);
        await writeCache(key, providers);
        resolved.set(key, { status: 'ok', providers });
      }
    } catch {
      for (const key of animeKeys) resolved.set(key, fallback(key));
    }
  }

  titles.forEach((t, i) => {
    const key = keys[i];
    if (key) out[i] = resolved.get(key) ?? { status: 'unavailable' };
    else if (i >= WATCH_BATCH_LIMIT) out[i] = { status: 'unavailable' };
    else if ((t.slug === 'movies' || t.slug === 'tv') && !region && /^\d+$/.test(t.externalId)) {
      out[i] = { status: 'no-region' };
    }
  });
  return out;
}

/**
 * The services offered in `region` (Settings picker), cached for 7 days.
 * Falls back to a short static list without a key, region or answer.
 */
export async function getProviderOptions(
  region: string | null,
): Promise<{ options: ProviderOption[]; source: 'tmdb' | 'fallback' }> {
  if (!region || !/^[A-Z]{2}$/.test(region)) return { options: FALLBACK_PROVIDERS, source: 'fallback' };
  const key = providerListKey(region);
  const row = await prisma.watchProviderCache.findUnique({ where: { key } });
  const cached = row && Array.isArray(row.data) ? (row.data as unknown as ProviderOption[]) : null;
  if (row && cached && cached.length && isCacheFresh(row.fetchedAt)) return { options: cached, source: 'tmdb' };
  if (!tmdbConfigured()) {
    return cached?.length ? { options: cached, source: 'tmdb' } : { options: FALLBACK_PROVIDERS, source: 'fallback' };
  }
  try {
    const options = mapProviderList(await fetchProviderListJson(region));
    if (options.length) {
      await writeCache(key, options);
      return { options, source: 'tmdb' };
    }
  } catch {
    // fall through to the stale list or the static one
  }
  return cached?.length ? { options: cached, source: 'tmdb' } : { options: FALLBACK_PROVIDERS, source: 'fallback' };
}

/**
 * The names of the user's services (for matching AniList links, which carry
 * no TMDB ids): from the region's cached list where known, else the static one.
 */
export async function serviceNames(services: number[], region: string | null): Promise<string[]> {
  if (services.length === 0) return [];
  const known = new Map<number, string>(FALLBACK_PROVIDERS.map((p) => [p.id, p.name]));
  if (region && /^[A-Z]{2}$/.test(region)) {
    const row = await prisma.watchProviderCache.findUnique({ where: { key: providerListKey(region) } });
    if (row && Array.isArray(row.data)) {
      for (const p of row.data as unknown as ProviderOption[]) {
        if (typeof p?.id === 'number' && typeof p.name === 'string') known.set(p.id, p.name);
      }
    }
  }
  return services.map((id) => known.get(id)).filter((n): n is string => Boolean(n));
}
