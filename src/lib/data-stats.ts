// ───────────────────────────────────────────────────────────────────────────
//  Stats (spec 6.x): server-only loaders, not server actions.
//
//  Everything is computed per request from ONE user's own rows (G2): the
//  caller passes the `userId` (the pages pass the logged-in user; a year
//  share link passes its owner). Queries select only the columns the pure
//  functions in src/lib/stats/*.ts read. Sections hidden in Settings drop
//  out of the stats (goals still measure the section they name).
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST, NAV_ORDER, type CategorySlug } from '@/lib/categories';
import { crowdScore } from '@/lib/crowd';
import { getPrefs } from '@/lib/data-prefs';
import { diaryYears, yearTopThree } from '@/lib/data-year';
import { effectiveTimeZone, type Prefs } from '@/lib/prefs';
import { progressTotal } from '@/lib/progress';
import { todayYmd } from '@/lib/release';
import { displayTitle } from '@/lib/title';
import { yearBounds } from '@/lib/year-arena';
import {
  avgScoreByYear,
  crowdOverview,
  dropRates,
  finishedPerMonth,
  statusMix,
  topGenres,
} from '@/lib/stats/charts';
import { comparePair, periodSummary, type ComparePair, type PeriodSummary } from '@/lib/stats/compare';
import { goalsProgress, isGoalMetric, type Goal, type GoalProgress } from '@/lib/stats/goals';
import { countsAsFinished, sectionStat, type SectionStat } from '@/lib/stats/measures';
import { topPeople } from '@/lib/stats/people';
import { daysOf, streaks } from '@/lib/stats/streaks';
import { dropPoints, genreDrift, progressAtDrop, type DropEvent } from '@/lib/stats/taste';
import { yearSummary, type YearSummary } from '@/lib/stats/year';
import type { DayRange, FinishEntry, StatTitle } from '@/lib/stats/types';
import type { Status } from '@/lib/status';
import type { Tier } from '@/lib/tiers';
import type { MediaItem } from '@/lib/types';

// ── Raw loading ─────────────────────────────────────────────────────────────

/** Per media relation: only the columns stats read. */
const MEDIA_SELECT = {
  book: { select: { title: true, imageUrl: true, genres: true, pageCount: true } },
  movie: {
    select: { title: true, imageUrl: true, genres: true, runtime: true, directors: true, cast: true, tmdbRating: true },
  },
  tvShow: {
    select: {
      title: true,
      imageUrl: true,
      genres: true,
      episodeCount: true,
      episodeRunTime: true,
      directors: true,
      cast: true,
      tmdbRating: true,
    },
  },
  anime: {
    select: {
      title: true,
      titleEnglish: true,
      titleRomaji: true,
      titleNative: true,
      imageUrl: true,
      genres: true,
      episodes: true,
      malScore: true,
    },
  },
  manga: {
    select: {
      title: true,
      titleEnglish: true,
      titleRomaji: true,
      titleNative: true,
      imageUrl: true,
      genres: true,
      chapters: true,
      malScore: true,
    },
  },
  videoGame: { select: { title: true, imageUrl: true, genres: true, igdbRating: true } },
  musicAlbum: { select: { title: true, imageUrl: true, genres: true, trackCount: true } },
} as const;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);

/** The user's titles as stats see them (optionally only some ids). */
export async function loadStatTitles(userId: string, prefs: Prefs, ids?: string[]): Promise<StatTitle[]> {
  const hidden = new Set<string>(prefs.hiddenSections);
  const cats = CATEGORY_LIST.filter((c) => !hidden.has(c.slug));
  if (cats.length === 0 || (ids && ids.length === 0)) return [];
  const rows = await prisma.userMediaActivity.findMany({
    where: { userId, category: { in: cats.map((c) => c.dbCategory) }, ...(ids ? { id: { in: ids } } : {}) },
    select: {
      id: true,
      category: true,
      status: true,
      rating: true,
      tier: true,
      progress: true,
      rewatching: true,
      franchise: { select: { id: true, name: true } },
      ...MEDIA_SELECT,
    },
  });
  const out: StatTitle[] = [];
  for (const row of rows) {
    const cat = cats.find((c) => c.dbCategory === row.category);
    // Sanctioned dynamic access: the one populated relation of seven.
    const media = cat ? ((row as Record<string, unknown>)[cat.prismaModel] as Record<string, unknown> | null) : null;
    if (!cat || !media) continue;
    out.push({
      id: row.id,
      category: cat.slug,
      status: row.status as Status,
      rating: row.rating,
      tier: (row.tier as Tier | null) ?? null,
      progress: row.progress,
      rewatching: row.rewatching,
      franchise: row.franchise,
      media: {
        title: displayTitle(media as { title: string }, prefs.titleLanguage),
        imageUrl: typeof media.imageUrl === 'string' ? media.imageUrl : null,
        genres: strings(media.genres),
        runtime: num(media.runtime),
        episodeCount: num(media.episodeCount),
        episodeRunTime: num(media.episodeRunTime),
        episodes: num(media.episodes),
        pageCount: num(media.pageCount),
        chapters: num(media.chapters),
        trackCount: num(media.trackCount),
        directors: strings(media.directors),
        cast: strings(media.cast),
        crowd: crowdScore(media, cat.slug),
      },
    });
  }
  return out;
}

