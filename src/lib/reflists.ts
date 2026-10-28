// ───────────────────────────────────────────────────────────────────────────
//  Reference lists (spec 4.8): the built-in sources, progress against the
//  library, and the plain "Paste titles" reader. Pure and client-safe.
//
//  A reference list is a stored snapshot (refreshed on demand) of an outside
//  ranking, matched to catalogue ids, so "done" is a lookup by section +
//  externalId in the user's library. Built-ins are fetched one provider page
//  per server call, so a slow provider never holds one request for long.
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from '@/lib/categories';
import type { Status } from '@/lib/status';

export interface BuiltinRefList {
  name: string;
  category: CategorySlug;
  /** How many titles the list keeps. */
  size: number;
  /** Titles per provider page. */
  perPage: number;
  /** The provider whose key it needs (G4: missing → disabled with a note). */
  provider: 'TMDB' | 'AniList' | 'IGDB';
  blurb: string;
}

export const BUILTIN_REF_LISTS = {
  'tmdb-movies': {
    name: 'TMDB top rated movies',
    category: 'movies',
    size: 250,
    perPage: 20,
    provider: 'TMDB',
    blurb: 'The 250 best-rated films on TMDB.',
  },
  'tmdb-tv': {
    name: 'TMDB top rated TV',
    category: 'tv',
    size: 100,
    perPage: 20,
    provider: 'TMDB',
    blurb: 'The 100 best-rated shows on TMDB.',
  },
  'anilist-anime': {
    name: 'AniList top 100 anime',
    category: 'anime',
    size: 100,
    perPage: 50,
    provider: 'AniList',
    blurb: 'The highest-scored anime on AniList.',
  },
  'anilist-manga': {
    name: 'AniList top 100 manga',
    category: 'manga',
    size: 100,
    perPage: 50,
    provider: 'AniList',
    blurb: 'The highest-scored manga on AniList.',
  },
  'igdb-games': {
    name: 'IGDB top 100 games',
    category: 'games',
    size: 100,
    perPage: 100,
    provider: 'IGDB',
    blurb: 'The best-rated games on IGDB with more than 500 ratings.',
  },
} as const satisfies Record<string, BuiltinRefList>;

export type BuiltinSource = keyof typeof BUILTIN_REF_LISTS;
export const BUILTIN_SOURCES = Object.keys(BUILTIN_REF_LISTS) as BuiltinSource[];
export const CUSTOM_SOURCE = 'custom';

export const isBuiltinSource = (v: unknown): v is BuiltinSource =>
  typeof v === 'string' && Object.hasOwn(BUILTIN_REF_LISTS, v);

/** Provider pages a built-in needs (TMDB movies: 13 pages of 20 for 250). */
export function refPageCount(source: BuiltinSource): number {
  const s = BUILTIN_REF_LISTS[source];
  return Math.ceil(s.size / s.perPage);
}

/** One stored entry of a reference list. */
export interface RefItem {
  externalId: string;
  title: string;
  year: number | null;
  imageUrl: string | null;
}

/**
 * Items to append to a list: drops titles already on it (provider pages can
 * shift between requests and repeat a title), duplicates inside the batch,
 * bad rows, and anything past the list's size.
 */
export function newRefItems(existing: ReadonlySet<string>, batch: readonly RefItem[], room: number): RefItem[] {
  const seen = new Set(existing);
  const out: RefItem[] = [];
  for (const item of batch) {
    if (out.length >= room) break;
    if (!item.externalId || !item.title || seen.has(item.externalId)) continue;
    seen.add(item.externalId);
    out.push(item);
  }
  return out;
}

/** The library key of a title: section + externalId. */
export const refKey = (category: string, externalId: string): string => `${category}:${externalId}`;

export type RefState = 'done' | 'planned' | 'other';

/**
 * Where a title stands for the user: done (finished), planned (planned,
 * in progress or on hold), other (dropped / retired), or not in the
 * library (null).
 */
export function refState(status: Status | null | undefined): RefState | null {
  if (!status) return null;
  if (status === 'COMPLETED') return 'done';
  if (status === 'PLANNED' || status === 'CONSUMING' || status === 'ON_HOLD') return 'planned';
  return 'other';
}

export interface RefProgress {
  total: number;
  done: number;
  planned: number;
}

/** How much of a list is done and planned, given the user's statuses by refKey. */
export function refProgress(
  items: readonly { category: string; externalId: string }[],
  library: ReadonlyMap<string, Status>,
): RefProgress {
  let done = 0;
  let planned = 0;
  for (const it of items) {
    const state = refState(library.get(refKey(it.category, it.externalId)));
    if (state === 'done') done += 1;
    else if (state === 'planned') planned += 1;
  }
  return { total: items.length, done, planned };
}

/** The most titles one paste may hold, and per title. */
export const PASTE_MAX_LINES = 200;
export const PASTE_MAX_TITLE = 300;

/**
 * Plain pasted lines → titles: one per line, list markers ("1.", "2)", "#3",
 * "-", "*", "•") stripped, and a trailing year — "(1999)", "[1999]" or
 * "- 1999" — kept as the year. Empty lines are skipped.
 */
export function parsePlainLines(text: string): { title: string; year?: number }[] {
  const out: { title: string; year?: number }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (out.length >= PASTE_MAX_LINES) break;
    let line = raw.trim().replace(/^(?:#\d{1,4}[.):]?\s+|\d{1,4}[.)]\s+|[-*•·]\s+)/, '').trim();
    let year: number | undefined;
    const m = /^(.*?)\s*(?:\((\d{4})\)|\[(\d{4})\]|[-–—]\s*(\d{4}))$/.exec(line);
    if (m && m[1].trim()) {
      const y = Number(m[2] ?? m[3] ?? m[4]);
      if (y >= 1800 && y <= 2100) {
        year = y;
        line = m[1].trim();
      }
    }
    if (!line) continue;
    const title = line.slice(0, PASTE_MAX_TITLE);
    out.push(year ? { title, year } : { title });
  }
  return out;
}

/**
 * One pasted title as `addPastedRefItems` accepts it: trimmed to
 * PASTE_MAX_TITLE, a year only when it is plausible (1800–2100), null when
 * empty. Applied before sending, so one odd row (e.g. from the AI reader)
 * can't make the server refuse its whole chunk; the server still validates.
 */
export function cleanPastedTitle(title: unknown, year: unknown): { title: string; year?: number } | null {
  if (typeof title !== 'string') return null;
  const t = title.trim().slice(0, PASTE_MAX_TITLE).trim();
  if (!t) return null;
  const y = typeof year === 'number' && Number.isInteger(year) && year >= 1800 && year <= 2100 ? year : undefined;
  return y ? { title: t, year: y } : { title: t };
}
