'use server';

// Linked notes (spec 8.5): the details' "Mentioned in" list. The caller's
// own titles only, and only for an activity they own (as in media.ts).

import { prisma } from '@/lib/prisma';
import { getMentions } from '@/lib/data-mentions';
import type { LibraryIndexEntry } from '@/lib/data-search';
import { requireUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

export async function getMentionedIn(activityId: unknown): Promise<ActionResult & { items?: LibraryIndexEntry[] }> {
  if (typeof activityId !== 'string' || !activityId) return { ok: false, error: 'Not found.' };
  try {
    const user = await requireUser();
    const own = await prisma.userMediaActivity.findUnique({ where: { id: activityId }, select: { userId: true } });
    if (!own || own.userId !== user.id) return { ok: false, error: 'Not found.' };
    return { ok: true, items: await getMentions(user.id, activityId) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not load the mentions.' };
  }
}
