// ───────────────────────────────────────────────────────────────────────────
//  "Mentioned in" (spec 8.5): the user's titles whose notes or diary reviews
//  link to a given title with `[[Title]]`. Server-only; trusts `userId` (the
//  action in src/lib/actions/linked-notes.ts authenticates). Only rows that
//  contain "[[" are read, and everything stays inside the one library (G2).
// ───────────────────────────────────────────────────────────────────────────

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST } from '@/lib/categories';
import { getLibraryIndex, type LibraryIndexEntry } from '@/lib/data-search';
import { mentionsOf, type MentionSource } from '@/lib/linked-notes';

export async function getMentions(userId: string, activityId: string): Promise<LibraryIndexEntry[]> {
  const [notes, reviews, index] = await Promise.all([
    prisma.userMediaActivity.findMany({
      where: { userId, notes: { contains: '[[' } },
      select: { id: true, category: true, notes: true },
    }),
    prisma.diaryEntry.findMany({
      where: { userId, review: { contains: '[[' } },
      select: { activityId: true, review: true, activity: { select: { category: true } } },
    }),
    getLibraryIndex(userId),
  ]);
  const slug = (db: string) => CATEGORY_LIST.find((c) => c.dbCategory === db)?.slug ?? '';
  const sources = new Map<string, MentionSource>();
  const source = (id: string, category: string) => {
    let s = sources.get(id);
    if (!s) sources.set(id, (s = { id, category: slug(category), texts: [] }));
    return s;
  };
  for (const n of notes) source(n.id, n.category).texts.push(n.notes);
  for (const r of reviews) source(r.activityId, r.activity.category).texts.push(r.review);

  const ids = new Set(mentionsOf(activityId, [...sources.values()], index));
  return index.filter((e) => ids.has(e.id));
}
