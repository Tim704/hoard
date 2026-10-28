// ───────────────────────────────────────────────────────────────────────────
//  Matching import rows to catalogue entries (spec 2.1): ids first, then a
//  title + year search, then `scoreMatch` for the confidence. Every outside
//  call goes through `MatchDeps`, so the whole flow is tested with fixtures;
//  src/lib/import/server.ts supplies the real database and providers.
//
//    Hoard CSV   externalId → the catalogue row (a hand-made `manual:` row
//                only when it is the user's own, by id or title + year —
//                otherwise a new hand-made entry); else title + year search
//    AniList     MAL id, then `al-` id in the catalogue; else the AniList
//                entry itself by id (mapped exactly like a search hit)
//    Books       ISBN-13, then ISBN-10, then title + author (OpenLibrary)
//    Movies      TMDB search by title + year, then by title alone
//    Others      the section's normal search
// ───────────────────────────────────────────────────────────────────────────

import { CATEGORIES, type CategorySlug } from '@/lib/categories';
import type { NormalizedResult, SearchResponse } from '@/lib/types';

import { scoreMatch, titlesMatch } from './match';
import { NEW_MANUAL_ID, type ImportRow, type InLibrary, type RowMatch } from './types';

export interface MatchDeps {
  /** Catalogue rows of `slug` by externalId, as search-shaped results. */
  catalogue(slug: CategorySlug, externalIds: string[]): Promise<Map<string, NormalizedResult>>;
  /** The user's own hand-made (`manual:`) entries of `slug`. */
  ownManual(slug: CategorySlug): Promise<NormalizedResult[]>;
  /** The user's activities of `slug` by their media's externalId. */
  library(slug: CategorySlug, externalIds: string[]): Promise<Map<string, InLibrary>>;
  /** Whether `slug`'s provider has its key (a missing one is a clear message, G4). */
  configured(slug: CategorySlug): boolean;
  search(slug: CategorySlug, query: string): Promise<SearchResponse>;
  searchMovies(title: string, year?: number): Promise<NormalizedResult[]>;
  booksByIsbn(isbn: string): Promise<NormalizedResult[]>;
  booksByTitle(title: string, author?: string): Promise<NormalizedResult[]>;
  /** AniList entries by AniList id. */
  aniListByIds(type: 'ANIME' | 'MANGA', ids: number[]): Promise<Map<number, NormalizedResult>>;
  /** Wait between provider calls (pacing). */
  pause(ms: number): Promise<void>;
}

/** Gap between two provider searches inside one chunk. */
export const SEARCH_GAP_MS = 250;

export function notConfiguredMessage(slug: CategorySlug): string {
  const cat = CATEGORIES[slug];
  return `${cat.source} isn't configured on this server, so ${cat.label.toLowerCase()} can't be matched. Ask the owner to add its API key.`;
}

/** A hand-made row to be created anew from the import row (title + year only). */
export function newManualCandidate(row: ImportRow): NormalizedResult {
  const year = row.year ?? null;
  return {
    externalId: NEW_MANUAL_ID,
    title: row.title,
    imageUrl: null,
    subtitle: 'Added by hand',
    year,
    description: null,
    fields: { externalId: NEW_MANUAL_ID, title: row.title, year },
  };
}

interface Found {
  hits: NormalizedResult[];
  /** Index of a hit found by id (high confidence). */
  idMatch: number;
  message?: string;
  /** Force this confidence (hand-made rows). */
  confidence?: RowMatch['confidence'];
}

const isManual = (id: string | undefined) => Boolean(id?.startsWith('manual:'));

