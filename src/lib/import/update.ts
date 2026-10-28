// ───────────────────────────────────────────────────────────────────────────
//  "Update existing titles" (spec 2.1): what an import row changes on an
//  activity the user already has. Pure; src/lib/import/server.ts runs it in a
//  transaction with the events.
//
//  Only what the row actually carries is applied: its status always (the
//  review screen shows and lets you change it), a score / start / finish /
//  progress only when the row has one, and tags are merged, never removed.
// ───────────────────────────────────────────────────────────────────────────

import { eventsForUpdate, type EventInput } from '@/lib/events';
import type { Status } from '@/lib/status';

export interface ActivityNow {
  status: Status;
  rating: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  progress: number | null;
  tags: string[];
}

export interface ImportChange {
  status: Status;
  rating?: number | null;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  progress?: number | null;
  tags?: string[];
}

export interface ImportUpdatePlan {
  /** Columns to write (empty = nothing changes). */
  patch: Partial<ActivityNow>;
  /** Up next membership follows the status, as in updateActivity. */
  queue: 'leave' | 'join' | null;
  events: EventInput[];
}

const sameTime = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

export function planImportUpdate(
  ids: { userId: string; activityId: string },
  now: ActivityNow,
  change: ImportChange,
): ImportUpdatePlan {
  const patch: Partial<ActivityNow> = {};
  if (change.status !== now.status) patch.status = change.status;
  if (change.rating != null && change.rating !== now.rating) patch.rating = change.rating;
  if (change.startedAt && !sameTime(change.startedAt, now.startedAt)) patch.startedAt = change.startedAt;
  if (change.finishedAt && !sameTime(change.finishedAt, now.finishedAt)) patch.finishedAt = change.finishedAt;
  if (change.progress != null && change.progress !== now.progress) patch.progress = change.progress;
  const extra = (change.tags ?? []).filter((t) => !now.tags.includes(t));
  if (extra.length) patch.tags = [...now.tags, ...extra];

  let queue: ImportUpdatePlan['queue'] = null;
  if (patch.status) {
    if (now.status === 'PLANNED') queue = 'leave';
    else if (patch.status === 'PLANNED') queue = 'join';
  }

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
