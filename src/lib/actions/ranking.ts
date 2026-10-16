'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Ranking server actions — the user's manual, drag-and-drop order per
//  category. The client always sends the complete ordered list of ranked ids;
//  positions are rewritten as 1000, 2000, … so there is never any drift, and
//  anything left out of the list becomes unranked again.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { getCategory, type CategorySlug } from '@/lib/categories';
import { getRankBoard } from '@/lib/data';
import { requireUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

const STEP = 1000;

function revalidate(slug: CategorySlug) {
  revalidatePath('/' + slug);
  revalidatePath('/' + slug + '/arena');
}

/**
 * Persist the full manual ranking for a category. `orderedIds` is best-first;
 * every other activity in the category is cleared to unranked. Ids that do not
 * belong to the user (or the category) are ignored.
 */
export async function saveRanking(
  slug: CategorySlug,
  orderedIds: string[],
): Promise<ActionResult> {
  const cat = getCategory(slug);
  if (!cat) return { ok: false, error: 'Unknown category.' };

  try {
    const user = await requireUser();
    const owned = await prisma.userMediaActivity.findMany({
      where: { userId: user.id, category: cat.dbCategory },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((o) => o.id));
    const ids = [...new Set(orderedIds)].filter((id) => ownedIds.has(id));

    await prisma.$transaction([
      prisma.userMediaActivity.updateMany({
        where: { userId: user.id, category: cat.dbCategory, id: { notIn: ids } },
        data: { rankOrder: null },
      }),
      ...ids.map((id, i) =>
        prisma.userMediaActivity.update({
          where: { id },
          data: { rankOrder: (i + 1) * STEP },
        }),
      ),
    ]);

    revalidate(slug);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save ranking.' };
  }
}

/**
 * Append every unranked-but-rankable item to the bottom of the ranking, ordered
 * by rating then hidden Elo. Existing positions are kept.
 */
export async function seedRanking(slug: CategorySlug): Promise<ActionResult> {
  try {
    await requireUser();
    const { ranked, unranked } = await getRankBoard(slug);
    return saveRanking(slug, [...ranked, ...unranked].map((a) => a.id));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to seed ranking.' };
  }
}
