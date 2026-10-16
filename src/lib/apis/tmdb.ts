// ───────────────────────────────────────────────────────────────────────────
//  TMDB provider — movies + tv. Requires TMDB_API_KEY.
//  Server-only: reads process.env. fetch with { cache: 'no-store' }.
// ───────────────────────────────────────────────────────────────────────────

import type { NormalizedResult } from '@/lib/types';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

/** Build a poster/backdrop URL, or null when the path is missing. */
function imageUrl(path: string | null | undefined, size: string): string | null {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

/** Read & validate the API key, throwing a hard error when absent. */
function requireKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error('TMDB_API_KEY not configured');
  return key;
}

interface TmdbMovie {
  id: number;
  title: string;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string | null;
  vote_average?: number | null;
}

interface TmdbTv {
  id: number;
  name: string;
  overview?: string | null;
  poster_path?: string | null;
  first_air_date?: string | null;
  vote_average?: number | null;
}

interface TmdbResponse<T> {
  results?: T[];
}

export async function searchMovies(query: string): Promise<NormalizedResult[]> {
  const q = query.trim();
  if (!q) return [];
  const key = requireKey();

  const url = `${TMDB_BASE}/search/movie?api_key=${key}&include_adult=false&query=${encodeURIComponent(q)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TMDB movie search failed (${res.status})`);

  const data = (await res.json()) as TmdbResponse<TmdbMovie>;
  const results = data.results ?? [];

  return results.map((m): NormalizedResult => {
    const year = m.release_date ? Number(m.release_date.slice(0, 4)) : null;
    const tmdbRating = m.vote_average ?? null;
    const image = imageUrl(m.poster_path, 'w500');
    const backdropUrl = imageUrl(m.backdrop_path, 'w780');

    const subtitleParts: string[] = [];
    if (year) subtitleParts.push(String(year));
    if (tmdbRating) subtitleParts.push(`★ ${tmdbRating.toFixed(1)}`);

    return {
      externalId: String(m.id),
      title: m.title,
      imageUrl: image,
      subtitle: subtitleParts.length ? subtitleParts.join(' · ') : null,
      year,
      description: m.overview || null,
      // EXACTLY the Movie table columns (+ externalId + title).
      fields: {
        externalId: String(m.id),
        title: m.title,
        imageUrl: image,
        backdropUrl,
        description: m.overview || null,
        year,
        tmdbRating,
        runtime: null,
      },
    };
  });
}

/**
 * Fetch movie detail enrichment (runtime in minutes). Best-effort: the caller
 * wraps this and falls back to the un-enriched result on any failure.
 */
export async function fetchMovieDetails(
  externalId: string,
): Promise<{ runtime: number | null }> {
  const key = requireKey();
  const url = `${TMDB_BASE}/movie/${externalId}?api_key=${key}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TMDB movie details failed (${res.status})`);

  const data = (await res.json()) as { runtime?: number | null };
  return { runtime: data.runtime ?? null };
}

/**
 * Fetch tv detail enrichment (episode + season counts). Best-effort, as above.
 */
export async function fetchTvDetails(
  externalId: string,
): Promise<{ episodeCount: number | null; seasonCount: number | null }> {
  const key = requireKey();
  const url = `${TMDB_BASE}/tv/${externalId}?api_key=${key}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TMDB tv details failed (${res.status})`);

  const data = (await res.json()) as {
    number_of_episodes?: number | null;
    number_of_seasons?: number | null;
  };
  return {
    episodeCount: data.number_of_episodes ?? null,
    seasonCount: data.number_of_seasons ?? null,
  };
}

export async function searchTv(query: string): Promise<NormalizedResult[]> {
  const q = query.trim();
  if (!q) return [];
  const key = requireKey();

  const url = `${TMDB_BASE}/search/tv?api_key=${key}&include_adult=false&query=${encodeURIComponent(q)}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`TMDB tv search failed (${res.status})`);

  const data = (await res.json()) as TmdbResponse<TmdbTv>;
  const results = data.results ?? [];

  return results.map((t): NormalizedResult => {
    const year = t.first_air_date ? Number(t.first_air_date.slice(0, 4)) : null;
    const tmdbRating = t.vote_average ?? null;
    const image = imageUrl(t.poster_path, 'w500');

    const subtitleParts: string[] = [];
    if (year) subtitleParts.push(String(year));
    if (tmdbRating) subtitleParts.push(`★ ${tmdbRating.toFixed(1)}`);

    return {
      externalId: String(t.id),
      title: t.name,
      imageUrl: image,
      subtitle: subtitleParts.length ? subtitleParts.join(' · ') : null,
      year,
      description: t.overview || null,
      // EXACTLY the TvShow table columns (+ externalId + title).
      fields: {
        externalId: String(t.id),
        title: t.name,
        imageUrl: image,
        description: t.overview || null,
        year,
        tmdbRating,
        episodeCount: null,
        seasonCount: null,
      },
    };
  });
}
