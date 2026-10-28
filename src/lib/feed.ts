// ───────────────────────────────────────────────────────────────────────────
//  Activity feed (spec 9.2). Pure: which raw rows become feed entries, the
//  privacy filter, ordering and cursor paging.
//
//  Privacy (G2): only users with `feedOptIn` appear. The data layer already
//  asks the database for opted-in users only; `buildFeed` filters AGAIN by
//  the allowed set, so a row from anyone else can never reach the page even
//  if a query returns it. Nothing is copied anywhere: opting out removes your
//  entries from everyone's feed on the next request.
//
//  Entries:
//    - finish:  a diary entry (every entry is a run finished as Completed or
//               Retired, see src/lib/diary.ts);
//    - drop:    a status event into Dropped (not an undo);
//    - s-tier:  a tier event into S from another tier or none (an Arena swap
//               inside S and undo restores are not new placements).
//  A drop or S placement that a later Undo took back is left out.
// ───────────────────────────────────────────────────────────────────────────

/** How far back the feed reaches. */
export const FEED_DAYS = 30;
/** Entries per page. */
export const FEED_PAGE_SIZE = 50;

export type FeedKind = 'finish' | 'drop' | 's-tier';

/** A diary entry as read for the feed. */
export interface RawDiary {
  id: string;
  userId: string;
  activityId: string;
  date: string; // YYYY-MM-DD
  createdAt: Date;
  rating: number | null;
  rewatch: boolean;
}

/** An ActivityEvent as read for the feed. */
export interface RawEvent {
  id: string;
  userId: string;
  activityId: string;
  kind: string;
  from: string | null;
  to: string | null;
  at: Date;
  meta: unknown;
}

export interface FeedEntry {
  /** Unique across sources: "d:<diary id>" or "e:<event id>". */
  id: string;
  kind: FeedKind;
  userId: string;
  activityId: string;
  at: Date;
  /** The diary entry's score (finish); null for other kinds (the caller adds the current score for drops). */
  rating: number | null;
  rewatch: boolean;
}

/**
 * A paging position: entries at `at` or older, minus the first `skip` of the
 * ones exactly at `at` (in feed order). Encoded opaquely, never with row ids.
 */
export interface FeedCursor {
  at: Date;
  skip: number;
}

/** An undo event (`meta.undo`) as read for the feed. */
export interface RawUndo {
  activityId: string;
  kind: string;
  from: string | null;
  at: Date;
}

const meta = (m: unknown): Record<string, unknown> =>
  m && typeof m === 'object' && !Array.isArray(m) ? (m as Record<string, unknown>) : {};

/**
 * When a diary entry happened: its creation time when that falls on the
 * entry's own day (in the owner's zone, `ymdOf`), otherwise noon UTC of the
 * entry's day (a run logged after the fact, an import or the backfill), but
 * never later than its creation.
 */
export function diaryMoment(d: Pick<RawDiary, 'date' | 'createdAt'>, ymdOf: (at: Date) => string): Date {
  if (ymdOf(d.createdAt) === d.date) return d.createdAt;
  const noon = new Date(`${d.date}T12:00:00.000Z`);
  if (Number.isNaN(noon.getTime())) return d.createdAt;
  return noon < d.createdAt ? noon : d.createdAt;
}

/** The feed kind of an event, or null when it isn't a feed entry. */
export function eventKind(ev: Pick<RawEvent, 'kind' | 'from' | 'to' | 'meta'>): FeedKind | null {
  const m = meta(ev.meta);
  if (m.undo === true) return null;
  if (ev.kind === 'status' && ev.to === 'DROPPED' && ev.from !== 'DROPPED') return 'drop';
  if (ev.kind === 'tier' && ev.to === 'S' && ev.from !== 'S' && m.via !== 'arena') return 's-tier';
  return null;
}

