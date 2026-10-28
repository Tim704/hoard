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

import { eventsForUpdate, type EventInput } from '@/lib/events';
import type { Status } from '@/lib/status';
import { normalizeTags } from '@/lib/tags';

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
  // Merged through the tag normaliser (4.2): case-insensitive, max 20.
  const tags = normalizeTags([...now.tags, ...(change.tags ?? [])]);
  if (tags.length !== now.tags.length || tags.some((t, i) => t !== now.tags[i])) patch.tags = tags;
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
