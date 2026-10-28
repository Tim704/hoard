'use server';

// ───────────────────────────────────────────────────────────────────────────
//  "More by the same people" in the details (spec 5.10), loaded when the
//  section is opened. Only for the caller's own activity; titles already in
//  their library are left out.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST } from '@/lib/categories';
import { libraryMarks, markKey } from '@/lib/data-search';
import { trimGroups, type MoreByAnswer } from '@/lib/more-by';
import { moreByFor } from '@/lib/more-by-server';
import { requireUser } from '@/lib/session';
import type { ActionResult } from '@/lib/types';
import { publicError } from '@/lib/action-error';
import { takeActionRate } from '@/lib/rate-limit';

export async function loadMoreBy(
  activityId: string,
): Promise<ActionResult & { answer?: MoreByAnswer }> {
  try {
    const user = await requireUser();
    if (typeof activityId !== 'string' || !activityId) return { ok: false, error: 'Not found.' };
    const limited = takeActionRate('loadMoreBy', user.id);
    if (limited) return { ok: false, error: limited };
    const a: any = await prisma.userMediaActivity.findUnique({
      where: { id: activityId },
      include: Object.fromEntries(CATEGORY_LIST.map((c) => [c.prismaModel, true])) as any,
    });
    if (!a || a.userId !== user.id) return { ok: false, error: 'Not found.' };
    const cat = CATEGORY_LIST.find((c) => c.dbCategory === a.category);
    const media = cat ? a[cat.prismaModel] : null;
    if (!cat || !media) return { ok: false, error: 'Not found.' };

    const answer = await moreByFor(cat.slug, media);
    if (answer.status !== 'ok') return { ok: true, answer };
    const all = answer.groups.flatMap((g) => g.items.map((it) => ({ slug: it.slug, externalId: it.result.externalId })));
    const owned = await libraryMarks(user.id, all);
    const groups = trimGroups(answer.groups, { slug: cat.slug, externalId: media.externalId }, (slug, id) => markKey(slug, id) in owned);
    if (!groups.length) {
      return { ok: true, answer: { status: 'message', message: 'Nothing more to add: you have their best-known work already, or none was found.' } };
    }
    return { ok: true, answer: { status: 'ok', groups } };
  } catch (err) {
    return { ok: false, error: publicError(err, 'Could not load more by the same people.') };
  }
}
