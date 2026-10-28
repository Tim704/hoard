'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Up next queue server actions. The client sends the full queue order; only
//  the user's own PLANNED items in this category are rewritten (1000, 2000, …).
//  PLANNED items missing from the list keep their position, so a stale client
//  can never wipe the order.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST, getCategory, type CategorySlug } from '@/lib/categories';
import { requireUser } from '@/lib/session';
import { revalidateCategory } from '@/lib/actions/shared';
import { orderQueue, QUEUE_STEP } from '@/lib/queue';
import { queueMoveEvent, recordEvent } from '@/lib/events';
import type { ActionResult } from '@/lib/types';

export async function saveQueue(
  slug: CategorySlug,
  orderedIds: string[],
): Promise<ActionResult> {
  const cat = getCategory(slug);
  if (!cat) return { ok: false, error: 'Unknown category.' };

  try {
    const user = await requireUser();
    const planned = await prisma.userMediaActivity.findMany({
      where: { userId: user.id, category: cat.dbCategory, status: 'PLANNED' },
      select: { id: true, queueOrder: true, createdAt: true },
    });
    const valid = new Set(planned.map((p) => p.id));
    const ids = [...new Set(orderedIds)].filter((id) => valid.has(id));

    // One `queue` event per save, attached to the item that moved.
    const before = orderQueue(
      planned.map((p) => ({ ...p, status: 'PLANNED' as const, createdAt: p.createdAt.toISOString() })),
    ).map((p) => p.id);
    const event = queueMoveEvent(user.id, before, ids);

    await prisma.$transaction([
      ...ids.map((id, i) =>
        prisma.userMediaActivity.update({
          where: { id },
          data: { queueOrder: (i + 1) * QUEUE_STEP },
        }),
      ),
      ...(event ? [recordEvent(prisma, event)] : []),
    ]);

    revalidateCategory(slug);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to save queue.' };
  }
}

/**
 * Move one PLANNED title to the top of its Up next queue (the Cmd/Ctrl+K
 * palette, 2.6), through the same save as a drag in the queue.
 */
export async function moveToQueueTop(activityId: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const activity = await prisma.userMediaActivity.findUnique({
      where: { id: String(activityId) },
      select: { userId: true, status: true, category: true },
    });
    if (!activity || activity.userId !== user.id) return { ok: false, error: 'Not found.' };
    if (activity.status !== 'PLANNED') return { ok: false, error: 'Only titles in Up next can be moved.' };
    const cat = CATEGORY_LIST.find((c) => c.dbCategory === activity.category);
    if (!cat) return { ok: false, error: 'Not found.' };

    const planned = await prisma.userMediaActivity.findMany({
      where: { userId: user.id, category: activity.category, status: 'PLANNED' },
      select: { id: true, queueOrder: true, createdAt: true },
    });
    const order = orderQueue(
      planned.map((p) => ({ ...p, status: 'PLANNED' as const, createdAt: p.createdAt.toISOString() })),
    ).map((p) => p.id);
    if (order[0] === activityId) return { ok: true };
    return saveQueue(cat.slug, [activityId, ...order.filter((id) => id !== activityId)]);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to move that title.' };
  }
}
