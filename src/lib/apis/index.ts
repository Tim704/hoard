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

/**
 * Enrich a normalized result with provider details before it is upserted:
 * runtime and episode / season counts (so dashboard metrics have numbers to
 * sum), and the F2 details (release date, genres, credits, TV status, IGDB
 * time to beat and Steam app id, book genres, album tags). A successful lookup
 * stamps `metaFetchedAt`, so the nightly metadata job leaves the row alone for
 * 30 days. AniList search hits already carry everything, so anime and manga
 * are only stamped. Best-effort: a missing key or any failure returns the
 * result unchanged, so enrichment never blocks an add.
 */
export async function enrichResult(
  slug: CategorySlug,
  result: NormalizedResult,
): Promise<NormalizedResult> {
  if (isLookupSkipped(result.externalId) || !detailsConfigured(slug)) return result;
  try {
    if (slug === 'anime' || slug === 'manga') {
      // Older clients may send a hit without the AniList variants; let the job fill those.
      if (!('titleRomaji' in result.fields)) return result;
      return { ...result, fields: { ...result.fields, metaFetchedAt: new Date() } };
    }
    const f = result.fields;
    const patch = await fetchDetailPatch(slug, {
      externalId: result.externalId,
      title: result.title,
      artist: typeof f.artist === 'string' ? f.artist : null,
      description: typeof f.description === 'string' ? f.description : null,
      trackCount: typeof f.trackCount === 'number' ? f.trackCount : null,
    });
    if (!patch) return result;
    return { ...result, fields: { ...f, ...patch, metaFetchedAt: new Date() } };
  } catch {
    // Enrichment is best-effort; fall back to the un-enriched result.
    return result;
  }
}
