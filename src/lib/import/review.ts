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
    if (r.favourite) row.favourite = true;
    if (r.rewatchCount != null) row.rewatchCount = r.rewatchCount;
    if (r.review) row.review = r.review;
    if (r.diary?.length) row.diary = r.diary;
    if (r.source === 'steam') {
      if (r.playtimeMinutes != null) row.playtimeMinutes = r.playtimeMinutes;
      if (r.ids.steam && /^\d{1,10}$/.test(r.ids.steam)) row.steamAppId = Number(r.ids.steam);
    }
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

/**
 * What matching needs from a row: everything but the long free text
 * (review, diary, notes), so a chunk stays far below the 1 MB Server Action
 * body limit. The full row is kept on the client for the commit.
 */
export function matchPayload(row: ImportRow): ImportRow {
  const { review: _review, diary: _diary, notes: _notes, ...rest } = row;
  return rest;
}

/** Keep each commit call's JSON body under this (Server Actions cap at 1 MB). */
export const COMMIT_BYTES = 700_000;

const bytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

/**
 * Shrink one commit row that alone would exceed `maxBytes`: diary reviews
 * are cut to 2,000 characters, then the oldest diary entries dropped, then
 * the review cut. Rows that fit are returned unchanged.
 */
export function fitRow(row: CommitRow, maxBytes = COMMIT_BYTES): CommitRow {
  if (bytes(row) <= maxBytes) return row;
  let out: CommitRow = {
    ...row,
    diary: row.diary?.map((e) => (e.review && e.review.length > 2000 ? { ...e, review: e.review.slice(0, 2000) } : e)),
  };
  while (out.diary?.length && bytes(out) > maxBytes) out = { ...out, diary: out.diary.slice(Math.ceil(out.diary.length / 2)) };
  if (bytes(out) > maxBytes && out.review) out = { ...out, review: out.review.slice(0, 2000) };
  return out;
}

/** Commit chunks: at most `maxCount` rows and about `maxBytes` of JSON each. */
export function chunkCommitRows(rows: CommitRow[], maxCount: number, maxBytes = COMMIT_BYTES): CommitRow[][] {
  const out: CommitRow[][] = [];
  let current: CommitRow[] = [];
  let size = 2;
  for (const raw of rows) {
    const row = fitRow(raw, maxBytes);
    const b = bytes(row) + 1;
    if (current.length && (current.length >= maxCount || size + b > maxBytes)) {
      out.push(current);
      current = [];
      size = 2;
    }
    current.push(row);
    size += b;
  }
  if (current.length) out.push(current);
  return out;
}

/** Retries of one chunk the server rate-limited (re-review 2). */
export const RATE_RETRIES = 3;
/** Longer waits (a spent daily budget) aren't waited out: the rows fail as before. */
export const RATE_MAX_WAIT_SEC = 120;

export interface RateRetryOptions {
  /** True once the user pressed Stop or the screen unmounted: stop waiting and retrying. */
  shouldStop?: () => boolean;
  /** Sleep `ms` (tests pass a fake); it may return early once `shouldStop` is true. */
  wait?: (ms: number, shouldStop: () => boolean) => Promise<void>;
  retries?: number;
}

/** Sleep in short ticks, ending early once `shouldStop()` is true. */
export async function stoppableWait(ms: number, shouldStop: () => boolean, tick = 250): Promise<void> {
  const end = Date.now() + ms;
  while (!shouldStop() && Date.now() < end) {
    await new Promise((r) => setTimeout(r, Math.min(tick, end - Date.now())));
  }
}

/**
 * Run an import call; when the server answers with `retryAfterSec` (its row
 * budget is spent for now), wait that long and send the SAME chunk again, up
 * to RATE_RETRIES times, instead of marking its rows failed. Stop / unmount
 * (`shouldStop`) ends the wait at once and returns the last answer.
 */
export async function withRateRetry<T extends { retryAfterSec?: number } | null>(
  call: () => Promise<T>,
  opts: RateRetryOptions = {},
): Promise<T> {
  const shouldStop = opts.shouldStop ?? (() => false);
  const wait = opts.wait ?? stoppableWait;
  const retries = opts.retries ?? RATE_RETRIES;
  let res = await call();
  for (let i = 0; i < retries; i++) {
    const after = res?.retryAfterSec;
    if (typeof after !== 'number' || after > RATE_MAX_WAIT_SEC || shouldStop()) break;
    await wait(Math.max(1, after) * 1000, shouldStop);
    if (shouldStop()) break;
    res = await call();
  }
  return res;
}
