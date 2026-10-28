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

/** Movie search; `year` narrows it to films released that year (imports). */
export async function searchMovies(query: string, year?: number): Promise<NormalizedResult[]> {
  const q = query.trim();
  if (!q) return [];
  const key = requireKey();

  const y = year && Number.isInteger(year) ? `&year=${year}` : '';
  const url = `${TMDB_BASE}/search/movie?api_key=${key}&include_adult=false&query=${encodeURIComponent(q)}${y}`;
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
  title?: string | null;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number | null;
  runtime?: number | null;
  release_date?: string | null;
  genres?: Array<{ id?: number; name?: string | null }> | null;
  belongs_to_collection?: { id?: number; name?: string } | null;
  credits?: TmdbCredits | null;
}

export interface MovieDetails {
  // The display core (the provider is the source of truth for these).
  title: string | null;
  imageUrl: string | null;
  backdropUrl: string | null;
  description: string | null;
  tmdbRating: number | null;
  runtime: number | null;
  collection: { id: number; name: string } | null;
  releaseDate: string | null;
  year: number | null;
  genres: string[];
  directors: string[];
  cast: string[];
}

/** TMDB's vote average, or null for 0 (= no votes yet; never stored over a real one). */
function crowdRating(v: number | null | undefined): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/** GET /movie/{id}?append_to_response=credits → our movie details. */
export function mapMovieDetails(data: TmdbMovieDetailsJson): MovieDetails {
  const col = data.belongs_to_collection;
  return {
    title: data.title?.trim() || null,
    imageUrl: imageUrl(data.poster_path, 'w500'),
    backdropUrl: imageUrl(data.backdrop_path, 'w780'),
    description: data.overview?.trim() || null,
    tmdbRating: crowdRating(data.vote_average),
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
  name?: string | null;
  overview?: string | null;
  poster_path?: string | null;
  vote_average?: number | null;
  first_air_date?: string | null;
  number_of_episodes?: number | null;
  number_of_seasons?: number | null;
  episode_run_time?: number[] | null;
  status?: string | null;
  genres?: Array<{ id?: number; name?: string | null }> | null;
  created_by?: Array<{ name?: string | null }> | null;
  next_episode_to_air?: { air_date?: string | null } | null;
  credits?: TmdbCredits | null;
  seasons?: TmdbSeasonJson[] | null;
}

/** One entry of `/tv/{id}` → `seasons[]`. */
export interface TmdbSeasonJson {
  season_number?: unknown;
  name?: string | null;
  episode_count?: number | null;
  air_date?: string | null;
  poster_path?: string | null;
}

/** A season as stored in `TvSeason` (3.3). */
export interface TvSeasonData {
  seasonNumber: number;
  name: string;
  episodeCount: number | null;
  airDate: string | null;
  imageUrl: string | null;
}

export interface TvDetails {
  title: string | null;
  imageUrl: string | null;
  description: string | null;
  tmdbRating: number | null;
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
  /** Typical episode length in minutes (the first `episode_run_time`), for 5.2. */
  episodeRunTime: number | null;
}

/** GET /tv/{id}?append_to_response=credits → our tv details. */
export function mapTvDetails(data: TmdbTvDetailsJson): TvDetails {
  return {
    title: data.name?.trim() || null,
    imageUrl: imageUrl(data.poster_path, 'w500'),
    description: data.overview?.trim() || null,
    tmdbRating: crowdRating(data.vote_average),
    episodeCount: data.number_of_episodes ?? null,
    seasonCount: data.number_of_seasons ?? null,
    releaseDate: normalizeYmd(data.first_air_date),
    year: yearFrom(data.first_air_date),
    genres: normalizeGenres((data.genres ?? []).map((g) => g.name)),
    directors: uniqueNames((data.created_by ?? []).map((c) => c.name)),
    cast: topCast(data.credits),
    status: data.status?.trim() || null,
    nextAirDate: normalizeYmd(data.next_episode_to_air?.air_date),
    episodeRunTime: firstRunTime(data.episode_run_time),
  };
}

/** The first sane `episode_run_time` entry (minutes), or null (often an empty list). */
function firstRunTime(v: unknown): number | null {
  if (!Array.isArray(v)) return null;
  const n = v.find((x) => typeof x === 'number' && Number.isInteger(x) && x > 0 && x < 600);
  return typeof n === 'number' ? n : null;
}

/**
 * The show's seasons from the same `/tv/{id}` answer, by season number.
 * Season 0 (the specials) and malformed entries are skipped; a blank name
 * becomes "Season N"; the poster uses the same URL format as show posters.
 */
export function mapTvSeasons(data: TmdbTvDetailsJson): TvSeasonData[] {
  const out = new Map<number, TvSeasonData>();
  for (const s of data.seasons ?? []) {
    const n = s?.season_number;
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0 || out.has(n)) continue;
    const count = s.episode_count;
    out.set(n, {
      seasonNumber: n,
      name: s.name?.trim() || `Season ${n}`,
      episodeCount: typeof count === 'number' && Number.isInteger(count) && count >= 0 ? count : null,
      airDate: normalizeYmd(s.air_date),
      imageUrl: imageUrl(s.poster_path, 'w500'),
    });
  }
  return [...out.values()].sort((a, b) => a.seasonNumber - b.seasonNumber);
}

