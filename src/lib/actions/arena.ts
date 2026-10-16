'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Arena server actions — resolve head-to-head duels between same-rated items.
//
//  A duel takes two activities the user scored identically and asks "which is
//  better?". The winner's hidden Elo rises, the loser's falls, and a fresh
//  matchup is returned so the UI can keep the user dueling without a round-trip.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import type { CategorySlug } from '@/lib/categories';
import { requireUser } from '@/lib/session';
import { updateElo } from '@/lib/elo';
import { getMatchup } from '@/lib/data';
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

  // Persist both new ratings atomically.
  await prisma.$transaction([
    prisma.userMediaActivity.update({
      where: { id: winner.id },
      data: { elo: newWinnerElo },
    }),
    prisma.userMediaActivity.update({
      where: { id: loser.id },
      data: { elo: newLoserElo },
    }),
  ]);

  revalidatePath('/' + slug + '/arena');

  return getMatchup(slug);
}
