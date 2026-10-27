'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Media server actions — search providers and mutate the user's library.
//
//  Every mutating action: authenticates (requireUser), scopes to that user,
//  performs the write, then revalidates the affected category page so server
//  components re-render with fresh data. Failures are caught and returned as a
//  serializable `ActionResult` rather than thrown (these are called from forms).
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import {
  getCategory,
  CATEGORY_LIST,
  type CategorySlug,
  type DbCategory,
} from '@/lib/categories';
import { normalizeRating } from '@/lib/rating';
import { requireUser } from '@/lib/session';
import { searchProvider, enrichResult } from '@/lib/apis';
import { autoGroupAfterAdd } from '@/lib/franchise/auto';
import { appendQueueOrder, revalidateCategory } from '@/lib/actions/shared';
import type {
  NormalizedResult,
  SearchResponse,
  ActionResult,
} from '@/lib/types';
import type { Status } from '@/lib/status';

/**
 * Search the external provider for a category. Pure delegation — the provider
 * layer owns query trimming, fetching, and error wrapping.
 */
export async function searchMedia(
  slug: CategorySlug,
  query: string,
): Promise<SearchResponse> {
  return searchProvider(slug, query);
}

/** Resolve the URL slug for a stored DB category enum value (e.g. BOOK → books). */
function slugForDbCategory(dbCategory: DbCategory): CategorySlug | undefined {
  return CATEGORY_LIST.find((c) => c.dbCategory === dbCategory)?.slug;
}

/**
 * Add a search result to the current user's library:
 *  1. Upsert the canonical media row (keyed by its provider `externalId`).
 *  2. Create an activity (COMPLETED or PLANNED) linking the user to that media
 *     — unless one already exists, which is returned unchanged (`existing`).
 */
export async function addToList(
  slug: CategorySlug,
  result: NormalizedResult,
  status: 'COMPLETED' | 'PLANNED',
): Promise<{ ok: boolean; error?: string; activityId?: string; existing: boolean }> {
  const cat = getCategory(slug);
  if (!cat) return { ok: false, error: 'Unknown category.', existing: false };

  try {
    const user = await requireUser();

    // Best-effort enrich the result with extra provider detail (runtime,
    // episode counts, …) before persisting, so dashboard metrics have data.
    result = await enrichResult(slug, result);

    // Upsert the shared media row. `result.fields` is the exact column payload
    // for this category's table (per the provider contract).
    const media = await (prisma as any)[cat.prismaModel].upsert({
      where: { externalId: result.externalId },
      update: result.fields,
      create: result.fields,
    });

    // Only create the join row if the user hasn't already added this item.
    const existing = await prisma.userMediaActivity.findFirst({
      where: { userId: user.id, [cat.fkField]: media.id } as any,
    });

    // Reuse the pre-existing activity id when present, else the newly created one.
    let activityId: string;
    if (existing) {
      activityId = existing.id;
    } else {
      // PLANNED rows join the bottom of the category's Up next queue.
      const queueOrder =
        status === 'PLANNED' ? await appendQueueOrder(user.id, cat.dbCategory) : null;
      const created = await prisma.userMediaActivity.create({
        data: {
          userId: user.id,
          category: cat.dbCategory,
          status,
          queueOrder,
          finishedAt: status === 'COMPLETED' ? new Date() : null,
          [cat.fkField]: media.id,
        } as any,
      });
      activityId = created.id;
      // Group the new title with the rest of its franchise (best-effort).
      await autoGroupAfterAdd(user.id, slug, media);
    }

    revalidateCategory(slug);
    revalidatePath('/franchises');
    return { ok: true, activityId, existing: !!existing };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to add item.';
    return { ok: false, error, existing: false };
  }
}

/**
 * Update per-user state on an activity (status / rating / favorite / notes).
 * Verifies ownership first. When the status transitions to COMPLETED and no
 * finish date is recorded yet, stamps `finishedAt` with the current time.
 */
export async function updateActivity(
  id: string,
  data: {
    status?: Status;
    rating?: number | null;
    favorite?: boolean;
    notes?: string;
  },
): Promise<ActionResult> {
  try {
    const user = await requireUser();

    const activity = await prisma.userMediaActivity.findUnique({ where: { id } });
    if (!activity || activity.userId !== user.id) {
      return { ok: false, error: 'Not found.' };
    }

    // Build the patch from only the provided fields.
    const patch: {
      status?: Status;
      rating?: number | null;
      favorite?: boolean;
      notes?: string;
      finishedAt?: Date;
      queueOrder?: number | null;
    } = {};

    if (data.status !== undefined) patch.status = data.status;
    if (data.rating !== undefined) {
      if (typeof data.rating === 'number') {
        const rating = normalizeRating(data.rating);
        if (rating === null) return { ok: false, error: 'Score must be between 0 and 10.' };
        patch.rating = rating;
      } else {
        patch.rating = null;
      }
    }
    if (data.favorite !== undefined) patch.favorite = data.favorite;
    if (data.notes !== undefined) patch.notes = data.notes;

    // Stamp completion the first time an item is marked COMPLETED.
    if (data.status === 'COMPLETED' && !activity.finishedAt) {
      patch.finishedAt = new Date();
    }

    // Queue membership follows status: leaving PLANNED drops the position,
    // entering PLANNED joins the end of the category's queue.
    if (data.status !== undefined && data.status !== activity.status) {
      if (activity.status === 'PLANNED') {
        patch.queueOrder = null;
      } else if (data.status === 'PLANNED') {
        patch.queueOrder = await appendQueueOrder(user.id, activity.category as DbCategory);
      }
    }

    await prisma.userMediaActivity.update({ where: { id }, data: patch as any });

    const slug = slugForDbCategory(activity.category as DbCategory);
    if (slug) revalidateCategory(slug);
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to update item.';
    return { ok: false, error };
  }
}

/**
 * Remove an activity from the current user's library (verifies ownership).
 */
export async function removeActivity(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();

    const activity = await prisma.userMediaActivity.findUnique({ where: { id } });
    if (!activity || activity.userId !== user.id) {
      return { ok: false, error: 'Not found.' };
    }

    await prisma.userMediaActivity.delete({ where: { id } });

    const slug = slugForDbCategory(activity.category as DbCategory);
    if (slug) revalidateCategory(slug);
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to remove item.';
    return { ok: false, error };
  }
}
