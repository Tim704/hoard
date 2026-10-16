'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Franchise server actions — detection, editing, manual (re)assignment,
//  merging and the franchise ranking. Every action is scoped to the user and
//  verifies ownership before writing.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST, type CategorySlug } from '@/lib/categories';
import { requireUser } from '@/lib/session';
import { resolveMediaRow } from '@/lib/franchise/auto';
import { normalizeTitle } from '@/lib/franchise/normalize';
import { syncUserFranchises } from '@/lib/franchise/sync';
import type { ActionResult } from '@/lib/types';

/** Refresh every page that shows franchise data. */
function revalidateAll() {
  revalidatePath('/', 'layout');
}

function fail(err: unknown, fallback: string): ActionResult {
  return { ok: false, error: err instanceof Error ? err.message : fallback };
}

/** Time budget per detection step, well under the tunnel's request timeout. */
const STEP_BUDGET_MS = 20_000;

export interface DetectResult extends ActionResult {
  resolved: number;
  remaining: number;
  groups: number;
}

/**
 * One step of franchise detection: resolve as many of the user's not-yet-
 * resolved titles as fit in the time budget, then regroup. The client calls
 * this repeatedly until `remaining` is 0, showing progress in between.
 */
export async function detectFranchisesStep(): Promise<DetectResult> {
  try {
    const user = await requireUser();
    const started = Date.now();

    const pending: { slug: CategorySlug; media: any }[] = [];
    for (const cat of CATEGORY_LIST) {
      const rows = await prisma.userMediaActivity.findMany({
        where: {
          userId: user.id,
          category: cat.dbCategory,
          [cat.prismaModel]: { is: { franchiseName: null } },
        } as any,
        select: {
          [cat.prismaModel]: {
            select: { id: true, externalId: true, title: true, franchiseName: true },
          },
        } as any,
      });
      for (const row of rows as any[]) pending.push({ slug: cat.slug, media: row[cat.prismaModel] });
    }

    let resolved = 0;
    let failed = 0;
    for (const item of pending) {
      if (Date.now() - started > STEP_BUDGET_MS) break;
      if (await resolveMediaRow(item.slug, item.media)) resolved++;
      else failed++;
      // Pace provider calls (AniList in particular rate-limits aggressively).
      await new Promise((r) => setTimeout(r, 800));
      // Several provider failures in a row: stop instead of hammering the API.
      if (failed >= 3) break;
    }

    const groups = await syncUserFranchises(user.id);
    revalidateAll();
    if (failed >= 3) {
      return {
        ok: resolved > 0,
        error: 'Some providers are not responding. Run detection again later.',
        resolved,
        remaining: 0,
        groups,
      };
    }
    return { ok: true, resolved, remaining: pending.length - resolved, groups };
  } catch (err) {
    return { ...fail(err, 'Detection failed.'), resolved: 0, remaining: 0, groups: 0 };
  }
}

async function ownFranchise(userId: string, id: string) {
  const f = await prisma.franchise.findUnique({ where: { id } });
  return f && f.userId === userId ? f : null;
}

/** Rename, rate (1–10 or null), annotate, or set the cover of a franchise. */
export async function updateFranchise(
  id: string,
  data: { name?: string; rating?: number | null; notes?: string; imageUrl?: string | null },
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!(await ownFranchise(user.id, id))) return { ok: false, error: 'Not found.' };

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) {
      const name = data.name.trim();
      if (!name) return { ok: false, error: 'Name cannot be empty.' };
      const matchName = normalizeTitle(name) || name.toLowerCase();
      const clash = await prisma.franchise.findUnique({
        where: { userId_matchName: { userId: user.id, matchName } },
        select: { id: true },
      });
      if (clash && clash.id !== id) {
        return { ok: false, error: 'Another franchise already has that name. Merge them instead.' };
      }
      patch.name = name;
      patch.matchName = matchName;
    }
    if (data.rating !== undefined) {
      if (data.rating !== null && (data.rating < 1 || data.rating > 10)) {
        return { ok: false, error: 'Rating must be 1–10.' };
      }
      patch.rating = data.rating;
    }
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.imageUrl !== undefined) patch.imageUrl = data.imageUrl;

    await prisma.franchise.update({ where: { id }, data: patch });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to update franchise.');
  }
}

