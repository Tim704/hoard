// ───────────────────────────────────────────────────────────────────────────
//  Goodreads import (spec 2.3): "My Books → Import and export → Export
//  Library" gives goodreads_library_export.csv.
//
//    Exclusive Shelf  read → Completed, currently-reading → Ongoing,
//                     to-read → Planned (a custom exclusive shelf such as
//                     "did-not-finish" → Dropped, "paused" → Paused)
//    Bookshelves      every other shelf becomes a tag
//    My Rating        1–5 stars × 2; 0 = unrated
//    ISBN13 / ISBN    ="9780…" (the spreadsheet guard) is stripped
//    Date Read        the finish day; Read Count > 1 counts rereads
//
//  Matched later through OpenLibrary: ISBN-13, then ISBN-10, then title +
//  author. Pure.
// ───────────────────────────────────────────────────────────────────────────

import type { Status } from '@/lib/status';

import { csvRecords, hasHeaders } from '../csv';
import { parseCount, parseDay, parseIsbn, parseRating, parseYear, splitList, text } from '../fields';
import { dedupeRows, type ParseResult } from '../rows';
import type { ImportRow } from '../types';

const REQUIRED = ['Title', 'Author', 'Exclusive Shelf'];

export function isGoodreadsCsv(headers: string[]): boolean {
  return hasHeaders(headers, REQUIRED);
}

/** The three built-in shelves, plus common names for the others. */
export function shelfStatus(shelf: string): Status {
  const s = shelf.trim().toLowerCase();
  if (s === 'read') return 'COMPLETED';
  if (s === 'currently-reading') return 'CONSUMING';
  if (s === 'to-read') return 'PLANNED';
  if (/(did-?not-?finish|^dnf$|abandon)/.test(s)) return 'DROPPED';
  if (/(paused|on-?hold)/.test(s)) return 'ON_HOLD';
  return 'PLANNED';
}

const BUILT_IN = new Set(['read', 'currently-reading', 'to-read']);

/** "The Way of Kings (The Stormlight Archive, #1)" → "The Way of Kings". */
export function stripSeries(title: string): string {
  return title.replace(/\s*\([^()]*#\s*\d+(?:\.\d+)?(?:-\d+)?\)\s*$/, '').trim() || title.trim();
}

/** Goodreads reviews are HTML-ish (<br/>); keep plain text with line breaks. */
export function cleanReview(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const t = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
  return t || undefined;
}

export function parseGoodreads(csv: string): ParseResult {
  const { headers, records } = csvRecords(csv);
  if (!isGoodreadsCsv(headers)) {
    return { rows: [], skipped: 0, warnings: ['This is not a Goodreads library export.'] };
  }
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const rec of records) {
    const rawTitle = text(rec.Title);
    if (!rawTitle) {
      skipped++;
      continue;
    }
    const shelf = rec['Exclusive Shelf'] ?? '';
    const isbn13 = parseIsbn(rec.ISBN13);
    const isbn10 = parseIsbn(rec.ISBN);
    const row: ImportRow = {
      source: 'goodreads',
      category: 'books',
      title: stripSeries(rawTitle),
      ids: {},
      status: shelfStatus(shelf),
    };
    if (isbn13 || isbn10) row.ids.isbn = isbn13 ?? isbn10;
    if (isbn13 && isbn10) row.ids.isbn10 = isbn10;
    const author = text(rec.Author);
    if (author) row.author = author;
    const year = parseYear(rec['Original Publication Year']) ?? parseYear(rec['Year Published']);
    if (year) row.year = year;
    const rating = parseRating(rec['My Rating'], 5);
    if (rating !== undefined) row.rating = rating;
    const finishedOn = parseDay(rec['Date Read']);
    if (finishedOn && row.status === 'COMPLETED') row.finishedOn = finishedOn;
    const reads = parseCount(rec['Read Count']);
    if (reads && reads > 1) row.rewatchCount = reads - 1;
    const tags = splitList(rec.Bookshelves, /,/).filter((t) => !BUILT_IN.has(t) && t !== shelf.trim());
    // A custom exclusive shelf is kept as a tag too (the status can't say "dnf").
    if (shelf.trim() && !BUILT_IN.has(shelf.trim())) tags.unshift(shelf.trim());
    if (tags.length) row.tags = tags;
    const review = cleanReview(rec['My Review']);
    if (review) row.review = review;
    rows.push(row);
  }
  return { rows: dedupeRows(rows), skipped, warnings: [] };
}
