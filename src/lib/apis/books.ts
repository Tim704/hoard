// ───────────────────────────────────────────────────────────────────────────
//  OpenLibrary provider — books. No API key required.
//  Server-only. Every call goes through providerFetch (no-store, 8 s timeout).
//
//  Books keep only a year (`releaseDate` stays null, spec F2). Genres are up
//  to 3 OpenLibrary subjects that pass the allow-list in src/lib/genres.ts.
// ───────────────────────────────────────────────────────────────────────────

import { genresFromSubjects } from '@/lib/genres';
import type { NormalizedResult } from '@/lib/types';

import { providerFetch } from './http';

const OPENLIBRARY = 'https://openlibrary.org';
const OPENLIBRARY_SEARCH = `${OPENLIBRARY}/search.json`;

interface OpenLibraryDoc {
  key: string;
  title: string;
  author_name?: string[] | null;
  first_publish_year?: number | null;
  cover_i?: number | null;
  number_of_pages_median?: number | null;
  isbn?: string[] | null;
  subject?: string[] | null;
}

interface OpenLibraryResponse {
  docs?: OpenLibraryDoc[];
}

/** One search.json doc → a NormalizedResult (fields = Book columns). */
export function mapBookDoc(d: OpenLibraryDoc): NormalizedResult {
  const image = d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : null;
  const year = d.first_publish_year ?? null;
  const authors = d.author_name ?? [];
  const pageCount = d.number_of_pages_median ?? null;
  const isbn = d.isbn?.[0] ?? null;
  const genres = genresFromSubjects(d.subject);

  const subtitleParts: string[] = [];
  if (authors.length) subtitleParts.push(authors.join(', '));
  if (year) subtitleParts.push(String(year));

  return {
    externalId: d.key,
    title: d.title,
    imageUrl: image,
    subtitle: subtitleParts.length ? subtitleParts.join(' · ') : null,
    year,
    description: null,
    // EXACTLY the Book table columns (+ externalId + title).
    fields: {
      externalId: d.key,
      title: d.title,
      imageUrl: image,
      description: null,
      year,
      authors,
      pageCount,
      isbn,
      ...(genres.length && { genres }),
    },
  };
}

const SEARCH_FIELDS = 'key,title,author_name,first_publish_year,cover_i,number_of_pages_median,isbn,subject';

async function openLibrarySearch(params: string, limit = 20): Promise<OpenLibraryDoc[]> {
  const url = `${OPENLIBRARY_SEARCH}?limit=${limit}&fields=${SEARCH_FIELDS}&${params}`;
  const res = await providerFetch(url);
  if (!res.ok) throw new Error(`OpenLibrary search failed (${res.status})`);
  const json = (await res.json()) as OpenLibraryResponse;
  return json.docs ?? [];
}

export async function searchBooks(query: string): Promise<NormalizedResult[]> {
  const q = query.trim();
  if (!q) return [];
  return (await openLibrarySearch(`q=${encodeURIComponent(q)}`)).map(mapBookDoc);
}

/**
 * The work an ISBN belongs to (imports, 2.3). The hit's `isbn` is set to the
 * one asked for (a work lists every edition's ISBN).
 */
export async function searchBooksByIsbn(isbn: string): Promise<NormalizedResult[]> {
  if (!/^[\dX]{10,13}$/.test(isbn)) return [];
  const docs = await openLibrarySearch(`isbn=${encodeURIComponent(isbn)}`, 3);
  return docs.map((d) => {
    const r = mapBookDoc(d);
    return { ...r, fields: { ...r.fields, isbn } };
  });
}

/** Books by title and (optionally) author, for imports without a usable ISBN. */
export async function searchBooksByTitle(title: string, author?: string): Promise<NormalizedResult[]> {
  const t = title.trim();
  if (!t) return [];
  const a = author?.trim();
  const params = `title=${encodeURIComponent(t)}${a ? `&author=${encodeURIComponent(a)}` : ''}`;
  return (await openLibrarySearch(params, 10)).map(mapBookDoc);
}

export interface OpenLibraryWorkJson {
  title?: string | null;
  covers?: unknown;
  subjects?: unknown;
  description?: string | { value?: string | null } | null;
}

export interface BookDetails {
  title: string | null;
  imageUrl: string | null;
  genres: string[];
  description: string | null;
}

/**
 * GET /works/{id}.json → title, cover (the work's first real cover id, at the
 * size search uses; OpenLibrary marks removed covers with -1), genres
 * (allow-listed subjects) and the description.
 */
export function mapWork(work: OpenLibraryWorkJson): BookDetails {
  const d = work.description;
  const description = typeof d === 'string' ? d : d?.value ?? null;
  const cover = Array.isArray(work.covers)
    ? work.covers.find((c): c is number => typeof c === 'number' && Number.isInteger(c) && c > 0)
    : undefined;
  return {
    title: typeof work.title === 'string' ? work.title.trim() || null : null,
    imageUrl: cover ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg` : null,
    genres: genresFromSubjects(work.subjects),
    description: description?.trim() || null,
  };
}

/**
 * Fetch a work's details. Only work keys ("/works/OL…W") are looked up; other
 * ids (manual or demo rows) return null, as does a 404.
 */
export async function fetchBookDetails(externalId: string): Promise<BookDetails | null> {
  if (!/^\/works\/OL\d+W$/.test(externalId)) return null;
  const res = await providerFetch(`${OPENLIBRARY}${externalId}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OpenLibrary work lookup failed (${res.status})`);
  return mapWork((await res.json()) as OpenLibraryWorkJson);
}
