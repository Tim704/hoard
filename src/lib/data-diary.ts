// ───────────────────────────────────────────────────────────────────────────
//  Server-only fetchers for /diary (spec 3.4). Not server actions: imported by
//  the page, scoped to the logged-in user, serializable output.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST, type CategorySlug } from '@/lib/categories';
import { getPrefs } from '@/lib/data-prefs';
import { todayIn } from '@/lib/diary';
import { effectiveTimeZone } from '@/lib/prefs';
import { getCurrentUser } from '@/lib/session';
import type { TitledMedia } from '@/lib/title';

export interface DiaryMedia extends TitledMedia {
  imageUrl: string | null;
  year: number | null;
}

export interface DiaryRow {
  id: string;
  activityId: string;
  category: CategorySlug;
  media: DiaryMedia;
  date: string;
  rating: number | null;
  rewatch: boolean;
  review: string | null;
  createdAt: string;
}

/** A library title to log a past watch against. */
export interface LibraryPick {
  activityId: string;
  category: CategorySlug;
  media: DiaryMedia;
}

export interface DiaryPageData {
  entries: DiaryRow[];
  library: LibraryPick[];
  today: string;
}

const MEDIA_SELECT = { title: true, imageUrl: true, year: true } as const;
const TITLES_SELECT = { ...MEDIA_SELECT, titleEnglish: true, titleRomaji: true, titleNative: true } as const;

/** Every media relation, selecting only what the diary shows. */
const MEDIA_INCLUDE = Object.fromEntries(
  CATEGORY_LIST.map((c) => [
    c.prismaModel,
    { select: c.slug === 'anime' || c.slug === 'manga' ? TITLES_SELECT : MEDIA_SELECT },
  ]),
);

// Sanctioned dynamic-Prisma access: one of seven media relations is set.
function mediaOf(activity: any): { category: CategorySlug; media: DiaryMedia } | null {
  const cat = CATEGORY_LIST.find((c) => c.dbCategory === activity.category);
  const media = cat ? activity[cat.prismaModel] : null;
  if (!cat || !media) return null;
  return { category: cat.slug, media: media as DiaryMedia };
}

/** The logged-in user's diary entries (newest first) and library titles. */
export async function getDiaryPage(): Promise<DiaryPageData | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const [entries, activities, prefs] = await Promise.all([
    prisma.diaryEntry.findMany({
      where: { userId: user.id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      include: { activity: { select: { category: true, userId: true, ...MEDIA_INCLUDE } as any } },
    }),
    prisma.userMediaActivity.findMany({
      where: { userId: user.id },
      select: { id: true, category: true, ...MEDIA_INCLUDE } as any,
      orderBy: { updatedAt: 'desc' },
    }),
    getPrefs(user.id),
  ]);

  const rows: DiaryRow[] = [];
  for (const e of entries as any[]) {
    if (e.activity?.userId !== user.id) continue;
    const m = mediaOf(e.activity);
    if (!m) continue;
    rows.push({
      id: e.id,
      activityId: e.activityId,
      category: m.category,
      media: m.media,
      date: e.date,
      rating: e.rating,
      rewatch: e.rewatch,
      review: e.review,
      createdAt: e.createdAt.toISOString(),
    });
  }
  const library: LibraryPick[] = [];
  for (const a of activities as any[]) {
    const m = mediaOf(a);
    if (m) library.push({ activityId: a.id, ...m });
  }
  return { entries: rows, library, today: todayIn(effectiveTimeZone(prefs)) };
}
