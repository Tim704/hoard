// ───────────────────────────────────────────────────────────────────────────
//  5.5: the show's current season count, recorded as `seenSeasonCount` when a
//  TV title is finished or started (see src/lib/new-seasons.ts). Server-only;
//  trusts its arguments (callers have checked ownership).
// ───────────────────────────────────────────────────────────────────────────

import type { Prisma, PrismaClient } from '@prisma/client';

import { prisma } from '@/lib/prisma';

/** The show's `seasonCount` (null when unknown or not a show). */
export async function currentSeasonCount(
  tvShowId: string | null | undefined,
  db: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<number | null> {
  if (!tvShowId) return null;
  const show = await db.tvShow.findUnique({ where: { id: tvShowId }, select: { seasonCount: true } });
  return show?.seasonCount ?? null;
}
