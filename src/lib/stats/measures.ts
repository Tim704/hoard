// ───────────────────────────────────────────────────────────────────────────
//  Stats (spec 6.x): what one title "weighs" (hours, episodes, pages), which
//  titles count as finished in a range of days, and the per-section headline
//  numbers shared with the dashboard. Pure and client-safe.
//
//  Hours are an approximation, documented on the stats pages:
//    - movies: the runtime;
//    - TV: episodes × the show's typical episode length (TMDB
//      episode_run_time), or 45 minutes when unknown;
//    - anime: episodes × 24 minutes.
//  Books, manga, games and music add no hours. A RETIRED title (set aside
//  without finishing) only counts the progress it got to, never the whole.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from '@/lib/categories';
import type { Status } from '@/lib/status';
import type { DayRange, FinishEntry, StatTitle } from './types';

/** Statuses whose diary entries count as finishes (a drop is not a finish). */
export const FINISHED_FOR_STATS: readonly Status[] = ['COMPLETED', 'RETIRED'];

export const TV_EPISODE_MINUTES = 45;
export const ANIME_EPISODE_MINUTES = 24;

/** The hours approximation in words, shown wherever hours are. */
export const HOURS_NOTE = `Hours are approximate: movie runtimes, plus TV episodes × the show's episode length (${TV_EPISODE_MINUTES} min when unknown) and anime episodes × ${ANIME_EPISODE_MINUTES} min.`;

const positive = (v: number | null | undefined): number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;

/**
 * How much of a total counts: everything for a completed title (or one being
 * rewatched), only the progress reached (capped at the total) for a retired one.
 */
function counted(t: StatTitle, total: number | null): number {
  const all = positive(total);
  if (t.status === 'RETIRED' && !t.rewatching) {
    const done = positive(t.progress);
    return all > 0 ? Math.min(done, all) : done;
  }
  return all;
}

/** Episodes of a TV show or anime (0 for other sections). */
export function episodesOf(t: StatTitle): number {
  if (t.category === 'tv') return counted(t, t.media.episodeCount);
  if (t.category === 'anime') return counted(t, t.media.episodes);
  return 0;
}

/** Pages of a book (0 for other sections). */
export function pagesOf(t: StatTitle): number {
  return t.category === 'books' ? counted(t, t.media.pageCount) : 0;
}

/** Chapters of a manga (0 for other sections). */
export function chaptersOf(t: StatTitle): number {
  return t.category === 'manga' ? counted(t, t.media.chapters) : 0;
}

/** Minutes watched for one finish (see the header for the approximation). */
export function minutesOf(t: StatTitle): number {
  switch (t.category) {
    case 'movies':
      return t.status === 'RETIRED' && !t.rewatching ? 0 : positive(t.media.runtime);
    case 'tv':
      return episodesOf(t) * (positive(t.media.episodeRunTime) || TV_EPISODE_MINUTES);
    case 'anime':
      return episodesOf(t) * ANIME_EPISODE_MINUTES;
    default:
      return 0;
  }
}

/** Hours, unrounded. */
export const hoursOf = (t: StatTitle): number => minutesOf(t) / 60;

/** Whether a title's diary entries count as finishes now (finished, or rewatching after one). */
export const countsAsFinished = (t: Pick<StatTitle, 'status' | 'rewatching'>): boolean =>
  FINISHED_FOR_STATS.includes(t.status) || t.rewatching;

export const inRange = (date: string, range: DayRange): boolean => date >= range.from && date <= range.to;

export interface FinishedSet {
  /** The distinct titles finished in the range (each once, however often). */
  titles: StatTitle[];
  /** Their diary entries inside the range (a rewatch is its own entry). */
  entries: FinishEntry[];
}

/** The titles finished in `range`: a diary entry dated inside it, on a title that counts as finished. */
export function finishedIn(titles: readonly StatTitle[], entries: readonly FinishEntry[], range: DayRange): FinishedSet {
  const byId = new Map(titles.map((t) => [t.id, t]));
  const kept: FinishEntry[] = [];
  const seen = new Set<string>();
  const out: StatTitle[] = [];
  for (const e of entries) {
    if (!inRange(e.date, range)) continue;
    const t = byId.get(e.activityId);
    if (!t || !countsAsFinished(t)) continue;
    kept.push(e);
    if (!seen.has(t.id)) {
      seen.add(t.id);
      out.push(t);
    }
  }
  return { titles: out, entries: kept };
}

/** Mean of some numbers rounded to one decimal, or null for none. */
export function mean1(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

/** Mean score of the rated titles, one decimal, or null. */
export function averageScore(titles: readonly Pick<StatTitle, 'rating'>[]): number | null {
  return mean1(titles.filter((t) => t.rating != null).map((t) => t.rating as number));
}

// ── Section headline numbers (shared with the dashboard) ────────────────────

/** Approximate words on a printed book page, for "words read". */
export const WORDS_PER_PAGE = 275;

export interface SectionStatRow {
  status: Status;
  rating: number | null;
  /** The media row (only the numeric columns below are read). */
  media: object;
}

export interface SectionStat {
  total: number;
  ongoing: number;
  planned: number;
  completed: number;
  onHold: number;
  retired: number;
  dropped: number;
  /** Over rated rows, one decimal. */
  avgRating: number | null;
  /** The section's headline number (words read, hours watched, …). */
  metricValue: number;
  metricUnit: string;
  metricVerb: string;
}

/** The unit/verb wording for a section's headline metric. */
export function metricMetaFor(slug: CategorySlug): { metricUnit: string; metricVerb: string } {
  switch (slug) {
    case 'books':
      return { metricUnit: 'words', metricVerb: 'read' };
    case 'movies':
      return { metricUnit: 'hours', metricVerb: 'watched' };
    case 'tv':
    case 'anime':
      return { metricUnit: 'episodes', metricVerb: 'watched' };
    case 'manga':
      return { metricUnit: 'chapters', metricVerb: 'read' };
    case 'games':
      return { metricUnit: 'games', metricVerb: 'beaten' };
    case 'music':
      return { metricUnit: 'albums', metricVerb: 'heard' };
  }
}

/**
 * Status counts, average score and the headline metric of one section. The
 * metric sums the COMPLETED rows only (Retired and Dropped were not finished).
 */
export function sectionStat(slug: CategorySlug, rows: readonly SectionStatRow[]): SectionStat {
  const count = (s: Status) => rows.filter((a) => a.status === s).length;
  const completedRows = rows.filter((a) => a.status === 'COMPLETED');
  const sumField = (field: string) =>
    completedRows.reduce((sum, a) => sum + (Number((a.media as Record<string, unknown>)[field]) || 0), 0);
  const completed = completedRows.length;

  let metricValue = 0;
  switch (slug) {
    case 'books':
      metricValue = Math.round(sumField('pageCount') * WORDS_PER_PAGE);
      break;
    case 'movies':
      metricValue = Math.round(sumField('runtime') / 60); // minutes → hours
      break;
    case 'tv':
      metricValue = sumField('episodeCount');
      break;
    case 'anime':
      metricValue = sumField('episodes');
      break;
    case 'manga':
      metricValue = sumField('chapters');
      break;
    case 'games':
    case 'music':
      metricValue = completed;
      break;
  }

  return {
    total: rows.length,
    ongoing: count('CONSUMING'),
    planned: count('PLANNED'),
    completed,
    onHold: count('ON_HOLD'),
    retired: count('RETIRED'),
    dropped: count('DROPPED'),
    avgRating: averageScore(rows),
    metricValue,
    ...metricMetaFor(slug),
  };
}
