// ───────────────────────────────────────────────────────────────────────────
//  Watch together (5.8), server side. Strict privacy (G2):
//    - only users with `compareOptIn` are ever listed, by username only;
//    - a comparison re-checks BOTH opt-ins on every call;
//    - it returns only the shared catalogue rows (title, cover, year,
//      section) and the two queue positions; the other user's activity ids,
//      other titles, scores and notes never leave this module.
// ───────────────────────────────────────────────────────────────────────────

import { CATEGORY_LIST, type CategorySlug } from '@/lib/categories';
import { parsePrefs } from '@/lib/prefs';
import { prisma } from '@/lib/prisma';
import { orderQueue } from '@/lib/queue';
import { displayTitle } from '@/lib/title';
import { canCompare, rankOverlap, type QueueSlot } from '@/lib/together';

/** At most this many shared titles are returned. */
export const TOGETHER_LIMIT = 50;

/** The usernames of every other user who opted in to comparing (alphabetical). */
export async function comparableUsernames(meId: string): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { id: { not: meId }, prefs: { path: ['compareOptIn'], equals: true } },
    select: { username: true, prefs: true },
    orderBy: { username: 'asc' },
  });
  // Re-parse: only a real `true` counts (the same rule as everywhere else).
  return rows.filter((r) => parsePrefs(r.prefs).compareOptIn === true).map((r) => r.username);
}

export interface TogetherItem {
  slug: CategorySlug;
  title: string;
  imageUrl: string | null;
  year: number | null;
  myPosition: number;
  theirPosition: number;
  /** The caller's OWN activity for this title (for its details and streaming badges). */
  activityId: string;
}

export type CompareResult =
  | { ok: true; items: TogetherItem[] }
  | { ok: false; reason: 'me-off' | 'unavailable' };

/**
 * The titles both users have Planned in `sections`, best first (lowest
 * combined queue position). `otherUsername` must be another opted-in user,
 * and the caller must be opted in too; anything else (including an unknown
 * name) answers the same "unavailable", so names can't be probed.
 */
export async function compareQueues(
  meId: string,
  otherUsername: string,
  sections: CategorySlug[],
): Promise<CompareResult> {
  const [me, other] = await Promise.all([
    prisma.user.findUnique({ where: { id: meId }, select: { id: true, prefs: true } }),
    typeof otherUsername === 'string' && otherUsername.length <= 100
      ? prisma.user.findUnique({ where: { username: otherUsername }, select: { id: true, prefs: true } })
      : null,
  ]);
  const myPrefs = parsePrefs(me?.prefs);
  if (!me || !myPrefs.compareOptIn) return { ok: false, reason: 'me-off' };
  const gate = canCompare(
    { id: me.id, compareOptIn: myPrefs.compareOptIn },
    other ? { id: other.id, compareOptIn: parsePrefs(other.prefs).compareOptIn } : null,
  );
  if (!gate || !other) return { ok: false, reason: 'unavailable' };

  const cats = CATEGORY_LIST.filter((c) => sections.includes(c.slug));
  if (cats.length === 0) return { ok: true, items: [] };

  const fkSelect = Object.fromEntries(CATEGORY_LIST.map((c) => [c.fkField, true]));
  const rows = await prisma.userMediaActivity.findMany({
    where: { userId: { in: [me.id, other.id] }, status: 'PLANNED', category: { in: cats.map((c) => c.dbCategory) } },
    select: { id: true, userId: true, category: true, status: true, queueOrder: true, createdAt: true, ...fkSelect },
  });

  const slotsOf = (userId: string) => {
    const slots: (QueueSlot & { activityId: string })[] = [];
    for (const cat of cats) {
      const queue = orderQueue(
        rows
          .filter((r) => r.userId === userId && r.category === cat.dbCategory)
          .map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      );
      queue.forEach((r, i) => {
        const mediaId = (r as unknown as Record<string, string | null>)[cat.fkField];
        if (mediaId) slots.push({ slug: cat.slug, mediaId, position: i + 1, activityId: r.id });
      });
    }
    return slots;
  };
  const mine = slotsOf(me.id);
  const overlap = rankOverlap(mine, slotsOf(other.id)).slice(0, TOGETHER_LIMIT);
  if (overlap.length === 0) return { ok: true, items: [] };

  // Only the shared catalogue rows are read (never the other user's activities).
  const media = new Map<string, Record<string, unknown>>();
  for (const cat of cats) {
    const ids = overlap.filter((o) => o.slug === cat.slug).map((o) => o.mediaId);
    if (ids.length === 0) continue;
    const model = (prisma as unknown as Record<string, { findMany: (a: unknown) => Promise<Record<string, unknown>[]> }>)[
      cat.prismaModel
    ];
    for (const m of await model.findMany({ where: { id: { in: ids } } })) media.set(`${cat.slug}:${m.id as string}`, m);
  }
  const myActivity = new Map(mine.map((s) => [`${s.slug}:${s.mediaId}`, s.activityId]));

  const items: TogetherItem[] = [];
  for (const o of overlap) {
    const m = media.get(`${o.slug}:${o.mediaId}`);
    const activityId = myActivity.get(`${o.slug}:${o.mediaId}`);
    if (!m || !activityId) continue;
    items.push({
      slug: o.slug,
      title: displayTitle(m as never, myPrefs.titleLanguage),
      imageUrl: typeof m.imageUrl === 'string' ? m.imageUrl : null,
      year: typeof m.year === 'number' ? m.year : null,
      myPosition: o.myPosition,
      theirPosition: o.theirPosition,
      activityId,
    });
  }
  return { ok: true, items };
}
