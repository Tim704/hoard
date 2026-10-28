// ───────────────────────────────────────────────────────────────────────────
//  TMDB provider — movies + tv. Requires TMDB_API_KEY.
//  Server-only: reads process.env. Every call goes through providerFetch
//  (no-store, 8 s timeout).
//
//  The response → column mapping lives in small pure functions
//  (`mapMovieSearchHit`, `mapMovieDetails`, …) so it is tested on fixture JSON
//  without the network.
// ───────────────────────────────────────────────────────────────────────────

import { normalizeGenres, uniqueNames } from '@/lib/genres';
import { normalizeYmd } from '@/lib/release';
import type { NormalizedResult } from '@/lib/types';

import { providerFetch } from './http';

const TMDB_BASE = 'https://api.themoviedb.org/3';
const IMAGE_BASE = 'https://image.tmdb.org/t/p';

/** How many billed cast members we keep (5.10 / 6.6). */
const TOP_CAST = 5;

/** Build a poster/backdrop URL, or null when the path is missing. */
function imageUrl(path: string | null | undefined, size: string): string | null {
  return path ? `${IMAGE_BASE}/${size}${path}` : null;
}

export function tmdbConfigured(): boolean {
  return Boolean(process.env.TMDB_API_KEY);
}

/** Read & validate the API key, throwing a hard error when absent. */
function requireKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) throw new Error('TMDB_API_KEY not configured');
  return key;
}

// TMDB's fixed genre lists (GET /genre/movie/list and /genre/tv/list). Search
// hits only carry `genre_ids`; details carry names directly.
const MOVIE_GENRES: Record<number, string> = {
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Science Fiction',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
};
const TV_GENRES: Record<number, string> = {
  10759: 'Action & Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  10762: 'Kids',
  9648: 'Mystery',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
  37: 'Western',
};

/** Genre names for search-hit `genre_ids` (unknown ids are skipped). */
export function genreNamesFromIds(ids: unknown, kind: 'movie' | 'tv'): string[] {
  if (!Array.isArray(ids)) return [];
  const table = kind === 'movie' ? MOVIE_GENRES : TV_GENRES;
  return normalizeGenres(ids.map((id) => (typeof id === 'number' ? table[id] : undefined)));
}

/** The year of a TMDB date string ("1999-03-30" → 1999), or null. */
function yearFrom(date: string | null | undefined): number | null {
  const y = date ? Number(date.slice(0, 4)) : NaN;
  return Number.isFinite(y) && y > 0 ? y : null;
}

interface TmdbMovie {
  id: number;
  title: string;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string | null;
  vote_average?: number | null;
  genre_ids?: number[] | null;
}

interface TmdbTv {
  id: number;
  name: string;
  overview?: string | null;
  poster_path?: string | null;
  first_air_date?: string | null;
  vote_average?: number | null;
  genre_ids?: number[] | null;
}

interface TmdbResponse<T> {
  results?: T[];
}

interface TmdbCredits {
  cast?: Array<{ name?: string | null; order?: number | null }> | null;
  crew?: Array<{ name?: string | null; job?: string | null }> | null;
}

/** The top-billed cast names (by `order`), at most TOP_CAST. */
export function topCast(credits: TmdbCredits | null | undefined): string[] {
  const cast = [...(credits?.cast ?? [])].sort((a, b) => (a.order ?? 999) - (b.order ?? 999));
  return uniqueNames(cast.map((c) => c.name), TOP_CAST);
}

/** Crew members credited with the job "Director". */
export function directorsOf(credits: TmdbCredits | null | undefined): string[] {
  return uniqueNames((credits?.crew ?? []).filter((c) => c.job === 'Director').map((c) => c.name));
}

/** One movie search hit → a NormalizedResult (fields = Movie columns). */
export function mapMovieSearchHit(m: TmdbMovie): NormalizedResult {
  const year = yearFrom(m.release_date);
  const tmdbRating = m.vote_average ?? null;
  const image = imageUrl(m.poster_path, 'w500');
  const backdropUrl = imageUrl(m.backdrop_path, 'w780');
  const releaseDate = normalizeYmd(m.release_date);
  const genres = genreNamesFromIds(m.genre_ids, 'movie');

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
    // EXACTLY the Movie table columns (+ externalId + title). F2 columns are
    // only sent when known, so re-adding never blanks stored details.
    fields: {
      externalId: String(m.id),
      title: m.title,
      imageUrl: image,
      backdropUrl,
      description: m.overview || null,
      year,
      tmdbRating,
      runtime: null,
      ...(releaseDate && { releaseDate }),
      ...(genres.length && { genres }),
    },
  };
}

/** One tv search hit → a NormalizedResult (fields = TvShow columns). */
export function mapTvSearchHit(t: TmdbTv): NormalizedResult {
  const year = yearFrom(t.first_air_date);
  const tmdbRating = t.vote_average ?? null;
  const image = imageUrl(t.poster_path, 'w500');
  const releaseDate = normalizeYmd(t.first_air_date);
  const genres = genreNamesFromIds(t.genre_ids, 'tv');

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
      ...(releaseDate && { releaseDate }),
      ...(genres.length && { genres }),
    },
  };
}

