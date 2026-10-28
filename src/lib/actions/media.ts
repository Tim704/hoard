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
import { addMediaForUser, newManualExternalId } from '@/lib/library/add';
import { seenSeasonCountNow, userToday } from '@/lib/library/seen-seasons';
import { recordsSeenSeasons } from '@/lib/new-seasons';
import {
  isManualId,
  manualResult,
  parseManualInput,
  type ManualInput,
} from '@/lib/manual';
import { normalizeRating } from '@/lib/rating';
import { requireUser } from '@/lib/session';
import { searchProvider, enrichResult } from '@/lib/apis';
import { appendQueueOrder, revalidateCategory } from '@/lib/actions/shared';
import { eventsForUpdate, recordEvent, recordEvents } from '@/lib/events';
import { validProgress } from '@/lib/progress';
import { getPrefs } from '@/lib/data-prefs';
import { applyDiaryForUpdate, touchesDiary, undoDiaryForRestore } from '@/lib/diary';
import {
  ActivityStateSchema,
  planStateRestore,
  restorePlan,
  snapshotPlan,
  stateOf,
  type ActivitySnapshot,
  type ActivityState,
  type Row,
} from '@/lib/undo';
import { undoStore } from '@/lib/undo-store';
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
 * Add a search result to the current user's library (see `addMediaForUser`):
 * upsert the canonical media row, then create a COMPLETED or PLANNED activity
 * — unless one already exists, which is returned unchanged (`existing`).
 */
export async function addToList(
  slug: CategorySlug,
  result: NormalizedResult,
  status: 'COMPLETED' | 'PLANNED',
): Promise<{ ok: boolean; error?: string; activityId?: string; existing: boolean }> {
  const cat = getCategory(slug);
  if (!cat) return { ok: false, error: 'Unknown category.', existing: false };
  if (status !== 'COMPLETED' && status !== 'PLANNED') {
    return { ok: false, error: 'Unknown status.', existing: false };
  }
  // Hand-made rows belong to whoever made them: they are only ever written by
  // addManualEntry / updateManualEntry, never by a (client-sent) search hit.
  if (typeof result?.externalId !== 'string' || isManualId(result.externalId)) {
    return { ok: false, error: 'Could not add that item.', existing: false };
  }

  try {
    const user = await requireUser();

    // Best-effort enrich the result with extra provider detail (runtime,
    // episode counts, …) before persisting, so dashboard metrics have data.
    const enriched = await enrichResult(slug, result);

    const { activityId, existing } = await addMediaForUser(user.id, slug, enriched.result, {
      status,
      metaFetchedAt: enriched.metaFetchedAt,
      seasons: enriched.seasons,
    });

    revalidateCategory(slug);
    revalidatePath('/franchises');
    return { ok: true, activityId, existing };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to add item.';
    return { ok: false, error, existing: false };
  }
}

/**
 * Add a title the providers don't know (spec 1.5). Every manual add creates
 * its own catalogue row (`manual:<id>`), so later edits only ever touch the
 * adding user's row. Status is COMPLETED or PLANNED, as in the search results.
 */
export async function addManualEntry(
  slug: CategorySlug,
  input: ManualInput,
  status: 'COMPLETED' | 'PLANNED',
): Promise<{ ok: boolean; error?: string; activityId?: string }> {
  const cat = getCategory(slug);
  if (!cat) return { ok: false, error: 'Unknown category.' };
  if (status !== 'COMPLETED' && status !== 'PLANNED') return { ok: false, error: 'Unknown status.' };
  const parsed = parseManualInput(slug, input);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  try {
    const user = await requireUser();
    const externalId = newManualExternalId();
    const { activityId } = await addMediaForUser(
      user.id,
      slug,
      manualResult(externalId, parsed.fields),
      { status },
    );
    revalidateCategory(slug);
    revalidatePath('/franchises');
    return { ok: true, activityId };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to add item.';
    return { ok: false, error };
  }
}

/**
 * Edit a manual entry's details (title, year, cover, description, counts).
 * Only for the caller's own activity, and only when its media row is manual —
 * provider rows are shared and never edited by hand.
 */
export async function updateManualEntry(
  activityId: string,
  input: ManualInput,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const activity = await prisma.userMediaActivity.findUnique({ where: { id: activityId } });
    if (!activity || activity.userId !== user.id) return { ok: false, error: 'Not found.' };
    const cat = CATEGORY_LIST.find((c) => c.dbCategory === activity.category);
    const mediaId = cat ? activity[cat.fkField] : null;
    if (!cat || !mediaId) return { ok: false, error: 'Not found.' };

    const media = await (prisma as any)[cat.prismaModel].findUnique({ where: { id: mediaId } });
    if (!media || !isManualId(media.externalId)) {
      return { ok: false, error: 'Only titles you added yourself can be edited.' };
    }
    const parsed = parseManualInput(cat.slug, input);
    if (!parsed.ok) return { ok: false, error: parsed.error };

    await (prisma as any)[cat.prismaModel].update({ where: { id: mediaId }, data: parsed.fields });
    revalidateCategory(cat.slug);
    revalidatePath('/franchises');
    revalidatePath('/dashboard');
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Could not save those details.';
    return { ok: false, error };
  }
}

