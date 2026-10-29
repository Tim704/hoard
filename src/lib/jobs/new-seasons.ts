// ───────────────────────────────────────────────────────────────────────────
//  The `new-seasons` job (spec 5.5 / 5.6, 04:00 server time). Three steps:
//
//  1. Shows: refresh finished and ongoing TV whose status isn't Ended or
//     Canceled through the TMDB details call (counts, status, next air date,
//     and the `TvSeason` rows), at most 100 a night, paced, oldest fetch
//     first and only shows not refreshed in the last 20 h. With up to 700 a
//     week, the calendar's next episodes stay fresh far inside the 30-day
//     metadata cadence.
//  2. Detection: every finished show with an aired season beyond its
//     `seenSeasonCount` gets one "new-seasons" notification per (activity,
//     season number); `notify`'s dedupe key stops re-runs from re-sending.
//     A finished show with no recorded count yet is baselined silently.
//  3. Unreleased sequels: walk the AniList relations of franchises with anime
//     or manga members (20 a night, least recently tried first) and cache
//     their NOT_YET_RELEASED entries on `Franchise.upcoming`. A failed walk
//     keeps the old entries but stamps the attempt, so it can't starve others.
//
//  (Airing anime are refreshed by the separate `airing` job at 06:30, AFTER
//  the 06:00 `releases` job: refreshing at 04:00 would move an episode that
//  aired at 01:00 on to next week before "New episode today" was sent.)
//
//  Each step fails on its own; the job reports every failure at the end.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { anilistQuery, fetchAniListDetails } from '@/lib/apis/anilist';
import { detailsConfigured, fetchDetailPatch, isLookupSkipped, splitSeasons } from '@/lib/apis/details';
import { CATEGORY_LIST, type CategorySlug } from '@/lib/categories';
import { aniListStart, GRAPH_FIELDS, walkAniList, type AniListGraphNode } from '@/lib/franchise/missing';
import { extractUpcoming, parseUpcoming, type StatusNode } from '@/lib/franchise/upcoming';
import { saveTvSeasons } from '@/lib/library/tv-seasons';
import { airedSeasonCount, canGetSeasons, newAiredSeasons, newSeasonKey } from '@/lib/new-seasons';
import { notify } from '@/lib/notify';
import { serverTimeZone } from '@/lib/prefs';
import { todayYmd } from '@/lib/release';
import { universalTitleHref } from '@/lib/title-href';

export const NEW_SEASONS_MAX_SHOWS = 100;
export const SHOW_REFRESH_HOURS = 20;
export const SHOW_DELAY_MS = 600;
/** Stop TMDB after this many failures in a row (it is down or the key is bad). */
const MAX_FAILURES_IN_A_ROW = 3;
export const AIRING_MAX_ANIME = 500;
export const SEQUEL_FRANCHISES_PER_NIGHT = 20;
const FRANCHISE_GAP_MS = 700;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

// ── Pure planning ──────────────────────────────────────────────────────────

export interface FinishedShowRow {
  activityId: string;
  userId: string;
  title: string;
  seenSeasonCount: number | null;
  seasonCount: number | null;
  seasons: { seasonNumber: number; airDate: string | null }[];
}

export interface SeasonNotice {
  activityId: string;
  userId: string;
  title: string;
  season: number;
}

/**
 * What step 3 does: the rows to baseline (finished before seasons were
 * recorded) and one notice per aired new season.
 */
export function planSeasonNotices(
  rows: readonly FinishedShowRow[],
  today: string,
): { baseline: { activityId: string; seasonCount: number }[]; notices: SeasonNotice[] } {
  const baseline: { activityId: string; seasonCount: number }[] = [];
  const notices: SeasonNotice[] = [];
  for (const r of rows) {
    if (r.seenSeasonCount == null) {
      const seen = airedSeasonCount(r.seasons, r.seasonCount, today);
      if (seen != null) baseline.push({ activityId: r.activityId, seasonCount: seen });
      continue;
    }
    for (const season of newAiredSeasons(r, today)) {
      notices.push({ activityId: r.activityId, userId: r.userId, title: r.title, season });
    }
  }
  return { baseline, notices };
}

/** The notification for one new season. */
export function seasonNotification(n: SeasonNotice) {
  return {
    kind: 'new-seasons' as const,
    title: `New season: ${n.title}`,
    body: `Season ${n.season} of ${n.title} is out.`,
    // Stored with the notification: the universal link, whatever the title view.
    url: universalTitleHref('tv', n.activityId),
    dedupeKey: newSeasonKey(n.activityId, n.season),
  };
}

/** Franchises to refresh tonight: never refreshed first, then the oldest. */
export function pickSequelFranchises<T extends { upcoming: unknown }>(rows: readonly T[], limit: number): T[] {
  const at = (r: T) => parseUpcoming(r.upcoming)?.fetchedAt || '';
  return [...rows].sort((a, b) => at(a).localeCompare(at(b))).slice(0, limit);
}

