'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Up next queue server actions. The client sends the full queue order; only
//  the user's own PLANNED items in this category are rewritten (1000, 2000, …).
//  PLANNED items missing from the list keep their position, so a stale client
//  can never wipe the order.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { getCategory, type CategorySlug } from '@/lib/categories';
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
