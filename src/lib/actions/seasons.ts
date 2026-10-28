'use server';

// ───────────────────────────────────────────────────────────────────────────
//  TV seasons (spec 3.3 / 4.5): watched episodes per season, season scores,
//  the per-show season tier list and its Arena.
//
//  Every action authenticates and checks that the activity is the caller's own
//  TV title (as src/lib/actions/media.ts does); a season must belong to that
//  title's show, and a SeasonActivity to that activity. SeasonActivity rows
//  are created lazily on the first change. A watched-episodes change rewrites
//  the activity's `progress` (the sum over its seasons) in the same
//  transaction, with one `progress` event per change.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/session';
import { revalidateCategory } from '@/lib/actions/shared';
import {
  ownTvActivity,
  seasonItemsForUser,
  seasonMatchupForUser,
  seasonRowsForUser,
  type SeasonRow,
} from '@/lib/data-seasons';
import { updateElo } from '@/lib/elo';
import { recordEvent } from '@/lib/events';
import { normalizeRating } from '@/lib/rating';
import {
  applySeasonChange,
  buildSeasonBoard,
  isSeasonRankable,
  parseSeasonChange,
  hasWatchState,
  prefillSeasons,
  seasonProgress,
  type SeasonMatchup,
  type SeasonWatch,
} from '@/lib/seasons';
import {
  acceptSuggestions,
  parseTierSave,
  planTierSave,
  type TierPlacement,
  type TierPosition,
} from '@/lib/tiers';
import type { ActionResult } from '@/lib/types';

const fail = (err: unknown, fallback: string): ActionResult => ({
  ok: false,
  error: err instanceof Error && err.message ? err.message : fallback,
});

function refresh(activityId: string) {
  revalidateCategory('tv');
  revalidatePath(`/tv/seasons/${activityId}`);
}

/** The caller's activity plus one season of its show, or null. */
async function ownSeason(userId: string, activityId: unknown, seasonId: unknown) {
  const activity = await ownTvActivity(userId, activityId);
  if (!activity || typeof seasonId !== 'string' || !seasonId) return null;
  const season = await prisma.tvSeason.findUnique({ where: { id: seasonId } });
  if (!season || season.tvShowId !== activity.tvShowId) return null;
  return { activity, season };
}

// ── The details' Seasons section ────────────────────────────────────────────

/** Every season of the show with the caller's tracking (details, on open). */
export async function getSeasons(
  activityId: string,
): Promise<ActionResult & { seasons?: SeasonRow[] }> {
  try {
    const user = await requireUser();
    const seasons = await seasonRowsForUser(user.id, activityId);
    if (!seasons) return { ok: false, error: 'Not found.' };
    return { ok: true, seasons };
  } catch (err) {
    return fail(err, 'Could not load the seasons.');
  }
}

/**
 * Change a season's watched episodes (+1, a count, "all", or episode ticks)
 * and resync the activity's progress. Returns the season's stored state and
 * the new progress.
 */
