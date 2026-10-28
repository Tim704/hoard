// ───────────────────────────────────────────────────────────────────────────
//  TV season data (3.3 / 4.5). Server-only fetchers, NOT server actions: the
//  `…ForUser` helpers trust their `userId` argument, so callers authenticate
//  first. Ownership of a SeasonActivity always goes through its parent
//  activity (the caller's own TV activity).
// ───────────────────────────────────────────────────────────────────────────

import { fetchSeasonsNow } from '@/lib/library/tv-seasons';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { buildSeasonBoard, pickSeasonMatchup, prefillSeasons, type SeasonItem, type SeasonMatchup } from '@/lib/seasons';
import { TIERS, type Tier, type TierBoardData } from '@/lib/tiers';

/** One season in the details' Seasons section: catalogue data + the user's state. */
export interface SeasonRow {
  seasonId: string;
  seasonNumber: number;
  name: string;
  episodeCount: number | null;
  airDate: string | null;
  imageUrl: string | null;
  watchedEpisodes: number;
  episodesWatched: number[];
  rating: number | null;
  tier: Tier | null;
}

/** The caller's own TV activity with its show id, or null. */
export async function ownTvActivity(userId: string, activityId: unknown) {
  if (typeof activityId !== 'string' || !activityId) return null;
  const a = await prisma.userMediaActivity.findUnique({
    where: { id: activityId },
    select: { id: true, userId: true, category: true, tvShowId: true, progress: true },
  });
  if (!a || a.userId !== userId || a.category !== 'TV' || !a.tvShowId) return null;
  return { ...a, tvShowId: a.tvShowId };
}

/**
 * Every season of the activity's show, with the user's tracking merged in.
 * A show without seasons yet (added before 3.3) gets them fetched on demand.
 */
export async function seasonRowsForUser(userId: string, activityId: string): Promise<SeasonRow[] | null> {
  const activity = await ownTvActivity(userId, activityId);
  if (!activity) return null;
  const load = () =>
    prisma.tvSeason.findMany({
      where: { tvShowId: activity.tvShowId },
      orderBy: { seasonNumber: 'asc' },
      include: { activities: { where: { userId, activityId } } },
    });
  let seasons = await load();
  if (seasons.length === 0) {
    const show = await prisma.tvShow.findUnique({
      where: { id: activity.tvShowId },
      select: { id: true, externalId: true, title: true },
    });
    if (show && (await fetchSeasonsNow(show))) seasons = await load();
  }
  // Nothing tracked yet but progress stored: show that progress spread over
  // the seasons, as the first change will store it (updateSeasonWatch).
  const untracked = seasons.every((s) => s.activities.length === 0);
  const prefill = untracked ? prefillSeasons(seasons, activity.progress) : new Map<string, number>();
  return seasons.map((s) => {
    const mine = s.activities[0];
    return {
      seasonId: s.id,
      seasonNumber: s.seasonNumber,
      name: s.name,
      episodeCount: s.episodeCount,
      airDate: s.airDate,
      imageUrl: s.imageUrl,
      watchedEpisodes: mine?.watchedEpisodes ?? prefill.get(s.id) ?? 0,
      episodesWatched: mine?.episodesWatched ?? [],
      rating: mine?.rating ?? null,
      tier: (mine?.tier as Tier | null) ?? null,
    };
  });
}

/** The user's tracked seasons of one show as tier / Arena items. */
export async function seasonItemsForUser(userId: string, activityId: string): Promise<SeasonItem[]> {
  const rows = await prisma.seasonActivity.findMany({
    where: { userId, activityId },
    include: { season: true },
  });
  return rows.map((r) => ({
    id: r.id,
    seasonId: r.seasonId,
    seasonNumber: r.season.seasonNumber,
    title: r.season.name,
    imageUrl: r.season.imageUrl,
    airDate: r.season.airDate,
    episodeCount: r.season.episodeCount,
    watchedEpisodes: r.watchedEpisodes,
    rating: r.rating,
    tier: (r.tier as Tier | null) ?? null,
    rankOrder: r.rankOrder,
    elo: r.elo,
    duels: r.duels,
  }));
}

export async function seasonMatchupForUser(userId: string, activityId: string): Promise<SeasonMatchup | null> {
  return pickSeasonMatchup(await seasonItemsForUser(userId, activityId));
}

export interface SeasonTierPage {
  activityId: string;
  show: { title: string; imageUrl: string | null; year: number | null };
  board: TierBoardData<SeasonItem>;
  matchup: SeasonMatchup | null;
  /** The board flattened S→F (the Arena's ranking). */
  ranking: SeasonItem[];
  /** How many seasons the show has in the catalogue. */
  seasonCount: number;
}

/** `/tv/seasons/[activityId]`: null when it isn't the caller's own TV title. */
export async function getSeasonTierPage(activityId: string): Promise<SeasonTierPage | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const activity = await ownTvActivity(user.id, activityId);
  if (!activity) return null;
  const [show, items, seasonCount] = await Promise.all([
    prisma.tvShow.findUnique({
      where: { id: activity.tvShowId },
      select: { title: true, imageUrl: true, year: true },
    }),
    seasonItemsForUser(user.id, activityId),
    prisma.tvSeason.count({ where: { tvShowId: activity.tvShowId } }),
  ]);
  if (!show) return null;
  const board = buildSeasonBoard(items);
  return {
    activityId,
    show,
    board,
    matchup: pickSeasonMatchup(items),
    ranking: TIERS.flatMap((t) => board.tiers[t]),
    seasonCount,
  };
}
