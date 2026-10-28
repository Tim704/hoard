// ───────────────────────────────────────────────────────────────────────────
//  Trakt import (spec 2.7): a public profile's watched movies and shows,
//  ratings and watchlist, read on the server through the Trakt API
//  (src/lib/actions/import.ts, needs TRAKT_CLIENT_ID) and mapped here. Pure,
//  so the mapping is tested on the documented response shapes.
//
//    /users/{id}/watched/movies           → Completed (plays > 1 = rewatches)
//    /users/{id}/watched/shows?extended=full
//                                         → Completed once every aired episode
//                                           of an ended / cancelled show is
//                                           watched, else Ongoing; progress =
//                                           episodes watched (specials aside)
//    /users/{id}/ratings/movies|shows     → the score (Trakt's 1–10 as-is);
//                                           rated but not watched = Completed
//    /users/{id}/watchlist/movies|shows   → Planned (its note kept)
//
//  Titles are matched by their TMDB id (Hoard's movie / TV externalId). The
//  last watch is a timestamp; it becomes a calendar day in the user's zone.
// ───────────────────────────────────────────────────────────────────────────

import { todayYmd } from '@/lib/release';

import { parseRating, parseYear, text } from '../fields';
import { dedupeRows, rowKey, type ParseResult } from '../rows';
import type { ImportRow } from '../types';

export const TRAKT_API = 'https://api.trakt.tv';

export interface TraktIds {
  trakt?: number | null;
  slug?: string | null;
  imdb?: string | null;
  tmdb?: number | null;
  tvdb?: number | null;
}

export interface TraktMedia {
  title?: string | null;
  year?: number | null;
  ids?: TraktIds | null;
  /** extended=full (shows). */
  aired_episodes?: number | null;
  status?: string | null;
}

export interface TraktWatched {
  plays?: number | null;
  last_watched_at?: string | null;
  reset_at?: string | null;
  movie?: TraktMedia | null;
  show?: TraktMedia | null;
  seasons?: Array<{
    number?: number | null;
    episodes?: Array<{ number?: number | null; plays?: number | null; last_watched_at?: string | null }> | null;
  }> | null;
}

export interface TraktRating {
  rated_at?: string | null;
  rating?: number | null;
  type?: string | null;
  movie?: TraktMedia | null;
  show?: TraktMedia | null;
}

export interface TraktWatchlistItem {
  listed_at?: string | null;
  notes?: string | null;
  type?: string | null;
  movie?: TraktMedia | null;
  show?: TraktMedia | null;
}

/** Everything read from one profile (any part may be empty). */
export interface TraktData {
  watchedMovies: TraktWatched[];
  watchedShows: TraktWatched[];
  ratingsMovies: TraktRating[];
  ratingsShows: TraktRating[];
  watchlistMovies: TraktWatchlistItem[];
  watchlistShows: TraktWatchlistItem[];
}

/** The six reads, in the order the rows are merged (richest first). */
export const TRAKT_PATHS: Array<{ key: keyof TraktData; path: string }> = [
  { key: 'ratingsMovies', path: 'ratings/movies' },
  { key: 'ratingsShows', path: 'ratings/shows' },
  { key: 'watchedMovies', path: 'watched/movies' },
  { key: 'watchedShows', path: 'watched/shows?extended=full' },
  { key: 'watchlistMovies', path: 'watchlist/movies' },
  { key: 'watchlistShows', path: 'watchlist/shows' },
];

/** A Trakt username / slug as it may appear in a profile URL. */
export function validTraktUser(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name.trim());
}