/**
 * Update per-user state on an activity (status / rating / favorite / notes).
 * Verifies ownership first. When the status transitions to COMPLETED and no
 * finish date is recorded yet, stamps `finishedAt` with the current time.
 * Finishing a run also logs a diary entry, and a score given right after
 * lands on today's entry (src/lib/diary.ts).
 * Returns the state from before the change (`previous`) so a toast can offer
 * Undo through `restoreActivityState`.
 */
export async function updateActivity(
  id: string,
  data: {
    status?: Status;
    rating?: number | null;
    favorite?: boolean;
    notes?: string;
  },
): Promise<ActionResult & { previous?: ActivityState }> {
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
      seenSeasonCount?: number | null;
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

    // 5.5: finishing or starting a show records its season count (this also
    // clears a "New season" badge). Tiers are untouched.
    if (recordsSeenSeasons(activity.category, activity.status as Status, data.status)) {
      patch.seenSeasonCount = await seenSeasonCountNow(activity.tvShowId, await userToday(user.id));
    }

    const events = eventsForUpdate(
      { userId: user.id, activityId: id },
      { status: activity.status, rating: activity.rating },
      { status: patch.status, rating: patch.rating },
    );
    // The diary (3.1): finishes, score changes and the end of a repeat run.
    const diaryChange = { status: patch.status, rating: patch.rating };
    const diaryPrefs = touchesDiary(activity, diaryChange) ? await getPrefs(user.id) : null;
    const { diaryEntryId } = await prisma.$transaction(async (tx) => {
      await tx.userMediaActivity.update({ where: { id }, data: patch as any });
      await recordEvents(tx, events);
      return diaryPrefs ? applyDiaryForUpdate(tx, activity, diaryChange, diaryPrefs) : { diaryEntryId: undefined };
    });

    const slug = slugForDbCategory(activity.category as DbCategory);
    if (slug) revalidateCategory(slug);
    // Undo deletes exactly the diary entry this finish wrote.
    return { ok: true, previous: { ...stateOf(activity), ...(diaryEntryId ? { diaryEntryId } : {}) } };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to update item.';
    return { ok: false, error };
  }
}

/**
 * Set how far the user is through a title (pages, chapters, episodes, tracks;
 * null stops tracking). One `progress` event per call — the client batches
 * rapid +1 taps and saves typed values on blur/Enter, so one change is one
 * event. Never changes the status (reaching the total only offers to).
 */
export async function setProgress(id: string, progress: number | null): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (progress !== null && validProgress(progress) === null) {
      return { ok: false, error: 'Progress must be a whole number.' };
    }

    const activity = await prisma.userMediaActivity.findUnique({ where: { id } });
    if (!activity || activity.userId !== user.id) {
      return { ok: false, error: 'Not found.' };
    }
    if (activity.progress === progress) return { ok: true };

    await prisma.$transaction([
      prisma.userMediaActivity.update({ where: { id }, data: { progress } }),
      recordEvent(prisma, {
        userId: user.id,
        activityId: id,
        kind: 'progress',
        from: activity.progress == null ? null : String(activity.progress),
        to: progress == null ? null : String(progress),
      }),
    ]);

    const slug = slugForDbCategory(activity.category as DbCategory);
    if (slug) revalidateCategory(slug);
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to save progress.';
    return { ok: false, error };
  }
}

/**
 * Remove an activity from the current user's library (verifies ownership).
 * The row and everything that cascades from it are snapshotted first and kept
 * on the server for a short while; the returned `undoToken` lets
 * `restoreActivity` bring it all back with the same ids.
 */
export async function removeActivity(
  id: string,
): Promise<ActionResult & { undoToken?: string }> {
  try {
    const user = await requireUser();

    const activity = await prisma.userMediaActivity.findUnique({ where: { id } });
    if (!activity || activity.userId !== user.id) {
      return { ok: false, error: 'Not found.' };
    }

    // Read the snapshot and delete in one transaction, so nothing written in
    // between is lost without being captured.
    const plan = snapshotPlan(id);
    const snapshot = await prisma.$transaction(async (tx) => {
      const db = tx as any; // sanctioned dynamic model access (see src/lib/undo.ts)
      const row = await db[plan.activity.model].findUnique({ where: plan.activity.where });
      if (!row || row.userId !== user.id) return null;
      const children: Record<string, Row[]> = {};
      for (const step of plan.children) {
        children[step.model] = await db[step.model].findMany({ where: step.where });
      }
      await tx.userMediaActivity.delete({ where: { id } });
      return { activity: row, children } as ActivitySnapshot;
    });
    if (!snapshot) return { ok: false, error: 'Not found.' };
    const undoToken = undoStore.put(user.id, snapshot);

    const slug = slugForDbCategory(activity.category as DbCategory);
    if (slug) revalidateCategory(slug);
    return { ok: true, undoToken };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Failed to remove item.';
    return { ok: false, error };
  }
}

