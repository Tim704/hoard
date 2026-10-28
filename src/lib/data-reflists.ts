// ───────────────────────────────────────────────────────────────────────────
//  Reference lists (spec 4.8): server-only loaders, not server actions. A
//  reference list belongs to one user and is only ever read for its owner.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { getCategory, isCategorySlug, type CategorySlug } from '@/lib/categories';
import { refSourceConfigured } from '@/lib/reflists-server';
import {
  BUILTIN_REF_LISTS,
  BUILTIN_SOURCES,
  isBuiltinSource,
  refKey,
  refProgress,
  type BuiltinSource,
  type RefProgress,
} from '@/lib/reflists';
import type { Status } from '@/lib/status';

export interface RefListSummary extends RefProgress {
  id: string;
  name: string;
  source: string;
  category: CategorySlug;
  builtin: boolean;
  createdAt: string;
  refreshedAt: string | null;
}

export interface BuiltinChoice {
  source: BuiltinSource;
  name: string;
  blurb: string;
  category: CategorySlug;
  provider: string;
  configured: boolean;
  /** The user's list from this source, when they made it already. */
  listId: string | null;
}

export interface RefItemView {
  id: string;
  position: number;
  externalId: string;
  title: string;
  year: number | null;
  imageUrl: string | null;
  /** The user's own entry for it (status + score), or null. */
  library: { status: Status; rating: number | null } | null;
}

export interface RefListView extends RefListSummary {
  items: RefItemView[];
}

/** The user's statuses and scores for some titles of one section, by refKey. */
async function libraryFor(
  userId: string,
  slug: CategorySlug,
  externalIds: string[],
): Promise<Map<string, { status: Status; rating: number | null }>> {
  const cat = getCategory(slug);
  const out = new Map<string, { status: Status; rating: number | null }>();
  if (!cat || externalIds.length === 0) return out;
  const rows: any[] = await prisma.userMediaActivity.findMany({
    where: {
      userId,
      category: cat.dbCategory,
      [cat.prismaModel]: { is: { externalId: { in: [...new Set(externalIds)] } } },
    } as any,
    select: { status: true, rating: true, [cat.prismaModel]: { select: { externalId: true } } } as any,
  });
  for (const r of rows) {
    out.set(refKey(slug, r[cat.prismaModel].externalId), { status: r.status, rating: r.rating });
  }
  return out;
}

function summaryOf(
  list: { id: string; name: string; source: string; category: string; createdAt: Date; refreshedAt: Date | null },
  progress: RefProgress,
): RefListSummary | null {
  if (!isCategorySlug(list.category)) return null;
  return {
    id: list.id,
    name: list.name,
    source: list.source,
    category: list.category,
    builtin: isBuiltinSource(list.source),
    createdAt: list.createdAt.toISOString(),
    refreshedAt: list.refreshedAt?.toISOString() ?? null,
    ...progress,
  };
}

/** The user's reference lists with progress, and the built-in sources. */
export async function getRefLists(userId: string): Promise<{ lists: RefListSummary[]; builtins: BuiltinChoice[] }> {
  const lists = await prisma.refList.findMany({
    where: { userId },
    include: { items: { select: { category: true, externalId: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const summaries: RefListSummary[] = [];
  for (const l of lists) {
    if (!isCategorySlug(l.category)) continue;
    const lib = await libraryFor(userId, l.category, l.items.map((i) => i.externalId));
    const statuses = new Map([...lib].map(([k, v]) => [k, v.status]));
    const s = summaryOf(l, refProgress(l.items, statuses));
    if (s) summaries.push(s);
  }
  const builtins = BUILTIN_SOURCES.map((source) => {
    const b = BUILTIN_REF_LISTS[source];
    return {
      source,
      name: b.name,
      blurb: b.blurb,
      category: b.category,
      provider: b.provider,
      configured: refSourceConfigured(source),
      listId: lists.find((l) => l.source === source)?.id ?? null,
    };
  });
  return { lists: summaries, builtins };
}

/** One of the user's reference lists with its items and their library state. */
export async function getRefList(listId: string, userId: string): Promise<RefListView | null> {
  if (typeof listId !== 'string' || listId.length > 64) return null;
  const list = await prisma.refList.findUnique({
    where: { id: listId },
    include: { items: { orderBy: { position: 'asc' } } },
  });
  if (!list || list.userId !== userId || !isCategorySlug(list.category)) return null;
  const lib = await libraryFor(userId, list.category, list.items.map((i) => i.externalId));
  const statuses = new Map([...lib].map(([k, v]) => [k, v.status]));
  const summary = summaryOf(list, refProgress(list.items, statuses));
  if (!summary) return null;
  return {
    ...summary,
    items: list.items.map((i) => ({
      id: i.id,
      position: i.position,
      externalId: i.externalId,
      title: i.title,
      year: i.year,
      imageUrl: i.imageUrl,
      library: lib.get(refKey(i.category, i.externalId)) ?? null,
    })),
  };
}
