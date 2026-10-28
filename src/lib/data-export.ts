// ───────────────────────────────────────────────────────────────────────────
//  Server-only loaders for the data export (spec 1.11). Not server actions:
//  the /api/export/* route handlers authenticate and pass the user id in.
//  Everything is scoped to that one user (spec G2).
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST } from '@/lib/categories';
import { flattenActivity } from '@/lib/data';
import { getPrefs } from '@/lib/data-prefs';
import { type ExportActivity, type ExportFranchise } from '@/lib/export';
import { shapeFullExport } from '@/lib/export-full';
import { providerUrl, type MarkdownEntry } from '@/lib/markdown-export';
import { todayYmd } from '@/lib/release';
import { isTierEligible } from '@/lib/tiers';
import { displayTitle, titleVariants } from '@/lib/title';
import type { TitleLanguage } from '@/lib/display-prefs';
import type { Status } from '@/lib/status';

const MEDIA_INCLUDE = Object.fromEntries(CATEGORY_LIST.map((c) => [c.prismaModel, true]));
const FRANCHISE_REF = { select: { id: true, name: true, imageUrl: true, rating: true } };

async function activityRows(userId: string) {
  return prisma.userMediaActivity.findMany({
    where: { userId },
    include: { ...MEDIA_INCLUDE, franchise: FRANCHISE_REF } as any,
    orderBy: { createdAt: 'asc' },
  });
}

/** Every activity of the user, shaped for the library CSV. */
export async function getExportActivities(userId: string): Promise<ExportActivity[]> {
  const rows = (await activityRows(userId)) as any[];
  const out: ExportActivity[] = [];
  for (const row of rows) {
    const cat = CATEGORY_LIST.find((c) => c.dbCategory === row.category);
    const flat = cat ? flattenActivity(row, cat) : null;
    if (!flat) continue;
    out.push({
      ...flat,
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
      // Tags (4.2) are read once the column exists.
      tags: Array.isArray(row.tags) ? row.tags : [],
    });
  }
  return out;
}

/**
 * Every title as a Markdown note's data (8.4): display title in the user's
 * language, days in their time zone, the diary's reviews.
 */
export async function getMarkdownEntries(
  userId: string,
  timeZone: string,
  language: TitleLanguage,
): Promise<MarkdownEntry[]> {
  const [rows, diary] = await Promise.all([
    activityRows(userId),
    prisma.diaryEntry.findMany({
      where: { userId },
      select: { activityId: true, date: true, rating: true, rewatch: true, review: true },
    }),
  ]);
  const byActivity = new Map<string, typeof diary>();
  for (const d of diary) byActivity.set(d.activityId, [...(byActivity.get(d.activityId) ?? []), d]);
  const day = (d: Date | null) => (d ? todayYmd(timeZone, d) : null);
  const out: MarkdownEntry[] = [];
  for (const row of rows as any[]) {
    const cat = CATEGORY_LIST.find((c) => c.dbCategory === row.category);
    const media = cat ? row[cat.prismaModel] : null;
    if (!cat || !media) continue;
    const title = displayTitle(media, language);
    const entries = byActivity.get(row.id) ?? [];
    out.push({
      category: cat.slug,
      title,
      aliases: titleVariants(media).filter((t) => t !== title),
      year: media.year ?? null,
      status: row.status as Status,
      rating: row.rating ?? null,
      tier: row.tier && isTierEligible(row.status) ? row.tier : null,
      started: day(row.startedAt),
      finished: day(row.finishedAt),
      timesFinished: entries.length,
      tags: Array.isArray(row.tags) ? row.tags : [],
      franchise: row.franchise?.name ?? null,
      favourite: Boolean(row.favorite),
      platforms: Array.isArray(row.ownedPlatforms) ? row.ownedPlatforms : [],
      format: row.format ?? null,
      link: providerUrl(cat.slug, media),
      notes: row.notes ?? null,
      reviews: entries.map((e) => ({ date: e.date, rating: e.rating, rewatch: e.rewatch, review: e.review })),
    });
  }
  return out;
}

