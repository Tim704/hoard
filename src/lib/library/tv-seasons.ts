// ───────────────────────────────────────────────────────────────────────────
//  Writing a show's TMDB seasons (3.3) into the `TvSeason` catalogue table.
//  Called on add (seasons from `enrichResult`) and by the metadata job. Rows
//  are upserted by (show, season number) and never deleted, so a season TMDB
//  stops listing keeps the users' tracking that hangs off it.
//  Server-only; trusts its input (it comes from the provider, never a client).
// ───────────────────────────────────────────────────────────────────────────

import type { Prisma, PrismaClient } from '@prisma/client';

import type { TvSeasonData } from '@/lib/apis/tmdb';

export async function saveTvSeasons(
  db: PrismaClient | Prisma.TransactionClient,
  tvShowId: string,
  seasons: TvSeasonData[],
): Promise<void> {
  for (const s of seasons) {
    const data = {
      name: s.name,
      episodeCount: s.episodeCount,
      airDate: s.airDate,
      imageUrl: s.imageUrl,
    };
    await db.tvSeason.upsert({
      where: { tvShowId_seasonNumber: { tvShowId, seasonNumber: s.seasonNumber } },
      update: data,
      create: { tvShowId, seasonNumber: s.seasonNumber, ...data },
    });
  }
}
