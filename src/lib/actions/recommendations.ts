'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Recommendation actions. Every one re-checks both people's compareOptIn
//  before writing. An unknown, opted-out or own username gets one answer, and
//  a recommendation that isn't yours (or is hidden by a switch) gets the same
//  answer as an id that doesn't exist. Notifications carry only a username and
//  a title, never the note or the guess.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';

import { publicError } from '@/lib/action-error';
import { getCategory } from '@/lib/categories';
import { catalogueKeyOf, fkSelect, loadMediaRow } from '@/lib/data-compare';
import {
  getRecommendContext,
  mutuallyOptedIn,
  readLibraryState,
  type RecommendContext,
} from '@/lib/data-recommendations';
import { isManualId } from '@/lib/manual';
import { notify } from '@/lib/notify';
import { parsePrefs } from '@/lib/prefs';
import { prisma } from '@/lib/prisma';
import { takeActionRate } from '@/lib/rate-limit';
import { canWithdraw, parseRecommendInput, verdictOf, type RecResponse } from '@/lib/recommendations';
import { requireUser } from '@/lib/session';
import { displayTitle } from '@/lib/title';
import type { ActionResult } from '@/lib/types';

const NOT_FOUND: ActionResult = { ok: false, error: 'Not found.' };
const UNAVAILABLE: ActionResult = { ok: false, error: "That user isn't available." };
const ALREADY_SENT: ActionResult = { ok: false, error: "You've already sent them this." };

const isId = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 64;

export async function sendRecommendation(
  activityId: string,
  username: string,
  input: { note?: unknown; guess?: unknown },
): Promise<ActionResult> {
  try {
    const parsed = parseRecommendInput(input ?? {});
    if (!parsed.ok) return { ok: false, error: parsed.error };

    const user = await requireUser();
    const limited = takeActionRate('recommend', user.id);
    if (limited) return { ok: false, error: limited };

    // Only from my own library. The title comes from my row, never the client.
    if (!isId(activityId)) return NOT_FOUND;
    const activity = await prisma.userMediaActivity.findFirst({
      where: { id: activityId, userId: user.id },
      select: { category: true, ...fkSelect },
    });
    const title = activity ? catalogueKeyOf(activity) : null;
    if (!title) return NOT_FOUND;
    const { cat, mediaId } = title;
    const media = await loadMediaRow(cat, mediaId);
    if (!media) return NOT_FOUND;
    if (isManualId(String(media.externalId))) return { ok: false, error: "Hand-made entries can't be sent." };

    // The same answer for unknown, self and opted out: names can't be probed.
    const [me, other] = await Promise.all([
      prisma.user.findUnique({ where: { id: user.id }, select: { id: true, prefs: true } }),
      typeof username === 'string' && username.length > 0 && username.length <= 100
        ? prisma.user.findUnique({ where: { username }, select: { id: true, prefs: true } })
        : null,
    ]);
    if (!other || !mutuallyOptedIn(me, other)) return UNAVAILABLE;

    const key = { fromId: user.id, toId: other.id, category: cat.slug, mediaId };
    const existing = await prisma.recommendation.findUnique({
      where: { fromId_toId_category_mediaId: key },
      select: { id: true },
    });
    if (existing) return ALREADY_SENT;

    if (verdictOf(await readLibraryState(other.id, cat.slug, mediaId))) {
      return { ok: false, error: "They've already made up their mind on this one. See Compare." };
    }

    let id: string;
    try {
      const created = await prisma.recommendation.create({
        data: { ...key, note: parsed.note, guess: parsed.guess },
        select: { id: true },
      });
      id = created.id;
    } catch (err) {
      // A double-click or a second tab: the unique index turned it down.
      if ((err as { code?: string })?.code === 'P2002') return ALREADY_SENT;
      throw err;
    }

    const shown = displayTitle(media as never, parsePrefs(other.prefs).titleLanguage);
    await notify(other.id, {
      kind: 'friends',
      title: `${user.username} recommended ${shown}`,
      body: 'Open Recommendations to see it.',
      url: '/recommendations',
      dedupeKey: `rec-new:${id}`,
    });
    revalidatePath('/recommendations');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: publicError(err, 'Could not send the recommendation.') };
  }
}

/** A recommendation the caller is `role` on, with both switches on; else null. */
async function loadMine(id: unknown, role: 'from' | 'to', userId: string) {
  if (!isId(id)) return null;
  const person = { select: { id: true, prefs: true } } as const;
  const rec = await prisma.recommendation.findUnique({
    where: { id },
    select: { id: true, category: true, mediaId: true, response: true, from: person, to: person },
  });
  if (!rec || rec[role].id !== userId || !mutuallyOptedIn(rec.from, rec.to)) return null;
  return rec;
}

/** The recipient says no thanks. Only a pick that's still PENDING. */
export async function passRecommendation(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const rec = await loadMine(id, 'to', user.id);
    if (!rec) return NOT_FOUND;
    // A double tap or a second tab: already passed is what they asked for.
    if (rec.response === 'PASSED') return { ok: true };
    const { count } = await prisma.recommendation.updateMany({
      where: { id: rec.id, toId: user.id, response: 'PENDING' },
      data: { response: 'PASSED', respondedAt: new Date() },
    });
    if (count !== 1) return NOT_FOUND;
    revalidatePath('/recommendations');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: publicError(err, 'Could not pass on it.') };
  }
}

/** The recipient takes a pass back (Undo, or "Undo pass" later): PASSED → PENDING while there's no verdict. */
export async function unpassRecommendation(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const rec = await loadMine(id, 'to', user.id);
    const cat = rec ? getCategory(rec.category) : undefined;
    if (!rec || !cat) return NOT_FOUND;
    if (rec.response === 'PENDING') return { ok: true };
    const tooLate: ActionResult = { ok: false, error: "You've already answered this one." };
    if (rec.response !== 'PASSED') return tooLate;
    if (verdictOf(await readLibraryState(user.id, cat.slug, rec.mediaId))) return tooLate;
    const { count } = await prisma.recommendation.updateMany({
      where: { id: rec.id, toId: user.id, response: 'PASSED' },
      data: { response: 'PENDING', respondedAt: null },
    });
    if (count !== 1) return tooLate;
    revalidatePath('/recommendations');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: publicError(err, 'Could not undo that.') };
  }
}

/** The sender takes a pick back while nothing has happened to it. */
export async function withdrawRecommendation(id: string): Promise<ActionResult> {
  const tooLate: ActionResult = { ok: false, error: "It's too late to take this back." };
  try {
    const user = await requireUser();
    const rec = await loadMine(id, 'from', user.id);
    const cat = rec ? getCategory(rec.category) : undefined;
    if (!rec || !cat) return NOT_FOUND;
    const recipient = await readLibraryState(rec.to.id, cat.slug, rec.mediaId);
    if (!canWithdraw(rec.response as RecResponse, recipient)) return tooLate;
    const { count } = await prisma.recommendation.deleteMany({
      where: { id: rec.id, fromId: user.id, response: 'PENDING' },
    });
    if (count !== 1) return tooLate;
    revalidatePath('/recommendations');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: publicError(err, 'Could not take it back.') };
  }
}

/** The title view's Send panel loads this when it opens. */
export async function loadRecommendContext(activityId: string): Promise<ActionResult & { context?: RecommendContext }> {
  if (!isId(activityId)) return NOT_FOUND;
  try {
    const user = await requireUser();
    return { ok: true, context: await getRecommendContext(user.id, activityId) };
  } catch (err) {
    return { ok: false, error: publicError(err, 'Could not load your friends.') };
  }
}
