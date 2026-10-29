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
import { suggestedIds } from '@/lib/lastfm-suggest';
import {
  getCategory,
  CATEGORY_LIST,
  type CategorySlug,
  type CategoryConfig,
} from '@/lib/categories';
import { getCurrentUser } from '@/lib/session';
import { orderQueue } from '@/lib/queue';
import { earlierUnfinished, isOrderMode, orderFranchiseMembers, type QueueHint } from '@/lib/franchise/order';
import { getPrefs } from '@/lib/data-prefs';
import { displayTitle } from '@/lib/title';
import { newSeasonBadge } from '@/lib/new-seasons';
import { effectiveTimeZone } from '@/lib/prefs';
import { todayYmd } from '@/lib/release';
import { sectionStat } from '@/lib/stats/measures';
import { bucketPair, challengePairs, fewestDuelsPair } from '@/lib/arena-pick';
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
export function flattenActivity(
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
    duels: row.duels ?? 0,
    tags: Array.isArray(row.tags) ? row.tags : [],
    rankOrder: row.rankOrder ?? null,
    progress: row.progress ?? null,
    favorite: row.favorite,
    notes: row.notes,
    ownedPlatforms: row.ownedPlatforms ?? [],
    format: row.format ?? null,
    rewatching: row.rewatching ?? false,
    franchiseOrder: row.franchiseOrder ?? null,
    playtimeMinutes: row.playtimeMinutes ?? null,
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

  const out = rows
    .map((row) => flattenActivity(row, cat))
    .filter((a): a is ActivityWithMedia => a !== null);
  if (slug === 'tv') await markNewSeasons(user.id, rows as any[], out);
  if (slug === 'music') await markListenSuggestions(user.id, out);
  return out;
}

/** 8.3: flag the albums Last.fm suggests marking as listened. */
async function markListenSuggestions(userId: string, out: ActivityWithMedia[]): Promise<void> {
  const link = await prisma.externalLink.findUnique({
    where: { userId_provider: { userId, provider: 'lastfm' } },
    select: { data: true },
  });
  const ids = new Set(suggestedIds(link?.data));
  if (!ids.size) return;
  for (const a of out) if (ids.has(a.id) && (a.status === 'PLANNED' || a.status === 'CONSUMING')) a.listenSuggested = true;
}

/**
 * 5.5: set `newSeason` on finished shows with an aired season beyond the one
 * recorded when they were finished (one query for the candidates' seasons).
 */
async function markNewSeasons(userId: string, rows: any[], out: ActivityWithMedia[]): Promise<void> {
  const candidates = rows.filter(
    (r) =>
      r.status === 'COMPLETED' &&
      r.seenSeasonCount != null &&
      r.tvShow?.seasonCount != null &&
      r.tvShow.seasonCount > r.seenSeasonCount,
  );
  if (!candidates.length) return;
  const today = todayYmd(effectiveTimeZone(await getPrefs(userId)));
  const seasons = await prisma.tvSeason.findMany({
    where: { tvShowId: { in: candidates.map((r) => r.tvShow.id) } },
    select: { tvShowId: true, seasonNumber: true, airDate: true },
  });
  const byShow = new Map<string, typeof seasons>();
  for (const s of seasons) byShow.set(s.tvShowId, [...(byShow.get(s.tvShowId) ?? []), s]);
  const byId = new Map(out.map((a) => [a.id, a]));
  for (const r of candidates) {
    const badge = newSeasonBadge(
      { seenSeasonCount: r.seenSeasonCount, seasonCount: r.tvShow.seasonCount, seasons: byShow.get(r.tvShow.id) ?? [] },
      today,
    );
    const a = byId.get(r.id);
    if (a && badge != null) a.newSeason = badge;
  }
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
  retired: number;
  dropped: number;
  avgRating: number | null; // over rated rows, rounded to 1 decimal
  metricValue: number; // headline number
  metricUnit: string; // 'words'|'hours'|'episodes'|'chapters'|'games'|'albums'
  metricVerb: string; // 'read'|'watched'|'beaten'|'heard'
}

/** An all-zero stat row for a category (used when not logged in / empty). */
function emptyStat(cat: CategoryConfig): CategoryStat {
  return { slug: cat.slug, label: cat.label, ...sectionStat(cat.slug, []) };
}

/**
 * Per-category dashboard roll-up: status counts, average rating and the
 * headline metric (src/lib/stats/measures.ts, shared with /stats).
 */
export async function getDashboardStats(): Promise<CategoryStat[]> {
  const user = await getCurrentUser();
  if (!user) {
    return CATEGORY_LIST.map((cat) => emptyStat(cat));
  }

  return Promise.all(
    CATEGORY_LIST.map(async (cat) => {
      const activities = await getCategoryActivities(cat.slug);
      return { slug: cat.slug, label: cat.label, ...sectionStat(cat.slug, activities) };
    }),
  );
}

/** All of the user's activities in a category, flattened (no ordering). */
async function loadCategory(slug: CategorySlug): Promise<ActivityWithMedia[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  return loadCategoryFor(user.id, slug);
}

/**
 * `loadCategory` for a given user (trusts `userId`: the public API passes
 * its token's owner).
 */
