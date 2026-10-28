// ───────────────────────────────────────────────────────────────────────────
//  Writing a show's TMDB seasons (3.3) into the `TvSeason` catalogue table.
//  Called on add (seasons from `enrichResult`), by the metadata job, and on
//  demand when the details open a show that has none yet. Rows are keyed by
//  (show, season number) and never deleted, so a season TMDB stops listing
//  keeps the users' tracking that hangs off it.
//  Server-only; trusts its input (it comes from the provider, never a client).
// ───────────────────────────────────────────────────────────────────────────

import type { Prisma, PrismaClient } from '@prisma/client';

import { detailsConfigured, fetchDetailPatch, isLookupSkipped, splitSeasons } from '@/lib/apis/details';
import type { TvSeasonData } from '@/lib/apis/tmdb';
import { prisma } from '@/lib/prisma';

/**
 * Upsert the seasons. `insertOnly` (the add transaction) only inserts missing
 * rows with ON CONFLICT DO NOTHING, so a concurrent add of the same new show
 * can't abort the transaction with a unique violation.
 */
export async function saveTvSeasons(
  db: PrismaClient | Prisma.TransactionClient,
  tvShowId: string,
  seasons: TvSeasonData[],
  opts: { insertOnly?: boolean } = {},
): Promise<void> {
  const rows = seasons.map((s) => ({
    seasonNumber: s.seasonNumber,
    name: s.name,
    episodeCount: s.episodeCount,
    airDate: s.airDate,
    imageUrl: s.imageUrl,
  }));
  if (opts.insertOnly) {
    if (rows.length) {
      await db.tvSeason.createMany({ data: rows.map((r) => ({ tvShowId, ...r })), skipDuplicates: true });
    }
    return;
  }
  for (const { seasonNumber, ...data } of rows) {
    await db.tvSeason.upsert({
      where: { tvShowId_seasonNumber: { tvShowId, seasonNumber } },
      update: data,
      create: { tvShowId, seasonNumber, ...data },
    });
  }
}

/** After a failed (or empty) on-demand lookup, a show waits this long. */
export const ON_DEMAND_RETRY_MS = 30 * 60_000;
const lastTry = new Map<string, number>();

/**
 * Fetch a show's seasons right now (the details opened a show with none):
 * one TMDB details call (8 s timeout), stored like the metadata job does —
 * seasons, refreshed columns and the `metaFetchedAt` stamp. Best-effort:
 * manual / demo rows, a missing key, or a show tried in the last 30 minutes
 * are skipped, and failures only set `metaFailedAt`. True when seasons were
 * stored.
 */
export async function fetchSeasonsNow(
  show: { id: string; externalId: string; title: string },
  now = Date.now(),
): Promise<boolean> {
  if (isLookupSkipped(show.externalId) || !detailsConfigured('tv')) return false;
  const tried = lastTry.get(show.id);
  if (tried !== undefined && now - tried < ON_DEMAND_RETRY_MS) return false;
  lastTry.set(show.id, now);
  if (lastTry.size > 5000) lastTry.clear(); // bounded; worst case a few extra lookups

  try {
    const patch = await fetchDetailPatch('tv', { externalId: show.externalId, title: show.title });
    const { columns, seasons } = patch ? splitSeasons(patch) : { columns: {}, seasons: null };
    await prisma.tvShow.update({
      where: { id: show.id },
      data: { ...columns, metaFetchedAt: new Date(now), metaFailedAt: null },
    });
    if (!seasons?.length) return false;
    await saveTvSeasons(prisma, show.id, seasons);
    lastTry.delete(show.id);
    return true;
  } catch {
    await prisma.tvShow
      .update({ where: { id: show.id }, data: { metaFailedAt: new Date(now) } })
      .catch(() => {});
    return false;
  }
}
