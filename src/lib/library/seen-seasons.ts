// ───────────────────────────────────────────────────────────────────────────
//  5.5: what to record as `seenSeasonCount` when a TV title is finished,
//  started or acknowledged: the highest season aired by "today" (see
//  `airedSeasonCount` in src/lib/new-seasons.ts). Actions pass the acting
//  user's today; jobs the server's. Server-only; trusts its arguments
//  (callers have checked ownership).
// ───────────────────────────────────────────────────────────────────────────

import type { Prisma, PrismaClient } from '@prisma/client';

import { getPrefs } from '@/lib/data-prefs';
import { airedSeasonCount } from '@/lib/new-seasons';
import { prisma } from '@/lib/prisma';
import { effectiveTimeZone } from '@/lib/prefs';
import { todayYmd } from '@/lib/release';

/** The seen count for a show as of `today` (null when unknown or not a show). */
export async function seenSeasonCountNow(
  tvShowId: string | null | undefined,
  today: string,
  db: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<number | null> {
  if (!tvShowId) return null;
  const show = await db.tvShow.findUnique({
    where: { id: tvShowId },
    select: { seasonCount: true, seasons: { select: { seasonNumber: true, airDate: true } } },
  });
  if (!show) return null;
  return airedSeasonCount(show.seasons, show.seasonCount, today);
}

/** Today (YYYY-MM-DD) in a user's own time zone (G10). */
export async function userToday(userId: string): Promise<string> {
  return todayYmd(effectiveTimeZone(await getPrefs(userId)));
}
