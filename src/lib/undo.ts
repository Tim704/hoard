// ───────────────────────────────────────────────────────────────────────────
//  Undo (spec 1.6). Pure planning only: what to read before a remove, how to
//  recreate it afterwards, and how to validate a status-change undo. The
//  server actions in src/lib/actions/media.ts run these plans; the snapshots
//  themselves stay on the server (src/lib/undo-store.ts) and the client only
//  ever holds a random token, so a forged snapshot can't write anything.
//
//  ADDING A CHILD TABLE: any model that hangs off UserMediaActivity with
//  `activityId … onDelete: Cascade` (DiaryEntry, PlaySession, SeasonActivity,
//  YearDuelScore, …) must come back on Undo. Add its Prisma accessor name to
//  SNAPSHOT_CHILDREN below — that one line is all: snapshotPlan reads its rows,
//  restorePlan recreates them with the same ids (after the activity, in list
//  order, so list a table after anything it references), and the round-trip
//  test in undo.test.ts covers every listed model. Child rows must carry
//  `activityId`; a `userId` column, when present, is checked too.
// ───────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

import { scoreValue, type EventInput } from './events';
import { normalizeRating } from './rating';
import { STATUSES, type Status } from './status';
import { isTierEligible, TIERS, type Tier } from './tiers';

export const SNAPSHOT_CHILDREN = ['activityEvent', 'diaryEntry', 'playSession'] as const;
export type ChildModel = (typeof SNAPSHOT_CHILDREN)[number];

/** A database row as Prisma returns it (column → value). */
export type Row = Record<string, unknown>;

export interface ActivitySnapshot {
  activity: Row & { id: string; userId: string };
  children: Record<ChildModel, Row[]>;
}

export interface ReadStep {
  model: 'userMediaActivity' | ChildModel;
  where: Row;
}

/** The reads that capture an activity and everything that cascades from it. */
export function snapshotPlan(activityId: string): { activity: ReadStep; children: ReadStep[] } {
  return {
    activity: { model: 'userMediaActivity', where: { id: activityId } },
    children: SNAPSHOT_CHILDREN.map((model) => ({ model, where: { activityId } })),
  };
}

export interface CreateStep {
  model: 'userMediaActivity' | ChildModel;
  data: Row[];
}

/**
 * Prisma `createMany` input for a row: null columns are left out, so they
 * fall back to null (none of our nullable columns has another default), and
 * a JSON column stored as null — which Prisma refuses as a plain `null` —
 * stays null too.
 */
function createInput(row: Row): Row {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== null && v !== undefined));
}

/**
 * The writes that recreate a snapshot with its original ids: the activity
 * first, then each child table in SNAPSHOT_CHILDREN order. Throws when the
 * snapshot isn't wholly `userId`'s own activity (defence in depth; snapshots
 * never come from the client). `activityOverrides` patches the activity row
 * (e.g. dropping a franchise that no longer exists).
 */
export function restorePlan(
  snapshot: ActivitySnapshot,
  userId: string,
  activityOverrides: Row = {},
): CreateStep[] {
  const { activity } = snapshot;
  if (activity.userId !== userId) throw new Error('Snapshot belongs to another user.');
  const steps: CreateStep[] = [
    { model: 'userMediaActivity', data: [createInput({ ...activity, ...activityOverrides })] },
  ];
  for (const model of SNAPSHOT_CHILDREN) {
    const rows = snapshot.children[model] ?? [];
    for (const row of rows) {
      if (row.activityId !== activity.id) throw new Error(`A ${model} row belongs to another activity.`);
      if ('userId' in row && row.userId !== userId) throw new Error(`A ${model} row belongs to another user.`);
    }
    if (rows.length) steps.push({ model, data: rows.map(createInput) });
  }
  return steps;
}

// ── Status-change undo ───────────────────────────────────────────────────────

/** The per-user state a status change can alter, as sent to and from the client. */
export interface ActivityState {
  status: Status;
  rating: number | null;
  queueOrder: number | null;
  finishedAt: string | null; // ISO
  tier: Tier | null;
  rankOrder: number | null;
  progress: number | null;
  /** 3.1: a repeat run in progress (Watch again / finishing flips it). */
  rewatching: boolean;
}

/** The state a client may ask to restore: only these fields, each optional. */
export const ActivityStateSchema = z
  .object({
    status: z.enum(STATUSES),
    rating: z.number().min(0).max(10).nullable(),
    queueOrder: z.number().finite().nullable(),
    finishedAt: z.string().datetime().nullable(),
    tier: z.enum(TIERS).nullable(),
    rankOrder: z.number().finite().nullable(),
    progress: z.number().int().min(0).max(100_000).nullable(),
    rewatching: z.boolean(),
  })
  .partial()
  .strict();

export type ActivityStatePatch = z.infer<typeof ActivityStateSchema>;

/** Pick the restorable state off a stored activity row. */
export function stateOf(row: {
  status: string;
  rating: number | null;
  queueOrder: number | null;
  finishedAt: Date | null;
  tier: string | null;
  rankOrder: number | null;
  progress: number | null;
  rewatching?: boolean;
}): ActivityState {
  return {
    status: row.status as Status,
    rating: row.rating,
    queueOrder: row.queueOrder,
    finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
    tier: row.tier as Tier | null,
    rankOrder: row.rankOrder,
    progress: row.progress,
    rewatching: row.rewatching ?? false,
  };
}

/**
 * Turn a validated restore request into the row update and the events that
 * describe it (status, score, tier and progress — the same kinds a normal
 * edit writes). A tier only sticks while the restored status is tier-eligible.
 */
export function planStateRestore(
  ids: { userId: string; activityId: string },
  current: ActivityState,
  wanted: ActivityStatePatch,
): { data: Row; events: EventInput[] } {
  const data: Row = { ...wanted };
  // Same one-decimal rounding as updateActivity (the schema already bounds 0–10).
  if (typeof wanted.rating === 'number') data.rating = normalizeRating(wanted.rating);
  if (wanted.finishedAt !== undefined) {
    data.finishedAt = wanted.finishedAt === null ? null : new Date(wanted.finishedAt);
  }
  const status = wanted.status ?? current.status;
  if (!isTierEligible(status) && (wanted.tier ?? current.tier) !== null) data.tier = null;

  const next: ActivityState = {
    ...current,
    ...wanted,
    rating: data.rating !== undefined ? (data.rating as number | null) : current.rating,
    tier: data.tier !== undefined ? (data.tier as Tier | null) : current.tier,
  };
  const events: EventInput[] = [];
  if (next.status !== current.status) {
    events.push({ ...ids, kind: 'status', from: current.status, to: next.status, meta: { undo: true } });
  }
  if (scoreValue(next.rating) !== scoreValue(current.rating)) {
    events.push({ ...ids, kind: 'score', from: scoreValue(current.rating), to: scoreValue(next.rating), meta: { undo: true } });
  }
  if (next.tier !== current.tier) {
    events.push({ ...ids, kind: 'tier', from: current.tier, to: next.tier, meta: { undo: true } });
  }
  if (next.progress !== current.progress) {
    events.push({
      ...ids,
      kind: 'progress',
      from: current.progress == null ? null : String(current.progress),
      to: next.progress == null ? null : String(next.progress),
      meta: { undo: true },
    });
  }
  return { data, events };
}