export async function updateSeasonWatch(
  activityId: string,
  seasonId: string,
  change: unknown,
): Promise<ActionResult & { watch?: SeasonWatch; progress?: number }> {
  try {
    const user = await requireUser();
    const own = await ownSeason(user.id, activityId, seasonId);
    if (!own) return { ok: false, error: 'Not found.' };
    const parsed = parseSeasonChange(change);
    if (!parsed) return { ok: false, error: 'Invalid change.' };
    const { activity, season } = own;

    const out = await prisma.$transaction(async (tx) => {
      // Lock the show's activity: concurrent season saves recompute the sum
      // (and log its event) one after the other.
      const locked = await tx.$queryRaw<{ progress: number | null }[]>`
        SELECT "progress" FROM "UserMediaActivity" WHERE "id" = ${activity.id} FOR UPDATE`;
      if (locked.length === 0) return null;
      const oldProgress = locked[0].progress;

      // The first season change on a show that already has progress: spread
      // that progress over the seasons first, so the sum continues from it.
      // Rows holding only a score or tier don't count as tracking; the prefill
      // sets their watch count and keeps the score / tier.
      const rows = await tx.seasonActivity.findMany({
        where: { userId: user.id, activityId: activity.id },
        select: { watchedEpisodes: true, episodesWatched: true },
      });
      if (!hasWatchState(rows) && oldProgress != null && oldProgress > 0) {
        const all = await tx.tvSeason.findMany({
          where: { tvShowId: activity.tvShowId },
          select: { id: true, seasonNumber: true, episodeCount: true },
        });
        for (const [seasonId, watchedEpisodes] of prefillSeasons(all, oldProgress)) {
          await tx.seasonActivity.upsert({
            where: { userId_seasonId: { userId: user.id, seasonId } },
            update: { watchedEpisodes, episodesWatched: [] },
            create: { userId: user.id, activityId: activity.id, seasonId, watchedEpisodes, episodesWatched: [] },
          });
        }
      }

      const key = { userId_seasonId: { userId: user.id, seasonId: season.id } };
      const existing = await tx.seasonActivity.findUnique({ where: key });
      if (existing && existing.activityId !== activity.id) return null;
      const next = applySeasonChange(
        existing ?? { watchedEpisodes: 0, episodesWatched: [] },
        parsed,
        season.episodeCount,
      );
      if (!next) return null;
      await tx.seasonActivity.upsert({
        where: key,
        update: next,
        create: { userId: user.id, activityId: activity.id, seasonId: season.id, ...next },
      });

      const all = await tx.seasonActivity.findMany({
        where: { userId: user.id, activityId: activity.id },
        select: { watchedEpisodes: true, episodesWatched: true, season: { select: { episodeCount: true } } },
      });
      const progress = seasonProgress(all.map((r) => ({ ...r, episodeCount: r.season.episodeCount })));
      if (oldProgress !== progress) {
        await tx.userMediaActivity.update({ where: { id: activity.id }, data: { progress } });
        await recordEvent(tx, {
          userId: user.id,
          activityId: activity.id,
          kind: 'progress',
          from: oldProgress == null ? null : String(oldProgress),
          to: String(progress),
          meta: { via: 'seasons', season: season.seasonNumber },
        });
      }
      return { watch: next, progress };
    });
    if (!out) return { ok: false, error: 'Invalid change.' };

    refresh(activity.id);
    return { ok: true, ...out };
  } catch (err) {
    return fail(err, 'Could not save the season.');
  }
}

/** Score one season (null clears it). */
export async function setSeasonRating(
  activityId: string,
  seasonId: string,
  rating: number | null,
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const own = await ownSeason(user.id, activityId, seasonId);
    if (!own) return { ok: false, error: 'Not found.' };
    const value = rating === null ? null : typeof rating === 'number' ? normalizeRating(rating) : null;
    if (rating !== null && value === null) return { ok: false, error: 'Scores go from 0 to 10.' };

    const key = { userId_seasonId: { userId: user.id, seasonId: own.season.id } };
    const existing = await prisma.seasonActivity.findUnique({ where: key });
    if (existing && existing.activityId !== own.activity.id) return { ok: false, error: 'Not found.' };
    await prisma.seasonActivity.upsert({
      where: key,
      update: { rating: value },
      create: {
        userId: user.id,
        activityId: own.activity.id,
        seasonId: own.season.id,
        rating: value,
        episodesWatched: [],
      },
    });
    refresh(own.activity.id);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not save the score.');
  }
}

// ── The season tier list (4.5) ──────────────────────────────────────────────

