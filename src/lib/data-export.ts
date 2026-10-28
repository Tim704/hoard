// ───────────────────────────────────────────────────────────────────────────
//  Server-only loaders for the data export (spec 1.11). Not server actions:
//  the /api/export/* route handlers authenticate and pass the user id in.
//  Everything is scoped to that one user (spec G2).
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST } from '@/lib/categories';
import { flattenActivity } from '@/lib/data';
import { getPrefs } from '@/lib/data-prefs';
import { exportablePrefs, type ExportActivity, type ExportFranchise } from '@/lib/export';

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

/**
 * Everything the user owns, for the JSON export: account basics, settings
 * (minus secrets), every activity with its media row, the event log and the
 * franchises. Sessions and password hashes are never included.
 */
export async function getFullExport(userId: string) {
  const [user, prefs, rows, events, franchises] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { username: true, createdAt: true } }),
    getPrefs(userId),
    activityRows(userId),
    prisma.activityEvent.findMany({ where: { userId }, orderBy: { at: 'asc' } }),
    prisma.franchise.findMany({ where: { userId }, orderBy: { name: 'asc' } }),
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

  return {
    format: 'hoard-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    user: user ? { username: user.username, createdAt: user.createdAt } : null,
    prefs: exportablePrefs(prefs),
    activities,
    events: events.map(({ userId: _u, ...e }) => e),
    franchises: franchises.map(({ userId: _u, ...f }) => f),
  };
}
