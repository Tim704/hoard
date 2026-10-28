// ───────────────────────────────────────────────────────────────────────────
//  Letterboxd import (spec 2.2): the export zip, or any of its watched.csv,
//  ratings.csv, diary.csv, reviews.csv and watchlist.csv files.
//
//    watchlist          → Planned
//    watched / rated    → Completed, ratings (½–5 stars) × 2
//    diary / reviews    → Completed, one diary entry each (date, rating,
//                         rewatch flag, review) for the diary (3.1)
//
//  A film in several files becomes one row with the richest data (the diary's
//  latest watch date, its rating, every diary entry, all tags). Films are
//  matched later through TMDB search by title + year. Pure; the zip is read
//  with fflate in the browser.
// ───────────────────────────────────────────────────────────────────────────

import { unzipSync } from 'fflate';

import { csvRecords, hasHeaders } from '../csv';
import { parseDay, parseRating, parseYear, splitList, text } from '../fields';
import { dedupeRows, type ParseResult } from '../rows';
import type { ImportDiaryEntry, ImportRow } from '../types';

export interface NamedText {
  name: string;
  text: string;
}

type Kind = 'watched' | 'ratings' | 'diary' | 'reviews' | 'watchlist';

/**
 * The files we read, in merge order: ratings.csv holds the film's current
 * rating, so it wins over a single diary entry's; the logs come next.
 */
const KINDS: Kind[] = ['ratings', 'reviews', 'diary', 'watched', 'watchlist'];

const BASE = ['Name', 'Year', 'Date'];

/** Which Letterboxd file this is: by its name, checked against its header. */
export function letterboxdKind(name: string, headers: string[]): Kind | null {
  if (!hasHeaders(headers, BASE)) return null;
  const base = name.split(/[\\/]/).pop()!.toLowerCase().replace(/\.csv$/, '');
  if ((KINDS as string[]).includes(base)) return base as Kind;
  // Renamed files: tell them apart by their columns.
  if (headers.includes('Review')) return 'reviews';
  if (headers.includes('Watched Date')) return 'diary';
  if (headers.includes('Rating')) return 'ratings';
  return null;
}

/**
 * The CSVs inside a Letterboxd export zip (top level only: the `deleted/` and
 * `orphaned/` folders hold films the user removed).
 */
export function readLetterboxdZip(bytes: Uint8Array): NamedText[] {
  const wanted = new Set(KINDS.map((k) => `${k}.csv`));
  const files = unzipSync(bytes, { filter: (f) => !f.name.includes('/') && wanted.has(f.name.toLowerCase()) });
  const decoder = new TextDecoder('utf-8');
  return Object.entries(files).map(([name, data]) => ({ name, text: decoder.decode(data) }));
}

function rowFrom(kind: Kind, rec: Record<string, string>): ImportRow | null {
  const title = text(rec.Name);
  if (!title) return null;
  const row: ImportRow = {
    source: 'letterboxd',
    category: 'movies',
    title,
    ids: {},
    status: kind === 'watchlist' ? 'PLANNED' : 'COMPLETED',
  };
  const year = parseYear(rec.Year);
  if (year) row.year = year;
  const rating = parseRating(rec.Rating, 5);
  if (rating !== undefined && kind !== 'watchlist') row.rating = rating;
  const tags = splitList(rec.Tags, /,/);
  if (tags.length) row.tags = tags;

  if (kind === 'diary' || kind === 'reviews') {
    const date = parseDay(rec['Watched Date']) ?? parseDay(rec.Date);
    if (date) {
      const entry: ImportDiaryEntry = { date, rewatch: /^yes$/i.test(rec.Rewatch?.trim() ?? '') };
      if (rating !== undefined) entry.rating = rating;
      const review = text(rec.Review);
      if (review) entry.review = review;
      row.diary = [entry];
      row.finishedOn = date;
      if (entry.rewatch) row.rewatchCount = 1;
    }
    const review = text(rec.Review);
    if (review) row.review = review;
  } else if (kind === 'watched') {
    // The day it was marked watched — the best date when there is no diary.
    const date = parseDay(rec.Date);
    if (date) row.finishedOn = date;
  }
  return row;
}

/**
 * Parse any set of Letterboxd CSVs. A diary entry and a review of the same
 * watch both appear (diary.csv and reviews.csv); they are merged by date.
 */
export function parseLetterboxd(files: NamedText[]): ParseResult {
  const byKind = new Map<Kind, Record<string, string>[]>();
  const warnings: string[] = [];
  for (const f of files) {
    const { headers, records } = csvRecords(f.text);
    const kind = letterboxdKind(f.name, headers);
    if (!kind) {
      warnings.push(`${f.name}: not a Letterboxd watched, ratings, diary, reviews or watchlist file.`);
      continue;
    }
    byKind.set(kind, [...(byKind.get(kind) ?? []), ...records]);
  }

  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const kind of KINDS) {
    for (const rec of byKind.get(kind) ?? []) {
      const row = rowFrom(kind, rec);
      if (row) rows.push(row);
      else skipped++;
    }
  }
  const merged = dedupeRows(rows).map(collapseDiary);
  return { rows: merged, skipped, warnings };
}

/**
 * One diary entry per watch day and rewatch flag (diary.csv and reviews.csv
 * list the same reviewed watch), keeping the fuller one; then the rewatch
 * count from the merged entries.
 */
function collapseDiary(row: ImportRow): ImportRow {
  if (!row.diary?.length) return row;
  const byDay = new Map<string, ImportDiaryEntry>();
  for (const e of row.diary) {
    const k = `${e.date}|${e.rewatch}`;
    const prev = byDay.get(k);
    byDay.set(k, prev ? { ...e, ...prev, rating: prev.rating ?? e.rating, review: prev.review ?? e.review } : e);
  }
  const diary = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of diary) {
    if (e.rating === undefined) delete e.rating;
    if (e.review === undefined) delete e.review;
  }
  const rewatches = diary.filter((e) => e.rewatch).length;
  const out: ImportRow = { ...row, diary };
  if (rewatches > 0) out.rewatchCount = rewatches;
  else delete out.rewatchCount;
  return out;
}