/** The user's diary entries (finishes), optionally inside a range of days. */
export async function loadFinishEntries(userId: string, range?: DayRange): Promise<FinishEntry[]> {
  return prisma.diaryEntry.findMany({
    where: { userId, ...(range ? { date: { gte: range.from, lte: range.to } } : {}) },
    select: { activityId: true, date: true, rating: true },
    orderBy: { date: 'asc' },
  });
}

/**
 * Days (in the user's zone) with any activity event or diary entry. Events
 * come back as distinct 15-minute buckets — every zone's offset is a multiple
 * of 15 minutes, so a bucket never straddles a local midnight — which keeps
 * the rows bounded however many events a day had.
 */
async function loadActiveDays(userId: string, timeZone: string): Promise<Set<string>> {
  const [buckets, diary] = await Promise.all([
    prisma.$queryRaw<{ b: Date }[]>`
      SELECT DISTINCT to_timestamp(floor(extract(epoch FROM "at") / 900) * 900) AS b
      FROM "ActivityEvent" WHERE "userId" = ${userId}`,
    prisma.diaryEntry.findMany({ where: { userId }, select: { date: true }, distinct: ['date'] }),
  ]);
  const days = daysOf(
    buckets.map((r) => r.b),
    timeZone,
  );
  for (const d of diary) days.add(d.date);
  return days;
}

// ── Overview (/stats) ───────────────────────────────────────────────────────

export interface OverviewSection extends SectionStat {
  slug: CategorySlug;
}

export interface StatsOverview {
  today: string;
  sections: OverviewSection[];
  statusMix: ReturnType<typeof statusMix>;
  dropRates: ReturnType<typeof dropRates>;
  crowd: ReturnType<typeof crowdOverview>;
  streaks: ReturnType<typeof streaks>;
  chartYear: number;
  /** Years with diary entries, newest first (for the per-month chart's picker). */
  years: number[];
  perMonth: ReturnType<typeof finishedPerMonth>;
  genres: ReturnType<typeof topGenres>;
  scoreByYear: ReturnType<typeof avgScoreByYear>;
}

/** Everything the Overview tab shows. `chartYear` null = the current year. */
export async function getStatsOverview(userId: string, chartYear: number | null): Promise<StatsOverview> {
  const prefs = await getPrefs(userId);
  const tz = effectiveTimeZone(prefs);
  const today = todayYmd(tz);
  const [titles, entries, days, years] = await Promise.all([
    loadStatTitles(userId, prefs),
    loadFinishEntries(userId),
    loadActiveDays(userId, tz),
    diaryYears(userId),
  ]);
  const year = chartYear ?? Number(today.slice(0, 4));
  const sections = NAV_ORDER.filter((slug) => !prefs.hiddenSections.includes(slug)).map((slug) => ({
    slug,
    ...sectionStat(slug, titles.filter((t) => t.category === slug)),
  }));
  return {
    today,
    sections,
    statusMix: statusMix(titles),
    dropRates: dropRates(titles),
    crowd: crowdOverview(titles, 10),
    streaks: streaks(days, today),
    chartYear: year,
    years,
    perMonth: finishedPerMonth(titles, entries, year),
    genres: topGenres(titles, 10),
    scoreByYear: avgScoreByYear(titles, entries),
  };
}

// ── Year in review (/stats/year/[year]) ─────────────────────────────────────

export interface YearReview {
  summary: YearSummary;
  /** The best-of-year Arena's top 3 (4.6), only once a year duel exists. */
  topThree: { id: string; category: CategorySlug; title: string; imageUrl: string | null }[];
  /** Years with diary entries, newest first. */
  years: number[];
  perMonth: ReturnType<typeof finishedPerMonth>;
}

