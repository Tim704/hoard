// ───────────────────────────────────────────────────────────────────────────
//  Provider dispatch. Maps a CategorySlug to its metadata provider, runs the
//  search, and wraps the call so a hard error (missing key, network failure)
//  surfaces as `SearchResponse.error` instead of throwing to the caller.
//  Server-only.
// ───────────────────────────────────────────────────────────────────────────

import { getCategory, type CategorySlug } from '@/lib/categories';
import type { NormalizedResult, SearchResponse } from '@/lib/types';

import {
  searchMovies,
  searchTv,
  fetchMovieDetails,
  fetchTvDetails,
} from './tmdb';
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
 * Enrich a normalized result with extra provider details before it is upserted.
 * Currently fills runtime (movies) and episode/season counts (tv) from TMDB so
 * the dashboard's headline metrics have real numbers to sum. Best-effort: any
 * failure returns the original result unchanged — enrichment never blocks an add.
 */
export async function enrichResult(
  slug: CategorySlug,
  result: NormalizedResult,
): Promise<NormalizedResult> {
  try {
    if (slug === 'movies') {
      const d = await fetchMovieDetails(result.externalId);
      return { ...result, fields: { ...result.fields, runtime: d.runtime } };
    }
    if (slug === 'tv') {
      const d = await fetchTvDetails(result.externalId);
      return {
        ...result,
        fields: {
          ...result.fields,
          episodeCount: d.episodeCount,
          seasonCount: d.seasonCount,
        },
      };
    }
    return result;
  } catch {
    // Enrichment is best-effort; fall back to the un-enriched result.
    return result;
  }
}
