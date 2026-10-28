// ───────────────────────────────────────────────────────────────────────────
//  The import pipeline's shared shapes (spec 2.1). Every source (a file parsed
//  in the browser, or an account fetched on the server) becomes a list of
//  `ImportRow`s; `matchImportRows` turns each into candidates; the review
//  screen lets the user pick, and `commitImportRows` writes the picks.
//  Pure and dependency-free, so client and server share it.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from '@/lib/categories';
import type { Status } from '@/lib/status';
import type { NormalizedResult } from '@/lib/types';

export const IMPORT_SOURCES = [
  'hoard',
  'anilist',
  'letterboxd',
  'goodreads',
  'storygraph',
  'mal',
  'trakt',
  'generic',
  'ai',
  'franchise',
  'steam',
  'anilist-sync',
] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

/** Client-side caps: biggest file read, and most rows in one import. */
export const MAX_IMPORT_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
/** Server-side chunk sizes (one action call each, sent one after another). */
export const MATCH_CHUNK = 10;
export const COMMIT_CHUNK = 20;

export interface ImportIds {
  tmdb?: string;
  imdb?: string;
  mal?: string;
  anilist?: string;
  /** ISBN-13 when known, else ISBN-10. */
  isbn?: string;
  /** The ISBN-10 too, tried when the ISBN-13 finds nothing (Goodreads). */
  isbn10?: string;
  igdb?: string;
  steam?: string;
}

/**
 * One dated watch / read from a log (Letterboxd diary, Goodreads read dates).
 * Carried through to the commit for the diary (3.1), which writes them.
 */
export interface ImportDiaryEntry {
  /** YYYY-MM-DD as written in the export (a calendar day, spec G10). */
  date: string;
  /** 0–10. */
  rating?: number;
  rewatch: boolean;
  review?: string;
}

export interface ImportRow {
  source: ImportSource;
  category: CategorySlug;
  title: string;
  year?: number;
  /** Extra search hint (books: the author). */
  author?: string;
  ids: ImportIds;
  /** Hoard's own CSV: the catalogue key, matched directly. */
  externalId?: string;
  status: Status;
  /** 0–10, one decimal. Absent = unrated. */
  rating?: number;
  /** YYYY-MM-DD. */
  finishedOn?: string;
  startedOn?: string;
  rewatchCount?: number;
  review?: string;
  tags?: string[];
  progress?: number;
  notes?: string;
  /** Hoard CSV: the favourite flag. */
  favourite?: boolean;
  diary?: ImportDiaryEntry[];
  /** Steam (8.1): minutes played, stored on the activity. */
  playtimeMinutes?: number;
}

export type MatchConfidence = 'high' | 'medium' | 'low' | 'none';

export interface InLibrary {
  activityId: string;
  status: Status;
}

export interface RowMatch {
  /** At most 3, best first. */
  candidates: NormalizedResult[];
  /** Index into `candidates`; -1 when there are none. */
  chosenIndex: number;
  confidence: MatchConfidence;
  /** The user's activity for the chosen candidate, if they already have it. */
  inLibrary: InLibrary | null;
  /** Same, per candidate (so picking an alternative updates the flag). */
  libraryByCandidate: (InLibrary | null)[];
  /** Why there is no match ("TMDB isn't configured…", a provider error). */
  message?: string;
}

/** A reviewed row as the client sends it to `commitImportRows`. */
export interface CommitRow {
  category: CategorySlug;
  source: ImportSource;
  result: NormalizedResult;
  status: Status;
  rating?: number | null;
  finishedOn?: string | null;
  startedOn?: string | null;
  progress?: number | null;
  tags?: string[];
  notes?: string | null;
  favourite?: boolean;
  rewatchCount?: number | null;
  review?: string | null;
  diary?: ImportDiaryEntry[];
  /** Steam (8.1): minutes played, and the app id for the game's catalogue row. */
  playtimeMinutes?: number | null;
  steamAppId?: number | null;
}

export interface CommitRowOutcome {
  /** added | updated | unchanged (already there, update not asked) | failed */
  outcome: 'added' | 'updated' | 'unchanged' | 'failed';
  activityId?: string;
  error?: string;
}

/** A sentinel externalId: "make a new hand-made entry from this row" (Hoard CSV). */
export const NEW_MANUAL_ID = 'manual:';
