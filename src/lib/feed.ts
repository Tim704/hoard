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

export interface FeedCursor {
  at: Date;
  id: string;
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

/** Is `e` strictly after the cursor in feed order (i.e. older)? */
function afterCursor(e: FeedEntry, c: FeedCursor): boolean {
  const t = e.at.getTime();
  const ct = c.at.getTime();
  return t < ct || (t === ct && e.id < c.id);
}

export interface BuildFeedOptions {
  /** User ids that opted in (and the viewer only if they did too). */
  allowed: ReadonlySet<string>;
  now: Date;
  /** The owner's day for a timestamp (diaryMoment). */
  ymdOf: (userId: string, at: Date) => string;
  cursor?: FeedCursor | null;
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

  const inWindow = all
    .filter((e) => e.at.getTime() >= since && e.at.getTime() <= opts.now.getTime() + 60_000)
    .filter((e) => !opts.cursor || afterCursor(e, opts.cursor))
    .sort(newerFirst);
  const entries = inWindow.slice(0, limit);
  const last = entries[entries.length - 1];
  return { entries, next: inWindow.length > limit && last ? { at: last.at, id: last.id } : null };
}

/** "1730000000000~e:abc" ⇄ cursor. Anything malformed reads as "first page". */
export function encodeCursor(c: FeedCursor): string {
  return `${c.at.getTime()}~${c.id}`;
}

export function decodeCursor(raw: unknown): FeedCursor | null {
  if (typeof raw !== 'string' || raw.length > 200) return null;
  const m = /^(\d{1,15})~([de]:[A-Za-z0-9_-]{1,100})$/.exec(raw);
  if (!m) return null;
  const at = new Date(Number(m[1]));
  return Number.isNaN(at.getTime()) ? null : { at, id: m[2] };
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
