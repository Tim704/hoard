// ───────────────────────────────────────────────────────────────────────────
//  Detail lookups (spec F2, 4.9, 5.3): one place that knows, per category,
//  which provider call fills the F2 columns (release date, genres, credits,
//  title variants, time to beat, …) and turns the answer into a column patch.
//  Used by `enrichResult` (on add) and by the nightly `metadata` job.
//  Server-only.
//
//  Missing keys are not errors here: `detailsConfigured(slug)` is false and
//  callers skip the lookup (spec G4).
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from '@/lib/categories';

import { fetchAniListDetails } from './anilist';
import { fetchBookDetails } from './books';
import { fetchGameDetails, igdbConfigured } from './igdb';
import { fetchAlbumDetails, lastfmConfigured } from './music';
import { fetchMovieDetails, fetchTvDetails, tmdbConfigured } from './tmdb';

/** Rows that never get provider lookups: hand-made entries and the demo library. */
export function isLookupSkipped(externalId: string): boolean {
  return externalId.startsWith('manual:') || externalId.startsWith('demo-');
}

/** Whether `slug`'s provider can be asked for details (its keys are set). */
export function detailsConfigured(slug: CategorySlug): boolean {
  switch (slug) {
    case 'movies':
    case 'tv':
      return tmdbConfigured();
    case 'games':
      return igdbConfigured();
    case 'music':
      return lastfmConfigured();
    case 'books':
    case 'anime':
    case 'manga':
      return true; // OpenLibrary and AniList need no key
  }
}

/** What a lookup needs to know about a stored (or about-to-be-stored) row. */
export interface DetailSource {
  externalId: string;
  title: string;
  artist?: string | null;
  description?: string | null;
  trackCount?: number | null;
}

/** Drop null / empty-array entries, except the keys where null is the news. */
function compact(patch: Record<string, unknown>, keepNull: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if ((v === null || (Array.isArray(v) && v.length === 0)) && !keepNull.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

/**
 * The column patch for one row, or null when the provider doesn't know it.
 * Throws when the provider call fails (the caller decides what that means).
 * `releaseDate` is always written for TMDB / IGDB (a null there is the
 * provider's answer); `status`, `nextAirDate` and the airing fields too, so a
 * show that stopped airing stops showing a date.
 */
export async function fetchDetailPatch(
  slug: CategorySlug,
  src: DetailSource,
): Promise<Record<string, unknown> | null> {
  switch (slug) {
    case 'movies': {
      const d = await fetchMovieDetails(src.externalId);
      if (!d) return null;
      const { collection: _collection, ...rest } = d;
      return compact(rest, ['releaseDate']);
    }
    case 'tv': {
      const d = await fetchTvDetails(src.externalId);
      return d ? compact({ ...d }, ['releaseDate', 'status', 'nextAirDate']) : null;
    }
    case 'games': {
      const d = await fetchGameDetails(src.externalId);
      return d ? compact({ ...d }, ['releaseDate']) : null;
    }
    case 'books': {
      const d = await fetchBookDetails(src.externalId);
      if (!d) return null;
      // Search results carry no description; fill it, but never replace one.
      return compact({ genres: d.genres, description: src.description ? null : d.description });
    }
    case 'music': {
      const d = await fetchAlbumDetails(src.artist ?? null, src.title);
      if (!d) return null;
      return compact({ genres: d.genres, trackCount: src.trackCount ? null : d.trackCount });
    }
    case 'anime':
    case 'manga': {
      const map = await fetchAniListDetails(slug === 'anime' ? 'ANIME' : 'MANGA', [src.externalId]);
      const patch = map.get(src.externalId);
      return patch ? compact(patch, ['nextAiringAt', 'nextAiringEpisode']) : null;
    }
  }
}

/** Re-exported for the metadata job's AniList batches. */
export { fetchAniListDetails };
