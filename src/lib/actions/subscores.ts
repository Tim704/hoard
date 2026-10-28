'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Sub-score actions (spec 4.10). Saving sub-scores never touches the main
//  score; "Use as score" goes through updateActivity, so its events and
//  diary rules apply as for any score change.
// ───────────────────────────────────────────────────────────────────────────

import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST } from '@/lib/categories';
import { requireUser } from '@/lib/session';
import { revalidateCategory } from '@/lib/actions/shared';
import { parseSubScores, type SubScores } from '@/lib/subscores';
import type { ActionResult } from '@/lib/types';

/**
 * Replace a title's sub-scores with `scores` (unknown keys and invalid values
 * are dropped; an empty set clears the column). Own titles only.
 */
export async function setSubScores(
  activityId: string,
  scores: unknown,
): Promise<ActionResult & { subScores?: SubScores }> {
  try {
    if (typeof activityId !== 'string') return { ok: false, error: 'Not found.' };
    const user = await requireUser();
    const activity = await prisma.userMediaActivity.findUnique({
      where: { id: activityId },
      select: { id: true, userId: true, category: true },
    });
    if (!activity || activity.userId !== user.id) return { ok: false, error: 'Not found.' };
    const cat = CATEGORY_LIST.find((c) => c.dbCategory === activity.category);
    if (!cat) return { ok: false, error: 'Not found.' };
    const clean = parseSubScores(cat.slug, scores);
    await prisma.userMediaActivity.update({
      where: { id: activityId },
      data: { subScores: Object.keys(clean).length ? clean : Prisma.DbNull },
    });
    revalidateCategory(cat.slug);
    return { ok: true, subScores: clean };
  } catch (err) {
    console.error('[subscores]', err instanceof Error ? err.message : err);
    return { ok: false, error: 'Could not save the sub-scores.' };
  }
}
