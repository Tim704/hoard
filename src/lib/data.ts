// ───────────────────────────────────────────────────────────────────────────
//  Server-only data fetchers.
//
//  These read the current user's media activities and shape them for the UI.
//  They are NOT server actions (no 'use server') — they are imported directly by
//  server components. They never mutate. Each function scopes to the logged-in
//  user and returns serializable, client-safe data (dates as ISO strings).
//
//  The seven media tables are accessed dynamically by category config. Prisma's
//  generated client cannot express "any of seven models" statically, so the
//  sanctioned `as any` casts (per the build contract) are used at those points.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import {
  getCategory,
  CATEGORY_LIST,
  type CategorySlug,
  type CategoryConfig,
} from '@/lib/categories';
import { getCurrentUser } from '@/lib/session';
import { orderQueue } from '@/lib/queue';
import { buildTierBoard, TIERS, withinTierPairs, type TierBoardData } from '@/lib/tiers';
import type {
  ActivityWithMedia,
  FranchiseRef,
  FranchiseWithMembers,
  MediaItem,
  Matchup,
} from '@/lib/types';

/** Prisma select for the franchise info flattened onto each activity. */
const FRANCHISE_REF = { select: { id: true, name: true, imageUrl: true, rating: true } };

/**
 * Flatten a Prisma `UserMediaActivity` row (queried with the matching media
 * relation included) into the UI-facing `ActivityWithMedia`. Dates are
 * serialized to ISO strings. Returns `null` when the media relation is missing
 * (defensive — exactly one fk should always be set, but never trust the DB
 * blindly) so callers can skip the row.
 */
function flattenActivity(
  // Sanctioned dynamic-Prisma access: the row carries one populated media
  // relation keyed by `cat.prismaModel`, which Prisma's types can't express
  // statically across all seven models.
  row: any,
  cat: CategoryConfig,
): ActivityWithMedia | null {
  const media = row[cat.prismaModel];
  if (!media) return null;

  return {
    id: row.id,
    category: cat.slug,
    status: row.status,
    rating: row.rating,
    tier: row.tier ?? null,
    queueOrder: row.queueOrder ?? null,
    elo: row.elo,
    rankOrder: row.rankOrder ?? null,
    favorite: row.favorite,
    notes: row.notes,
    franchise: (row.franchise as FranchiseRef | undefined) ?? null,
    franchiseLocked: row.franchiseLocked ?? false,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    media: media as MediaItem,
  };
}

/**
 * The current user's activities for a category, newest first, with media
 * included and flattened. Returns `[]` when not logged in.
 */
export async function getCategoryActivities(
  slug: CategorySlug,
): Promise<ActivityWithMedia[]> {
  const cat = getCategory(slug);
  if (!cat) return [];

  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await prisma.userMediaActivity.findMany({
    where: { userId: user.id, category: cat.dbCategory },
    include: { [cat.prismaModel]: true, franchise: FRANCHISE_REF } as any,
    orderBy: { createdAt: 'desc' },
  });

  return rows
    .map((row) => flattenActivity(row, cat))
    .filter((a): a is ActivityWithMedia => a !== null);
}

/**
 * Per-category dashboard roll-up. One entry per category (CATEGORY_LIST order),
 * carrying status counts, average rating, and a category-appropriate headline
 * metric (e.g. words read, hours watched, episodes watched). See the dashboard.
 */
export interface CategoryStat {
  slug: CategorySlug;
  label: string;
  total: number;
  ongoing: number;
  planned: number;
  completed: number;
  onHold: number;
  dropped: number;
  avgRating: number | null; // over rated rows, rounded to 1 decimal
  metricValue: number; // headline number
  metricUnit: string; // 'words'|'hours'|'episodes'|'chapters'|'games'|'albums'
  metricVerb: string; // 'read'|'watched'|'beaten'|'heard'
}

/** Approximate words on a printed book page — used for the books "words read" metric. */
const WORDS_PER_PAGE = 275;

/** An all-zero stat row for a category (used when not logged in / empty). */
function emptyStat(cat: CategoryConfig): CategoryStat {
  const { metricUnit, metricVerb } = metricMetaFor(cat.slug);
  return {
    slug: cat.slug,
    label: cat.label,
    total: 0,
    ongoing: 0,
    planned: 0,
    completed: 0,
    onHold: 0,
    dropped: 0,
    avgRating: null,
    metricValue: 0,
    metricUnit,
    metricVerb,
  };
}

