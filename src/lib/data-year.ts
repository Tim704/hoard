// ───────────────────────────────────────────────────────────────────────────
//  Best of the year (spec 4.6): server-only loaders, not server actions.
//  Everything is scoped by the `userId` the caller passes (the page passes
//  the logged-in user; Task 15's year in review passes the owner of a link).
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST } from '@/lib/categories';
import { bucketPair } from '@/lib/arena-pick';
import { flattenActivity } from '@/lib/data';
import { getCurrentUser } from '@/lib/session';
import { rankYear, yearBounds, yearsOf } from '@/lib/year-arena';
import type { ActivityWithMedia, Matchup } from '@/lib/types';

/** Statuses that count as finished for "best of" (a drop is not a finish). */
const FINISHED = ['COMPLETED', 'RETIRED'] as const;

/**
 * The ids of `userId`'s titles finished in `year`: a diary entry dated in
 * that year, on a title that is completed or retired now (or being
 * rewatched after such a finish).
 */
export async function yearCandidateIds(userId: string, year: number): Promise<string[]> {
  const { from, to } = yearBounds(year);
  const entries = await prisma.diaryEntry.findMany({
    where: {
      userId,
      date: { gte: from, lte: to },
      activity: { userId, OR: [{ status: { in: [...FINISHED] } }, { rewatching: true }] },
    },
    select: { activityId: true },
    distinct: ['activityId'],
  });
  return entries.map((e) => e.activityId);
}

/**
 * The year's candidates as activities whose `elo` and `duels` are the YEAR's
 * (1200 / 0 until their first year duel), best first.
 */
export async function yearRanking(userId: string, year: number): Promise<ActivityWithMedia[]> {
  const ids = await yearCandidateIds(userId, year);
  if (ids.length === 0) return [];
  const include = Object.fromEntries(CATEGORY_LIST.map((c) => [c.prismaModel, true]));
  const [rows, scores] = await Promise.all([
    prisma.userMediaActivity.findMany({ where: { userId, id: { in: ids } }, include: include as any }),
    prisma.yearDuelScore.findMany({ where: { userId, year, activityId: { in: ids } } }),
  ]);
  const byActivity = new Map(scores.map((s) => [s.activityId, s]));
  const items = rows
    .map((row) => {
      const cat = CATEGORY_LIST.find((c) => c.dbCategory === row.category);
      const a = cat ? flattenActivity(row, cat) : null;
      if (!a) return null;
      const s = byActivity.get(a.id);
      return { ...a, elo: s?.elo ?? 1200, duels: s?.duels ?? 0 };
    })
    .filter((a): a is ActivityWithMedia => a !== null);
  return rankYear(items);
}

/** The year's top three titles, best first (for the year in review, 6.1). */
export async function yearTopThree(userId: string, year: number): Promise<ActivityWithMedia[]> {
  return (await yearRanking(userId, year)).slice(0, 3);
}

/** A year duel: the two least-dueled candidates (random among equals), random sides. */
export function yearMatchupFrom(ranking: ActivityWithMedia[]): Matchup | null {
  const pair = bucketPair(ranking);
  if (!pair) return null;
  const [a, b] = Math.random() < 0.5 ? pair : [pair[1], pair[0]];
  return { rating: null, a, b };
}

/** Years in which `userId` has diary entries, newest first. */
export async function diaryYears(userId: string): Promise<number[]> {
  const rows = await prisma.diaryEntry.findMany({
    where: { userId },
    select: { date: true },
    distinct: ['date'],
  });
  return yearsOf(rows.map((r) => r.date));
}

export interface YearArenaPage {
  year: number;
  years: number[];
  ranking: ActivityWithMedia[];
  matchup: Matchup | null;
}

/** Everything /arena/year/[year] shows, for the logged-in user (null when logged out). */
export async function getYearArenaPage(year: number): Promise<YearArenaPage | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const [years, ranking] = await Promise.all([diaryYears(user.id), yearRanking(user.id, year)]);
  return { year, years, ranking, matchup: yearMatchupFrom(ranking) };
}
