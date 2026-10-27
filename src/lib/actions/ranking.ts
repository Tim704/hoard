'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Tier list server actions — the user's hand-placed S–F tiers per category.
//  The client always sends the complete placement (ids per tier, best first);
//  positions inside each tier are rewritten as 1000, 2000, … so there is never
//  any drift, and eligible items left out go back to the Unranked tray. Items
//  hidden from the tier list (not COMPLETED/DROPPED) are never touched.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { getCategory, type CategorySlug } from '@/lib/categories';
import { getTierBoard } from '@/lib/data';
import { requireUser } from '@/lib/session';
import { revalidateCategory } from '@/lib/actions/shared';
import { acceptSuggestions, isTierEligible, planTierSave, type TierPlacement } from '@/lib/tiers';
import type { ActionResult } from '@/lib/types';

/**
 * Persist the full tier placement for a category. Ids that do not belong to
 * the user, the category, or the tier list (wrong status) are ignored.
 */
export async function saveTiers(
  slug: CategorySlug,
  placement: TierPlacement,
): Promise<ActionResult> {
  const cat = getCategory(slug);
  if (!cat) return { ok: false, error: 'Unknown category.' };

  try {
    const user = await requireUser();
    const owned = await prisma.userMediaActivity.findMany({
      where: { userId: user.id, category: cat.dbCategory },
      select: { id: true, status: true },
    });
    const eligibleIds = new Set(owned.filter((o) => isTierEligible(o.status)).map((o) => o.id));
    const { placed, clearIds } = planTierSave(placement, eligibleIds);

    await prisma.$transaction([
      // Only rows that actually leave a tier are cleared: items already in the
      // tray keep their legacy rankOrder, so the tray keeps its old order.
      prisma.userMediaActivity.updateMany({
        where: { userId: user.id, id: { in: clearIds }, tier: { not: null } },
        data: { tier: null, rankOrder: null },
      }),
      ...placed.map(({ id, tier, rankOrder }) =>
        prisma.userMediaActivity.update({ where: { id }, data: { tier, rankOrder } }),
      ),
    ]);

    revalidateCategory(slug);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save tiers.' };
  }
}

/**
 * Place every rated tray item into its score-suggested tier (at the bottom,
 * keeping tray order). Existing placements are kept; unrated items stay put.
 */
export async function acceptSuggestedTiers(slug: CategorySlug): Promise<ActionResult> {
  try {
    await requireUser();
    return saveTiers(slug, acceptSuggestions(await getTierBoard(slug)));
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to accept suggestions.' };
  }
}
