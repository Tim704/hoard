// ───────────────────────────────────────────────────────────────────────────
//  "Update existing titles" (spec 2.1): what an import row changes on an
//  activity the user already has. Pure; src/lib/import/server.ts runs it in a
//  transaction with the events.
//
//  Only what the row actually carries is applied, and nothing moves back:
//  the status only when it is further along (Planned never replaces
//  Completed), a score / start / finish / progress only when the row has one,
//  tags merged and a favourite only ever switched on.
// ───────────────────────────────────────────────────────────────────────────

import { isFinishTransition } from '@/lib/diary';
import { eventsForUpdate, type EventInput } from '@/lib/events';
import type { Status } from '@/lib/status';
import { MAX_TAGS, normalizeTags, tagKey } from '@/lib/tags';

import { STATUS_RANK } from './rows';

export interface ActivityNow {
  status: Status;
  rating: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  progress: number | null;
  tags: string[];
  favorite: boolean;
}

export interface ImportChange {
  status: Status;
  rating?: number | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  progress?: number | null;
  tags?: string[];
  favorite?: boolean;
}

export interface ImportUpdatePlan {
  /** Columns to write (empty = nothing changes). */
  patch: Partial<ActivityNow>;
  /**
   * Up next membership follows the status, as in updateActivity. Only ever
   * 'leave': the status only moves forward, so it can't become Planned here.
   */
  queue: 'leave' | null;
  events: EventInput[];
}

const sameTime = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

export function planImportUpdate(
  ids: { userId: string; activityId: string },
  now: ActivityNow,
  change: ImportChange,
): ImportUpdatePlan {
  const patch: Partial<ActivityNow> = {};
  if (STATUS_RANK[change.status] > STATUS_RANK[now.status]) patch.status = change.status;
  if (change.rating != null && change.rating !== now.rating) patch.rating = change.rating;
  if (change.startedAt && !sameTime(change.startedAt, now.startedAt)) patch.startedAt = change.startedAt;
  if (change.finishedAt && !sameTime(change.finishedAt, now.finishedAt)) patch.finishedAt = change.finishedAt;
  if (change.progress != null && change.progress !== now.progress) patch.progress = change.progress;
  // Tags (4.2): only tags whose case-insensitive key is new are added, and
  // only while there is room under 20; an existing list (older imports kept
  // up to 50) is never rewritten or truncated.
  const have = new Set(now.tags.map(tagKey));
  const added = normalizeTags(change.tags ?? []).filter((t) => !have.has(tagKey(t)));
  if (added.length && now.tags.length < MAX_TAGS) patch.tags = normalizeTags([...now.tags, ...added]);
  if (change.favorite && !now.favorite) patch.favorite = true;

  let queue: ImportUpdatePlan['queue'] = null;
  if (patch.status && now.status === 'PLANNED') queue = 'leave';

  const events = eventsForUpdate(ids, now, { status: patch.status, rating: patch.rating });
  if (patch.progress !== undefined) {
    events.push({
      ...ids,
      kind: 'progress',
      from: now.progress == null ? null : String(now.progress),
      to: String(patch.progress),
    });
  }
  return { patch, queue, events };
}

// ── Finishing through an import update or the AniList pull (final review 13) ─

export interface FinishNow {
  status: Status;
  finishedAt: Date | null;
  rating: number | null;
  rewatching: boolean;
}

export interface FinishRow {
  /** 'anilist-sync' never moves a finish date that is already set. */
  source: string;
  /** The remote completion day (AniList completedAt / import finishedOn). */
  finishedOn?: string | null;
  /** A dated log: its entries are written by writeImportDiary instead. */
  diary?: unknown[] | null;
}

export interface FinishPlanResult {
  /** Write this `finishedAt` (null = leave the column as the patch has it). */
  finishedAt: Date | null;
  /** Drop a `finishedAt` the patch carries (the AniList pull keeps a set one). */
  keepStoredFinishedAt: boolean;
  /** A diary entry dated today in the user's zone (no remote day known). */
  todayEntry: { date: string; rating: number | null; rewatch: boolean } | null;
}

/**
 * What a status change INTO Completed / Retired (same rule as the Add /
 * edit path: from any other status, Dropped included) means for `finishedAt`
 * and the diary when it arrives through an import update or the AniList
 * pull. `finishedAt` is written only when unset: the remote completion day,
 * else now. The diary entry is the remote day's (writeImportDiary writes
 * it from `finishedOn`); without a remote day or log, one entry dated
 * `today` in the user's zone.
 */
export function planImportFinish(
  now: FinishNow,
  patch: { status?: Status; rating?: number | null; finishedAt?: Date | null },
  row: FinishRow,
  today: string,
  dayToDate: (ymd: string) => Date | null,
  clock: Date = new Date(),
): FinishPlanResult {
  const keepStoredFinishedAt = row.source === 'anilist-sync' && now.finishedAt != null && patch.finishedAt != null;
  const none: FinishPlanResult = { finishedAt: null, keepStoredFinishedAt, todayEntry: null };
  if (!isFinishTransition(now.status, patch.status)) return none;
  const remote = row.finishedOn ? dayToDate(row.finishedOn) : null;
  const finishedAt = now.finishedAt == null && patch.finishedAt == null ? (remote ?? clock) : null;
  const hasRemoteEntry = Boolean(row.finishedOn) || Boolean(row.diary && row.diary.length);
  return {
    finishedAt,
    keepStoredFinishedAt,
    todayEntry: hasRemoteEntry
      ? null
      : { date: today, rating: patch.rating !== undefined ? patch.rating : now.rating, rewatch: now.rewatching },
  };
}
