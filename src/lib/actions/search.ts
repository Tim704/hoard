'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Global search server actions (spec 2.4–2.6, 2.9): add by link, ISBN
//  lookup, Search everything, and the library index behind Cmd/Ctrl+K.
//  Each one needs a session; hits come back with the user's own library
//  marks ("In library · …"), never anyone else's.
//
//  Search everything fans out on the server: client-side server-action calls
//  run one at a time, so a browser fan-out would not be parallel.
// ───────────────────────────────────────────────────────────────────────────

import { searchProvider } from '@/lib/apis';
import { fetchAniListByIds, fetchAniListByMalIds } from '@/lib/apis/anilist';
import { fetchBookByEditionKey, fetchBookByWorkKey, lookupIsbn, searchBooksByTitle } from '@/lib/apis/books';
import { fetchGameBySlug, fetchGameBySteamAppId } from '@/lib/apis/igdb';
import { fetchTmdbById, findByImdbId, searchMovies } from '@/lib/apis/tmdb';
import { NAV_ORDER, type CategorySlug } from '@/lib/categories';
import { getLibraryIndex, libraryMarks, markKey, type LibraryIndexEntry, type LibraryMarks } from '@/lib/data-search';
import { getPrefs } from '@/lib/data-prefs';
import { normalizeIsbn } from '@/lib/isbn';
import { resolveMediaLink, type LinkDeps, type LinkResolution } from '@/lib/link-resolve';
import { takeRate } from '@/lib/rate-limit';
import { fetchPublicPage } from '@/lib/safe-fetch';
import { searchSections, type SectionOutcome } from '@/lib/search-everything';
import { requireUser } from '@/lib/session';
import type { NormalizedResult } from '@/lib/types';

/** Link lookups read other sites' pages: a per-user budget keeps that tame. */
const LINK_LIMITS = { perMinute: 20, perDay: 400 };

const linkDeps: LinkDeps = {
  tmdbById: fetchTmdbById,
  findImdb: findByImdbId,
  aniList: async (type, id) => (await fetchAniListByIds(type, [id])).get(id) ?? null,
  aniListByMal: async (type, id) => (await fetchAniListByMalIds(type, [id])).get(id) ?? null,
  igdbBySlug: fetchGameBySlug,
  igdbBySteam: fetchGameBySteamAppId,
  isbn: lookupIsbn,
  booksByTitle: (title) => searchBooksByTitle(title),
  movies: searchMovies,
  openLibrary: (key) => (key.startsWith('/works/') ? fetchBookByWorkKey(key) : fetchBookByEditionKey(key)),
  page: (url) => fetchPublicPage(url),
};

export type ResolveLinkResult =
  | { ok: false; error: string }
  | ({ ok: true; mark: LibraryMarks[string] | null } & LinkResolution);

/** Resolve a pasted or shared link to a title (2.4). */
export async function resolveLink(rawUrl: string): Promise<ResolveLinkResult> {
  const user = await requireUser();
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!/^https?:\/\//i.test(url) || url.length > 2000) return { ok: false, error: 'That doesn’t look like a link.' };
  const rate = takeRate(`link:${user.id}`, LINK_LIMITS);
  if (!rate.ok) return { ok: false, error: `Too many links at once. Try again in ${rate.retryAfterSec} s.` };

  const resolution = await resolveMediaLink(url, linkDeps);
  let mark: LibraryMarks[string] | null = null;
  if (resolution.slug && resolution.result) {
    const marks = await libraryMarks(user.id, [{ slug: resolution.slug, externalId: resolution.result.externalId }]);
    mark = marks[markKey(resolution.slug, resolution.result.externalId)] ?? null;
  }
  return { ok: true, ...resolution, mark };
}

export type IsbnLookupResult =
  | { ok: false; error: string }
  | { ok: true; result: NormalizedResult | null; mark: LibraryMarks[string] | null };

/** A typed or scanned ISBN → the book on OpenLibrary (2.9). */
export async function lookupBookByIsbn(raw: string): Promise<IsbnLookupResult> {
  const user = await requireUser();
  const isbn = typeof raw === 'string' ? normalizeIsbn(raw) : null;
  if (!isbn) return { ok: false, error: 'That isn’t a valid ISBN. Check the digits and try again.' };
  try {
    const result = await lookupIsbn(isbn);
    if (!result) return { ok: true, result: null, mark: null };
    const marks = await libraryMarks(user.id, [{ slug: 'books', externalId: result.externalId }]);
    return { ok: true, result, mark: marks[markKey('books', result.externalId)] ?? null };
  } catch {
    return { ok: false, error: 'OpenLibrary didn’t answer. Try again in a moment.' };
  }
}

/** Search every visible section's provider at once (2.5). */
export async function searchEverything(
  query: string,
): Promise<{ sections: SectionOutcome[]; marks: LibraryMarks }> {
  const user = await requireUser();
  const q = typeof query === 'string' ? query.trim().slice(0, 200) : '';
  if (q.length < 2) return { sections: [], marks: {} };
  const prefs = await getPrefs(user.id);
  const hidden = new Set<string>(prefs.hiddenSections);
  const slugs = NAV_ORDER.filter((s) => !hidden.has(s));

  const sections = await searchSections(slugs, q, searchProvider);
  const hits: Array<{ slug: CategorySlug; externalId: string }> = [];
  for (const s of sections) {
    if (s.state === 'ok') for (const r of s.results) hits.push({ slug: s.slug, externalId: r.externalId });
  }
  return { sections, marks: await libraryMarks(user.id, hits) };
}

/** The user's library in compact form, for the Cmd/Ctrl+K palette (2.6). */
export async function libraryIndex(): Promise<LibraryIndexEntry[]> {
  const user = await requireUser();
  return getLibraryIndex(user.id);
}