export async function loadCategoryFor(userId: string, slug: CategorySlug): Promise<ActivityWithMedia[]> {
  const cat = getCategory(slug);
  if (!cat) return [];
  const rows = await prisma.userMediaActivity.findMany({
    where: { userId, category: cat.dbCategory },
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

/**
 * Up next's "Next in {franchise}" chips (4.7): for each queued title whose
 * franchise has an earlier title (in the franchise's order) that isn't
 * finished, retired or dropped, the franchise name and that first earlier
 * title. Keyed by activity id; only the current user's rows are read.
 */
export async function getQueueHints(queue: ActivityWithMedia[]): Promise<Record<string, QueueHint>> {
  const user = await getCurrentUser();
  if (!user || queue.length === 0) return {};
  const rows = await prisma.userMediaActivity.findMany({
    where: { userId: user.id, id: { in: queue.map((a) => a.id) }, franchiseId: { not: null } },
    select: { id: true, franchiseId: true },
  });
  if (rows.length === 0) return {};
  const include = Object.fromEntries(CATEGORY_LIST.map((c) => [c.prismaModel, true]));
  const [franchises, prefs] = await Promise.all([
    prisma.franchise.findMany({
      where: { userId: user.id, id: { in: [...new Set(rows.map((r) => r.franchiseId!))] } },
      include: { activities: { where: { userId: user.id }, include: include as any } },
    }),
    getPrefs(user.id),
  ]);
  const ordered = new Map(
    franchises.map((f) => {
      const members = (f.activities as any[])
        .map((row) => {
          const cat = CATEGORY_LIST.find((c) => c.dbCategory === row.category);
          return cat ? flattenActivity({ ...row, franchise: null }, cat) : null;
        })
        .filter((a): a is ActivityWithMedia => a !== null);
      return [f.id, { name: f.name, members: orderFranchiseMembers(members, f.orderMode) }] as const;
    }),
  );
  const out: Record<string, QueueHint> = {};
  for (const r of rows) {
    const f = ordered.get(r.franchiseId!);
    if (!f) continue;
    const [first] = earlierUnfinished(f.members, r.id);
    if (first) out[r.id] = { franchise: f.name, title: displayTitle(first.media, prefs.titleLanguage) };
  }
  return out;
}

/** The category's tier list: placed items per tier plus the Unranked tray. */
export async function getTierBoard(slug: CategorySlug): Promise<TierBoardData> {
  return buildTierBoard(await loadCategory(slug));
}

/**
 * Build an Arena matchup. When any tier holds two or more items, duel two
 * NEIGHBOURS inside a tier ("is #4 really better than #5?"), so every duel
 * refines the order without ever changing a tier. Otherwise fall back to two
 * items sharing the same whole-number score. Among the valid pairs, the one
 * with the fewest combined duels wins (4.3), ties at random.
 */
export async function getMatchup(slug: CategorySlug): Promise<Matchup | null> {
  return matchupFrom(await loadCategory(slug));
}

/** getMatchup's choice for an already-loaded category (pure apart from Math.random). */
export function matchupFrom(all: ActivityWithMedia[]): Matchup | null {
  const board = buildTierBoard(all);
  const neighbours = fewestDuelsPair(withinTierPairs(board));
  if (neighbours) {
    const [a, b] = neighbours;
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
  const candidates = [...byScore.values()]
    .map((items) => bucketPair(items))
    .filter((p): p is [ActivityWithMedia, ActivityWithMedia] => p !== null);
  const pair = fewestDuelsPair(candidates);
  if (!pair) return null;
  const [a, b] = Math.random() < 0.5 ? pair : ([pair[1], pair[0]] as const);
  return { rating: Math.floor(a.rating ?? 0), a, b };
}

/**
 * A "Challenge tiers" matchup (4.4): the bottom title of a tier against the
 * top title of the next lower non-empty tier, least-dueled pairing first.
 * `a` is the upper title, `b` the lower one.
 */
export async function getChallengeMatchup(slug: CategorySlug): Promise<Matchup | null> {
  const board = buildTierBoard(await loadCategory(slug));
  const pairs = challengePairs(board.tiers);
  const chosen = fewestDuelsPair(pairs.map((p) => [p.upper, p.lower] as const));
  if (!chosen) return null;
  const pair = pairs.find((p) => p.upper === chosen[0] && p.lower === chosen[1])!;
  return {
    rating: null,
    a: pair.upper,
    b: pair.lower,
    challenge: { upperTier: pair.upperTier, lowerTier: pair.lowerTier },
  };
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

/** Every title the current user starred, across all domains (unordered). */
export async function getFavourites(): Promise<ActivityWithMedia[]> {
  const user = await getCurrentUser();
  if (!user) return [];

  const include = Object.fromEntries(CATEGORY_LIST.map((c) => [c.prismaModel, true]));
  const rows = await prisma.userMediaActivity.findMany({
    where: { userId: user.id, favorite: true },
    include: include as any,
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
 * members in the franchise's watch order (4.7). Manually ranked franchises come first.
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

  return rows.map((f) => {
    const orderMode = isOrderMode(f.orderMode) ? f.orderMode : 'release';
    const members = (f.activities as any[])
      .map((row) => {
        const cat = CATEGORY_LIST.find((c) => c.dbCategory === row.category);
        return cat ? flattenActivity({ ...row, franchise: null }, cat) : null;
      })
      .filter((a): a is ActivityWithMedia => a !== null);
    return {
      id: f.id,
      name: f.name,
      imageUrl: f.imageUrl,
      rating: f.rating,
      notes: f.notes,
      rankOrder: f.rankOrder,
      orderMode,
      members: orderFranchiseMembers(members, orderMode),
    };
  });
}
