// ───────────────────────────────────────────────────────────────────────────
//  StoryGraph import (spec 2.3): "Manage account → Export StoryGraph library"
//  gives a CSV with one row per book.
//
//    Read Status   read → Completed, currently-reading → Ongoing, to-read →
//                  Planned, did-not-finish → Dropped, paused → Paused
//    Star Rating   0.25–5 stars (quarter stars) × 2; empty = unrated
//    ISBN/UID      an ISBN when it is one (other UIDs are ignored)
//    Dates         Last Date Read is the finish; Dates Read ("2024/01/02-
//                  2024/01/20, …") gives the start of the last read
//    Tags          comma-separated tags
//
//  Matched like Goodreads: ISBN, then title + author through OpenLibrary. Pure.
// ───────────────────────────────────────────────────────────────────────────

import type { Status } from '@/lib/status';

import { csvRecords, hasHeaders } from '../csv';
import { parseCount, parseDay, parseIsbn, parseRating, splitList, text } from '../fields';
import { dedupeRows, type ParseResult } from '../rows';
import type { ImportRow } from '../types';

const REQUIRED = ['Title', 'Read Status'];

export function isStoryGraphCsv(headers: string[]): boolean {
  return hasHeaders(headers, REQUIRED);
}

export const STORYGRAPH_STATUS: Record<string, Status> = {
  read: 'COMPLETED',
  'currently-reading': 'CONSUMING',
  'to-read': 'PLANNED',
  'did-not-finish': 'DROPPED',
  paused: 'ON_HOLD',
};

/** The last "start-end" range in a Dates Read cell, as days. */
export function lastReadRange(cell: string | undefined): { start?: string; end?: string } {
  const ranges = (cell ?? '').split(',').map((r) => r.trim()).filter(Boolean);
  const last = ranges[ranges.length - 1];
  if (!last) return {};
  const [a, b] = last.split(/\s*-\s*(?=\d{4})/);
  return { start: parseDay(a), end: parseDay(b ?? '') };
}

export function parseStoryGraph(csv: string): ParseResult {
  const { headers, records } = csvRecords(csv);
  if (!isStoryGraphCsv(headers)) {
    return { rows: [], skipped: 0, warnings: ['This is not a StoryGraph library export.'] };
  }
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const rec of records) {
    const title = text(rec.Title);
    if (!title) {
      skipped++;
      continue;
    }
    const status = STORYGRAPH_STATUS[(rec['Read Status'] ?? '').trim().toLowerCase()] ?? 'PLANNED';
    const row: ImportRow = { source: 'storygraph', category: 'books', title, ids: {}, status };
    const isbn = parseIsbn(rec['ISBN/UID']);
    if (isbn) row.ids.isbn = isbn;
    // "Authors" may list several, comma-separated: the first one searches best.
    const author = splitList(rec.Authors, /,/)[0];
    if (author) row.author = author;
    const rating = parseRating(rec['Star Rating'], 5);
    if (rating !== undefined) row.rating = rating;
    const range = lastReadRange(rec['Dates Read']);
    const finishedOn = parseDay(rec['Last Date Read']) ?? range.end;
    if (finishedOn && status === 'COMPLETED') row.finishedOn = finishedOn;
    if (range.start) row.startedOn = range.start;
    const reads = parseCount(rec['Read Count']);
    if (reads && reads > 1) row.rewatchCount = reads - 1;
    const tags = splitList(rec.Tags, /,/);
    if (tags.length) row.tags = tags;
    const review = text(rec.Review);
    if (review) row.review = review;
    rows.push(row);
  }
  return { rows: dedupeRows(rows), skipped, warnings: [] };
}
