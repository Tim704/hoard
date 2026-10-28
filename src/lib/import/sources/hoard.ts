// ───────────────────────────────────────────────────────────────────────────
//  Hoard's own library CSV (Settings → Data, spec 1.11) read back in (2.1).
//  Rows are matched by their `externalId` against the catalogue, falling back
//  to a title + year search when the row is gone. Every text cell first has
//  the export's formula escape undone (`unescapeCsvFormula`).
// ───────────────────────────────────────────────────────────────────────────

import { isCategorySlug } from '@/lib/categories';
import { unescapeCsvFormula } from '@/lib/export';
import { normalizeRating } from '@/lib/rating';
import { isStatus } from '@/lib/status';

import { csvRecords, hasHeaders } from '../csv';
import { parseCount, parseDay, parseYear, splitList, text } from '../fields';
import { dedupeRows, type ParseResult } from '../rows';
import type { ImportRow } from '../types';

const REQUIRED = ['section', 'title', 'status', 'externalId'];

/** True when the CSV text has Hoard's library header. */
export function isHoardCsv(headers: string[]): boolean {
  return hasHeaders(headers, REQUIRED);
}

export function parseHoardCsv(csv: string): ParseResult {
  const { headers, records } = csvRecords(csv);
  if (!isHoardCsv(headers)) {
    return { rows: [], skipped: 0, warnings: ['This is not a Hoard library export (library.csv).'] };
  }
  const rows: ImportRow[] = [];
  let skipped = 0;
  for (const raw of records) {
    const cell = (k: string) => unescapeCsvFormula(raw[k] ?? '');
    const section = cell('section').trim();
    const status = cell('status').trim();
    const title = text(cell('title'));
    if (!title || !isCategorySlug(section) || !isStatus(status)) {
      skipped++;
      continue;
    }
    const scoreText = cell('score').trim();
    // Hoard scores are already 0–10, and 0 is a real score here.
    const rating = scoreText === '' ? null : normalizeRating(Number(scoreText));
    const row: ImportRow = { source: 'hoard', category: section, title, ids: {}, status };
    const year = parseYear(cell('year'));
    if (year) row.year = year;
    const externalId = text(cell('externalId'));
    if (externalId) row.externalId = externalId;
    if (rating !== null) row.rating = rating;
    const progress = parseCount(cell('progress'));
    if (progress !== undefined) row.progress = progress;
    const tags = splitList(cell('tags'), /;/);
    if (tags.length) row.tags = tags;
    const startedOn = parseDay(cell('started'));
    if (startedOn) row.startedOn = startedOn;
    const finishedOn = parseDay(cell('finished'));
    if (finishedOn) row.finishedOn = finishedOn;
    if (/^(yes|true|1)$/i.test(cell('favourite').trim())) row.favourite = true;
    const notes = text(cell('notes'));
    if (notes) row.notes = notes;
    rows.push(row);
  }
  return { rows: dedupeRows(rows), skipped, warnings: [] };
}
