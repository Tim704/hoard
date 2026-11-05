// ───────────────────────────────────────────────────────────────────────────
//  Recommendations between friends, read side. Strict privacy (G2):
//    - BOTH users' compareOptIn is re-checked on every read, row by row, and a
//      row with someone switched off is hidden from both people (never deleted);
//    - the other person's activity is read with catalogue key, status and score
//      ONLY, never ids, notes, tiers or dates. Their status reaches a view only
//      as the `waiting` line, their score only inside a verdict;
//    - a sender's library isn't read at all for a recipient until a verdict
//      exists, and the guess reaches the recipient only inside a verdict.
// ───────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';

import { CATEGORIES, getCategory, type CategorySlug } from '@/lib/categories';
import { catalogueFields, catalogueKeyOf, fkSelect, loadMedia, mediaKey, titleOf } from '@/lib/data-compare';
import { comparableUsernames } from '@/lib/data-together';
import { parsePrefs } from '@/lib/prefs';
import { prisma } from '@/lib/prisma';
import {
  buildRecord,
  canWithdraw,
  verdictOf,
  visibleGuess,
  waitingLabel,
  type LibraryState,
  type RecResponse,
  type RecommendationRecord,
  type RecordRow,
  type Verdict,
} from '@/lib/recommendations';
import type { Status } from '@/lib/status';
import { canCompare } from '@/lib/together';

export interface RecView {
  id: string;
  /** The other person's username. */
  other: string;
  note: string | null;
  response: RecResponse;
  createdAt: string;
  slug: CategorySlug;
  title: string;
  imageUrl: string | null;
  year: number | null;
  externalId: string;
  /** The stored title and its variants (the add row's search-hit shape). */
  fields: Record<string, unknown>;
  /** The viewer's OWN activity for this title. */
  myActivityId: string | null;
  verdict: { kind: Verdict['kind']; recipientScore: number | null; guess: number | null; senderScore: number | null } | null;
  /** The sender's line while there is no verdict; always null for the recipient. */
  waiting: string | null;
  withdrawable: boolean;
}

export type RecommendationsPage =
  | {
      ok: true;
      inbox: RecView[];
      received: RecView[];
      sent: RecView[];
      mine: RecommendationRecord;
      theirs: RecommendationRecord;
      bestWorst: Record<string, string>;
    }
  | { ok: false; reason: 'me-off' };

export interface RecommendContext {
  friends: { username: string; alreadySent: boolean }[];
  recommendedBy: { from: string; note: string | null }[];
}

type Person = { id: string; prefs: unknown };

/** Both switches on, and two different people. The gate for every read and write. */
export function mutuallyOptedIn(a: Person | null, b: Person | null): boolean {
  const gate = (p: Person | null) => (p ? { id: p.id, compareOptIn: parsePrefs(p.prefs).compareOptIn } : null);
  return canCompare(gate(a), gate(b));
}

/** Matches one catalogue title among activities (add `userId` to scope it). */
export function titleWhere(slug: CategorySlug, mediaId: string): Prisma.UserMediaActivityWhereInput {
  const cat = CATEGORIES[slug];
  return { category: cat.dbCategory, [cat.fkField]: mediaId };
}

/** One person's entry for a title: status and score only, never notes. */
export async function readLibraryState(userId: string, slug: CategorySlug, mediaId: string): Promise<LibraryState | null> {
  const row = await prisma.userMediaActivity.findFirst({
    where: { userId, ...titleWhere(slug, mediaId) },
    select: { status: true, rating: true },
  });
  return row ? { status: row.status as Status, rating: row.rating } : null;
}

/** A person as the gate and the settling code need them. */
export const personSelect = { select: { id: true, username: true, prefs: true } } as const;

/** The "slug:id" key of an activity row selected with `category` and `fkSelect`. */
function keyOf(row: { category: string }): string | null {
  const key = catalogueKeyOf(row);
  return key && mediaKey(key.cat.slug, key.mediaId);
}

/**
 * Everything /recommendations shows, or `me-off`. `inbox` is to-me, PENDING and
 * with no verdict; `received` is the rest of to-me.
 */
