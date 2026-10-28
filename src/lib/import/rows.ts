// ───────────────────────────────────────────────────────────────────────────
//  What every source parser returns, and how duplicate rows (the same title
//  twice in one export, or once per Letterboxd file) collapse into one row
//  that keeps the richest data. Pure.
// ───────────────────────────────────────────────────────────────────────────

import type { Status } from '@/lib/status';

import { matchKey } from './match';
import type { ImportRow } from './types';

export interface ParseResult {
  rows: ImportRow[];
  /** Lines that could not become a row (no title, unknown section, …). */
  skipped: number;
  /** Human-readable notes for the user ("watchlist.csv: not a Letterboxd file"). */
  warnings: string[];
}

/**
 * How far along a status is: a merge keeps the furthest one, and "update
 * existing" never moves a title back down (src/lib/import/update.ts).
 */
export const STATUS_RANK: Record<Status, number> = {
  PLANNED: 0,
  DROPPED: 1,
  ON_HOLD: 2,
  RETIRED: 3,
  CONSUMING: 4,
  COMPLETED: 5,
};

/** The identity of a row inside one import: its ids, else title + year. */
export function rowKey(r: ImportRow): string {
  const id =
    r.externalId ??
    (r.ids.anilist && `al:${r.ids.anilist}`) ??
    (r.ids.mal && `mal:${r.ids.mal}`) ??
    (r.ids.tmdb && `tmdb:${r.ids.tmdb}`) ??
    (r.ids.isbn && `isbn:${r.ids.isbn}`);
  return `${r.category}|${id || `${matchKey(r.title)}|${r.year ?? ''}`}`;
}

/** Earlier / later of two optional YYYY-MM-DD days. */
const minDay = (a?: string, b?: string) => (a && b ? (a < b ? a : b) : a ?? b);
const maxDay = (a?: string, b?: string) => (a && b ? (a > b ? a : b) : a ?? b);

/**
 * Merge two rows for the same title: the furthest status, the first rating
 * (the caller passes richer files first), the earliest start and latest
 * finish, the union of tags, all diary entries, the higher rewatch count, and
 * whichever side has a year, ids, review, progress or notes.
 */
export function mergeRows(a: ImportRow, b: ImportRow): ImportRow {
  const tags = [...(a.tags ?? []), ...(b.tags ?? []).filter((t) => !(a.tags ?? []).includes(t))];
  const diary = [...(a.diary ?? []), ...(b.diary ?? [])].sort((x, y) => x.date.localeCompare(y.date));
  const rewatch = Math.max(a.rewatchCount ?? 0, b.rewatchCount ?? 0);
  const merged: ImportRow = {
    ...b,
    ...a,
    ids: { ...b.ids, ...a.ids },
    year: a.year ?? b.year,
    status: STATUS_RANK[b.status] > STATUS_RANK[a.status] ? b.status : a.status,
    rating: a.rating ?? b.rating,
    startedOn: minDay(a.startedOn, b.startedOn),
    finishedOn: maxDay(a.finishedOn, b.finishedOn),
    review: a.review ?? b.review,
    progress: a.progress ?? b.progress,
    notes: a.notes ?? b.notes,
  };
  if (a.favourite || b.favourite) merged.favourite = true;
  if (tags.length) merged.tags = tags;
  else delete merged.tags;
  if (diary.length) merged.diary = diary;
  else delete merged.diary;
  if (rewatch > 0) merged.rewatchCount = rewatch;
  else delete merged.rewatchCount;
  for (const k of ['rating', 'startedOn', 'finishedOn', 'review', 'progress', 'notes', 'year'] as const) {
    if (merged[k] === undefined) delete merged[k];
  }
  return merged;
}

/** Collapse rows with the same `rowKey`, keeping first-seen order. */
export function dedupeRows(rows: ImportRow[]): ImportRow[] {
  const byKey = new Map<string, ImportRow>();
  for (const r of rows) {
    const k = rowKey(r);
    const prev = byKey.get(k);
    byKey.set(k, prev ? mergeRows(prev, r) : r);
  }
  return [...byKey.values()];
}

/** Cap a text at `max` UTF-16 units (what zod counts), never splitting an emoji. */
function cap(text: string | undefined, max: number): string | undefined {
  if (text === undefined || text.length <= max) return text;
  const cut = text.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/**
 * Trim a parsed row to the limits the import actions accept (very long
 * titles, notes or reviews, piles of tags), so one odd line in a file can't
 * make its whole chunk fail validation.
 */
export function sanitizeRow(r: ImportRow): ImportRow {
  const out: ImportRow = { ...r, title: cap(r.title.trim(), 500)! };
  if (r.author !== undefined) out.author = cap(r.author, 300);
  if (r.externalId !== undefined && r.externalId.length > 200) delete out.externalId;
  if (r.notes !== undefined) out.notes = cap(r.notes, 5000);
  if (r.review !== undefined) out.review = cap(r.review, 20_000);
  if (r.tags) out.tags = r.tags.map((t) => cap(t.trim(), 100)!).filter(Boolean).slice(0, 50);
  if (r.diary) out.diary = r.diary.slice(-1000).map((e) => (e.review ? { ...e, review: cap(e.review, 20_000) } : e));
  const ids = Object.entries(r.ids).filter(([, v]) => typeof v === 'string' && v.length <= 64);
  out.ids = Object.fromEntries(ids);
  return out;
}