/**
 * Undo a remove: recreate the activity and its child rows (events, …) with
 * their original ids, in one transaction, plus a `removed-undone` event. Only
 * the user who removed it can restore it, and only while the token is fresh.
 */
export async function restoreActivity(undoToken: string): Promise<ActionResult> {
  const tooLate = { ok: false, error: 'Too late to undo.' };
  try {
    const user = await requireUser();
    if (typeof undoToken !== 'string' || !undoToken) return tooLate;
    const snapshot = undoStore.get(undoToken, user.id);
    if (!snapshot) return tooLate;

    const { activity } = snapshot;
    const cat = CATEGORY_LIST.find((c) => c.dbCategory === activity.category);
    if (!cat) return tooLate;
    const mediaId = activity[cat.fkField];

    // Media rows are never deleted, but check rather than fail on the FK.
    const media = await (prisma as any)[cat.prismaModel].findUnique({ where: { id: mediaId } });
    if (!media) return { ok: false, error: 'That title is no longer available.' };

    // Added again in the meantime? Then there is nothing to bring back.
    const again = await prisma.userMediaActivity.findFirst({
      where: { userId: user.id, [cat.fkField]: mediaId } as any,
    });
    if (again) return { ok: false, error: 'It is already back in your list.' };

    // A franchise deleted since the remove is simply left off.
    const overrides: Row = {};
    if (typeof activity.franchiseId === 'string') {
      const franchise = await prisma.franchise.findFirst({
        where: { id: activity.franchiseId, userId: user.id },
      });
      if (!franchise) Object.assign(overrides, { franchiseId: null, franchiseLocked: false });
    }

    const steps = restorePlan(snapshot, user.id, overrides);
    await prisma.$transaction(async (tx) => {
      const db = tx as any; // sanctioned dynamic model access (see src/lib/undo.ts)
      for (const step of steps) await db[step.model].createMany({ data: step.data });
      await recordEvent(tx, { userId: user.id, activityId: activity.id, kind: 'removed-undone' });
    });
    undoStore.drop(undoToken);

    revalidateCategory(cat.slug);
    revalidatePath('/franchises');
    return { ok: true };
  } catch (err) {
    console.error('[undo] restore failed:', err);
    return { ok: false, error: 'Could not undo that.' };
  }
}

/**
 * Undo a status change: put back the state `updateActivity` reported as
 * `previous`. The client sends it, so it is validated (only status, rating,
 * queueOrder, finishedAt, tier, rankOrder, progress and rewatching; sane values) and only
 * ever applied to the caller's own activity. Writes events like any edit.
 * `diaryEntryId` (the entry the undone finish wrote) is deleted only when it
 * is this user's entry of this activity.
 */
export async function restoreActivityState(
  id: string,
  previous: unknown,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = ActivityStateSchema.safeParse(previous);
    if (!parsed.success) return { ok: false, error: 'Could not undo that.' };

    const activity = await prisma.userMediaActivity.findUnique({ where: { id } });
    if (!activity || activity.userId !== user.id) {
      return { ok: false, error: 'Not found.' };
    }

    const { data, events } = planStateRestore(
      { userId: user.id, activityId: id },
      stateOf(activity),
      parsed.data,
    );
    // The diary (3.1): delete exactly the entry the undone finish wrote, and
    // give today's entry back the restored score.
    const wanted = parsed.data;
    const diaryPrefs = wanted.diaryEntryId || wanted.rating !== undefined ? await getPrefs(user.id) : null;
    await prisma.$transaction(async (tx) => {
      await tx.userMediaActivity.update({ where: { id }, data: data as any });
      await recordEvents(tx, events);
      if (diaryPrefs) {
        await undoDiaryForRestore(
          tx,
          { userId: user.id, activityId: id },
          {
            status: wanted.status ?? activity.status,
            ratingBefore: activity.rating,
            rating: data.rating === undefined ? undefined : (data.rating as number | null),
          },
          wanted.diaryEntryId,
          diaryPrefs,
        );
      }
    });

    const slug = slugForDbCategory(activity.category as DbCategory);
    if (slug) revalidateCategory(slug);
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Could not undo that.';
    return { ok: false, error };
  }
}
