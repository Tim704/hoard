// ───────────────────────────────────────────────────────────────────────────
//  Tag fetchers (spec 4.2). Server-only, not server actions.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST, type CategorySlug } from '@/lib/categories';
import { flattenActivity } from '@/lib/data';
import { countTags, hasAllTags, type TagCount } from '@/lib/tags';
import type { ActivityWithMedia } from '@/lib/types';

const SLUG_OF = new Map(CATEGORY_LIST.map((c) => [c.dbCategory, c.slug] as const));

/** Every tag of the user with its counts (overall and per section), most used first. */
export async function getMyTags(userId: string): Promise<TagCount<CategorySlug>[]> {
  const rows = await prisma.userMediaActivity.findMany({
    where: { userId, NOT: { tags: { isEmpty: true } } },
    select: { tags: true, category: true },
  });
  return countTags(
    rows.flatMap((r) => {
      const section = SLUG_OF.get(r.category);
      return section ? [{ tags: r.tags, section }] : [];
    }),
  );
}

/** The user's titles (every section) carrying all of `selected`. */
export async function getTaggedActivities(userId: string, selected: string[]): Promise<ActivityWithMedia[]> {
  if (selected.length === 0) return [];
  const include = Object.fromEntries(CATEGORY_LIST.map((c) => [c.prismaModel, true]));
  const rows = await prisma.userMediaActivity.findMany({
    where: { userId, NOT: { tags: { isEmpty: true } } },
    include: include as any,
    orderBy: { updatedAt: 'desc' },
  });
  return rows
    .filter((row) => hasAllTags(row.tags, selected))
    .map((row) => {
      const cat = CATEGORY_LIST.find((c) => c.dbCategory === row.category);
      return cat ? flattenActivity(row, cat) : null;
    })
    .filter((a): a is ActivityWithMedia => a !== null);
}
