// ───────────────────────────────────────────────────────────────────────────
//  Custom lists (spec 4.11): server-only loaders, not server actions.
//
//  Every loader checks access with src/lib/lists.ts first. What comes back
//  is the list itself (name, description, members' usernames) and its items
//  as CATALOGUE data only — title variants, cover and year. Nothing from
//  anyone's library (status, score, notes) is ever read here.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { getCategory, isCategorySlug, type CategorySlug } from '@/lib/categories';
import { listRole, type ListRole } from '@/lib/lists';
import type { TitledMedia } from '@/lib/title';

/** One list item's catalogue data. */
export interface ListMedia extends TitledMedia {
  imageUrl: string | null;
  year: number | null;
}

export interface ListItemView {
  id: string;
  category: CategorySlug;
  mediaId: string;
  media: ListMedia;
}

export interface ListMemberView {
  userId: string;
  username: string;
  canEdit: boolean;
}

export interface CustomListView {
  id: string;
  name: string;
  description: string | null;
  owner: string;
  role: ListRole;
  items: ListItemView[];
  members: ListMemberView[];
}

export interface ListSummary {
  id: string;
  name: string;
  description: string | null;
  owner: string;
  role: ListRole;
  itemCount: number;
  covers: string[];
}

const BASE_SELECT = { id: true, title: true, imageUrl: true, year: true } as const;
const TITLES_SELECT = { ...BASE_SELECT, titleEnglish: true, titleRomaji: true, titleNative: true } as const;

/** Catalogue rows for items, by "category:mediaId" (missing rows are left out). */
async function loadMedia(items: { category: string; mediaId: string }[]): Promise<Map<string, ListMedia>> {
  const out = new Map<string, ListMedia>();
  const bySlug = new Map<CategorySlug, string[]>();
  for (const it of items) {
    if (!isCategorySlug(it.category)) continue;
    const ids = bySlug.get(it.category) ?? [];
    ids.push(it.mediaId);
    bySlug.set(it.category, ids);
  }
  await Promise.all(
    [...bySlug.entries()].map(async ([slug, ids]) => {
      const cat = getCategory(slug)!;
      // Sanctioned dynamic-Prisma access: one of seven media tables.
      const rows: any[] = await (prisma as any)[cat.prismaModel].findMany({
        where: { id: { in: [...new Set(ids)] } },
        select: slug === 'anime' || slug === 'manga' ? TITLES_SELECT : BASE_SELECT,
      });
      for (const r of rows) {
        const { id, ...media } = r;
        out.set(`${slug}:${id}`, media as ListMedia);
      }
    }),
  );
  return out;
}

const LIST_INCLUDE = {
  owner: { select: { username: true } },
  members: { include: { user: { select: { username: true } } }, orderBy: { createdAt: 'asc' as const } },
};

/** One list with its items, or null when it is missing or `userId` may not see it. */
export async function getCustomList(listId: string, userId: string): Promise<CustomListView | null> {
  if (typeof listId !== 'string' || listId.length > 64) return null;
  const list = await prisma.customList.findUnique({ where: { id: listId }, include: LIST_INCLUDE });
  const role = listRole(list, userId);
  if (!list || !role) return null;
  const items = await prisma.customListItem.findMany({
    where: { listId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  });
  const media = await loadMedia(items);
  return {
    id: list.id,
    name: list.name,
    description: list.description,
    owner: list.owner.username,
    role,
    items: items
      .map((it) => {
        const m = media.get(`${it.category}:${it.mediaId}`);
        return m ? { id: it.id, category: it.category as CategorySlug, mediaId: it.mediaId, media: m } : null;
      })
      .filter((x): x is ListItemView => x !== null),
    members: list.members.map((m) => ({ userId: m.userId, username: m.user.username, canEdit: m.canEdit })),
  };
}

/** The user's own lists and the lists shared with them, newest change first. */
export async function getMyLists(userId: string): Promise<{ mine: ListSummary[]; shared: ListSummary[] }> {
  const lists = await prisma.customList.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId } } }] },
    include: {
      ...LIST_INCLUDE,
      _count: { select: { items: true } },
      items: { orderBy: [{ position: 'asc' }, { createdAt: 'asc' }], take: 4, select: { category: true, mediaId: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
  const media = await loadMedia(lists.flatMap((l) => l.items));
  const summaries = lists
    .map((l): ListSummary | null => {
      const role = listRole(l, userId);
      if (!role) return null;
      return {
        id: l.id,
        name: l.name,
        description: l.description,
        owner: l.owner.username,
        role,
        itemCount: l._count.items,
        covers: l.items
          .map((it) => media.get(`${it.category}:${it.mediaId}`)?.imageUrl)
          .filter((u): u is string => typeof u === 'string' && u.length > 0),
      };
    })
    .filter((x): x is ListSummary => x !== null);
  return {
    mine: summaries.filter((s) => s.role === 'owner'),
    shared: summaries.filter((s) => s.role !== 'owner'),
  };
}

/** Lists the user may add to (own lists and those they edit), for "Add to list…". */
export async function getEditableLists(userId: string): Promise<{ id: string; name: string }[]> {
  return prisma.customList.findMany({
    where: { OR: [{ ownerId: userId }, { members: { some: { userId, canEdit: true } } }] },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });
}
