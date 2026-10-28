// ───────────────────────────────────────────────────────────────────────────
//  Provider dispatch. Maps a CategorySlug to its metadata provider, runs the
//  search, and wraps the call so a hard error (missing key, network failure)
//  surfaces as `SearchResponse.error` instead of throwing to the caller.
//  Server-only.
// ───────────────────────────────────────────────────────────────────────────

import { getCategory, type CategorySlug } from '@/lib/categories';
import type { NormalizedResult, SearchResponse } from '@/lib/types';

import { searchMovies, searchTv } from './tmdb';
import { detailsConfigured, fetchDetailPatch, isLookupSkipped } from './details';
import { searchAnime, searchManga } from './anilist';
import { searchBooks } from './books';
import { searchGames } from './igdb';
import { searchAlbums } from './music';

/** Run the search for a single category slug, returning a normalized response. */
export async function searchProvider(
  slug: CategorySlug,
  query: string,
): Promise<SearchResponse> {
  const cat = getCategory(slug);
  // getCategory only returns undefined for non-slugs; this guard keeps the
  // `source` lookup type-safe and degrades gracefully if a bad slug slips in.
  if (!cat) {
    return { source: 'Unknown', results: [], error: `Unknown category: ${slug}` };
  }

  try {
    let results: NormalizedResult[];
    switch (slug) {
      case 'books':
        results = await searchBooks(query);
        break;
      case 'movies':
        results = await searchMovies(query);
        break;
      case 'tv':
        results = await searchTv(query);
        break;
      case 'anime':
        results = await searchAnime(query);
        break;
      case 'manga':
        results = await searchManga(query);
        break;
      case 'games':
        results = await searchGames(query);
        break;
      case 'music':
        results = await searchAlbums(query);
        break;
      default: {
        // Exhaustiveness guard: if CategorySlug grows, TS flags this.
        const _exhaustive: never = slug;
        throw new Error(`Unhandled category: ${String(_exhaustive)}`);
      }
    }
    return { source: cat.source, results };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search failed';
    return { source: cat.source, results: [], error: message };
  }
}

/** A search hit after the provider lookup, plus when that lookup succeeded. */
export interface EnrichedResult {
  result: NormalizedResult;
  /**
   * Server-side stamp for the new row's `metaFetchedAt`: set only when a real
   * provider lookup answered, so the nightly job leaves the row alone for 30
   * days. Never part of `fields` (those come back from the client and are
   * not trusted with job bookkeeping).
   */
  metaFetchedAt: Date | null;
}

/**
 * Enrich a search hit with the provider's own details before a new catalogue
 * row is created: the display core (title, cover, description, crowd score —
 * the provider, not the client, is their source of truth), runtime and
 * episode / season counts, and the F2 details (release date, genres, credits,
 * TV status, IGDB time to beat and Steam app id, AniList title variants and
 * airing, book genres, album tags). Best-effort: a missing key, an unknown id
 * or any failure returns the hit unchanged with no stamp, so enrichment never
 * blocks an add and the metadata job retries the lookup later.
 */
export async function enrichResult(
  slug: CategorySlug,
  result: NormalizedResult,
): Promise<EnrichedResult> {
  const unchanged = { result, metaFetchedAt: null };
  if (isLookupSkipped(result.externalId) || !detailsConfigured(slug)) return unchanged;
  try {
    const f = result.fields;
    const patch = await fetchDetailPatch(slug, {
      externalId: result.externalId,
      title: result.title,
      artist: typeof f.artist === 'string' ? f.artist : null,
      description: typeof f.description === 'string' ? f.description : null,
      trackCount: typeof f.trackCount === 'number' ? f.trackCount : null,
    });
    if (!patch) return unchanged;
    return { result: { ...result, fields: { ...f, ...patch } }, metaFetchedAt: new Date() };
  } catch {
    // Enrichment is best-effort; fall back to the un-enriched result.
    return unchanged;
  }
}