async function persistSeasonTiers(
  userId: string,
  activityId: string,
  placement: unknown,
  trayIds: unknown,
): Promise<ActionResult> {
  const input = parseTierSave(placement, trayIds);
  if (!input) return { ok: false, error: 'Invalid tier list.' };
  const items = await seasonItemsForUser(userId, activityId);
  const current = new Map<string, TierPosition>(
    items.filter(isSeasonRankable).map((s) => [s.id, { tier: s.tier, rankOrder: s.rankOrder }]),
  );
  const { placed, clearIds } = planTierSave(input.placement, input.trayIds, current);
  if (placed.length > 0 || clearIds.length > 0) {
    await prisma.$transaction([
      prisma.seasonActivity.updateMany({
        where: { userId, activityId, id: { in: clearIds }, tier: { not: null } },
        data: { tier: null, rankOrder: null },
      }),
      ...placed.map(({ id, tier, rankOrder }) =>
        prisma.seasonActivity.updateMany({ where: { id, userId, activityId }, data: { tier, rankOrder } }),
      ),
    ]);
  }
  refresh(activityId);
  return { ok: true };
}

/** Persist the season board (same contract as `saveTiers`). */
export async function saveSeasonTiers(
  activityId: string,
  placement: TierPlacement,
  trayIds: string[],
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!(await ownTvActivity(user.id, activityId))) return { ok: false, error: 'Not found.' };
    return await persistSeasonTiers(user.id, activityId, placement, trayIds);
  } catch (err) {
    return fail(err, 'Failed to save tiers.');
  }
}

/** Place every scored, untiered season in its score-suggested tier. */
export async function acceptSeasonSuggestions(activityId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (!(await ownTvActivity(user.id, activityId))) return { ok: false, error: 'Not found.' };
    const board = buildSeasonBoard(await seasonItemsForUser(user.id, activityId));
    const placement = acceptSuggestions(board);
    const placedIds = new Set(Object.values(placement).flat());
    const trayIds = board.tray.map((s) => s.id).filter((id) => !placedIds.has(id));
    return await persistSeasonTiers(user.id, activityId, placement, trayIds);
  } catch (err) {
    return fail(err, 'Failed to accept suggestions.');
  }
}

// ── The season Arena ────────────────────────────────────────────────────────

export async function nextSeasonMatchup(activityId: string): Promise<SeasonMatchup | null> {
  const user = await requireUser();
  if (!(await ownTvActivity(user.id, activityId))) return null;
  return seasonMatchupForUser(user.id, activityId);
}

/**
 * `winnerId` beat `loserId` (SeasonActivity ids of the same show): Elo moves,
 * both duel counts go up, and inside one tier a winner placed below the loser
 * swaps places with it (tiers never change). Returns the next matchup.
 */
export async function submitSeasonMatchup(
  activityId: string,
  winnerId: string,
  loserId: string,
): Promise<SeasonMatchup | null> {
  const user = await requireUser();
  if (!(await ownTvActivity(user.id, activityId)) || winnerId === loserId) return null;
  const [winner, loser] = await Promise.all([
    prisma.seasonActivity.findUnique({ where: { id: winnerId } }),
    prisma.seasonActivity.findUnique({ where: { id: loserId } }),
  ]);
  const mine = (s: typeof winner) => s && s.userId === user.id && s.activityId === activityId;
  if (!mine(winner) || !mine(loser) || !winner || !loser) return null;

  const elo = updateElo(winner.elo, loser.elo);
  const swap =
    winner.tier != null &&
    winner.tier === loser.tier &&
    winner.rankOrder != null &&
    loser.rankOrder != null &&
    loser.rankOrder < winner.rankOrder;
  await prisma.$transaction([
    prisma.seasonActivity.update({
      where: { id: winner.id },
      data: { elo: elo.winner, duels: { increment: 1 }, ...(swap ? { rankOrder: loser.rankOrder } : {}) },
    }),
    prisma.seasonActivity.update({
      where: { id: loser.id },
      data: { elo: elo.loser, duels: { increment: 1 }, ...(swap ? { rankOrder: winner.rankOrder } : {}) },
    }),
  ]);
  revalidatePath(`/tv/seasons/${activityId}`);
  return seasonMatchupForUser(user.id, activityId);
}
