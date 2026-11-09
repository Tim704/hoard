// ───────────────────────────────────────────────────────────────────────────
//  Settling recommendations after a recipient's library changed: PENDING turns
//  ADDED when the title arrived after the pick did or a verdict exists (PASSED
//  too, when it arrived after the pass or a verdict exists), and the
//  sender hears about the first verdict, once. With either switch off only the
//  verdict's promotion happens (it changes the row's state and tells nobody), so
//  a held verdict goes out when the switch comes back on.
//
//  Not a server action: it trusts its arguments, like src/lib/library/add.ts.
//  Callers pass the recipient's own id. The per-title helpers never throw, so a
//  failure here can't undo the save that triggered them.
// ───────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';

import { getCategory, type CategorySlug, type FkField } from '@/lib/categories';
import { catalogueKeyOf, loadMediaRow } from '@/lib/data-compare';
import { mutuallyOptedIn, personSelect, titleWhere } from '@/lib/data-recommendations';
import { notify } from '@/lib/notify';
import { parsePrefs } from '@/lib/prefs';
import { prisma } from '@/lib/prisma';
import { verdictOf } from '@/lib/recommendations';
import type { Status } from '@/lib/status';
import { displayTitle } from '@/lib/title';

const rowSelect = {
  id: true,
  category: true,
  mediaId: true,
  response: true,
  createdAt: true,
  respondedAt: true,
  verdictNotifiedAt: true,
  from: personSelect,
  to: personSelect,
} as const;

type SettleRow = Prisma.RecommendationGetPayload<{ select: typeof rowSelect }>;

/** Settle one row. True when it sent the verdict notification. */
async function settleRow(row: SettleRow): Promise<boolean> {
  const cat = getCategory(row.category);
  if (!cat) return false;

  const recipient = await prisma.userMediaActivity.findFirst({
    where: { userId: row.to.id, ...titleWhere(cat.slug, row.mediaId) },
    select: { status: true, rating: true, createdAt: true },
  });
  if (!recipient) return false;

  const open = mutuallyOptedIn(row.from, row.to);
  const verdict = verdictOf({ status: recipient.status as Status, rating: recipient.rating });

  // A verdict always moves a PENDING pick on, so it can't fall back to "nothing
  // has happened" if the title is removed later. Otherwise it counts as added
  // only if the title arrived after the pick; one they already had stays PENDING.
  const addedSince = recipient.createdAt.getTime() >= row.createdAt.getTime();
  if (row.response === 'PENDING' && (verdict || (open && addedSince))) {
    await prisma.recommendation.updateMany({
      where: { id: row.id, response: 'PENDING' },
      data: { response: 'ADDED', respondedAt: row.respondedAt ?? new Date() },
    });
  }
  // They passed, then changed their mind: added it after passing, or scored or
  // dropped it anyway. It counts as added, not as passed as well.
  const passedAt = (row.respondedAt ?? row.createdAt).getTime();
  const addedAfterPass = recipient.createdAt.getTime() >= passedAt;
  if (row.response === 'PASSED' && (verdict || (open && addedAfterPass))) {
    await prisma.recommendation.updateMany({
      where: { id: row.id, response: 'PASSED' },
      data: { response: 'ADDED', respondedAt: new Date() },
    });
  }

  if (!open || !verdict || row.verdictNotifiedAt) return false;

  const media = await loadMediaRow(cat, row.mediaId);
  if (!media) return false;

  // Whoever claims the row sends the news; clearing and re-scoring never does.
  const claimedAt = new Date();
  const claim = await prisma.recommendation.updateMany({
    where: { id: row.id, verdictNotifiedAt: null },
    data: { verdictNotifiedAt: claimedAt },
  });
  if (claim.count !== 1) return false;

  const title = displayTitle(media as never, parsePrefs(row.from.prefs).titleLanguage);
  const sent = await notify(row.from.id, {
    kind: 'friends',
    title: `${row.to.username}'s verdict on ${title} is in`,
    body: 'Open Recommendations to see it.',
    url: '/recommendations',
    dedupeKey: `rec-verdict:${row.id}`,
  });
  // The notification couldn't be saved at all: give the claim back, so the
  // next save or the nightly job tries again (the dedupe key still stops a double).
  if (!sent.id && !sent.duplicate) {
    await prisma.recommendation.updateMany({
      where: { id: row.id, verdictNotifiedAt: claimedAt },
      data: { verdictNotifiedAt: null },
    });
    return false;
  }
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
  const key = catalogueKeyOf(activity);
  if (!key) return;
  await settleRecommendationsForTitle(userId, key.cat.slug, key.mediaId);
}

/**
 * The nightly sweep over every pick whose verdict hasn't been announced, which
 * catches scores written by imports and syncs. Rows with a switch off are
 * counted as checked, and their notification is left for a later night.
 */
export async function settleAllRecommendations(): Promise<{ checked: number; notified: number }> {
  const rows = await prisma.recommendation.findMany({ where: { verdictNotifiedAt: null }, select: rowSelect });
  return { checked: rows.length, notified: await settleRows(rows) };
}