/** A user's input ("sean", "@sean", or "https://trakt.tv/users/sean/…") → the slug. */
export function traktUserFromInput(input: string): string {
  const s = input.trim();
  const m = /trakt\.tv\/users\/([^/?#\s]+)/i.exec(s);
  return (m ? m[1] : s.replace(/^@/, '')).trim();
}

const ENDED = new Set(['ended', 'canceled', 'cancelled']);

/** The calendar day of a Trakt timestamp in `timeZone`, or undefined. */
export function traktDay(iso: string | null | undefined, timeZone: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : todayYmd(timeZone, d);
}

/** The shared part of a row: section, title, year and TMDB / IMDb ids. Null without a title. */
function baseRow(media: TraktMedia | null | undefined, category: 'movies' | 'tv', status: ImportRow['status']): ImportRow | null {
  const title = text(media?.title ?? undefined);
  if (!media || !title) return null;
  const row: ImportRow = { source: 'trakt', category, title, ids: {}, status };
  const year = parseYear(media.year ?? undefined);
  if (year) row.year = year;
  const tmdb = media.ids?.tmdb;
  if (typeof tmdb === 'number' && Number.isInteger(tmdb) && tmdb > 0) row.ids.tmdb = String(tmdb);
  const imdb = media.ids?.imdb;
  if (imdb && /^tt\d{1,12}$/.test(imdb)) row.ids.imdb = imdb;
  return row;
}

/**
 * Episodes watched in a show's regular seasons (season 0 = specials). When
 * the user restarted the show (`reset_at`), only episodes watched since then
 * count, as Trakt's docs advise for re-watch progress.
 */
export function episodesWatched(w: TraktWatched): number {
  const reset = w.reset_at ? Date.parse(w.reset_at) : NaN;
  let n = 0;
  for (const s of w.seasons ?? []) {
    if (!s.number || s.number < 1) continue;
    for (const e of s.episodes ?? []) {
      if ((e.plays ?? 1) <= 0) continue;
      if (!Number.isNaN(reset)) {
        const at = e.last_watched_at ? Date.parse(e.last_watched_at) : NaN;
        if (Number.isNaN(at) || at < reset) continue;
      }
      n++;
    }
  }
  return n;
}

export function mapTraktWatchedMovie(w: TraktWatched, timeZone: string): ImportRow | null {
  const row = baseRow(w.movie, 'movies', 'COMPLETED');
  if (!row) return null;
  const finishedOn = traktDay(w.last_watched_at, timeZone);
  if (finishedOn) row.finishedOn = finishedOn;
  if (w.plays && w.plays > 1) row.rewatchCount = w.plays - 1;
  return row;
}

export function mapTraktWatchedShow(w: TraktWatched, timeZone: string): ImportRow | null {
  const show = w.show;
  const watched = episodesWatched(w);
  const aired = show?.aired_episodes ?? 0;
  const done = aired > 0 && watched >= aired && ENDED.has((show?.status ?? '').toLowerCase());
  const row = baseRow(show, 'tv', done ? 'COMPLETED' : 'CONSUMING');
  if (!row) return null;
  if (watched > 0) row.progress = watched;
  const last = traktDay(w.last_watched_at, timeZone);
  if (done && last) row.finishedOn = last;
  return row;
}

export function mapTraktRating(r: TraktRating): ImportRow | null {
  const isShow = r.type === 'show' || (!r.movie && Boolean(r.show));
  const row = baseRow(isShow ? r.show : r.movie, isShow ? 'tv' : 'movies', 'COMPLETED');
  if (!row) return null;
  const rating = parseRating(r.rating ?? undefined, 10);
  if (rating !== undefined) row.rating = rating;
  return row;
}

export function mapTraktWatchlist(item: TraktWatchlistItem): ImportRow | null {
  const isShow = item.type === 'show' || (!item.movie && Boolean(item.show));
  const row = baseRow(isShow ? item.show : item.movie, isShow ? 'tv' : 'movies', 'PLANNED');
  if (!row) return null;
  const notes = text(item.notes ?? undefined);
  if (notes) row.notes = notes;
  return row;
}

/**
 * Everything read from a profile → one row per title. Watched titles lead
 * (their status, progress and finish day); a rating adds its score to the
 * watched row, or stands alone as Completed when the title was never logged
 * as watched; the watchlist only adds titles nothing else mentions (merged
 * by src/lib/import/rows.ts, where the furthest status wins).
 */
export function mapTraktData(data: TraktData, timeZone: string): ParseResult {
  const rows: ImportRow[] = [];
  let skipped = 0;
  const add = (row: ImportRow | null) => (row ? rows.push(row) : skipped++);
  data.watchedMovies.forEach((w) => add(mapTraktWatchedMovie(w, timeZone)));
  data.watchedShows.forEach((w) => add(mapTraktWatchedShow(w, timeZone)));
  const watched = dedupeRows(rows);
  const byKey = new Map(watched.map((r) => [rowKey(r), r]));
  const rest: ImportRow[] = [];
  for (const r of [...data.ratingsMovies, ...data.ratingsShows]) {
    const row = mapTraktRating(r);
    if (!row) {
      skipped++;
      continue;
    }
    const seen = byKey.get(rowKey(row));
    if (seen) {
      if (seen.rating === undefined && row.rating !== undefined) seen.rating = row.rating;
    } else {
      rest.push(row);
    }
  }
  for (const i of [...data.watchlistMovies, ...data.watchlistShows]) {
    const row = mapTraktWatchlist(i);
    if (row) rest.push(row);
    else skipped++;
  }
  return { rows: dedupeRows([...watched, ...rest]), skipped, warnings: [] };
}

/** A friendly message for a failed Trakt read (status code of the answer). */
export function traktErrorMessage(status: number, user: string): string {
  if (status === 404) return `No Trakt user called "${user}".`;
  if (status === 401) {
    return `${user}'s Trakt profile is private. Make it public in Trakt's settings (Privacy), then try again.`;
  }
  // Trakt documents 403 as an invalid API key or an unapproved app.
  if (status === 403) return "Trakt refused this server's client id. Ask the owner to check TRAKT_CLIENT_ID.";
  if (status === 429) return 'Trakt is rate-limiting this server. Try again in a few minutes.';
  return `Trakt did not answer (${status}). Try again later.`;
}
