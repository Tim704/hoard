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
import type { ActivityWithMedia, MediaItem, Matchup } from '@/lib/types';

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
    elo: row.elo,
    favorite: row.favorite,
    notes: row.notes,
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
    include: { [cat.prismaModel]: true } as any,
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

/**
 * Build an Arena matchup for a category: among the user's rated rows, find a
 * 1–10 score shared by at least two items and pick two distinct rows at random.
 * Returns `null` when no rating value has a pair. (Same-rating duels keep the
 * Arena meaningful — it breaks ties the coarse 1–10 score cannot.)
 */
export async function getMatchup(slug: CategorySlug): Promise<Matchup | null> {
  const cat = getCategory(slug);
  if (!cat) return null;

  const user = await getCurrentUser();
  if (!user) return null;

  const rows = await prisma.userMediaActivity.findMany({
    where: { userId: user.id, category: cat.dbCategory, rating: { not: null } },
    include: { [cat.prismaModel]: true } as any,
  });

  // Group eligible rows by their rating value.
  const byRating = new Map<number, ActivityWithMedia[]>();
  for (const row of rows) {
    const flat = flattenActivity(row, cat);
    if (!flat || flat.rating == null) continue;
    const bucket = byRating.get(flat.rating);
    if (bucket) bucket.push(flat);
    else byRating.set(flat.rating, [flat]);
  }

  // Keep only ratings that actually have a pair to duel.
  const eligible = [...byRating.entries()].filter(([, items]) => items.length >= 2);
  if (eligible.length === 0) return null;

  // Pick a random eligible rating, then two distinct rows within it.
  const [rating, items] = eligible[Math.floor(Math.random() * eligible.length)];
  const firstIdx = Math.floor(Math.random() * items.length);
  let secondIdx = Math.floor(Math.random() * (items.length - 1));
  if (secondIdx >= firstIdx) secondIdx += 1; // ensure distinct from the first

  return { rating, a: items[firstIdx], b: items[secondIdx] };
}

/**
 * The user's rated rows for a category, sorted by hidden Elo descending — this
 * is the dynamic 1..N ranking surfaced in the Arena and ranking views.
 */
export async function getRanking(slug: CategorySlug): Promise<ActivityWithMedia[]> {
  const cat = getCategory(slug);
  if (!cat) return [];

  const user = await getCurrentUser();
  if (!user) return [];

  const rows = await prisma.userMediaActivity.findMany({
    where: { userId: user.id, category: cat.dbCategory, rating: { not: null } },
    include: { [cat.prismaModel]: true } as any,
    orderBy: { elo: 'desc' },
  });

  return rows
    .map((row) => flattenActivity(row, cat))
    .filter((a): a is ActivityWithMedia => a !== null);
}
