// ───────────────────────────────────────────────────────────────────────────
//  Where to stream (spec 5.1). Pure and client-safe: the provider answers
//  (TMDB watch providers, AniList external links) → one shape, the cache
//  keys and freshness rule, and "your services first".
//
//  - Movies and TV: TMDB `/{movie|tv}/{id}/watch/providers` → `results[REGION]`
//    with flatrate / free / ads (all "stream"), rent and buy. The data is
//    JustWatch's, which TMDB requires us to credit.
//  - Anime: AniList `Media.externalLinks` of type STREAMING (region-agnostic,
//    no provider ids, so "yours" is matched by service name).
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from '@/lib/categories';

/** How long a cached provider answer stays fresh. */
export const WATCH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** At most this many titles per lazy lookup (one server action call). */
export const WATCH_BATCH_LIMIT = 20;

const LOGO_BASE = 'https://image.tmdb.org/t/p/w92';

/** One place to watch a title. `id` is TMDB's provider id (null for AniList links). */
export interface WatchOffer {
  id: number | null;
  name: string;
  logo: string | null;
  url: string | null;
}

export interface WatchProviders {
  source: 'tmdb' | 'anilist';
  /** TMDB's "watch" page for the title in the region (JustWatch links live there). */
  link: string | null;
  stream: WatchOffer[];
  rent: WatchOffer[];
  buy: WatchOffer[];
}

/** A service the user can pick in Settings. */
export interface ProviderOption {
  id: number;
  name: string;
  logo: string | null;
}

/** Sections that have streaming data at all. */
export function isStreamable(slug: CategorySlug): boolean {
  return slug === 'movies' || slug === 'tv' || slug === 'anime';
}

/**
 * The cache key for one title, or null when it has no provider lookup:
 * TMDB titles need a numeric id and a region; anime a MAL id or `al-N`.
 * Hand-made (`manual:`) and demo rows never match these shapes.
 */
export function watchCacheKey(slug: CategorySlug, externalId: string, region: string | null): string | null {
  if (slug === 'movies' || slug === 'tv') {
    if (!/^\d+$/.test(externalId) || !region || !/^[A-Z]{2}$/.test(region)) return null;
    return `${slug === 'movies' ? 'movie' : 'tv'}:${externalId}:${region}`;
  }
  if (slug === 'anime') {
    return /^(al-)?\d+$/.test(externalId) ? `anime:${externalId}` : null;
  }
  return null;
}

/** The cache key of a region's service list (Settings picker). */
export function providerListKey(region: string): string {
  return `providers:${region}`;
}

/** True while a cached answer from `fetchedAt` is younger than 7 days. */
export function isCacheFresh(fetchedAt: Date | string, now: Date = new Date()): boolean {
  const t = new Date(fetchedAt).getTime();
  return Number.isFinite(t) && now.getTime() - t < WATCH_CACHE_TTL_MS && t <= now.getTime() + 60_000;
}

interface TmdbProviderJson {
  provider_id?: unknown;
  provider_name?: unknown;
  logo_path?: unknown;
  display_priority?: unknown;
}

function tmdbOffer(p: TmdbProviderJson): (WatchOffer & { priority: number }) | null {
  if (typeof p?.provider_id !== 'number' || typeof p.provider_name !== 'string' || !p.provider_name.trim()) {
    return null;
  }
  return {
    id: p.provider_id,
    name: p.provider_name.trim(),
    logo: typeof p.logo_path === 'string' && p.logo_path.startsWith('/') ? `${LOGO_BASE}${p.logo_path}` : null,
    url: null,
    priority: typeof p.display_priority === 'number' ? p.display_priority : 999,
  };
}

/** Offers of the given kinds, by TMDB's display priority, each provider once. */
function tmdbOffers(region: Record<string, unknown>, kinds: string[]): WatchOffer[] {
  const seen = new Set<number>();
  const out: (WatchOffer & { priority: number })[] = [];
  for (const kind of kinds) {
    const list = region[kind];
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const o = tmdbOffer(raw as TmdbProviderJson);
      if (!o || seen.has(o.id!)) continue;
      seen.add(o.id!);
      out.push(o);
    }
  }
  return out
    .sort((a, b) => a.priority - b.priority)
    .map(({ priority: _p, ...o }) => o);
}

/**
 * A TMDB watch-providers answer for one region. Flatrate, free and
 * ad-supported all count as "stream". An unknown region gives empty groups.
 */
