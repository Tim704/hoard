// ───────────────────────────────────────────────────────────────────────────
//  Loaders behind the public API (spec 8.7). Server-only; trust `userId`,
//  which src/lib/api-auth.ts takes from the request's token. Everything is
//  scoped to that one user (G2).
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { apiActivity, type ApiActivity } from '@/lib/api-shape';
import { pageOf, type Cursor } from '@/lib/api-tokens';
import { CATEGORY_LIST, getCategory, type CategorySlug } from '@/lib/categories';
import { flattenActivity } from '@/lib/data';
import type { Status } from '@/lib/status';

const MEDIA_INCLUDE = Object.fromEntries(CATEGORY_LIST.map((c) => [c.prismaModel, true]));
const FRANCHISE_REF = { select: { id: true, name: true, imageUrl: true, rating: true } };

function shape(row: any): ApiActivity | null {
  const cat = CATEGORY_LIST.find((c) => c.dbCategory === row.category);
  const flat = cat ? flattenActivity(row, cat) : null;
  return flat ? apiActivity(flat, { startedAt: row.startedAt, finishedAt: row.finishedAt }) : null;
}

export interface LibraryQuery {
  category: CategorySlug | null;
  status: Status | null;
  limit: number;
  cursor: Cursor | null;
}

/** One page of the library, oldest added first (stable while paging). */
export async function getApiLibraryPage(userId: string, q: LibraryQuery) {
  const where: Record<string, unknown> = { userId };
  if (q.category) where.category = getCategory(q.category)!.dbCategory;
  if (q.status) where.status = q.status;
  if (q.cursor) {
    where.OR = [
      { createdAt: { gt: q.cursor.createdAt } },
      { createdAt: q.cursor.createdAt, id: { gt: q.cursor.id } },
    ];
  }
  const rows: any[] = await prisma.userMediaActivity.findMany({
    where: where as any,
    include: { ...MEDIA_INCLUDE, franchise: FRANCHISE_REF } as any,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: q.limit + 1,
  });
  const page = pageOf(rows, q.limit);
  return {
    items: page.items.map(shape).filter((a): a is ApiActivity => a !== null),
    nextCursor: page.nextCursor,
  };
}

/** One title with its diary and play sessions, or null when it isn't the user's. */
export async function getApiActivity(userId: string, id: string) {
  const row: any = await prisma.userMediaActivity.findFirst({
    where: { id, userId },
    include: {
      ...MEDIA_INCLUDE,
      franchise: FRANCHISE_REF,
      diaryEntries: { orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] },
      playSessions: { orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] },
    } as any,
  });
  if (!row) return null;
  const activity = shape(row);
  if (!activity) return null;
  return {
    ...activity,
    diary: (row.diaryEntries as any[]).map((d) => ({ date: d.date, score: d.rating, again: d.rewatch, review: d.review })),
    playSessions: (row.playSessions as any[]).map((p) => ({ date: p.date, minutes: p.minutes, note: p.note })),
  };
}

export interface ApiTokenRow {
  id: string;
  name: string;
  /** Dates formatted in the user's time zone (rendered as is). */
  created: string;
  lastUsed: string | null;
}

/** Settings → API tokens: name and dates only (never the hash). */
export async function getApiTokens(userId: string, timeZone: string): Promise<ApiTokenRow[]> {
  const rows = await prisma.apiToken.findMany({
    where: { userId },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const day = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short', year: 'numeric' });
  const moment = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    created: day.format(r.createdAt),
    lastUsed: r.lastUsedAt ? moment.format(r.lastUsedAt) : null,
  }));
}
