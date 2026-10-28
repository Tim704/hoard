// ───────────────────────────────────────────────────────────────────────────
//  Saved views (spec 8.6), server-only loaders. Trust `userId`: the /views
//  page and the (app) layout pass the signed-in user's id.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST } from '@/lib/categories';
import { flattenActivity } from '@/lib/data';
import { parseViewQuery, type ViewQuery } from '@/lib/saved-views';
import type { ActivityWithMedia } from '@/lib/types';

export interface SavedViewSummary {
  id: string;
  name: string;
}

export interface SavedViewData extends SavedViewSummary {
  query: ViewQuery;
}

/** The user's views by name (the navigation's "Views" group). */
export async function getSavedViewNames(userId: string): Promise<SavedViewSummary[]> {
  return prisma.savedView.findMany({
    where: { userId },
    select: { id: true, name: true },
    orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
  });
}

/** The user's views with their (validated) queries. */
export async function getSavedViews(userId: string): Promise<SavedViewData[]> {
  const rows = await prisma.savedView.findMany({
    where: { userId },
    orderBy: [{ name: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((r) => ({ id: r.id, name: r.name, query: parseViewQuery(r.query) }));
}

const FRANCHISE_REF = { select: { id: true, name: true, imageUrl: true, rating: true } };

/** Every title of the user, across sections, for the view builder. */
export async function getViewLibrary(userId: string): Promise<ActivityWithMedia[]> {
  const include = Object.fromEntries(CATEGORY_LIST.map((c) => [c.prismaModel, true]));
  const rows = await prisma.userMediaActivity.findMany({
    where: { userId },
    include: { ...include, franchise: FRANCHISE_REF } as any,
    orderBy: { createdAt: 'desc' },
  });
  const out: ActivityWithMedia[] = [];
  for (const row of rows) {
    const cat = CATEGORY_LIST.find((c) => c.dbCategory === row.category);
    const flat = cat ? flattenActivity(row, cat) : null;
    if (flat) out.push(flat);
  }
  return out;
}
