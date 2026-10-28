// ───────────────────────────────────────────────────────────────────────────
//  Activity feed (9.2), server side. Strict privacy (G2):
//    - only users whose prefs say feedOptIn are read, and the viewer only
//      when they opted in too; buildFeed (src/lib/feed.ts) filters again;
//    - it is computed per request from the owners' own rows, so opting out
//      takes everyone's view of you away at once (nothing is copied);
//    - an entry carries the username, the catalogue row, the section, the
//      kind, its time and (finishes and drops) the score, nothing else.
// ───────────────────────────────────────────────────────────────────────────

import { CATEGORY_LIST, type CategorySlug } from '@/lib/categories';
import { Prisma } from '@prisma/client';

import {
  buildFeed,
  diaryHorizon,
  FEED_DAYS,
  FEED_PAGE_SIZE,
  latestHorizon,
  sourceHorizon,
  type FeedCursor,
  type FeedKind,
} from '@/lib/feed';
import { effectiveTimeZone, parsePrefs, type Prefs } from '@/lib/prefs';
import { prisma } from '@/lib/prisma';
import { todayYmd } from '@/lib/release';
import { displayTitle } from '@/lib/title';

/** Rows read per source and request (a bound; the window is 30 days). */
const SOURCE_CAP = 2000;

/**
 * Not an undo (`meta.undo` true). A plain NOT would also drop rows whose meta
 * is NULL or lacks the key (SQL NULL), so match those explicitly.
 */
const NOT_UNDO: Prisma.ActivityEventWhereInput = {
  OR: [
    { meta: { equals: Prisma.DbNull } },
    { meta: { path: ['undo'], equals: Prisma.AnyNull } },
    { meta: { path: ['undo'], equals: false } },
  ],
};

export interface FeedItem {
  kind: FeedKind;
  username: string;
  isMe: boolean;
  slug: CategorySlug;
  title: string;
  imageUrl: string | null;
  year: number | null;
  /** 0–10 score for finishes (the run's) and drops (the title's), else null. */
  rating: number | null;
  rewatch: boolean;
  at: string; // ISO
}

/** Every user who opted in to the feed: id → username and time zone. */
async function feedUsers(): Promise<Map<string, { username: string; timeZone: string }>> {
  const rows = await prisma.user.findMany({
    where: { prefs: { path: ['feedOptIn'], equals: true } },
    select: { id: true, username: true, prefs: true },
  });
  const out = new Map<string, { username: string; timeZone: string }>();
  for (const r of rows) {
    const p = parsePrefs(r.prefs);
    // Only a real `true` counts (the same rule as everywhere else).
    if (p.feedOptIn === true) out.set(r.id, { username: r.username, timeZone: effectiveTimeZone(p) });
  }
  return out;
}

/**
 * One page of the feed for `meId`. The viewer's own entries appear only when
 * `myPrefs.feedOptIn` is on (they are in the opted-in set exactly then).
 */
export async function getFeedPage(
  meId: string,
  myPrefs: Prefs,
  cursor: FeedCursor | null,
  now: Date = new Date(),
): Promise<{ items: FeedItem[]; next: FeedCursor | null }> {
  const users = await feedUsers();
  if (!myPrefs.feedOptIn) users.delete(meId);
  if (users.size === 0) return { items: [], next: null };
  const ids = [...users.keys()];

  const since = new Date(now.getTime() - FEED_DAYS * 86_400_000);
  const upper = cursor ? cursor.at : new Date(now.getTime() + 60_000);
  // Diary days are YYYY-MM-DD; a day of slack each side covers every zone.
  const fromDay = todayYmd('UTC', new Date(since.getTime() - 86_400_000));
  const toDay = todayYmd('UTC', new Date(upper.getTime() + 86_400_000));

  const [diary, events, undos] = await Promise.all([
    prisma.diaryEntry.findMany({
      where: { userId: { in: ids }, date: { gte: fromDay, lte: toDay } },
      select: { id: true, userId: true, activityId: true, date: true, createdAt: true, rating: true, rewatch: true },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: SOURCE_CAP,
    }),
    // Feed entries only, so the cap is spent on rows that count: drops, and
    // placements into S from elsewhere (an Arena swap inside S has from = S);
    // never undo events.
    prisma.activityEvent.findMany({
      where: {
        userId: { in: ids },
        at: { gte: since, lte: upper },
        AND: [
          NOT_UNDO,
          {
            OR: [
              { kind: 'status', to: 'DROPPED' },
              { kind: 'tier', to: 'S', OR: [{ from: null }, { from: { not: 'S' } }] },
            ],
          },
        ],
      },
      select: { id: true, userId: true, activityId: true, kind: true, from: true, to: true, at: true, meta: true },
      orderBy: { at: 'desc' },
      take: SOURCE_CAP,
    }),
    // Undos that took a drop or an S placement back (later than the entry).
    prisma.activityEvent.findMany({
      where: {
        userId: { in: ids },
        at: { gte: since },
        meta: { path: ['undo'], equals: true },
        OR: [
          { kind: 'status', from: 'DROPPED' },
          { kind: 'tier', from: 'S' },
        ],
      },
      select: { activityId: true, kind: true, from: true, at: true },
      orderBy: { at: 'desc' },
      take: 5 * SOURCE_CAP,
    }),
  ]);

  const page = buildFeed(diary, events, {
    allowed: new Set(ids),
    now,
    cursor,
    undos,
    horizon: latestHorizon(diaryHorizon(diary, SOURCE_CAP), sourceHorizon(events, SOURCE_CAP)),
    limit: FEED_PAGE_SIZE,
    ymdOf: (userId, at) => todayYmd(users.get(userId)?.timeZone ?? 'UTC', at),
  });
  if (page.entries.length === 0) return { items: [], next: null };

  // The titles: catalogue rows only (plus the current score, for drops).
  const mediaInclude = Object.fromEntries(CATEGORY_LIST.map((c) => [c.prismaModel, true]));
  const activities = await prisma.userMediaActivity.findMany({
    where: { id: { in: [...new Set(page.entries.map((e) => e.activityId))] }, userId: { in: ids } },
    select: { id: true, userId: true, category: true, rating: true, ...mediaInclude },
  });
  const byId = new Map(activities.map((a) => [a.id, a as unknown as Record<string, unknown>]));

  const items: FeedItem[] = [];
  for (const e of page.entries) {
    const a = byId.get(e.activityId);
    const owner = users.get(e.userId);
    if (!a || !owner || a.userId !== e.userId) continue;
    const cat = CATEGORY_LIST.find((c) => c.dbCategory === a.category);
    const m = cat ? (a[cat.prismaModel] as Record<string, unknown> | null) : null;
    if (!cat || !m) continue;
    const current = typeof a.rating === 'number' ? a.rating : null;
    items.push({
      kind: e.kind,
      username: owner.username,
      isMe: e.userId === meId,
      slug: cat.slug,
      title: displayTitle(m as never, myPrefs.titleLanguage),
      imageUrl: typeof m.imageUrl === 'string' ? m.imageUrl : null,
      year: typeof m.year === 'number' ? m.year : null,
      rating: e.kind === 'finish' ? e.rating : e.kind === 'drop' ? current : null,
      rewatch: e.rewatch,
      at: e.at.toISOString(),
    });
  }
  return { items, next: page.next };
}
