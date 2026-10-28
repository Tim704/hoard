'use server';

// ───────────────────────────────────────────────────────────────────────────
//  5.5 "Got it" on a "New season" badge: record the show's current season
//  count as seen. Only the caller's own TV activity; tiers are untouched.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { revalidateCategory } from '@/lib/actions/shared';
import { currentSeasonCount } from '@/lib/library/seen-seasons';
import { requireUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

export async function acknowledgeNewSeason(activityId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (typeof activityId !== 'string' || !activityId) return { ok: false, error: 'Not found.' };
    const a = await prisma.userMediaActivity.findUnique({
      where: { id: activityId },
      select: { userId: true, category: true, tvShowId: true },
    });
    if (!a || a.userId !== user.id || a.category !== 'TV') return { ok: false, error: 'Not found.' };
    const count = await currentSeasonCount(a.tvShowId);
    await prisma.userMediaActivity.update({ where: { id: activityId }, data: { seenSeasonCount: count } });
    revalidateCategory('tv');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save that.' };
  }
}