// ── Steps ──────────────────────────────────────────────────────────────────

/** TMDB's spellings of a finished show (filtered in the query). */
const ENDED_STATUSES = ['Ended', 'Canceled', 'Cancelled', 'ended', 'canceled', 'cancelled'];

const NOT_SKIPPED = [{ externalId: { startsWith: 'manual:' } }, { externalId: { startsWith: 'demo-' } }];

async function refreshShows(now: Date, failed: string[]): Promise<void> {
  if (!detailsConfigured('tv')) return;
  const shows = await prisma.tvShow.findMany({
    where: {
      activities: { some: { category: 'TV', status: { in: ['COMPLETED', 'CONSUMING'] } } },
      AND: [
        { OR: [{ metaFetchedAt: null }, { metaFetchedAt: { lt: new Date(now.getTime() - SHOW_REFRESH_HOURS * 3_600_000) } }] },
        { OR: [{ status: null }, { status: { notIn: ENDED_STATUSES } }] },
      ],
      NOT: NOT_SKIPPED,
    },
    select: { id: true, externalId: true, title: true, status: true },
    orderBy: [{ metaFetchedAt: { sort: 'asc', nulls: 'first' } }, { createdAt: 'asc' }],
    take: NEW_SEASONS_MAX_SHOWS * 2,
  });
  // canGetSeasons also catches odd spellings the query's list doesn't.
  const due = shows.filter((s) => canGetSeasons(s.status)).slice(0, NEW_SEASONS_MAX_SHOWS);
  let inARow = 0;
  for (const [i, show] of due.entries()) {
    if (i > 0) await sleep(SHOW_DELAY_MS);
    try {
      const patch = await fetchDetailPatch('tv', { externalId: show.externalId, title: show.title });
      const { columns, seasons } = patch ? splitSeasons(patch) : { columns: {}, seasons: null };
      await prisma.tvShow.update({ where: { id: show.id }, data: { ...columns, metaFetchedAt: now, metaFailedAt: null } });
      if (seasons?.length) await saveTvSeasons(prisma, show.id, seasons);
      inARow = 0;
    } catch (err) {
      failed.push(`tv ${show.externalId}: ${message(err)}`);
      await prisma.tvShow.update({ where: { id: show.id }, data: { metaFailedAt: now } }).catch(() => {});
      if (++inARow >= MAX_FAILURES_IN_A_ROW) {
        failed.push('TMDB failed repeatedly; the remaining shows wait for the next run');
        return;
      }
    }
  }
}

/**
 * The `airing` job (06:30, after `releases`): refresh `nextAiringAt` /
 * `nextAiringEpisode` of library anime that are airing or about to start,
 * in batched AniList queries, so the calendar stays current between the
 * 30-day metadata refreshes. Throws a summary on failures.
 */
export async function runAiring(now: Date = new Date()): Promise<void> {
  const failed: string[] = [];
  await refreshAiringAnime(now, failed);
  if (failed.length) throw new Error(`Airing: ${failed.length} problem(s): ${failed.slice(0, 5).join('; ')}`);
}

async function refreshAiringAnime(now: Date, failed: string[]): Promise<void> {
  // Airing now (a scheduled episode, even a stale one) or starting soon / recently.
  const monthAgo = todayYmd(serverTimeZone(), new Date(now.getTime() - 30 * 86_400_000));
  const rows = await prisma.anime.findMany({
    where: {
      activities: { some: { status: { in: ['PLANNED', 'CONSUMING', 'COMPLETED', 'ON_HOLD'] } } },
      OR: [{ nextAiringAt: { not: null } }, { releaseDate: { gte: monthAgo } }],
      NOT: NOT_SKIPPED,
    },
    select: { id: true, externalId: true },
    orderBy: { metaFetchedAt: { sort: 'asc', nulls: 'first' } },
    take: AIRING_MAX_ANIME,
  });
  if (!rows.length) return;
  let found: Map<string, Record<string, unknown>>;
  try {
    found = await fetchAniListDetails('ANIME', rows.map((r) => r.externalId));
  } catch (err) {
    failed.push(`anime airing: ${message(err)}`);
    return;
  }
  for (const r of rows) {
    const patch = found.get(r.externalId);
    if (!patch) continue;
    try {
      await prisma.anime.update({ where: { id: r.id }, data: { ...patch, metaFetchedAt: now, metaFailedAt: null } });
    } catch (err) {
      failed.push(`anime ${r.externalId}: ${message(err)}`);
    }
  }
}

