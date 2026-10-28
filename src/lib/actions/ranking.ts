'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Tier list server actions — the user's hand-placed S–F tiers per category.
//  The client sends the complete placement (ids per tier, best first) plus the
//  ids it shows in the Unranked tray. Positions inside each tier are rewritten
//  as 1000, 2000, … (only rows that actually change are written), and only ids
//  the client explicitly shows in the tray are taken out of their tier — so a
//  stale tab never clears items it does not know about. Items hidden from the
//  tier list (not COMPLETED/RETIRED/DROPPED) are never touched.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { getCategory, type CategorySlug } from '@/lib/categories';
import { getTierBoard } from '@/lib/data';
import { requireUser } from '@/lib/session';
import { revalidateCategory } from '@/lib/actions/shared';
import { recordEvents, tierEvents } from '@/lib/events';
import {
  acceptSuggestions,
  boardPlacement,
  findContainer,
  isTierEligible,
  moveItem,
  tierIndex,
  TIERS,
  parseTierSave,
  planTierSave,
  type Tier,
  type TierPlacement,
  type TierPosition,
} from '@/lib/tiers';
import type { ActionResult } from '@/lib/types';

/**
 * Persist the tier placement for a category. Ids that do not belong to the
 * user, the category, or the tier list (wrong status) are ignored.
 */
export async function saveTiers(
  slug: CategorySlug,
  placement: TierPlacement,
  trayIds: string[],
): Promise<ActionResult> {
  return persistTiers(slug, placement, trayIds);
}

/** saveTiers' body; `via` tags the tier events (e.g. accepted suggestions). */
async function persistTiers(
  slug: CategorySlug,
  placement: TierPlacement,
  trayIds: string[],
  via?: string,
): Promise<ActionResult> {
  const cat = getCategory(slug);
  if (!cat) return { ok: false, error: 'Unknown category.' };
  const input = parseTierSave(placement, trayIds);
  if (!input) return { ok: false, error: 'Invalid tier list.' };

  try {
    const user = await requireUser();
    const owned = await prisma.userMediaActivity.findMany({
      where: { userId: user.id, category: cat.dbCategory },
      select: { id: true, status: true, tier: true, rankOrder: true },
    });
    const current = new Map<string, TierPosition>(
      owned
        .filter((o) => isTierEligible(o.status))
        .map((o) => [o.id, { tier: o.tier as Tier | null, rankOrder: o.rankOrder }]),
    );
    const { placed, clearIds } = planTierSave(input.placement, input.trayIds, current);

    if (placed.length > 0 || clearIds.length > 0) {
      // A `tier` event for every row whose tier changes (not for reorders).
      const events = tierEvents(
        user.id,
        [
          ...clearIds.map((id) => ({ activityId: id, from: current.get(id)?.tier ?? null, to: null })),
          ...placed.map((p) => ({ activityId: p.id, from: current.get(p.id)?.tier ?? null, to: p.tier })),
        ],
        via ? { via } : undefined,
      );
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
        recordEvents(prisma, events),
      ]);
    }

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
    const board = await getTierBoard(slug);
    const placement = acceptSuggestions(board);
    // Unrated tray items stay in the tray (they are already untiered).
    const placedIds = new Set(Object.values(placement).flat());
    const trayIds = board.tray.map((a) => a.id).filter((id) => !placedIds.has(id));
    return persistTiers(slug, placement, trayIds, 'suggestions');
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to accept suggestions.' };
  }
}

/**
 * Accept a "Challenge tiers" suggestion (4.4): move the title to the bottom
 * of the higher tier `toTier`, through the normal tier save (so a `tier`
 * event is recorded, tagged `challenge`). Refused unless the title is on the
 * user's board in a tier below `toTier`.
 */
export async function promoteFromChallenge(
  slug: CategorySlug,
  activityId: string,
  toTier: Tier,
): Promise<ActionResult> {
  try {
    await requireUser();
    if (!(TIERS as readonly string[]).includes(toTier)) return { ok: false, error: 'Unknown tier.' };
    const board = await getTierBoard(slug);
    const from = findContainer(board, activityId);
    if (from === null || from === 'tray' || tierIndex(from) <= tierIndex(toTier)) {
      return { ok: false, error: 'That title is no longer below that tier.' };
    }
    const next = moveItem(board, activityId, toTier);
    return persistTiers(slug, boardPlacement(next), [], 'challenge');
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to move the title.' };
  }
}
