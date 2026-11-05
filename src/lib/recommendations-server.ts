// ───────────────────────────────────────────────────────────────────────────
//  Settling recommendations after a recipient's library changed: PENDING turns
//  ADDED when the title arrived after the pick did, and the sender hears about
//  the first verdict, once. Nothing here runs for a row with either switch off,
//  so a held verdict goes out when the switch comes back on.
//
//  Not a server action: it trusts its arguments, like src/lib/library/add.ts.
//  Callers pass the recipient's own id. The per-title helpers never throw, so a
//  failure here can't undo the save that triggered them.
// ───────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';

import { CATEGORY_LIST, getCategory, type CategorySlug, type FkField } from '@/lib/categories';
import { mutuallyOptedIn, titleWhere } from '@/lib/data-recommendations';
import { notify } from '@/lib/notify';
import { parsePrefs } from '@/lib/prefs';
import { prisma } from '@/lib/prisma';
import { verdictOf } from '@/lib/recommendations';
import type { Status } from '@/lib/status';
import { displayTitle } from '@/lib/title';

const person = { select: { id: true, username: true, prefs: true } } as const;
const rowSelect = {
  id: true,
  category: true,
  mediaId: true,
  response: true,
  createdAt: true,
  verdictNotifiedAt: true,
  from: person,
  to: person,
} as const;

type SettleRow = Prisma.RecommendationGetPayload<{ select: typeof rowSelect }>;

/** Settle one row. True when it sent the verdict notification. */
async function settleRow(row: SettleRow): Promise<boolean> {
  if (!mutuallyOptedIn(row.from, row.to)) return false;
  const cat = getCategory(row.category);
  if (!cat) return false;

  const recipient = await prisma.userMediaActivity.findFirst({
    where: { userId: row.to.id, ...titleWhere(cat.slug, row.mediaId) },
    select: { status: true, rating: true, createdAt: true },
  });
  if (!recipient) return false;

  // Added because of the pick only if it arrived afterwards. A title they
  // already had stays PENDING until they pass on it or a verdict moves it on.
  if (row.response === 'PENDING' && recipient.createdAt.getTime() >= row.createdAt.getTime()) {
    await prisma.recommendation.updateMany({
      where: { id: row.id, response: 'PENDING' },
      data: { response: 'ADDED', respondedAt: new Date() },
    });
  }

  const verdict = verdictOf({ status: recipient.status as Status, rating: recipient.rating });
  if (!verdict || row.verdictNotifiedAt) return false;

  const model = (prisma as unknown as Record<string, { findUnique: (a: unknown) => Promise<Record<string, unknown> | null> }>)[
    cat.prismaModel
  ];
  const media = await model.findUnique({ where: { id: row.mediaId } });
  if (!media) return false;

  // Whoever claims the row sends the news; clearing and re-scoring never does.
  const claim = await prisma.recommendation.updateMany({
    where: { id: row.id, verdictNotifiedAt: null },
    data: { verdictNotifiedAt: new Date() },
  });
  if (claim.count !== 1) return false;

  const title = displayTitle(media as never, parsePrefs(row.from.prefs).titleLanguage);
  await notify(row.from.id, {
    kind: 'friends',
    title: `${row.to.username}'s verdict on ${title} is in`,
    body: 'Open Recommendations to see it.',
    url: '/recommendations',
    dedupeKey: `rec-verdict:${row.id}`,
  });
  return true;
}

const logFailure = (err: unknown) =>
  console.error('[hoard] settling recommendations failed:', err instanceof Error ? err.message : err);

/** Settle each row in turn; one bad row doesn't stop the others. Returns how many notified. */
async function settleRows(rows: SettleRow[]): Promise<number> {
  let notified = 0;
  for (const row of rows) {
    try {
      if (await settleRow(row)) notified += 1;
    } catch (err) {
      logFailure(err);
    }
  }
  return notified;
}

/** After `userId`'s entry for this title changed. Never throws. */
export async function settleRecommendationsForTitle(userId: string, slug: CategorySlug, mediaId: string): Promise<void> {
  try {
    const rows = await prisma.recommendation.findMany({
      where: { toId: userId, category: slug, mediaId },
      select: rowSelect,
    });
    await settleRows(rows);
  } catch (err) {
    logFailure(err);
  }
}

/** The same, given the activity row (its category and foreign key). Never throws. */
export async function settleRecommendationsForActivity(
  userId: string,
  activity: { category: string } & Partial<Record<FkField, string | null>>,
): Promise<void> {
  const cat = CATEGORY_LIST.find((c) => c.dbCategory === activity.category);
  const mediaId = cat ? activity[cat.fkField] : null;
  if (!cat || !mediaId) return;
  await settleRecommendationsForTitle(userId, cat.slug, mediaId);
}

/**
 * The nightly sweep over every pick whose verdict hasn't been announced, which
 * catches scores written by imports and syncs. Rows with a switch off are
 * counted as checked and left for a later night.
 */
export async function settleAllRecommendations(): Promise<{ checked: number; notified: number }> {
  const rows = await prisma.recommendation.findMany({ where: { verdictNotifiedAt: null }, select: rowSelect });
  return { checked: rows.length, notified: await settleRows(rows) };
}