export async function getRecommendationsPage(meId: string): Promise<RecommendationsPage> {
  const me = await prisma.user.findUnique({ where: { id: meId }, select: { id: true, prefs: true } });
  const myPrefs = parsePrefs(me?.prefs);
  if (!me || !myPrefs.compareOptIn) return { ok: false, reason: 'me-off' };

  const rows = await prisma.recommendation.findMany({
    where: { OR: [{ fromId: me.id }, { toId: me.id }] },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      category: true,
      mediaId: true,
      note: true,
      guess: true,
      response: true,
      createdAt: true,
      from: personSelect,
      to: personSelect,
    },
  });
  const visible = rows.flatMap((r) => {
    const cat = getCategory(r.category);
    return cat && mutuallyOptedIn(r.from, r.to) ? [{ ...r, slug: cat.slug, key: mediaKey(cat.slug, r.mediaId) }] : [];
  });

  // My own entries, for my scores, my verdicts as a recipient and myActivityId.
  const mineByTitle = new Map<string, LibraryState & { id: string }>();
  if (visible.length > 0) {
    const mineRows = await prisma.userMediaActivity.findMany({
      where: { userId: me.id, OR: visible.map((r) => titleWhere(r.slug, r.mediaId)) },
      select: { id: true, category: true, status: true, rating: true, ...fkSelect },
    });
    for (const row of mineRows) {
      const key = keyOf(row);
      if (key) mineByTitle.set(key, { id: row.id, status: row.status as Status, rating: row.rating });
    }
  }

  // The other person's entry, only where the viewer may learn from it: a
  // recipient's for the sender, a sender's for a recipient once there's a verdict.
  const wanted = visible.flatMap((r) => {
    if (r.from.id === me.id) return [{ userId: r.to.id, slug: r.slug, mediaId: r.mediaId }];
    return verdictOf(mineByTitle.get(r.key) ?? null) ? [{ userId: r.from.id, slug: r.slug, mediaId: r.mediaId }] : [];
  });
  const theirsByTitle = new Map<string, LibraryState>();
  if (wanted.length > 0) {
    const theirRows = await prisma.userMediaActivity.findMany({
      where: { OR: wanted.map((w) => ({ userId: w.userId, ...titleWhere(w.slug, w.mediaId) })) },
      select: { userId: true, category: true, status: true, rating: true, ...fkSelect },
    });
    for (const row of theirRows) {
      const key = keyOf(row);
      if (key) theirsByTitle.set(`${row.userId}:${key}`, { status: row.status as Status, rating: row.rating });
    }
  }

  const media = await loadMedia(visible);
  const inbox: RecView[] = [];
  const received: RecView[] = [];
  const sent: RecView[] = [];
  const myPicks: RecordRow[] = [];
  const theirPicks: RecordRow[] = [];
  const titles = new Map<string, string>();

  for (const r of visible) {
    const m = media.get(r.key);
    const externalId = typeof m?.externalId === 'string' ? m.externalId : null;
    if (!m || !externalId) continue;

    const incoming = r.to.id === me.id;
    const other = incoming ? r.from : r.to;
    const myEntry = mineByTitle.get(r.key) ?? null;
    const theirEntry = theirsByTitle.get(`${other.id}:${r.key}`) ?? null;
    const recipient: LibraryState | null = incoming ? myEntry : theirEntry;
    const sender: LibraryState | null = incoming ? theirEntry : myEntry;
    const response = r.response as RecResponse;
    const verdict = verdictOf(recipient);
    const shown = titleOf(r.slug, m, myPrefs);

    titles.set(r.id, shown.title);
    (incoming ? theirPicks : myPicks).push({ id: r.id, response, guess: r.guess, recipient, createdAt: r.createdAt });

    const view: RecView = {
      id: r.id,
      other: other.username,
      note: r.note,
      response,
      createdAt: r.createdAt.toISOString(),
      ...shown,
      externalId,
      fields: catalogueFields(m, externalId),
      myActivityId: myEntry?.id ?? null,
      verdict: verdict && {
        kind: verdict.kind,
        recipientScore: verdict.score,
        guess: visibleGuess(r.guess, verdict),
        senderScore: sender?.rating ?? null,
      },
      waiting: !incoming && !verdict ? waitingLabel(response, recipient, r.slug) : null,
      withdrawable: !incoming && canWithdraw(response, recipient),
    };
    if (!incoming) sent.push(view);
    else if (response === 'PENDING' && !verdict) inbox.push(view);
    else received.push(view);
  }

  const mine = buildRecord(myPicks);
  const theirs = buildRecord(theirPicks);
  const bestWorst: Record<string, string> = {};
  for (const id of [mine.bestId, mine.worstId, theirs.bestId, theirs.worstId]) {
    const title = id ? titles.get(id) : undefined;
    if (id && title) bestWorst[id] = title;
  }

  return { ok: true, inbox, received, sent, mine, theirs, bestWorst };
}

/** What the title view's Send panel needs. Empty when I'm off or the activity isn't mine. */
export async function getRecommendContext(meId: string, activityId: string): Promise<RecommendContext> {
  const me = await prisma.user.findUnique({ where: { id: meId }, select: { id: true, prefs: true } });
  if (!me || !parsePrefs(me.prefs).compareOptIn) return { friends: [], recommendedBy: [] };

  const activity = await prisma.userMediaActivity.findFirst({
    where: { id: activityId, userId: me.id },
    select: { category: true, ...fkSelect },
  });
  const key = activity ? catalogueKeyOf(activity) : null;
  if (!key) return { friends: [], recommendedBy: [] };

  const title = { category: key.cat.slug, mediaId: key.mediaId };
  const [usernames, sentRows, receivedRows] = await Promise.all([
    comparableUsernames(me.id),
    prisma.recommendation.findMany({
      where: { fromId: me.id, ...title },
      select: { to: { select: { username: true } } },
    }),
    prisma.recommendation.findMany({
      where: { toId: me.id, ...title },
      orderBy: { createdAt: 'desc' },
      select: { note: true, from: personSelect },
    }),
  ]);
  const alreadySent = new Set(sentRows.map((r) => r.to.username));
  return {
    friends: usernames.map((username) => ({ username, alreadySent: alreadySent.has(username) })),
    recommendedBy: receivedRows
      .filter((r) => mutuallyOptedIn(me, r.from))
      .map((r) => ({ from: r.from.username, note: r.note })),
  };
}