/**
 * Fetch tv details (counts, dates, genres, credits, status) plus its seasons
 * (one request). Null on 404.
 */
export async function fetchTvDetails(
  externalId: string,
): Promise<(TvDetails & { seasons: TvSeasonData[] }) | null> {
  const key = requireKey();
  const url = `${TMDB_BASE}/tv/${encodeURIComponent(externalId)}?api_key=${key}&append_to_response=credits`;
  const res = await providerFetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TMDB tv details failed (${res.status})`);
  const json = (await res.json()) as TmdbTvDetailsJson;
  return { ...mapTvDetails(json), seasons: mapTvSeasons(json) };
}

/** GET /collection/{id}: the collection and its films ("parts"). */
export interface TmdbCollectionJson {
  id?: number;
  name?: string | null;
  parts?: TmdbMovie[] | null;
}

/** A collection's films → search-shaped results, oldest first (unreleased last). */
export function mapCollectionParts(data: TmdbCollectionJson): NormalizedResult[] {
  return (data.parts ?? [])
    .filter((p) => p && typeof p.id === 'number' && p.title)
    .map(mapMovieSearchHit)
    .sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity));
}

/**
 * The films of a TMDB collection (2.10 "Add missing titles"). An unknown id
 * (404) gives []. Throws on other failures and without a key.
 */
export async function fetchCollectionParts(collectionId: number): Promise<NormalizedResult[]> {
  const key = requireKey();
  if (!Number.isInteger(collectionId) || collectionId <= 0) return [];
  const res = await providerFetch(`${TMDB_BASE}/collection/${collectionId}?api_key=${key}`);
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`TMDB collection failed (${res.status})`);
  return mapCollectionParts((await res.json()) as TmdbCollectionJson);
}

/**
 * One movie or show by TMDB id as a search-shaped hit (add by link, 2.4).
 * The details JSON carries the search-hit fields the mapper reads (genres
 * come later, from the add's enrichment). Null on 404; throws without a key.
 */
export async function fetchTmdbById(kind: 'movie' | 'tv', id: string): Promise<NormalizedResult | null> {
  const key = requireKey();
  if (!/^\d+$/.test(id)) return null;
  const res = await providerFetch(`${TMDB_BASE}/${kind}/${id}?api_key=${key}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TMDB ${kind} lookup failed (${res.status})`);
  const data = (await res.json()) as TmdbMovie & TmdbTv;
  if (typeof data?.id !== 'number') return null;
  return kind === 'movie' ? mapMovieSearchHit(data) : mapTvSearchHit(data);
}

/** GET /find/{imdb_id}?external_source=imdb_id */
export interface TmdbFindJson {
  movie_results?: TmdbMovie[] | null;
  tv_results?: TmdbTv[] | null;
}

/** The film (preferred) or show a /find answer names, or null. */
export function mapFindResult(
  data: TmdbFindJson,
): { kind: 'movie' | 'tv'; result: NormalizedResult } | null {
  const movie = (data.movie_results ?? []).find((m) => m && typeof m.id === 'number' && m.title);
  if (movie) return { kind: 'movie', result: mapMovieSearchHit(movie) };
  const tv = (data.tv_results ?? []).find((t) => t && typeof t.id === 'number' && t.name);
  if (tv) return { kind: 'tv', result: mapTvSearchHit(tv) };
  return null;
}

/** An IMDb title id (tt…) through TMDB's /find. Null when TMDB doesn't know it. */
export async function findByImdbId(
  imdbId: string,
): Promise<{ kind: 'movie' | 'tv'; result: NormalizedResult } | null> {
  const key = requireKey();
  if (!/^tt\d{5,10}$/.test(imdbId)) return null;
  const res = await providerFetch(`${TMDB_BASE}/find/${imdbId}?api_key=${key}&external_source=imdb_id`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TMDB find failed (${res.status})`);
  return mapFindResult((await res.json()) as TmdbFindJson);
}

/**
 * One page of GET /{movie|tv}/top_rated (20 per page) → search-shaped hits,
 * in TMDB's order. Malformed entries are skipped.
 */
export function mapTmdbTopRated(kind: 'movie' | 'tv', data: unknown): NormalizedResult[] {
  const results = (data as TmdbResponse<TmdbMovie & TmdbTv> | null)?.results;
  if (!Array.isArray(results)) return [];
  return results
    .filter((r) => r && typeof r.id === 'number' && (kind === 'movie' ? r.title : r.name))
    .map((r) => (kind === 'movie' ? mapMovieSearchHit(r) : mapTvSearchHit(r)));
}