/** Newest first; the id breaks ties so paging is stable. */
function newerFirst(a: FeedEntry, b: FeedEntry): number {
  return b.at.getTime() - a.at.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

/**
 * Was this drop / S placement taken back by a later Undo? (An undo of a drop
 * is a status event out of Dropped; of an S placement, a tier event out of S.)
 */
export function wasUndone(e: Pick<FeedEntry, 'kind' | 'activityId' | 'at'>, undos: readonly RawUndo[]): boolean {
  if (e.kind === 'finish') return false; // undoing a finish deletes its diary entry
  const kind = e.kind === 'drop' ? 'status' : 'tier';
  const from = e.kind === 'drop' ? 'DROPPED' : 'S';
  return undos.some(
    (u) => u.activityId === e.activityId && u.kind === kind && u.from === from && u.at.getTime() > e.at.getTime(),
  );
}

/**
 * The horizon of a source read newest-first with `take: cap`: when it came
 * back full, rows at or before its oldest timestamp may be missing, so only
 * entries strictly newer than that are complete. Null when it wasn't full.
 */
export function sourceHorizon(rowsNewestFirst: readonly { at: Date }[], cap: number): Date | null {
  return rowsNewestFirst.length >= cap && rowsNewestFirst.length > 0 ? rowsNewestFirst[rowsNewestFirst.length - 1].at : null;
}

/**
 * The same for diary entries read by day (newest first): a missing entry of
 * the oldest day read can be placed as late as that day's end in any zone
 * (diaryMoment), so the horizon is 36 h after that day's UTC midnight.
 */
export function diaryHorizon(rowsNewestFirst: readonly { date: string }[], cap: number): Date | null {
  if (rowsNewestFirst.length < cap || rowsNewestFirst.length === 0) return null;
  const day = new Date(`${rowsNewestFirst[rowsNewestFirst.length - 1].date}T00:00:00.000Z`);
  return Number.isNaN(day.getTime()) ? null : new Date(day.getTime() + 36 * 3_600_000);
}

/** The later of some horizons (null = none). */
export function latestHorizon(...hs: (Date | null)[]): Date | null {
  let out: Date | null = null;
  for (const h of hs) if (h && (!out || h > out)) out = h;
  return out;
}

/** The entries after `c` in feed order (`ordered` is already newest first). */
function applyCursor(ordered: FeedEntry[], c: FeedCursor | null | undefined): FeedEntry[] {
  if (!c) return ordered;
  const ct = c.at.getTime();
  let skipped = 0;
  return ordered.filter((e) => {
    const t = e.at.getTime();
    if (t > ct) return false;
    if (t === ct && skipped < c.skip) {
      skipped++;
      return false;
    }
    return true;
  });
}

export interface BuildFeedOptions {
  /** User ids that opted in (and the viewer only if they did too). */
  allowed: ReadonlySet<string>;
  now: Date;
  /** The owner's day for a timestamp (diaryMoment). */
  ymdOf: (userId: string, at: Date) => string;
  cursor?: FeedCursor | null;
  /** Later undo events: an undone drop / S placement is not shown. */
  undos?: readonly RawUndo[];
  /**
   * A capped source's horizon (latestHorizon of sourceHorizon/diaryHorizon):
   * only entries strictly newer are complete, so the page stops there and
   * `next` continues from it, even on a short page.
   */
  horizon?: Date | null;
  limit?: number;
  days?: number;
}

/**
 * One page of the feed from the raw diary entries and events: the privacy
 * filter, the 30-day window, newest first, `limit` entries after `cursor`.
 * `next` is the cursor of the following page, or null on the last one.
 */
export function buildFeed(
  diary: readonly RawDiary[],
  events: readonly RawEvent[],
  opts: BuildFeedOptions,
): { entries: FeedEntry[]; next: FeedCursor | null } {
  const limit = opts.limit ?? FEED_PAGE_SIZE;
  const since = opts.now.getTime() - (opts.days ?? FEED_DAYS) * 86_400_000;
  const all: FeedEntry[] = [];

  for (const d of diary) {
    if (!opts.allowed.has(d.userId)) continue;
    const at = diaryMoment(d, (t) => opts.ymdOf(d.userId, t));
    all.push({ id: `d:${d.id}`, kind: 'finish', userId: d.userId, activityId: d.activityId, at, rating: d.rating, rewatch: d.rewatch });
  }
  for (const ev of events) {
    if (!opts.allowed.has(ev.userId)) continue;
    const kind = eventKind(ev);
    if (!kind) continue;
    all.push({ id: `e:${ev.id}`, kind, userId: ev.userId, activityId: ev.activityId, at: ev.at, rating: null, rewatch: false });
  }

  const undos = opts.undos ?? [];
  const ordered = all
    .filter((e) => e.at.getTime() >= since && e.at.getTime() <= opts.now.getTime() + 60_000)
    .filter((e) => !wasUndone(e, undos))
    .sort(newerFirst);
  let candidates = applyCursor(ordered, opts.cursor);

  // A capped source: stop at its horizon so nothing older is skipped for
  // good, and continue from there on the next request (which rereads every
  // source at or before the cursor).
  let cut = false;
  if (opts.horizon) {
    const h = opts.horizon.getTime();
    const kept = candidates.filter((e) => e.at.getTime() > h);
    // Where this request started: the cursor, or the newest the window allows.
    const start = opts.cursor ? opts.cursor.at.getTime() : opts.now.getTime() + 60_000;
    if (kept.length > 0) {
      candidates = kept;
      cut = true;
    } else if (h < start) {
      // Nothing newer survived (e.g. undone or outside the window): an empty
      // page that moves the cursor back to the horizon. Rows exactly at the
      // horizon are reread (skip 0), so nothing is lost and it makes progress.
      return { entries: [], next: { at: opts.horizon, skip: 0 } };
    }
    // Last resort: the horizon isn't older than where we started (over
    // SOURCE_CAP rows at one instant, or diary entries within a couple of
    // days), so stopping there would never move. Page on without it.
  }

  const entries = candidates.slice(0, limit);
  const last = entries[entries.length - 1];
  if (!last || !(cut || candidates.length > limit)) return { entries, next: null };
  const sameAt = entries.filter((e) => e.at.getTime() === last.at.getTime()).length;
  const carried = opts.cursor && opts.cursor.at.getTime() === last.at.getTime() ? opts.cursor.skip : 0;
  return { entries, next: { at: last.at, skip: sameAt + carried } };
}

/** An opaque cursor ("<ms base36>-<skip base36>"); anything malformed reads as "first page". */
export function encodeCursor(c: FeedCursor): string {
  return `${c.at.getTime().toString(36)}-${c.skip.toString(36)}`;
}

export function decodeCursor(raw: unknown): FeedCursor | null {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const m = /^([0-9a-z]{1,10})-([0-9a-z]{1,6})$/.exec(raw);
  if (!m) return null;
  const at = new Date(parseInt(m[1], 36));
  const skip = parseInt(m[2], 36);
  return Number.isNaN(at.getTime()) || !Number.isSafeInteger(skip) ? null : { at, skip };
}

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago". */
export function relativeTime(at: Date, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (s < 60) return 'just now';
  const min = Math.floor(s / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
