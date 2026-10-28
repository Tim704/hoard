// ───────────────────────────────────────────────────────────────────────────
//  Adding a title to a user's library — the one write path behind the Add
//  dialog, "Select several", manual entries and (later) the importers.
//  Deliberately NOT a 'use server' module: it trusts its `userId` argument, so
//  it must never become a client-callable action. Callers authenticate first.
// ───────────────────────────────────────────────────────────────────────────

import { randomBytes } from 'crypto';

import type { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { getCategory, type CategorySlug } from '@/lib/categories';
import { getPrefs } from '@/lib/data-prefs';
import { isDiaryStatus, onFinished } from '@/lib/diary';
import { recordEvent } from '@/lib/events';
import { autoGroupAfterAdd } from '@/lib/franchise/auto';
import { saveTvSeasons } from '@/lib/library/tv-seasons';
import type { TvSeasonData } from '@/lib/apis/tmdb';
import { catalogueCreatePayload, fillOnlyUpdate } from '@/lib/media-upsert';
import { MANUAL_PREFIX } from '@/lib/manual';
import { recordsSeenSeasons } from '@/lib/new-seasons';
import { nextQueueOrder } from '@/lib/queue';
import type { Status } from '@/lib/status';
import type { NormalizedResult } from '@/lib/types';

export interface AddOptions {
  status: Status;
  /** 0–10, already validated by the caller. */
  rating?: number | null;
  /** Defaults to now for COMPLETED, else null. */
  finishedAt?: Date | null;
  startedAt?: Date | null;
  progress?: number | null;
  /** Free-form labels (4.2); imports store shelves / custom lists here. */
  tags?: string[];
  notes?: string | null;
  favorite?: boolean;
  /** Skip franchise auto-grouping (bulk callers regroup once at the end). */
  skipFranchise?: boolean;
  /**
   * Don't log a diary entry for a title added as finished (imports write
   * their own dated entries; see src/lib/diary.ts).
   */
  skipDiary?: boolean;
  eventKind?: 'added' | 'import';
  /**
   * Runs inside the add's transaction right after a NEW activity was created
   * (not for an existing one), so its extra rows land atomically with it.
   */
  afterCreate?: (tx: Prisma.TransactionClient, activityId: string) => Promise<unknown>;
  eventMeta?: Prisma.InputJsonValue;
  /**
   * When a provider lookup for this result succeeded (server-side, from
   * `enrichResult`): stamped on a newly created row only. Client `fields`
   * can never set it.
   */
  metaFetchedAt?: Date | null;
  /** TV: the show's seasons from the same server-side lookup (3.3). */
  seasons?: TvSeasonData[] | null;
}

export interface AddOutcome {
  activityId: string;
  /** True when the user already had this title; it is returned unchanged. */
  existing: boolean;
}

/**
 * Create the shared media row (keyed by its provider `externalId`; an existing
 * row only has its empty columns filled, never overwritten) and, unless the user
 * already has it, create their activity — joining the bottom of Up next when
 * PLANNED — with its `added`/`import` event, all in one transaction. Franchise
 * grouping runs afterwards (best-effort) unless `skipFranchise`.
 */
export async function addMediaForUser(
  userId: string,
  slug: CategorySlug,
  result: NormalizedResult,
  opts: AddOptions,
): Promise<AddOutcome> {
  const cat = getCategory(slug);
  if (!cat) throw new Error('Unknown category.');
  const { status } = opts;
  // Added as finished = finished today (3.1), unless the caller logs its own.
  const diaryPrefs = !opts.skipDiary && isDiaryStatus(status) ? await getPrefs(userId) : null;

  const outcome = await prisma.$transaction(async (tx) => {
    const media = await upsertCatalogueRow(tx, slug, result, opts.metaFetchedAt ?? null);

    if (slug === 'tv' && opts.seasons?.length) {
      await saveTvSeasons(tx, media.id, opts.seasons, { insertOnly: true });
    }

    const existing = await tx.userMediaActivity.findFirst({
      where: { userId, [cat.fkField]: media.id } as any,
      select: { id: true },
    });
    if (existing) return { activityId: existing.id, existing: true, media };

    // PLANNED rows join the bottom of the category's Up next queue.
    let queueOrder: number | null = null;
    if (status === 'PLANNED') {
      const top = await tx.userMediaActivity.aggregate({
        where: { userId, category: cat.dbCategory },
        _max: { queueOrder: true },
      });
      queueOrder = nextQueueOrder(top._max.queueOrder);
    }

    const created = await tx.userMediaActivity.create({
      data: {
        userId,
        category: cat.dbCategory,
        status,
        queueOrder,
        rating: opts.rating ?? null,
        progress: opts.progress ?? null,
        tags: opts.tags ?? [],
        notes: opts.notes ?? null,
        favorite: opts.favorite ?? false,
        startedAt: opts.startedAt ?? null,
        finishedAt:
          opts.finishedAt !== undefined
            ? opts.finishedAt
            : status === 'COMPLETED'
              ? new Date()
              : null,
        [cat.fkField]: media.id,
        // 5.5: a show added as watched or ongoing has seen its current seasons.
        ...(recordsSeenSeasons(slug, null, status) ? { seenSeasonCount: media.seasonCount ?? null } : {}),
      } as any,
    });
    await recordEvent(tx, {
      userId,
      activityId: created.id,
      kind: opts.eventKind ?? 'added',
      to: status,
      ...(opts.eventMeta !== undefined ? { meta: opts.eventMeta } : {}),
    });
    if (diaryPrefs) {
      await onFinished(tx, { id: created.id, userId, rating: created.rating, rewatching: false }, diaryPrefs);
    }
    if (opts.afterCreate) await opts.afterCreate(tx, created.id);
    return { activityId: created.id, existing: false, media };
  });

  // Group the new title with the rest of its franchise (best-effort).
  if (!outcome.existing && !opts.skipFranchise) {
    await autoGroupAfterAdd(userId, slug, outcome.media);
  }
  return { activityId: outcome.activityId, existing: outcome.existing };
}

/**
 * The shared catalogue row for a search hit (spec G2): client-sent `fields`
 * never overwrite it. A new row is created with its externalId pinned; an
 * existing one only has empty columns filled in. (Upsert with an empty update
 * covers a concurrent add.) Returns the row. Also used by custom lists (4.11),
 * which point at catalogue rows without touching anyone's library.
 */
export async function upsertCatalogueRow(
  tx: Prisma.TransactionClient,
  slug: CategorySlug,
  result: NormalizedResult,
  metaFetchedAt: Date | null,
): Promise<any> {
  const cat = getCategory(slug);
  if (!cat) throw new Error('Unknown category.');
  const db = tx as any; // sanctioned dynamic model access (seven media tables)
  const where = { externalId: result.externalId };
  let media = await db[cat.prismaModel].findUnique({ where });
  if (!media) {
    media = await db[cat.prismaModel].upsert({
      where,
      update: {},
      create: {
        ...catalogueCreatePayload(result.externalId, result.fields),
        ...(metaFetchedAt ? { metaFetchedAt } : {}),
      },
    });
  } else {
    const fill = fillOnlyUpdate(media, result.fields);
    if (Object.keys(fill).length > 0) {
      media = await db[cat.prismaModel].update({ where: { id: media.id }, data: fill });
    }
  }
  return media;
}

/**
 * A new hand-made row's externalId: `manual:` plus a collision-resistant id
 * (cuid-like: time + randomness), so every manual add gets its own row.
 */
export function newManualExternalId(): string {
  return MANUAL_PREFIX + 'c' + Date.now().toString(36) + randomBytes(9).toString('hex');
}