/** The unit/verb wording for a category's headline metric. */
function metricMetaFor(slug: CategorySlug): { metricUnit: string; metricVerb: string } {
  switch (slug) {
    case 'books':
      return { metricUnit: 'words', metricVerb: 'read' };
    case 'movies':
      return { metricUnit: 'hours', metricVerb: 'watched' };
    case 'tv':
      return { metricUnit: 'episodes', metricVerb: 'watched' };
    case 'anime':
      return { metricUnit: 'episodes', metricVerb: 'watched' };
    case 'manga':
      return { metricUnit: 'chapters', metricVerb: 'read' };
    case 'games':
      return { metricUnit: 'games', metricVerb: 'beaten' };
    case 'music':
      return { metricUnit: 'albums', metricVerb: 'heard' };
  }
}

export async function getDashboardStats(): Promise<CategoryStat[]> {
  const user = await getCurrentUser();
  if (!user) {
    return CATEGORY_LIST.map((cat) => emptyStat(cat));
  }

  return Promise.all(
    CATEGORY_LIST.map(async (cat) => {
      const activities = await getCategoryActivities(cat.slug);

      // Status counts.
      const total = activities.length;
      const ongoing = activities.filter((a) => a.status === 'CONSUMING').length;
      const planned = activities.filter((a) => a.status === 'PLANNED').length;
      const completed = activities.filter((a) => a.status === 'COMPLETED').length;
      const onHold = activities.filter((a) => a.status === 'ON_HOLD').length;
      const dropped = activities.filter((a) => a.status === 'DROPPED').length;

      // Average rating over rated rows, rounded to 1 decimal.
      const rated = activities.filter((a) => a.rating != null);
      const avgRating =
        rated.length === 0
          ? null
          : Math.round(
              (rated.reduce((sum, a) => sum + (a.rating ?? 0), 0) / rated.length) * 10,
            ) / 10;

      // Sum a numeric media field over the COMPLETED rows (nulls count as 0).
      const completedRows = activities.filter((a) => a.status === 'COMPLETED');
      const sumField = (field: string) =>
        completedRows.reduce((sum, a) => sum + (Number(a.media[field]) || 0), 0);

      const { metricUnit, metricVerb } = metricMetaFor(cat.slug);
      let metricValue = 0;
      switch (cat.slug) {
        case 'books':
          metricValue = Math.round(sumField('pageCount') * WORDS_PER_PAGE);
          break;
        case 'movies':
          metricValue = Math.round(sumField('runtime') / 60); // minutes → hours
          break;
        case 'tv':
          metricValue = sumField('episodeCount');
          break;
        case 'anime':
          metricValue = sumField('episodes');
          break;
        case 'manga':
          metricValue = sumField('chapters');
          break;
        case 'games':
          metricValue = completed;
          break;
        case 'music':
          metricValue = completed;
          break;
      }

      return {
        slug: cat.slug,
        label: cat.label,
        total,
        ongoing,
        planned,
        completed,
        onHold,
        dropped,
        avgRating,
        metricValue,
        metricUnit,
        metricVerb,
      };
    }),
  );
}

/** All of the user's activities in a category, flattened (no ordering). */
async function loadCategory(slug: CategorySlug): Promise<ActivityWithMedia[]> {
  const cat = getCategory(slug);
  if (!cat) return [];
  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await prisma.userMediaActivity.findMany({
    where: { userId: user.id, category: cat.dbCategory },
    include: { [cat.prismaModel]: true } as any,
  });
  return rows
    .map((row) => flattenActivity(row, cat))
    .filter((a): a is ActivityWithMedia => a !== null);
}

/** Rating desc (unrated last), then hidden Elo desc, then title. */
function byRatingThenElo(a: ActivityWithMedia, b: ActivityWithMedia): number {
  const byRating = (b.rating ?? -1) - (a.rating ?? -1);
  if (byRating !== 0) return byRating;
  const byElo = b.elo - a.elo;
  if (byElo !== 0) return byElo;
  return a.media.title.localeCompare(b.media.title);
}

/** The category's Up next queue: PLANNED items in queue order. */
export async function getQueue(slug: CategorySlug): Promise<ActivityWithMedia[]> {
  return orderQueue(await loadCategory(slug));
}

/** The category's tier list: placed items per tier plus the Unranked tray. */
export async function getTierBoard(slug: CategorySlug): Promise<TierBoardData> {
  return buildTierBoard(await loadCategory(slug));
}

