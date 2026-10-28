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
import { getCategoryActivities, getChallengeMatchup, getMatchup } from '@/lib/data';
import { getPrefs } from '@/lib/data-prefs';
import { getCategory } from '@/lib/categories';
import {
  applyChallengeResult,
  challengePairs,
  parseChallengeHistory,
  type ChallengeHistory,
} from '@/lib/arena-pick';
import { buildTierBoard, type Tier } from '@/lib/tiers';
import { displayTitle } from '@/lib/title';
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
  const ok = await recordDuel(user.id, winnerActivityId, loserActivityId);
  if (!ok) return null;
  revalidateCategory(slug);
  return getMatchup(slug);
}

/** What a "Challenge tiers" duel hands back (4.4). */
export interface ChallengeOutcome {
  next: Matchup | null;
  /** The session's lower-title wins per pairing, to send with the next duel. */
  history: ChallengeHistory;
  /** Set when the lower title has beaten the same upper title twice. */
  suggestion: { activityId: string; title: string; toTier: Tier } | null;
}

/**
 * Record a "Challenge tiers" duel: the bottom title of `upperTier` against
 * the top title of the next lower non-empty tier. Elo and duels update like
 * any duel; tiers never move here. `history` is the client's count of
 * lower-title wins this session; after the second win of the same pairing a
 * suggestion to move the lower title up comes back (accepted through
 * `promoteFromChallenge`).
 */
export async function submitChallenge(
  slug: CategorySlug,
  winnerActivityId: string,
  loserActivityId: string,
  history: unknown,
): Promise<ChallengeOutcome> {
  const user = await requireUser();
  const past = parseChallengeHistory(history);
  const cat = getCategory(slug);
  if (!cat) return { next: null, history: past, suggestion: null };

  // Which of the two is the lower title, judged by the stored board.
  const board = buildTierBoard(await getCategoryActivities(slug));
  const pair = challengePairs(board.tiers).find(
    (p) =>
      (p.upper.id === winnerActivityId && p.lower.id === loserActivityId) ||
      (p.upper.id === loserActivityId && p.lower.id === winnerActivityId),
  );
  const ok = await recordDuel(user.id, winnerActivityId, loserActivityId);
  if (!ok) return { next: null, history: past, suggestion: null };
  revalidateCategory(slug);

  let nextHistory = past;
  let suggestion: ChallengeOutcome['suggestion'] = null;
  if (pair) {
    const result = applyChallengeResult(past, { upperId: pair.upper.id, lowerId: pair.lower.id }, winnerActivityId);
    nextHistory = result.history;
    if (result.suggest) {
      const prefs = await getPrefs(user.id);
      suggestion = {
        activityId: pair.lower.id,
        title: displayTitle(pair.lower.media, prefs.titleLanguage),
        toTier: pair.upperTier,
      };
    }
  }
  return { next: await getChallengeMatchup(slug), history: nextHistory, suggestion };
}

/** The next "Challenge tiers" matchup (requires auth). */
export async function nextChallenge(slug: CategorySlug): Promise<Matchup | null> {
  await requireUser();
  return getChallengeMatchup(slug);
}

/**
 * Elo, duel counts and (inside one tier) the order swap for one duel, in one
 * transaction. False when either activity is missing or not the user's.
 */
async function recordDuel(userId: string, winnerActivityId: string, loserActivityId: string): Promise<boolean> {
  if (winnerActivityId === loserActivityId) return false;
  // Load both rows and confirm ownership before touching anything.
  const [winner, loser] = await Promise.all([
    prisma.userMediaActivity.findUnique({ where: { id: winnerActivityId } }),
    prisma.userMediaActivity.findUnique({ where: { id: loserActivityId } }),
  ]);

  if (!winner || !loser || winner.userId !== userId || loser.userId !== userId) {
    return false;
  }

  const { winner: newWinnerElo, loser: newLoserElo } = updateElo(winner.elo, loser.elo);

  // If both sit in the same tier and the loser is placed above the winner,
  // swap their positions so the duel shows up in the order. Tiers never change.
  const swap =
    winner.tier != null &&
    winner.tier === loser.tier &&
    winner.rankOrder != null &&
    loser.rankOrder != null &&
    loser.rankOrder < winner.rankOrder;

  // Persist both new ratings, the duel counts (4.3) and any swap atomically.
  await prisma.$transaction([
    prisma.userMediaActivity.update({
      where: { id: winner.id },
      data: {
        elo: newWinnerElo,
        duels: { increment: 1 },
        ...(swap ? { rankOrder: loser.rankOrder } : {}),
      },
    }),
    prisma.userMediaActivity.update({
      where: { id: loser.id },
      data: {
        elo: newLoserElo,
        duels: { increment: 1 },
        ...(swap ? { rankOrder: winner.rankOrder } : {}),
      },
    }),
    // A swap moves the winner above the loser inside its tier: log it as a
    // `tier` event whose tier stays the same (meta says what happened).
    ...(swap
      ? [
          recordEvent(prisma, {
            userId,
            activityId: winner.id,
            kind: 'tier',
            from: winner.tier,
            to: winner.tier,
            meta: { via: 'arena', above: loser.id },
          }),
        ]
      : []),
  ]);
  return true;
}
