'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Tag server actions (spec 4.2). Tags save on their own (not with the
//  details' Save button), normalised by src/lib/tags.ts. No event is
//  recorded: the event log covers status, score, progress, tier, queue,
//  import and review changes only.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST } from '@/lib/categories';
import { requireUser } from '@/lib/session';
import { revalidateCategory } from '@/lib/actions/shared';
import { getMyTags } from '@/lib/data-tags';
import { normalizeTags } from '@/lib/tags';
import type { ActionResult } from '@/lib/types';

/** Replace a title's tags (yours only). Returns the stored, normalised list. */
export async function setActivityTags(
  activityId: unknown,
  tags: unknown,
): Promise<ActionResult & { tags?: string[] }> {
  if (typeof activityId !== 'string' || !Array.isArray(tags) || tags.length > 200) {
    return { ok: false, error: 'Invalid tags.' };
  }
  try {
    const user = await requireUser();
    const activity = await prisma.userMediaActivity.findUnique({
      where: { id: activityId },
      select: { userId: true, category: true },
    });
    if (!activity || activity.userId !== user.id) return { ok: false, error: 'Not found.' };
    const clean = normalizeTags(tags);
    await prisma.userMediaActivity.update({ where: { id: activityId }, data: { tags: clean } });
    const slug = CATEGORY_LIST.find((c) => c.dbCategory === activity.category)?.slug;
    if (slug) revalidateCategory(slug);
    revalidatePath('/tags');
    return { ok: true, tags: clean };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not save the tags.' };
  }
}

/** Every tag you use, most used first (the tag input's autocomplete). */
export async function listMyTags(): Promise<string[]> {
  const user = await requireUser();
  return (await getMyTags(user.id)).map((t) => t.tag);
}
