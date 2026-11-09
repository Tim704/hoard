// ───────────────────────────────────────────────────────────────────────────
//  Recommendations between friends, read side. Strict privacy (G2):
//    - BOTH users' compareOptIn is re-checked on every read, row by row, and a
//      row with someone switched off is hidden from both people (never deleted);
//    - the other person's activity is read with catalogue key, status and score
//      ONLY, never ids, notes, tiers or dates. Their status reaches a view only
//      as the `waiting` line, their score only inside a verdict (and, in the
//      Send form, only as "has already scored this", which a send would say);
//    - a sender's library isn't read at all for a recipient until a verdict
//      exists, and the guess reaches the recipient only inside a verdict.
// ───────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';

import { CATEGORIES, getCategory, type CategorySlug } from '@/lib/categories';
import { catalogueFields, catalogueKeyOf, fkSelect, loadMedia, loadMediaRow, mediaKey, titleOf } from '@/lib/data-compare';
import { comparableUsers } from '@/lib/data-together';
import { relativeTime } from '@/lib/feed';
import { isManualId } from '@/lib/manual';
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
  /** Where it stands while there is no verdict, from the viewer's side ("On their list", "You passed"). */
  waiting: string | null;
  /** When it was sent, relative to the page load ("3 days ago"). */
  when: string;
  withdrawable: boolean;
  /** The guess I made, on rows I sent; always null on rows sent to me. */
  myGuess: number | null;
}

export type RecommendationsPage =
  | {
      ok: true;
      inbox: RecView[];
      received: RecView[];
      sent: RecView[];
      mine: RecommendationRecord;
      theirs: RecommendationRecord;
      /** The best and worst picks' titles and the recipient's score, by recommendation id. */
      bestWorst: Record<string, { title: string; score: number }>;
      /** How many other people could get a recommendation now (both switches on). */
      friends: number;
    }
  | { ok: false; reason: 'me-off' };

export interface RecommendContext {
  /** `decided`: they've already scored or dropped this title, so a pick would be refused. */
  friends: { username: string; alreadySent: boolean; decided: boolean }[];
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

  const now = new Date();
  const friends = (await comparableUsers(me.id)).length;
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
  const scores = new Map<string, number>();

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
    if (verdict?.score != null) scores.set(r.id, verdict.score);
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
      waiting: verdict ? null : waitingLabel(response, recipient, r.slug, incoming ? 'recipient' : 'sender'),
      when: relativeTime(r.createdAt, now),
      withdrawable: !incoming && canWithdraw(response, recipient),
      myGuess: incoming ? null : r.guess,
    };
    if (!incoming) sent.push(view);
    else if (response === 'PENDING' && !verdict) inbox.push(view);
    else received.push(view);
  }

  const mine = buildRecord(myPicks);
  const theirs = buildRecord(theirPicks);
  const bestWorst: Record<string, { title: string; score: number }> = {};
  for (const id of [mine.bestId, mine.worstId, theirs.bestId, theirs.worstId]) {
    const title = id ? titles.get(id) : undefined;
    const score = id ? scores.get(id) : undefined;
    if (id && title && score != null) bestWorst[id] = { title, score };
  }

  return { ok: true, inbox, received, sent, mine, theirs, bestWorst, friends };
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
  const media = await loadMediaRow(key.cat, key.mediaId);
  // A hand-made entry can't be sent, so offer no friends (the recommender still shows).
  const manual = !!media && isManualId(String(media.externalId));
  const [people, sentRows, receivedRows] = await Promise.all([
    comparableUsers(me.id),
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
  // Who has already made up their mind: status and score only, never notes.
  const decided = new Set<string>();
  if (!manual && people.length > 0) {
    const theirRows = await prisma.userMediaActivity.findMany({
      where: { OR: people.map((p) => ({ userId: p.id, ...titleWhere(key.cat.slug, key.mediaId) })) },
      select: { userId: true, status: true, rating: true },
    });
    for (const row of theirRows) {
      if (verdictOf({ status: row.status as Status, rating: row.rating })) decided.add(row.userId);
    }
  }
  return {
    friends: manual
      ? []
      : people.map((p) => ({ username: p.username, alreadySent: alreadySent.has(p.username), decided: decided.has(p.id) })),
    recommendedBy: receivedRows
      .filter((r) => mutuallyOptedIn(me, r.from))
      .map((r) => ({ from: r.from.username, note: r.note })),
  };
}