/** Reference lists (4.8): page `page` (1-based) of TMDB's top rated movies or shows. Throws without a key. */
export async function fetchTmdbTopRated(kind: 'movie' | 'tv', page: number): Promise<NormalizedResult[]> {
  const key = requireKey();
  if (!Number.isInteger(page) || page < 1 || page > 500) return [];
  const res = await providerFetch(`${TMDB_BASE}/${kind}/top_rated?api_key=${key}&page=${page}`);
  if (!res.ok) throw new Error(`TMDB top rated failed (${res.status})`);
  return mapTmdbTopRated(kind, await res.json());
}

// ── Where to stream (5.1) ────────────────────────────────────────────────────
//  JustWatch data served by TMDB. Callers cache the raw answers for 7 days
//  (src/lib/watch-providers.ts); the mapping lives in src/lib/streaming.ts.

/** GET /{movie|tv}/{id}/watch/providers: the raw answer (every region). Null on 404. */
export async function fetchWatchProvidersJson(kind: 'movie' | 'tv', id: string): Promise<unknown | null> {
  const key = requireKey();
  if (!/^\d+$/.test(id)) return null;
  const res = await providerFetch(`${TMDB_BASE}/${kind}/${id}/watch/providers?api_key=${key}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`TMDB watch providers failed (${res.status})`);
  return res.json();
}

/** GET /watch/providers/movie?watch_region=XX: the services available in a region (raw). */
export async function fetchProviderListJson(region: string): Promise<unknown> {
  const key = requireKey();
  if (!/^[A-Z]{2}$/.test(region)) throw new Error('Invalid region');
  const res = await providerFetch(`${TMDB_BASE}/watch/providers/movie?api_key=${key}&watch_region=${region}`);
  if (!res.ok) throw new Error(`TMDB provider list failed (${res.status})`);
  return res.json();
}

// ── More by the same people (5.10) ─────────────────────────────────────────

/** One entry of `/person/{id}/combined_credits` → cast[] / crew[]. */
export interface TmdbCreditJson {
  id?: number;
  media_type?: string | null;
  title?: string | null;
  name?: string | null;
  overview?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string | null;
  first_air_date?: string | null;
  vote_average?: number | null;
  genre_ids?: number[] | null;
  popularity?: number | null;
}

export interface TmdbCombinedCreditsJson {
  cast?: TmdbCreditJson[] | null;
  crew?: TmdbCreditJson[] | null;
}

/** Talk shows, news and reality TV: guest spots, not "their work". */
const SKIPPED_TV_GENRES = new Set([10763, 10764, 10767]);

/**
 * A person's films and shows (cast and crew together), each once, most
 * popular first, as add-ready results (`movies` or `tv`). Talk, news and
 * reality shows and entries without a title are left out.
 */
export function mapCombinedCredits(
  json: TmdbCombinedCreditsJson,
): Array<{ slug: 'movies' | 'tv'; result: NormalizedResult; popularity: number }> {
  const seen = new Set<string>();
  const out: Array<{ slug: 'movies' | 'tv'; result: NormalizedResult; popularity: number }> = [];
  for (const c of [...(json.cast ?? []), ...(json.crew ?? [])]) {
    if (!c || typeof c.id !== 'number') continue;
    const kind = c.media_type === 'movie' ? 'movies' : c.media_type === 'tv' ? 'tv' : null;
    if (!kind) continue;
    if (kind === 'tv' && (c.genre_ids ?? []).some((g) => SKIPPED_TV_GENRES.has(g))) continue;
    const key = `${kind}:${c.id}`;
    if (seen.has(key)) continue;
    const title = (kind === 'movies' ? c.title : c.name)?.trim();
    if (!title) continue;
    seen.add(key);
    const result =
      kind === 'movies'
        ? mapMovieSearchHit({ ...c, id: c.id, title })
        : mapTvSearchHit({ ...c, id: c.id, name: title });
    out.push({ slug: kind, result, popularity: typeof c.popularity === 'number' ? c.popularity : 0 });
  }
  return out.sort((a, b) => b.popularity - a.popularity);
}

/**
 * The TMDB person for a credited name (the most popular exact-name match,
 * else the top hit), then their combined credits. Null when nobody matches.
 */
export async function fetchPersonCredits(name: string): Promise<TmdbCombinedCreditsJson | null> {
  const key = requireKey();
  const q = name.trim();
  if (!q) return null;
  const res = await providerFetch(`${TMDB_BASE}/search/person?api_key=${key}&include_adult=false&query=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`TMDB person search failed (${res.status})`);
  const people = ((await res.json()) as { results?: Array<{ id?: number; name?: string; popularity?: number }> }).results ?? [];
  const exact = people.filter((p) => p.name?.toLowerCase() === q.toLowerCase());
  const person = exact.length ? exact.sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))[0] : people[0];
  if (typeof person?.id !== 'number') return null;
  const credits = await providerFetch(`${TMDB_BASE}/person/${person.id}/combined_credits?api_key=${key}`);
  if (credits.status === 404) return null;
  if (!credits.ok) throw new Error(`TMDB person credits failed (${credits.status})`);
  return (await credits.json()) as TmdbCombinedCreditsJson;
}
