// ───────────────────────────────────────────────────────────────────────────
//  The activity event log (spec F1). Every mutation of an activity records what
//  changed — in the same transaction as the change — so history, streaks and
//  stats can be built later. `from` / `to` are the before / after values as
//  strings (null = unset). Server-only (writes through a Prisma client).
//
//  The builders (`eventsForUpdate`, `tierEvents`, `queueMoveEvent`) are pure so
//  the payloads are unit-tested without a database.
// ───────────────────────────────────────────────────────────────────────────

import type { Prisma, PrismaClient } from '@prisma/client';

export const EVENT_KINDS = [
  'added',
  'status',
  'score',
  'progress',
  'tier',
  'queue',
  'removed-undone',
  'rewatch',
  'review',
  'import',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export interface EventInput {
  userId: string;
  activityId: string;
  kind: EventKind;
  from?: string | null;
  to?: string | null;
  meta?: Prisma.InputJsonValue;
}

/** The prisma client or an interactive-transaction client. */
export type EventDb = Pick<PrismaClient, 'activityEvent'> | Prisma.TransactionClient;

/**
 * Write one event. Returns the Prisma promise unawaited, so it can also be
 * passed to an array `$transaction([...])` next to the change it describes.
 */
export function recordEvent(db: EventDb, e: EventInput) {
  return db.activityEvent.create({ data: toRow(e) });
}

/** Write several events in one statement (no-op promise for an empty list). */
export function recordEvents(db: EventDb, es: EventInput[]) {
  return db.activityEvent.createMany({ data: es.map(toRow) });
}

function toRow(e: EventInput): Prisma.ActivityEventCreateManyInput {
  return {
    userId: e.userId,
    activityId: e.activityId,
    kind: e.kind,
    from: e.from ?? null,
    to: e.to ?? null,
    ...(e.meta !== undefined ? { meta: e.meta } : {}),
  };
}

/** A score as stored in an event: "8.5", or null when unrated. */
export function scoreValue(v: number | null | undefined): string | null {
  return v == null ? null : String(Math.round(v * 10) / 10);
}

interface ActivityState {
  status: string;
  rating: number | null;
}

/**
 * Events for an `updateActivity` patch: one `status` event when the status
 * changes and one `score` event when the score changes. Fields absent from
 * `after` (undefined) are not being changed.
 */
export function eventsForUpdate(
  ids: { userId: string; activityId: string },
  before: ActivityState,
  after: Partial<ActivityState>,
): EventInput[] {
  const out: EventInput[] = [];
  if (after.status !== undefined && after.status !== before.status) {
    out.push({ ...ids, kind: 'status', from: before.status, to: after.status });
  }
  if (after.rating !== undefined) {
    const from = scoreValue(before.rating);
    const to = scoreValue(after.rating);
    if (from !== to) out.push({ ...ids, kind: 'score', from, to });
  }
  return out;
}

/**
 * `tier` events for a tier-list save: one per activity whose tier actually
 * changed (moves inside a tier are ordering, not placement).
 */
export function tierEvents(
  userId: string,
  changes: { activityId: string; from: string | null; to: string | null }[],
  meta?: Prisma.InputJsonValue,
): EventInput[] {
  return changes
    .filter((c) => c.from !== c.to)
    .map((c) => ({ userId, activityId: c.activityId, kind: 'tier' as const, from: c.from, to: c.to, ...(meta !== undefined ? { meta } : {}) }));
}

/**
 * The single `queue` event for a queue save (spec F1: one per save, not per
 * row). It is attached to the item that moved, with its 1-based positions in
 * `from` / `to`. When several items moved at once, the first one that changed
 * place is used and `meta.moved` counts them. Null when nothing moved.
 */
export function queueMoveEvent(
  userId: string,
  before: string[],
  after: string[],
): EventInput | null {
  // Compare only ids present in both lists, in their relative orders.
  const inAfter = new Set(after);
  const inBefore = new Set(before);
  const b = before.filter((id) => inAfter.has(id));
  const a = after.filter((id) => inBefore.has(id));
  if (b.every((id, i) => a[i] === id)) return null;

  // A single drag: the item whose removal makes both orders equal.
  const without = (list: string[], id: string) => list.filter((x) => x !== id);
  const same = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i]);
  const single = a.find((id) => same(without(a, id), without(b, id)));
  const changed = a.filter((id, i) => b[i] !== id);
  const moved = single ?? changed[0];

  return {
    userId,
    activityId: moved,
    kind: 'queue',
    from: String(b.indexOf(moved) + 1),
    to: String(a.indexOf(moved) + 1),
    meta: { moved: single ? 1 : changed.length },
  };
}
