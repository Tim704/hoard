// ───────────────────────────────────────────────────────────────────────────
//  Server-side helpers shared by the server actions. Deliberately NOT a
//  'use server' module: nothing here may become a client-callable action
//  (appendQueueOrder trusts its userId argument).
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import type { CategorySlug, DbCategory } from '@/lib/categories';
import { nextQueueOrder } from '@/lib/queue';

/** Re-render every page that shows a category's library: the list and the arena. */
export function revalidateCategory(slug: CategorySlug): void {
  revalidatePath('/' + slug);
  revalidatePath('/' + slug + '/arena');
}

/** Queue position for an item joining the bottom of a category's Up next queue. */
export async function appendQueueOrder(userId: string, category: DbCategory): Promise<number> {
  const top = await prisma.userMediaActivity.aggregate({
    where: { userId, category },
    _max: { queueOrder: true },
  });
  return nextQueueOrder(top._max.queueOrder);
}
