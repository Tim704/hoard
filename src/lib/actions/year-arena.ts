'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Best of the year duels (spec 4.6). Both titles must be the caller's and
//  both must be finished in that year; their YEAR Elo and duel counts move
//  (YearDuelScore, created on the first duel). The section Arena's Elo,
//  tiers and scores never change here.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { updateElo } from '@/lib/elo';
import { yearCandidateIds, yearMatchupFrom, yearRanking } from '@/lib/data-year';
import { parseYear } from '@/lib/year-arena';
import type { Matchup } from '@/lib/types';

/** A fresh year matchup (requires auth). */
export async function nextYearMatchup(year: unknown): Promise<Matchup | null> {
  const user = await requireUser();
  const y = parseYear(year);
  if (y === null) return null;
  return yearMatchupFrom(await yearRanking(user.id, y));
}

/**
 * Record a year duel: `winnerId` beat `loserId` in `year`. Returns the next
 * matchup, or `{ ok: false }` when either title isn't one of the caller's
 * finishes of that year.
 */
export async function submitYearDuel(
  year: unknown,
  winnerId: unknown,
  loserId: unknown,
): Promise<{ ok: boolean; error?: string; next?: Matchup | null }> {
  const y = parseYear(year);
  if (y === null || typeof winnerId !== 'string' || typeof loserId !== 'string' || winnerId === loserId) {
    return { ok: false, error: 'That duel is not valid.' };
  }
  try {
    const user = await requireUser();
    const ids = new Set(await yearCandidateIds(user.id, y));
    if (!ids.has(winnerId) || !ids.has(loserId)) return { ok: false, error: 'Those titles are not from that year.' };

    await prisma.$transaction(async (tx) => {
      const ensure = (activityId: string) =>
        tx.yearDuelScore.upsert({
          where: { activityId_year: { activityId, year: y } },
          update: {},
          create: { userId: user.id, activityId, year: y },
        });
      const winner = await ensure(winnerId);
      const loser = await ensure(loserId);
      const elo = updateElo(winner.elo, loser.elo);
      await tx.yearDuelScore.update({ where: { id: winner.id }, data: { elo: elo.winner, duels: { increment: 1 } } });
      await tx.yearDuelScore.update({ where: { id: loser.id }, data: { elo: elo.loser, duels: { increment: 1 } } });
    });

    revalidatePath(`/arena/year/${y}`);
    return { ok: true, next: yearMatchupFrom(await yearRanking(user.id, y)) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save the duel.' };
  }
}