/**
 * Put a title into a franchise by hand: an existing franchise id, `null` to
 * take it out of any franchise, or `'new'` to start a new franchise named
 * after the title. Manual choices are locked against auto-detection.
 */
export async function assignFranchise(
  activityId: string,
  target: string | null,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const activity = await prisma.userMediaActivity.findUnique({
      where: { id: activityId },
      include: Object.fromEntries(CATEGORY_LIST.map((c) => [c.prismaModel, true])) as any,
    });
    if (!activity || activity.userId !== user.id) return { ok: false, error: 'Not found.' };

    let franchiseId: string | null = null;
    if (target === 'new') {
      const cat = CATEGORY_LIST.find((c) => c.dbCategory === activity.category);
      const media = cat ? (activity as any)[cat.prismaModel] : null;
      const name: string = media?.title ?? 'Untitled';
      const matchName = normalizeTitle(name) || name.toLowerCase();
      const f = await prisma.franchise.upsert({
        where: { userId_matchName: { userId: user.id, matchName } },
        update: {},
        create: { userId: user.id, name, matchName, imageUrl: media?.imageUrl ?? null },
      });
      franchiseId = f.id;
    } else if (target) {
      if (!(await ownFranchise(user.id, target))) return { ok: false, error: 'Franchise not found.' };
      franchiseId = target;
    }

    await prisma.userMediaActivity.update({
      where: { id: activityId },
      data: { franchiseId, franchiseLocked: true },
    });
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to update franchise.');
  }
}

/** Move every title of `sourceId` into `targetId`, then delete the source. */
export async function mergeFranchise(sourceId: string, targetId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (sourceId === targetId) return { ok: false, error: 'Pick a different franchise.' };
    const [src, dst] = await Promise.all([
      ownFranchise(user.id, sourceId),
      ownFranchise(user.id, targetId),
    ]);
    if (!src || !dst) return { ok: false, error: 'Not found.' };

    await prisma.$transaction([
      prisma.userMediaActivity.updateMany({
        where: { userId: user.id, franchiseId: sourceId },
        data: { franchiseId: targetId, franchiseLocked: true },
      }),
      prisma.franchise.delete({ where: { id: sourceId } }),
    ]);
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to merge.');
  }
}

/**
 * Delete a franchise. Its titles stay in the library, ungrouped, and are
 * locked so auto-detection does not immediately recreate the group.
 */
export async function deleteFranchise(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!(await ownFranchise(user.id, id))) return { ok: false, error: 'Not found.' };
    await prisma.$transaction([
      prisma.userMediaActivity.updateMany({
        where: { userId: user.id, franchiseId: id },
        data: { franchiseId: null, franchiseLocked: true },
      }),
      prisma.franchise.delete({ where: { id } }),
    ]);
    revalidateAll();
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to delete.');
  }
}

/** Persist the full franchise ranking (best first); others become unranked. */
export async function saveFranchiseRanking(orderedIds: string[]): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const owned = await prisma.franchise.findMany({
      where: { userId: user.id },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((o) => o.id));
    const ids = [...new Set(orderedIds)].filter((id) => ownedIds.has(id));
    await prisma.$transaction([
      prisma.franchise.updateMany({
        where: { userId: user.id, id: { notIn: ids } },
        data: { rankOrder: null },
      }),
      ...ids.map((id, i) =>
        prisma.franchise.update({ where: { id }, data: { rankOrder: (i + 1) * 1000 } }),
      ),
    ]);
    revalidatePath('/franchises');
    return { ok: true };
  } catch (err) {
    return fail(err, 'Failed to save ranking.');
  }
}