export async function searchMovies(query: string): Promise<NormalizedResult[]> {
  const q = query.trim();
  if (!q) return [];
  const key = requireKey();

  const url = `${TMDB_BASE}/search/movie?api_key=${key}&include_adult=false&query=${encodeURIComponent(q)}`;
  const res = await providerFetch(url);
  if (!res.ok) throw new Error(`TMDB movie search failed (${res.status})`);

  const data = (await res.json()) as TmdbResponse<TmdbMovie>;
  return (data.results ?? []).map(mapMovieSearchHit);
}

export async function searchTv(query: string): Promise<NormalizedResult[]> {
  const q = query.trim();
  if (!q) return [];
  const key = requireKey();

  const url = `${TMDB_BASE}/search/tv?api_key=${key}&include_adult=false&query=${encodeURIComponent(q)}`;
  const res = await providerFetch(url);
  if (!res.ok) throw new Error(`TMDB tv search failed (${res.status})`);

  const data = (await res.json()) as TmdbResponse<TmdbTv>;
  return (data.results ?? []).map(mapTvSearchHit);
}

export interface TmdbMovieDetailsJson {
  runtime?: number | null;
  release_date?: string | null;
  genres?: Array<{ id?: number; name?: string | null }> | null;
  belongs_to_collection?: { id?: number; name?: string } | null;
  credits?: TmdbCredits | null;
}

export interface MovieDetails {
  runtime: number | null;
  collection: { id: number; name: string } | null;
  releaseDate: string | null;
  year: number | null;
  genres: string[];
  directors: string[];
  cast: string[];
}

/** GET /movie/{id}?append_to_response=credits → our movie details. */
export function mapMovieDetails(data: TmdbMovieDetailsJson): MovieDetails {
  const col = data.belongs_to_collection;
  return {
    runtime: data.runtime || null,
    collection: col?.id && col.name ? { id: col.id, name: col.name } : null,
    releaseDate: normalizeYmd(data.release_date),
    year: yearFrom(data.release_date),
    genres: normalizeGenres((data.genres ?? []).map((g) => g.name)),
    directors: directorsOf(data.credits),
    cast: topCast(data.credits),
  };
}

/**
 * Fetch movie details: runtime, the TMDB collection the film belongs to (used
 * for franchise grouping), release date, genres and credits. Returns null when
 * TMDB doesn't know the id (404). Throws on other failures.
 */
export async function fetchMovieDetails(externalId: string): Promise<MovieDetails | null> {
  const key = requireKey();
  const url = `${TMDB_BASE}/movie/${encodeURIComponent(externalId)}?api_key=${key}&append_to_response=credits`;
  const res = await providerFetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TMDB movie details failed (${res.status})`);
  return mapMovieDetails((await res.json()) as TmdbMovieDetailsJson);
}

export interface TmdbTvDetailsJson {
  first_air_date?: string | null;
  number_of_episodes?: number | null;
  number_of_seasons?: number | null;
  status?: string | null;
  genres?: Array<{ id?: number; name?: string | null }> | null;
  created_by?: Array<{ name?: string | null }> | null;
  next_episode_to_air?: { air_date?: string | null } | null;
  credits?: TmdbCredits | null;
}

export interface TvDetails {
  episodeCount: number | null;
  seasonCount: number | null;
  releaseDate: string | null;
  year: number | null;
  genres: string[];
  /** The show's creators (TV has no single director). */
  directors: string[];
  cast: string[];
  status: string | null;
  nextAirDate: string | null;
}

/** GET /tv/{id}?append_to_response=credits → our tv details. */
export function mapTvDetails(data: TmdbTvDetailsJson): TvDetails {
  return {
    episodeCount: data.number_of_episodes ?? null,
    seasonCount: data.number_of_seasons ?? null,
    releaseDate: normalizeYmd(data.first_air_date),
    year: yearFrom(data.first_air_date),
    genres: normalizeGenres((data.genres ?? []).map((g) => g.name)),
    directors: uniqueNames((data.created_by ?? []).map((c) => c.name)),
    cast: topCast(data.credits),
    status: data.status?.trim() || null,
    nextAirDate: normalizeYmd(data.next_episode_to_air?.air_date),
  };
}

/** Fetch tv details (counts, dates, genres, credits, status). Null on 404. */
export async function fetchTvDetails(externalId: string): Promise<TvDetails | null> {
  const key = requireKey();
  const url = `${TMDB_BASE}/tv/${encodeURIComponent(externalId)}?api_key=${key}&append_to_response=credits`;
  const res = await providerFetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TMDB tv details failed (${res.status})`);
  return mapTvDetails((await res.json()) as TmdbTvDetailsJson);
}