/** The year in review of `userId` (also behind a year share link). */
export async function getYearReview(userId: string, year: number): Promise<YearReview> {
  const prefs = await getPrefs(userId);
  const [entries, years, top] = await Promise.all([
    loadFinishEntries(userId, yearBounds(year)),
    diaryYears(userId),
    yearTopThree(userId, year),
  ]);
  const titles = await loadStatTitles(userId, prefs, [...new Set(entries.map((e) => e.activityId))]);
  const hidden = new Set<string>(prefs.hiddenSections);
  const topThree = top.some((a) => a.duels > 0)
    ? top
        .filter((a) => !hidden.has(a.category))
        .map((a) => ({
          id: a.id,
          category: a.category,
          title: displayTitle(a.media, prefs.titleLanguage),
          imageUrl: a.media.imageUrl,
        }))
    : [];
  return { summary: yearSummary(titles, entries, year), topThree, years, perMonth: finishedPerMonth(titles, entries, year) };
}

// ── Goals (/stats?tab=goals and the dashboard tile) ─────────────────────────

/** The user's goals for `year` with their progress (sorted for display). */
export async function getGoalsProgress(userId: string, year: number): Promise<GoalProgress[]> {
  const rows = await prisma.goal.findMany({
    where: { userId, year },
    select: { id: true, year: true, category: true, metric: true, target: true },
  });
  const goals: Goal[] = rows
    .filter((g) => isGoalMetric(g.metric))
    .map((g) => ({ ...g, category: (g.category as CategorySlug | null) ?? null, metric: g.metric as Goal['metric'] }));
  if (goals.length === 0) return [];
  const prefs = await getPrefs(userId);
  const entries = await loadFinishEntries(userId, yearBounds(year));
  // Goals measure the section they name, even one hidden in Settings.
  const titles = await loadStatTitles(userId, { ...prefs, hiddenSections: [] }, [...new Set(entries.map((e) => e.activityId))]);
  return goalsProgress(goals, titles, entries);
}

/** Today's year in the user's zone. */
export async function currentYear(userId: string): Promise<number> {
  return Number(todayYmd(effectiveTimeZone(await getPrefs(userId))).slice(0, 4));
}

// ── Taste (/stats?tab=taste) ────────────────────────────────────────────────

export interface TastePage {
  drops: ReturnType<typeof dropPoints>;
  drift: ReturnType<typeof genreDrift>;
  compare: {
    preset: ComparePair['preset'];
    ranges: { a: ComparePair['a']; b: ComparePair['b'] };
    a: PeriodSummary;
    b: PeriodSummary;
  };
}

export interface CompareQuery {
  preset?: string;
  a1?: string;
  a2?: string;
  b1?: string;
  b2?: string;
}

/** Drop points, genre drift and the two compared periods. */
export async function getTastePage(userId: string, q: CompareQuery): Promise<TastePage> {
  const prefs = await getPrefs(userId);
  const today = todayYmd(effectiveTimeZone(prefs));
  const [titles, entries] = await Promise.all([loadStatTitles(userId, prefs), loadFinishEntries(userId)]);

  // Drop points: the progress at each current drop's DROPPED event.
  const dropped = titles.filter((t) => t.status === 'DROPPED');
  const events = dropped.length
    ? await prisma.activityEvent.findMany({
        where: { userId, activityId: { in: dropped.map((t) => t.id) }, kind: { in: ['status', 'progress'] } },
        select: { activityId: true, kind: true, to: true, at: true },
      })
    : [];
  const byActivity = new Map<string, DropEvent[]>();
  for (const e of events) byActivity.set(e.activityId, [...(byActivity.get(e.activityId) ?? []), e]);
  const drops = dropPoints(
    dropped.map((t) => ({
      category: t.category,
      progress: progressAtDrop(byActivity.get(t.id) ?? [], t.progress),
      total: progressTotal({ category: t.category, media: t.media as unknown as MediaItem }),
    })),
  );

  const pair = comparePair(q.preset, today, { a: [q.a1, q.a2], b: [q.b1, q.b2] });
  return {
    drops,
    drift: genreDrift(titles, entries),
    compare: {
      preset: pair.preset,
      ranges: { a: pair.a, b: pair.b },
      a: periodSummary(titles, entries, pair.a),
      b: periodSummary(titles, entries, pair.b),
    },
  };
}

// ── People (/stats?tab=people) ──────────────────────────────────────────────

export async function getPeoplePage(userId: string) {
  const prefs = await getPrefs(userId);
  const titles = (await loadStatTitles(userId, prefs)).filter(
    (t) => (t.category === 'movies' || t.category === 'tv') && countsAsFinished(t),
  );
  return {
    directors: topPeople(titles, 'directors', 10),
    cast: topPeople(titles, 'cast', 10),
    /** Finished movies/shows whose credits are known (F2 metadata may still be filling in). */
    withCredits: titles.filter((t) => t.media.directors.length || t.media.cast.length).length,
  };
}
