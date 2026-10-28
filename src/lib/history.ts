// ───────────────────────────────────────────────────────────────────────────
//  The "History" section of the details (spec 3.2): the activity's events and
//  diary entries merged into one plain-language list, newest first. Pure and
//  client-safe; the score formatter is passed in (the user's score format).
//
//  A status event INTO a finished status is left out when a diary entry of
//  the same day says it better ("Watched (rewatch) · 8.5" instead of also
//  "Marked as Watched"), and the status event of a "Watch again" is left out
//  next to its "Started watching again".
// ───────────────────────────────────────────────────────────────────────────

import type { CategorySlug } from './categories';
import { progressUnit } from './progress';
import { todayYmd } from './release';
import { againStartedLabel, doneVerb, isStatus, statusLabel } from './status';

export interface HistoryEvent {
  id: string;
  kind: string;
  from: string | null;
  to: string | null;
  /** ISO timestamp. */
  at: string;
  meta?: unknown;
}

export interface HistoryDiary {
  id: string;
  date: string; // YYYY-MM-DD
  rating: number | null;
  rewatch: boolean;
  review: string | null;
  /** ISO timestamp. */
  createdAt: string;
}

export interface HistoryItem {
  id: string;
  /** The calendar day (YYYY-MM-DD) in the user's zone. */
  day: string;
  text: string;
  kind: 'event' | 'diary';
}

const SOURCE_NAMES: Record<string, string> = {
  hoard: 'a Hoard export',
  anilist: 'AniList',
  letterboxd: 'Letterboxd',
  goodreads: 'Goodreads',
  storygraph: 'StoryGraph',
  mal: 'MyAnimeList',
  trakt: 'Trakt',
  generic: 'a CSV file',
  ai: 'a pasted list',
  franchise: 'the franchise’s missing titles',
};

/** "Letterboxd", "a CSV file", … for an import source id. */
export function sourceName(source: unknown): string {
  return (typeof source === 'string' && SOURCE_NAMES[source]) || 'an import';
}

const metaOf = (meta: unknown): Record<string, unknown> =>
  meta && typeof meta === 'object' && !Array.isArray(meta) ? (meta as Record<string, unknown>) : {};

const label = (status: string | null, slug: CategorySlug) =>
  status && isStatus(status) ? statusLabel(status, slug) : 'unknown';

/** One event in plain language. `score` formats a 0–10 score for display. */
export function eventText(e: HistoryEvent, slug: CategorySlug, score: (v: number) => string): string {
  const meta = metaOf(e.meta);
  const text = baseEventText(e, slug, score, meta);
  return meta.undo === true ? `Undo: ${text[0].toLowerCase()}${text.slice(1)}` : text;
}

function baseEventText(
  e: HistoryEvent,
  slug: CategorySlug,
  score: (v: number) => string,
  meta: Record<string, unknown>,
): string {
  const num = (v: string | null) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
  switch (e.kind) {
    case 'added':
      return e.to === 'PLANNED' ? 'Added to Up next' : `Added as ${label(e.to, slug)}`;
    case 'import':
      return meta.updated === true ? `Updated from ${sourceName(meta.source)}` : `Imported from ${sourceName(meta.source)}`;
    case 'status':
      return e.to === 'PLANNED' ? 'Moved to Up next' : `Marked as ${label(e.to, slug)}`;
    case 'score': {
      const to = num(e.to);
      const from = num(e.from);
      if (to == null) return 'Cleared the score';
      return from == null ? `Scored ${score(to)}` : `Scored ${score(to)} (was ${score(from)})`;
    }
    case 'progress': {
      const to = num(e.to);
      return to == null ? 'Stopped tracking progress' : `Progress: ${to} ${progressUnit(slug, to)}`;
    }
    case 'tier':
      if (!e.to) return 'Taken off the tier list';
      return e.from ? `Moved from tier ${e.from} to ${e.to}` : `Placed in tier ${e.to}`;
    case 'queue':
      return `Moved in Up next from #${e.from} to #${e.to}`;
    case 'removed-undone':
      return 'Brought back after a remove';
    case 'rewatch':
      return againStartedLabel(slug);
    case 'review':
      if (!e.to) return 'Removed the review';
      return e.from ? 'Edited the review' : 'Wrote a review';
    default:
      return e.kind;
  }
}

/** One diary entry: "Watched (rewatch) · 8.5". */
export function diaryText(d: HistoryDiary, slug: CategorySlug, score: (v: number) => string): string {
  const parts = [`${doneVerb(slug)}${d.rewatch ? ' (rewatch)' : ''}`];
  if (d.rating != null) parts.push(score(d.rating));
  return parts.join(' · ');
}

/**
 * Events and diary entries as one list, newest first. Days are in
 * `timeZone`; within a day, entries are ordered by their timestamps.
 */
export function historyItems(
  events: HistoryEvent[],
  diary: HistoryDiary[],
  slug: CategorySlug,
  timeZone: string,
  score: (v: number) => string,
): HistoryItem[] {
  const diaryDays = new Set(diary.map((d) => d.date));
  // "Watch again" writes a status and a rewatch event together: show one.
  const rewatchAt = new Set(events.filter((e) => e.kind === 'rewatch').map((e) => e.at));
  const rows: (HistoryItem & { sort: string })[] = [];
  for (const e of events) {
    const day = todayYmd(timeZone, new Date(e.at));
    const finish = e.kind === 'status' && (e.to === 'COMPLETED' || e.to === 'RETIRED') && metaOf(e.meta).undo !== true;
    if (finish && diaryDays.has(day)) continue;
    if (e.kind === 'status' && rewatchAt.has(e.at)) continue;
    rows.push({ id: e.id, day, text: eventText(e, slug, score), kind: 'event', sort: `${day} ${e.at}` });
  }
  for (const d of diary) {
    // A back-dated entry sorts at the end of its own day.
    const created = todayYmd(timeZone, new Date(d.createdAt)) === d.date ? d.createdAt : '~';
    rows.push({ id: d.id, day: d.date, text: diaryText(d, slug, score), kind: 'diary', sort: `${d.date} ${created}` });
  }
  rows.sort((a, b) => (a.sort < b.sort ? 1 : a.sort > b.sort ? -1 : 0));
  return rows.map(({ sort: _sort, ...item }) => item);
}
