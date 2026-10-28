'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Arena server actions — resolve head-to-head duels between tier neighbours
//  (or, before anything is tiered, between items with the same whole score).
//
//  A duel takes two close activities and asks "which is better?". The winner's
//  hidden Elo rises, the loser's falls, and a fresh matchup is returned so the
//  UI can keep the user dueling without a round-trip.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import type { CategorySlug } from '@/lib/categories';
import { requireUser } from '@/lib/session';
import { revalidateCategory } from '@/lib/actions/shared';
import { updateElo } from '@/lib/elo';
import { getMatchup } from '@/lib/data';
import { recordEvent } from '@/lib/events';
import type { Matchup } from '@/lib/types';

/** Fetch the next matchup for a category (requires auth). */
export async function nextMatchup(slug: CategorySlug): Promise<Matchup | null> {
  await requireUser();
  return getMatchup(slug);
}

/**
 * Record a duel result: `winnerActivityId` beat `loserActivityId`. Verifies both
 * activities belong to the user, applies the Elo update, persists both ratings,
 * revalidates the arena page, and returns a fresh matchup (or null if none left).
 */
export async function submitMatchup(
  slug: CategorySlug,
  winnerActivityId: string,
  loserActivityId: string,
): Promise<Matchup | null> {
  const user = await requireUser();

  // Load both rows and confirm ownership before touching anything.
  const [winner, loser] = await Promise.all([
    prisma.userMediaActivity.findUnique({ where: { id: winnerActivityId } }),
    prisma.userMediaActivity.findUnique({ where: { id: loserActivityId } }),
  ]);

  if (
    !winner ||
    !loser ||
    winner.userId !== user.id ||
    loser.userId !== user.id
  ) {
    return null;
  }

  const { winner: newWinnerElo, loser: newLoserElo } = updateElo(
    winner.elo,
    loser.elo,
  );

  // If both sit in the same tier and the loser is placed above the winner,
  // swap their positions so the duel shows up in the order. Tiers never change.
  const swap =
    winner.tier != null &&
    winner.tier === loser.tier &&
    winner.rankOrder != null &&
    loser.rankOrder != null &&
    loser.rankOrder < winner.rankOrder;

  // Persist both new ratings (and any swap) atomically.
  await prisma.$transaction([
    prisma.userMediaActivity.update({
      where: { id: winner.id },
      data: { elo: newWinnerElo, ...(swap ? { rankOrder: loser.rankOrder } : {}) },
    }),
    prisma.userMediaActivity.update({
      where: { id: loser.id },
      data: { elo: newLoserElo, ...(swap ? { rankOrder: winner.rankOrder } : {}) },
    }),
    // A swap moves the winner above the loser inside its tier: log it as a
    // `tier` event whose tier stays the same (meta says what happened).
    ...(swap
      ? [
          recordEvent(prisma, {
            userId: user.id,
            activityId: winner.id,
            kind: 'tier',
            from: winner.tier,
            to: winner.tier,
            meta: { via: 'arena', above: loser.id },
          }),
        ]
      : []),
  ]);

  revalidateCategory(slug);

  return getMatchup(slug);
}