/** Pick a random element (the caller guarantees `items` is non-empty). */
function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Build an Arena matchup. When any tier holds two or more items, pick a random
 * such tier and two random NEIGHBOURS inside it ("is #4 really better than
 * #5?"), so every duel refines the order without ever changing a tier.
 * Otherwise fall back to two items sharing the same whole-number score.
 */
export async function getMatchup(slug: CategorySlug): Promise<Matchup | null> {
  const all = await loadCategory(slug);

  const board = buildTierBoard(all);
  const pairs = withinTierPairs(board);
  if (pairs.length > 0) {
    const tiers = [...new Set(pairs.map(([a]) => a.tier))];
    const tier = pick(tiers);
    const [a, b] = pick(pairs.filter(([p]) => p.tier === tier));
    const ranking = TIERS.flatMap((t) => board.tiers[t]);
    return {
      rating: null,
      ranks: [ranking.indexOf(a) + 1, ranking.indexOf(b) + 1],
      a,
      b,
    };
  }

  // Group rated rows by whole-number score; keep scores that have a pair.
  const byScore = new Map<number, ActivityWithMedia[]>();
  for (const a of all) {
    if (a.rating == null) continue;
    const score = Math.floor(a.rating);
    const bucket = byScore.get(score);
    if (bucket) bucket.push(a);
    else byScore.set(score, [a]);
  }
  const eligible = [...byScore.entries()].filter(([, items]) => items.length >= 2);
  if (eligible.length === 0) return null;

  const [rating, items] = pick(eligible);
  const firstIdx = Math.floor(Math.random() * items.length);
  let secondIdx = Math.floor(Math.random() * (items.length - 1));
  if (secondIdx >= firstIdx) secondIdx += 1; // ensure distinct from the first

  return { rating, a: items[firstIdx], b: items[secondIdx] };
}

/**
 * The leaderboard shown beside the Arena: the tier list flattened S→F when
 * anything is placed, otherwise rated items by rating then Elo.
 */
export async function getRanking(slug: CategorySlug): Promise<ActivityWithMedia[]> {
  const all = await loadCategory(slug);
  const board = buildTierBoard(all);
  const placed = TIERS.flatMap((t) => board.tiers[t]);
  if (placed.length > 0) return placed;
  return all.filter((a) => a.rating != null).sort(byRatingThenElo);
}

/**
 * Everything the current user is actively consuming, across all domains,
 * most recently touched first. Powers the dashboard's "Now consuming" tile.
 */
export async function getNowConsuming(limit = 12): Promise<ActivityWithMedia[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const include = Object.fromEntries(CATEGORY_LIST.map((c) => [c.prismaModel, true]));
  const rows = await prisma.userMediaActivity.findMany({
    where: { userId: user.id, status: 'CONSUMING' },
    include: include as any,
    orderBy: { updatedAt: 'desc' },
    take: limit,
  });

  return rows
    .map((row) => {
      const cat = CATEGORY_LIST.find((c) => c.dbCategory === row.category);
      return cat ? flattenActivity(row, cat) : null;
    })
    .filter((a): a is ActivityWithMedia => a !== null);
}

/** The current user's franchises (id + name only), alphabetical. */
export async function getFranchiseOptions(): Promise<{ id: string; name: string }[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return prisma.franchise.findMany({
    where: { userId: user.id },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}

/**
 * Every franchise of the current user with its member titles (all domains),
 * members in release order. Manually ranked franchises come first.
 */
export async function getFranchises(): Promise<FranchiseWithMembers[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const include = Object.fromEntries(CATEGORY_LIST.map((c) => [c.prismaModel, true]));
  const rows = await prisma.franchise.findMany({
    where: { userId: user.id },
    include: { activities: { include: include as any } },
    orderBy: [{ rankOrder: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
  });

  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    imageUrl: f.imageUrl,
    rating: f.rating,
    notes: f.notes,
    rankOrder: f.rankOrder,
    members: (f.activities as any[])
      .map((row) => {
        const cat = CATEGORY_LIST.find((c) => c.dbCategory === row.category);
        return cat ? flattenActivity({ ...row, franchise: null }, cat) : null;
      })
      .filter((a): a is ActivityWithMedia => a !== null)
      .sort((a, b) => (a.media.year ?? 9999) - (b.media.year ?? 9999)),
  }));
}