async function detectNewSeasons(now: Date, failed: string[]): Promise<number> {
  const rows = await prisma.userMediaActivity.findMany({
    where: { category: 'TV', status: 'COMPLETED' },
    select: {
      id: true,
      userId: true,
      seenSeasonCount: true,
      tvShow: {
        select: { title: true, seasonCount: true, seasons: { select: { seasonNumber: true, airDate: true } } },
      },
    },
  });
  const plan = planSeasonNotices(
    rows
      .filter((r) => r.tvShow)
      .map((r) => ({
        activityId: r.id,
        userId: r.userId,
        title: r.tvShow!.title,
        seenSeasonCount: r.seenSeasonCount,
        seasonCount: r.tvShow!.seasonCount,
        seasons: r.tvShow!.seasons,
      })),
    todayYmd(serverTimeZone(), now),
  );
  for (const b of plan.baseline) {
    // Only while still unset, so a "Got it" in between is never overwritten.
    await prisma.userMediaActivity.updateMany({
      where: { id: b.activityId, seenSeasonCount: null },
      data: { seenSeasonCount: b.seasonCount },
    });
  }
  let sent = 0;
  for (const n of plan.notices) {
    const res = await notify(n.userId, seasonNotification(n));
    // A failed push is recorded on the row itself; only a missing row counts here.
    if (res.id) sent++;
    else if (!res.duplicate) failed.push(`notify ${n.activityId}: ${res.push.error ?? 'not created'}`);
  }
  return sent;
}

const STATUS_FIELDS = `${GRAPH_FIELDS} status`;
const SEQUEL_BY_MAL = `query ($ids: [Int], $type: MediaType) {
  Page(perPage: 50) { media(idMal_in: $ids, type: $type) { ${STATUS_FIELDS} } } }`;
const SEQUEL_BY_IDS = `query ($ids: [Int]) {
  Page(perPage: 50) { media(id_in: $ids) { ${STATUS_FIELDS} } } }`;

const ANILIST_CATS = CATEGORY_LIST.filter((c) => c.slug === 'anime' || c.slug === 'manga');

async function refreshSequels(now: Date, failed: string[]): Promise<void> {
  const franchises = await prisma.franchise.findMany({
    where: { activities: { some: { category: { in: ['ANIME', 'MANGA'] } } } },
    select: { id: true, upcoming: true },
  });
  const today = todayYmd(serverTimeZone(), now);
  for (const [i, f] of pickSequelFranchises(franchises, SEQUEL_FRANCHISES_PER_NIGHT).entries()) {
    if (i > 0) await sleep(FRANCHISE_GAP_MS);
    const members: { slug: CategorySlug; externalId: string }[] = [];
    for (const cat of ANILIST_CATS) {
      const acts = await prisma.userMediaActivity.findMany({
        where: { franchiseId: f.id, category: cat.dbCategory },
        select: { [cat.prismaModel]: { select: { externalId: true } } } as any,
      });
      for (const a of acts as any[]) {
        const id = a[cat.prismaModel]?.externalId;
        if (typeof id === 'string' && !isLookupSkipped(id)) members.push({ slug: cat.slug, externalId: id });
      }
    }
    const start = aniListStart(members);
    let items: ReturnType<typeof extractUpcoming> = [];
    if (start.al.length || start.mal.ANIME.length || start.mal.MANGA.length) {
      try {
        const nodes = await walkAniList(start, {
          byMal: (type, ids) => anilistQuery<AniListGraphNode>(SEQUEL_BY_MAL, { ids, type }, 'AniList sequels'),
          byIds: (ids) => anilistQuery<AniListGraphNode>(SEQUEL_BY_IDS, { ids }, 'AniList sequels'),
          pause: sleep,
        });
        items = extractUpcoming(nodes as StatusNode[], today);
      } catch (err) {
        failed.push(`sequels ${f.id}: ${message(err)}`);
        // Keep the old items but stamp the attempt, so a franchise that keeps
        // failing goes to the back of the queue instead of starving the rest.
        await prisma.franchise.update({
          where: { id: f.id },
          data: { upcoming: { fetchedAt: now.toISOString(), items: (parseUpcoming(f.upcoming)?.items ?? []) as any } },
        });
        continue;
      }
    }
    await prisma.franchise.update({
      where: { id: f.id },
      data: { upcoming: { fetchedAt: now.toISOString(), items: items as any } },
    });
  }
}

/** One run of the job. Throws a summary when any step had failures. */
export async function runNewSeasons(now: Date = new Date()): Promise<{ notified: number }> {
  const failed: string[] = [];
  const step = async (name: string, run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (err) {
      failed.push(`${name}: ${message(err)}`);
    }
  };
  let notified = 0;
  await step('shows', () => refreshShows(now, failed));
  await step('detect', async () => {
    notified = await detectNewSeasons(now, failed);
  });
  await step('sequels', () => refreshSequels(now, failed));
  if (failed.length) {
    const shown = failed.slice(0, 5).join('; ');
    const more = failed.length > 5 ? ` (+${failed.length - 5} more)` : '';
    throw new Error(`New seasons: ${failed.length} problem(s): ${shown}${more}`);
  }
  return { notified };
}