/** Match up to a chunk of rows (the action caps it at MATCH_CHUNK). */
export async function matchRows(rows: ImportRow[], deps: MatchDeps): Promise<RowMatch[]> {
  const found: (Found | null)[] = rows.map(() => null);

  // 1. Hoard rows by externalId, in one catalogue read per section.
  for (const slug of new Set(rows.map((r) => r.category))) {
    const idx = rows
      .map((r, i) => i)
      .filter((i) => rows[i].category === slug && rows[i].externalId && !isManual(rows[i].externalId));
    if (idx.length === 0) continue;
    const cat = await deps.catalogue(slug, idx.map((i) => rows[i].externalId!));
    for (const i of idx) {
      const hit = cat.get(rows[i].externalId!);
      if (hit) found[i] = { hits: [hit], idMatch: 0 };
    }
  }

  // 2. Hand-made rows: the user's own entry if they still have it, else a new one.
  for (const slug of new Set(rows.map((r) => r.category))) {
    const idx = rows.map((r, i) => i).filter((i) => rows[i].category === slug && isManual(rows[i].externalId));
    if (idx.length === 0) continue;
    const own = await deps.ownManual(slug);
    for (const i of idx) {
      const r = rows[i];
      // The same entry (this account's export), else one with the same title
      // and year (an export from another account, or imported before).
      const hit =
        own.find((m) => m.externalId === r.externalId) ??
        own.find((m) => titlesMatch(m.title, r.title) && (m.year ?? null) === (r.year ?? null));
      if (hit) {
        found[i] = { hits: [hit], idMatch: 0 };
        continue;
      }
      found[i] = {
        hits: [newManualCandidate(r)],
        idMatch: -1,
        confidence: 'medium',
        message: 'Added by hand in the export: it will be added as a new hand-made entry.',
      };
    }
  }

  // 3. AniList rows: the catalogue by MAL id, then by al- id, then AniList itself.
  for (const slug of ['anime', 'manga'] as const) {
    const idx = rows.map((r, i) => i).filter((i) => !found[i] && rows[i].category === slug && rows[i].ids.anilist);
    if (idx.length === 0) continue;
    const keys = idx.flatMap((i) => {
      const r = rows[i];
      return [...(r.ids.mal ? [r.ids.mal] : []), `al-${r.ids.anilist}`];
    });
    const cat = await deps.catalogue(slug, keys);
    const missing: number[] = [];
    for (const i of idx) {
      const r = rows[i];
      const hit = (r.ids.mal && cat.get(r.ids.mal)) || cat.get(`al-${r.ids.anilist}`);
      if (hit) found[i] = { hits: [hit], idMatch: 0 };
      else missing.push(i);
    }
    const ids = missing.map((i) => Number(rows[i].ids.anilist)).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) continue;
    try {
      const fetched = await deps.aniListByIds(slug === 'anime' ? 'ANIME' : 'MANGA', ids);
      for (const i of missing) {
        const hit = fetched.get(Number(rows[i].ids.anilist));
        if (hit) found[i] = { hits: [hit], idMatch: 0 };
      }
    } catch {
      // Fall through to a title search for these rows.
    }
  }

  // 4. Everything else: searches, one row at a time with a gap between calls.
  let searched = 0;
  for (let i = 0; i < rows.length; i++) {
    if (found[i]) continue;
    if (searched++ > 0) await deps.pause(SEARCH_GAP_MS);
    found[i] = await searchRow(rows[i], deps);
  }

  // 5. Scores, then which candidates the user already has.
  const scored = rows.map((r, i) => {
    const f = found[i]!;
    const s = scoreMatch(r, f.hits, f.idMatch);
    return {
      ...s,
      confidence: f.confidence && s.candidates.length ? f.confidence : s.confidence,
      message: f.message,
    };
  });
  const owned = new Map<string, InLibrary>();
  for (const slug of new Set(rows.map((r) => r.category))) {
    const ids = new Set<string>();
    scored.forEach((s, i) => {
      if (rows[i].category === slug) for (const c of s.candidates) if (c.externalId !== NEW_MANUAL_ID) ids.add(c.externalId);
    });
    if (ids.size === 0) continue;
    for (const [ext, lib] of await deps.library(slug, [...ids])) owned.set(`${slug}|${ext}`, lib);
  }
  return scored.map((s, i) => {
    const libraryByCandidate = s.candidates.map((c) => owned.get(`${rows[i].category}|${c.externalId}`) ?? null);
    const match: RowMatch = {
      candidates: s.candidates,
      chosenIndex: s.chosenIndex,
      confidence: s.confidence,
      inLibrary: s.chosenIndex >= 0 ? libraryByCandidate[s.chosenIndex] : null,
      libraryByCandidate,
    };
    if (s.message) match.message = s.message;
    return match;
  });
}

/** A title (+ year / author / ISBN) search for one row. Never throws. */
async function searchRow(row: ImportRow, deps: MatchDeps): Promise<Found> {
  const slug = row.category;
  if (!deps.configured(slug)) return { hits: [], idMatch: -1, message: notConfiguredMessage(slug) };
  try {
    if (slug === 'books') {
      for (const isbn of [row.ids.isbn, row.ids.isbn10]) {
        if (!isbn) continue;
        const hits = await deps.booksByIsbn(isbn);
        if (hits.length) return { hits, idMatch: 0 };
        await deps.pause(SEARCH_GAP_MS);
      }
      const hits = await deps.booksByTitle(row.title, row.author);
      return { hits, idMatch: -1 };
    }
    if (slug === 'movies') {
      let hits = row.year ? await deps.searchMovies(row.title, row.year) : [];
      if (hits.length === 0) {
        if (row.year) await deps.pause(SEARCH_GAP_MS);
        hits = await deps.searchMovies(row.title);
      }
      return { hits, idMatch: -1 };
    }
    const res = await deps.search(slug, row.title);
    if (res.error && res.results.length === 0) return { hits: [], idMatch: -1, message: `Search failed: ${res.error}` };
    return { hits: res.results, idMatch: -1 };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    if (/not configured/i.test(msg)) return { hits: [], idMatch: -1, message: notConfiguredMessage(slug) };
    return { hits: [], idMatch: -1, message: `Search failed: ${msg}` };
  }
}
