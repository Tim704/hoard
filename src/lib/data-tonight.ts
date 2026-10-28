// ───────────────────────────────────────────────────────────────────────────
//  Server-only fetchers for the tonight picker (5.2) and the dashboard's
//  "Coming up" tile (5.9). Both read only the current user's PLANNED titles.
// ───────────────────────────────────────────────────────────────────────────

import { CATEGORY_LIST, type CategorySlug } from '@/lib/categories';
import { flattenActivity } from '@/lib/data';
import { getPrefs } from '@/lib/data-prefs';
import { effectiveTimeZone } from '@/lib/prefs';
import { prisma } from '@/lib/prisma';
import { orderQueue } from '@/lib/queue';
import { daysUntil, isReleased, todayYmd } from '@/lib/release';
import { getCurrentUser } from '@/lib/session';
import { displayTitle } from '@/lib/title';
import { estimateMinutes, type TonightCandidate } from '@/lib/tonight';
import type { ActivityWithMedia } from '@/lib/types';

const ALL_MEDIA = Object.fromEntries(CATEGORY_LIST.map((c) => [c.prismaModel, true]));

/** The user's PLANNED titles of the given sections, flattened. */
async function plannedOf(userId: string, slugs: CategorySlug[]): Promise<ActivityWithMedia[]> {
  const cats = CATEGORY_LIST.filter((c) => slugs.includes(c.slug));
  if (cats.length === 0) return [];
  const rows = await prisma.userMediaActivity.findMany({
    where: { userId, status: 'PLANNED', category: { in: cats.map((c) => c.dbCategory) } },
    include: ALL_MEDIA as never,
  });
  return (rows as unknown[])
    .map((row) => {
      const cat = CATEGORY_LIST.find((c) => c.dbCategory === (row as { category: string }).category);
      return cat ? flattenActivity(row, cat) : null;
    })
    .filter((a): a is ActivityWithMedia => a !== null);
}

/** One tonight candidate as the client needs it (no notes, ratings or tags). */
export interface TonightItem extends TonightCandidate {
  title: string;
  imageUrl: string | null;
  year: number | null;
}

/**
 * Each visible section's Up next queue, released titles only (you can't
 * watch it tonight if it isn't out), in queue order.
 */
export async function getTonightQueues(): Promise<{
  queues: Partial<Record<CategorySlug, TonightItem[]>>;
  sections: CategorySlug[];
}> {
  const user = await getCurrentUser();
  if (!user) return { queues: {}, sections: [] };
  const prefs = await getPrefs(user.id);
  const hidden = new Set<string>(prefs.hiddenSections);
  const sections = CATEGORY_LIST.map((c) => c.slug).filter((s) => !hidden.has(s));
  const today = todayYmd(effectiveTimeZone(prefs));
  const planned = await plannedOf(user.id, sections);

  const queues: Partial<Record<CategorySlug, TonightItem[]>> = {};
  for (const slug of sections) {
    const queue = orderQueue(planned.filter((a) => a.category === slug)).filter((a) => isReleased(a.media, today));
    if (queue.length === 0) continue;
    queues[slug] = queue.map((a) => ({
      id: a.id,
      slug,
      title: displayTitle(a.media, prefs.titleLanguage),
      imageUrl: a.media.imageUrl,
      year: a.media.year,
      genres: Array.isArray(a.media.genres) ? (a.media.genres as unknown[]).filter((g): g is string => typeof g === 'string') : [],
      estimate: estimateMinutes(slug, a.media),
    }));
  }
  return { queues, sections };
}

export interface ComingUpItem {
  id: string;
  slug: CategorySlug;
  title: string;
  imageUrl: string | null;
  releaseDate: string;
  days: number;
}

/**
 * "Coming up" (5.9): the user's next `limit` PLANNED releases with a known
 * future day, soonest first. Hidden sections are left out.
 */
export async function getComingUp(limit = 5): Promise<ComingUpItem[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const prefs = await getPrefs(user.id);
  const today = todayYmd(effectiveTimeZone(prefs));
  const hidden = new Set<string>(prefs.hiddenSections);
  const cats = CATEGORY_LIST.filter((c) => !hidden.has(c.slug));
  if (cats.length === 0) return [];
  const rows = await prisma.userMediaActivity.findMany({
    where: {
      userId: user.id,
      status: 'PLANNED',
      OR: cats.map((c) => ({ category: c.dbCategory, [c.prismaModel]: { is: { releaseDate: { gt: today } } } })),
    },
    include: ALL_MEDIA as never,
  });
  const items: ComingUpItem[] = [];
  for (const row of rows as unknown[]) {
    const cat = CATEGORY_LIST.find((c) => c.dbCategory === (row as { category: string }).category);
    const a = cat ? flattenActivity(row, cat) : null;
    if (!a) continue;
    const days = daysUntil(a.media, today);
    if (days == null || days < 1) continue;
    items.push({
      id: a.id,
      slug: a.category,
      title: displayTitle(a.media, prefs.titleLanguage),
      imageUrl: a.media.imageUrl,
      releaseDate: a.media.releaseDate as string,
      days,
    });
  }
  return items
    .sort((x, y) => x.releaseDate.localeCompare(y.releaseDate) || x.title.localeCompare(y.title))
    .slice(0, limit);
}