/** The user's franchises with their members, for the franchises CSV. */
export async function getExportFranchises(userId: string): Promise<ExportFranchise[]> {
  const rows = await prisma.franchise.findMany({
    where: { userId },
    include: { activities: { include: MEDIA_INCLUDE as any } },
  });
  return rows.map((f) => ({
    name: f.name,
    rating: f.rating,
    rankOrder: f.rankOrder,
    notes: f.notes,
    members: (f.activities as any[])
      .map((a) => {
        const cat = CATEGORY_LIST.find((c) => c.dbCategory === a.category);
        const media = cat ? a[cat.prismaModel] : null;
        if (!cat || !media) return null;
        return {
          category: cat.slug,
          title: media.title as string,
          year: (media.year as number | null) ?? null,
          status: a.status as string,
          rating: a.rating as number | null,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title)),
  }));
}

/** Title, year and provider id of custom-list items (one query per section). */
async function titleListItems(items: { category: string; mediaId: string }[]) {
  const found = new Map<string, { title: string; year: number | null; externalId: string }>();
  for (const cat of CATEGORY_LIST) {
    const ids = [...new Set(items.filter((i) => i.category === cat.slug).map((i) => i.mediaId))];
    if (!ids.length) continue;
    const rows: any[] = await (prisma as any)[cat.prismaModel].findMany({
      where: { id: { in: ids } },
      select: { id: true, title: true, year: true, externalId: true },
    });
    for (const r of rows) found.set(`${cat.slug}:${r.id}`, { title: r.title, year: r.year ?? null, externalId: r.externalId });
  }
  return found;
}

/**
 * Everything the user owns, for the JSON export: account basics, settings
 * (minus secrets), every activity with its media row, the event log,
 * franchises, diary, play sessions, seasons, best-of-the-year duels, owned
 * custom lists, reference lists, goals, saved views, API token names, linked
 * accounts, the taste profile and share links. What is left out (hashes,
 * tokens, share ids) is listed in src/lib/export-full.ts.
 */
export async function getFullExport(userId: string) {
  const [
    user,
    prefs,
    rows,
    events,
    franchises,
    diaryEntries,
    playSessions,
    seasonActivities,
    yearDuelScores,
    customLists,
    refLists,
    goals,
    savedViews,
    apiTokens,
    externalLinks,
    tasteProfile,
    shareLinks,
  ] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { username: true, createdAt: true } }),
    getPrefs(userId),
    activityRows(userId),
    prisma.activityEvent.findMany({ where: { userId }, orderBy: { at: 'asc' } }),
    prisma.franchise.findMany({ where: { userId }, orderBy: { name: 'asc' } }),
    prisma.diaryEntry.findMany({ where: { userId }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
    prisma.playSession.findMany({ where: { userId }, orderBy: [{ date: 'asc' }, { createdAt: 'asc' }] }),
    prisma.seasonActivity.findMany({ where: { userId }, include: { season: true } }),
    prisma.yearDuelScore.findMany({ where: { userId }, orderBy: [{ year: 'asc' }] }),
    prisma.customList.findMany({
      where: { ownerId: userId },
      include: {
        items: { orderBy: { position: 'asc' } },
        members: { include: { user: { select: { username: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.refList.findMany({
      where: { userId },
      include: { items: { orderBy: { position: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.goal.findMany({ where: { userId }, orderBy: [{ year: 'asc' }, { createdAt: 'asc' }] }),
    prisma.savedView.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.apiToken.findMany({
      where: { userId },
      select: { name: true, createdAt: true, lastUsedAt: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.externalLink.findMany({
      where: { userId },
      select: { provider: true, accountId: true, data: true, updatedAt: true },
    }),
    prisma.tasteProfile.findUnique({ where: { userId } }),
    prisma.shareLink.findMany({
      where: { userId },
      select: { kind: true, target: true, createdAt: true, revokedAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const activities = (rows as any[]).map((row) => {
    const cat = CATEGORY_LIST.find((c) => c.dbCategory === row.category);
    const media = cat ? row[cat.prismaModel] : null;
    const core: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      // Drop the seven relation objects and FK columns; the media goes under `media`.
      if (CATEGORY_LIST.some((c) => c.prismaModel === key || c.fkField === key)) continue;
      if (key === 'franchise' || key === 'userId') continue;
      core[key] = value;
    }
    return { ...core, section: cat?.slug ?? null, media };
  });

  const titled = await titleListItems(customLists.flatMap((l) => l.items));
  const memberNames = new Map(customLists.flatMap((l) => l.members.map((m) => [m.userId, m.user.username] as const)));
  const lists = customLists.map(({ items, members, ...l }) => ({
    ...l,
    items: items.map((i) => ({
      ...i,
      ...(titled.get(`${i.category}:${i.mediaId}`) ?? { title: null, year: null, externalId: null }),
      addedBy: i.addedById === userId ? (user?.username ?? null) : (memberNames.get(i.addedById) ?? null),
    })),
    members: members.map(({ user: u, ...m }) => ({ ...m, username: u.username })),
  }));

  return shapeFullExport({
    user,
    prefs,
    activities,
    events,
    franchises,
    diaryEntries,
    playSessions,
    seasonActivities,
    yearDuelScores,
    customLists: lists,
    refLists,
    goals,
    savedViews,
    apiTokens,
    externalLinks,
    tasteProfile,
    shareLinks,
  });
}
