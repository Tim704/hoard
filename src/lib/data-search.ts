// ───────────────────────────────────────────────────────────────────────────
//  Server-only fetchers for the global search surfaces (spec 2.4–2.6): which
//  provider hits are already in a user's library, and the compact library
//  index the Cmd/Ctrl+K palette searches. Both trust their `userId`; the
//  actions in src/lib/actions/search.ts authenticate first.
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST, getCategory, type CategorySlug } from '@/lib/categories';
import type { Status } from '@/lib/status';

export type LibraryMarks = Record<string, { status: Status; rating: number | null }>;

/** The key a library mark is stored under. */
export const markKey = (slug: CategorySlug, externalId: string) => `${slug}:${externalId}`;

/** Which of these provider hits the user already has, keyed by `markKey`. */
export async function libraryMarks(
  userId: string,
  items: Array<{ slug: CategorySlug; externalId: string }>,
): Promise<LibraryMarks> {
  const bySlug = new Map<CategorySlug, string[]>();
  for (const { slug, externalId } of items) {
    if (!getCategory(slug) || typeof externalId !== 'string') continue;
    bySlug.set(slug, [...(bySlug.get(slug) ?? []), externalId]);
  }
  const marks: LibraryMarks = {};
  await Promise.all(
    [...bySlug].map(async ([slug, ids]) => {
      const cat = getCategory(slug)!;
      const rows: any[] = await prisma.userMediaActivity.findMany({
        where: {
          userId,
          category: cat.dbCategory,
          [cat.prismaModel]: { is: { externalId: { in: [...new Set(ids)] } } },
        } as any,
        select: { status: true, rating: true, [cat.prismaModel]: { select: { externalId: true } } } as any,
      });
      for (const r of rows) {
        marks[markKey(slug, r[cat.prismaModel].externalId)] = { status: r.status, rating: r.rating };
      }
    }),
  );
  return marks;
}

/** One library title in the palette's index (kept small: it is sent whole). */
export interface LibraryIndexEntry {
  id: string;
  category: CategorySlug;
  status: Status;
  title: string;
  titleEnglish?: string;
  titleRomaji?: string;
  titleNative?: string;
  year: number | null;
  imageUrl: string | null;
}

/** Every title in the user's library, newest first, for the palette. */
export async function getLibraryIndex(userId: string): Promise<LibraryIndexEntry[]> {
  const pick = { select: { title: true, year: true, imageUrl: true } };
  const variants = { select: { title: true, year: true, imageUrl: true, titleEnglish: true, titleRomaji: true, titleNative: true } };
  const include = Object.fromEntries(
    CATEGORY_LIST.map((c) => [c.prismaModel, c.slug === 'anime' || c.slug === 'manga' ? variants : pick]),
  );
  const rows: any[] = await prisma.userMediaActivity.findMany({
    where: { userId },
    select: { id: true, category: true, status: true, ...include } as any,
    orderBy: { updatedAt: 'desc' },
  });
  const out: LibraryIndexEntry[] = [];
  for (const r of rows) {
    const cat = CATEGORY_LIST.find((c) => c.dbCategory === r.category);
    const m = cat ? r[cat.prismaModel] : null;
    if (!cat || !m) continue;
    out.push({
      id: r.id,
      category: cat.slug,
      status: r.status,
      title: m.title,
      ...(m.titleEnglish && { titleEnglish: m.titleEnglish }),
      ...(m.titleRomaji && { titleRomaji: m.titleRomaji }),
      ...(m.titleNative && { titleNative: m.titleNative }),
      year: m.year ?? null,
      imageUrl: m.imageUrl ?? null,
    });
  }
  return out;
}
