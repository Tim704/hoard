// ───────────────────────────────────────────────────────────────────────────
//  The review screen's state rules (spec 2.1), kept pure so they are tested:
//  what a matched row starts as, what it sends to the commit, and the tally
//  at the end. The component (src/components/import/import-review.tsx) only
//  renders and wires these up.
// ───────────────────────────────────────────────────────────────────────────

import type { Status } from '@/lib/status';

import { includedByDefault } from './match';
import type { CommitRow, CommitRowOutcome, ImportRow, RowMatch } from './types';

export interface ReviewItem {
  row: ImportRow;
  /** Undefined while the row waits to be matched. */
  match?: RowMatch;
  /** Index of the picked candidate; -1 = skip. */
  chosen: number;
  include: boolean;
  status: Status;
  rating: number | null;
}

export function pendingItem(row: ImportRow): ReviewItem {
  return { row, chosen: -1, include: false, status: row.status, rating: row.rating ?? null };
}

/** A row once its match arrives: the best candidate, ticked unless unsure. */
export function matchedItem(item: ReviewItem, match: RowMatch): ReviewItem {
  const chosen = match.chosenIndex;
  return { ...item, match, chosen, include: chosen >= 0 && includedByDefault(match.confidence) };
}

/** The "already in library" flag for the candidate currently picked. */
export function pickedInLibrary(item: ReviewItem) {
  return item.match && item.chosen >= 0 ? item.match.libraryByCandidate[item.chosen] ?? null : null;
}

/** Ticked rows with a picked candidate → commit payloads. */
export function commitRowsFor(items: ReviewItem[]): CommitRow[] {
  const out: CommitRow[] = [];
  for (const it of items) {
    const result = it.match?.candidates[it.chosen];
    if (!it.include || !result) continue;
    const r = it.row;
    const row: CommitRow = {
      category: r.category,
      source: r.source,
      result,
      status: it.status,
      rating: it.rating,
    };
    if (r.finishedOn) row.finishedOn = r.finishedOn;
    if (r.startedOn) row.startedOn = r.startedOn;
    if (r.progress != null) row.progress = r.progress;
    if (r.tags?.length) row.tags = r.tags;
    if (r.notes) row.notes = r.notes;
    if (r.rewatchCount != null) row.rewatchCount = r.rewatchCount;
    if (r.review) row.review = r.review;
    if (r.diary?.length) row.diary = r.diary;
    out.push(row);
  }
  return out;
}

export interface ImportSummary {
  added: number;
  updated: number;
  /** Already in the library and left as they were. */
  unchanged: number;
  failed: number;
  /** Not ticked, or without a match. */
  skipped: number;
}

export function summarise(total: number, outcomes: CommitRowOutcome[]): ImportSummary {
  const count = (o: CommitRowOutcome['outcome']) => outcomes.filter((x) => x.outcome === o).length;
  return {
    added: count('added'),
    updated: count('updated'),
    unchanged: count('unchanged'),
    failed: count('failed'),
    skipped: total - outcomes.length,
  };
}

/** Split a list into consecutive chunks of `size`. */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