export function mapTmdbWatchProviders(json: unknown, region: string): WatchProviders {
  const results = (json as { results?: unknown } | null)?.results;
  const r =
    results && typeof results === 'object' && Object.hasOwn(results, region)
      ? ((results as Record<string, unknown>)[region] as Record<string, unknown> | null)
      : null;
  if (!r || typeof r !== 'object') return { source: 'tmdb', link: null, stream: [], rent: [], buy: [] };
  const link = typeof r.link === 'string' && r.link.startsWith('https://') ? r.link : null;
  return {
    source: 'tmdb',
    link,
    stream: tmdbOffers(r, ['flatrate', 'free', 'ads']),
    rent: tmdbOffers(r, ['rent']),
    buy: tmdbOffers(r, ['buy']),
  };
}

interface AniListLinkJson {
  site?: unknown;
  url?: unknown;
  type?: unknown;
  icon?: unknown;
}

/** AniList external links → the STREAMING ones (https only, each site once). */
export function mapAniListStreaming(links: unknown): WatchProviders {
  const out: WatchOffer[] = [];
  const seen = new Set<string>();
  for (const raw of Array.isArray(links) ? (links as AniListLinkJson[]) : []) {
    if (raw?.type !== 'STREAMING' || typeof raw.site !== 'string' || !raw.site.trim()) continue;
    const name = raw.site.trim();
    const key = normalizeProviderName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      id: null,
      name,
      logo: typeof raw.icon === 'string' && raw.icon.startsWith('https://') ? raw.icon : null,
      url: typeof raw.url === 'string' && raw.url.startsWith('https://') ? raw.url : null,
    });
  }
  return { source: 'anilist', link: null, stream: out, rent: [], buy: [] };
}

/** GET /watch/providers/movie answer → the region's services, by display priority. */
export function mapProviderList(json: unknown): ProviderOption[] {
  const results = (json as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return [];
  const seen = new Set<number>();
  const out: (ProviderOption & { priority: number })[] = [];
  for (const raw of results) {
    const o = tmdbOffer(raw as TmdbProviderJson);
    if (!o || seen.has(o.id!)) continue;
    seen.add(o.id!);
    out.push({ id: o.id!, name: o.name, logo: o.logo, priority: o.priority });
  }
  return out.sort((a, b) => a.priority - b.priority).map(({ priority: _p, ...o }) => o);
}

/**
 * Common services (TMDB provider ids) for when TMDB isn't configured or
 * can't be reached, so the Settings picker still works.
 */
export const FALLBACK_PROVIDERS: ProviderOption[] = [
  { id: 8, name: 'Netflix', logo: null },
  { id: 9, name: 'Amazon Prime Video', logo: null },
  { id: 337, name: 'Disney Plus', logo: null },
  { id: 350, name: 'Apple TV Plus', logo: null },
  { id: 1899, name: 'Max', logo: null },
  { id: 531, name: 'Paramount Plus', logo: null },
  { id: 15, name: 'Hulu', logo: null },
  { id: 386, name: 'Peacock Premium', logo: null },
  { id: 283, name: 'Crunchyroll', logo: null },
  { id: 430, name: 'HIDIVE', logo: null },
  { id: 30, name: 'WOW', logo: null },
  { id: 11, name: 'MUBI', logo: null },
];

/**
 * Names for provider ids even without the region's list: the fallback list
 * plus regional twins (Prime Video is 9 in some regions, 119 in others, e.g.
 * DE). Used to match AniList links by name and to label stale picks.
 */
export const KNOWN_PROVIDER_NAMES: ReadonlyArray<readonly [number, string]> = [
  ...FALLBACK_PROVIDERS.map((p) => [p.id, p.name] as const),
  [119, 'Amazon Prime Video'],
];

/** "Disney+" and "Disney Plus" → "disneyplus", for matching AniList site names. */
export function normalizeProviderName(name: string): string {
  return name.toLowerCase().replace(/\+/g, 'plus').replace(/[^a-z0-9]/g, '');
}

/** Is this offer one of the user's services (by TMDB id, or by name for AniList links)? */
export function isMyService(offer: WatchOffer, services: number[], serviceNames: string[] = []): boolean {
  if (offer.id != null) return services.includes(offer.id);
  const key = normalizeProviderName(offer.name);
  return serviceNames.some((n) => normalizeProviderName(n) === key);
}

/** The user's services among the stream offers (the badges on cards). */
export function myStreamOffers(p: WatchProviders, services: number[], serviceNames: string[] = []): WatchOffer[] {
  return p.stream.filter((o) => isMyService(o, services, serviceNames));
}

/** Every group with the user's services moved to the front (otherwise in order). */
export function mineFirst(p: WatchProviders, services: number[], serviceNames: string[] = []): WatchProviders {
  const sort = (list: WatchOffer[]) => [
    ...list.filter((o) => isMyService(o, services, serviceNames)),
    ...list.filter((o) => !isMyService(o, services, serviceNames)),
  ];
  return { ...p, stream: sort(p.stream), rent: sort(p.rent), buy: sort(p.buy) };
}
