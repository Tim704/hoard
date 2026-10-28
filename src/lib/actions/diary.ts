'use server';

// ───────────────────────────────────────────────────────────────────────────
//  Diary, rewatches, play sessions and ownership (spec 3.1–3.6).
//
//  Every action authenticates, checks that the activity (or the diary entry /
//  session) is the caller's own exactly as src/lib/actions/media.ts does, and
//  returns an ActionResult instead of throwing. Days are YYYY-MM-DD in the
//  user's time zone (G10) and may not lie in the future.
// ───────────────────────────────────────────────────────────────────────────

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { prisma } from '@/lib/prisma';
import { CATEGORY_LIST, type CategorySlug } from '@/lib/categories';
import { getPrefs } from '@/lib/data-prefs';
import { isDiaryStatus, latestEntry, todayIn } from '@/lib/diary';
import { recordEvent, recordEvents, type EventInput } from '@/lib/events';
import { currentSeasonCount } from '@/lib/library/seen-seasons';
import { recordsSeenSeasons } from '@/lib/new-seasons';
import { cleanPlatforms, validFormat } from '@/lib/ownership';
import { effectiveTimeZone } from '@/lib/prefs';
import { normalizeRating } from '@/lib/rating';
import { isYmd } from '@/lib/release';
import { requireUser } from '@/lib/session';
import { revalidateCategory } from '@/lib/actions/shared';
import { stateOf, type ActivityState } from '@/lib/undo';
import type { Status } from '@/lib/status';
import type { ActionResult } from '@/lib/types';

const slugOf = (dbCategory: string): CategorySlug | undefined =>
  CATEGORY_LIST.find((c) => c.dbCategory === dbCategory)?.slug;

/** The caller's own activity, or null. */
async function ownActivity(userId: string, id: unknown) {
  if (typeof id !== 'string' || !id) return null;
  const a = await prisma.userMediaActivity.findUnique({ where: { id } });
  return a && a.userId === userId ? a : null;
}

function refresh(dbCategory: string) {
  const slug = slugOf(dbCategory);
  if (slug) revalidateCategory(slug);
  revalidatePath('/diary');
}

const fail = (err: unknown, fallback: string): ActionResult => ({
  ok: false,
  error: err instanceof Error && err.message ? err.message : fallback,
});

/** A past-or-today day in the user's zone. */
async function dayProblem(userId: string, date: unknown): Promise<string | null> {
  if (!isYmd(date) || date < '1900-01-01') return 'Pick a valid day.';
  const today = todayIn(effectiveTimeZone(await getPrefs(userId)));
  return date > today ? 'That day is still to come.' : null;
}

// ── The details: history, rewatch count, sessions ───────────────────────────

export interface ActivityLog {
  events: { id: string; kind: string; from: string | null; to: string | null; at: string; meta: unknown }[];
  diary: { id: string; date: string; rating: number | null; rewatch: boolean; review: string | null; createdAt: string }[];
  sessions: { id: string; date: string; minutes: number | null; note: string | null }[];
  timeZone: string;
  today: string;
}

/** Everything the details show below the editor, for the caller's own activity. */
export async function getActivityLog(activityId: string): Promise<ActionResult & { log?: ActivityLog }> {
  try {
    const user = await requireUser();
    const a = await ownActivity(user.id, activityId);
    if (!a) return { ok: false, error: 'Not found.' };
    const [events, diary, sessions, prefs] = await Promise.all([
      prisma.activityEvent.findMany({ where: { activityId: a.id }, orderBy: { at: 'desc' }, take: 200 }),
      prisma.diaryEntry.findMany({ where: { activityId: a.id }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
      prisma.playSession.findMany({ where: { activityId: a.id }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] }),
      getPrefs(user.id),
    ]);
    const timeZone = effectiveTimeZone(prefs);
    return {
      ok: true,
      log: {
        events: events.map((e) => ({ id: e.id, kind: e.kind, from: e.from, to: e.to, at: e.at.toISOString(), meta: e.meta ?? null })),
        diary: diary.map((d) => ({
          id: d.id,
          date: d.date,
          rating: d.rating,
          rewatch: d.rewatch,
          review: d.review,
          createdAt: d.createdAt.toISOString(),
        })),
        sessions: sessions.map((s) => ({ id: s.id, date: s.date, minutes: s.minutes, note: s.note })),
        timeZone,
        today: todayIn(timeZone),
      },
    };
  } catch (err) {
    return fail(err, 'Could not load the history.');
  }
}

/**
 * Watch / Read / Play / Listen again (3.1): back to Ongoing as a repeat run.
 * The tier placement stays (hidden while ongoing); progress restarts at 0
 * when it was tracked. Returns the previous state for the Undo toast.
 */
export async function startRewatch(activityId: string): Promise<ActionResult & { previous?: ActivityState }> {
  try {
    const user = await requireUser();
    const a = await ownActivity(user.id, activityId);
    if (!a) return { ok: false, error: 'Not found.' };
    if (!isDiaryStatus(a.status)) return { ok: false, error: 'Only finished titles can start again.' };

    const ids = { userId: user.id, activityId: a.id };
    const events: EventInput[] = [
      { ...ids, kind: 'status', from: a.status, to: 'CONSUMING' },
      { ...ids, kind: 'rewatch', from: a.status, to: 'CONSUMING' },
    ];
    const resetProgress = a.progress != null && a.progress !== 0;
    if (resetProgress) events.push({ ...ids, kind: 'progress', from: String(a.progress), to: '0' });
    // 5.5: starting a show again acknowledges its current seasons.
    const seen = recordsSeenSeasons(a.category, a.status as Status, 'CONSUMING')
      ? { seenSeasonCount: await currentSeasonCount(a.tvShowId) }
      : {};
    await prisma.$transaction([
      prisma.userMediaActivity.update({
        where: { id: a.id },
        data: { status: 'CONSUMING', rewatching: true, ...seen, ...(resetProgress ? { progress: 0 } : {}) },
      }),
      recordEvents(prisma, events),
    ]);
    refresh(a.category);
    return { ok: true, previous: stateOf(a) };
  } catch (err) {
    return fail(err, 'Could not start again.');
  }
}

// ── Diary entries ────────────────────────────────────────────────────────────

const EntryInput = z
  .object({
    date: z.string(),
    rating: z.number().min(0).max(10).nullable(),
    rewatch: z.boolean(),
    review: z.string().max(20_000).nullable(),
  })
  .partial()
  .strict();
type EntryInput = z.infer<typeof EntryInput>;

const cleanReview = (r: string | null | undefined) => (r == null ? r : r.trim() || null);

/** The `review` event for a change of review text (null when unchanged). */
function reviewEvent(ids: { userId: string; activityId: string }, before: string | null, after: string | null): EventInput | null {
  if ((before ?? null) === (after ?? null)) return null;
  return { ...ids, kind: 'review', from: before ? '1' : null, to: after ? '1' : null };
}

/** Log a past (or today's) run of one of the caller's titles by hand (3.4). */
export async function addDiaryEntry(activityId: string, input: EntryInput): Promise<ActionResult & { id?: string }> {
  try {
    const user = await requireUser();
    const parsed = EntryInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Check the entry.' };
    const a = await ownActivity(user.id, activityId);
    if (!a) return { ok: false, error: 'Not found.' };
    const problem = await dayProblem(user.id, parsed.data.date);
    if (problem) return { ok: false, error: problem };

    const review = cleanReview(parsed.data.review) ?? null;
    const rating = parsed.data.rating == null ? null : normalizeRating(parsed.data.rating);
    const created = await prisma.$transaction(async (tx) => {
      const entry = await tx.diaryEntry.create({
        data: {
          userId: user.id,
          activityId: a.id,
          date: parsed.data.date!,
          rating,
          rewatch: parsed.data.rewatch ?? false,
          review,
        },
      });
      const ev = reviewEvent({ userId: user.id, activityId: a.id }, null, review);
      if (ev) await recordEvent(tx, ev);
      return entry;
    });
    refresh(a.category);
    return { ok: true, id: created.id };
  } catch (err) {
    return fail(err, 'Could not add that entry.');
  }
}

/** The caller's own entry with its activity, or null. */
async function ownEntry(userId: string, id: unknown) {
  if (typeof id !== 'string' || !id) return null;
  const e = await prisma.diaryEntry.findUnique({ where: { id }, include: { activity: { select: { userId: true, category: true } } } });
  return e && e.userId === userId && e.activity.userId === userId ? e : null;
}

/** Edit an entry's day, score, rewatch flag or review. */
export async function updateDiaryEntry(id: string, input: EntryInput): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = EntryInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Check the entry.' };
    const e = await ownEntry(user.id, id);
    if (!e) return { ok: false, error: 'Not found.' };
    if (parsed.data.date !== undefined) {
      const problem = await dayProblem(user.id, parsed.data.date);
      if (problem) return { ok: false, error: problem };
    }
    const data: Record<string, unknown> = {};
    if (parsed.data.date !== undefined) data.date = parsed.data.date;
    if (parsed.data.rating !== undefined) data.rating = parsed.data.rating == null ? null : normalizeRating(parsed.data.rating);
    if (parsed.data.rewatch !== undefined) data.rewatch = parsed.data.rewatch;
    const review = cleanReview(parsed.data.review);
    if (review !== undefined) data.review = review;

    await prisma.$transaction(async (tx) => {
      await tx.diaryEntry.update({ where: { id: e.id }, data });
      if (review !== undefined) {
        const ev = reviewEvent({ userId: user.id, activityId: e.activityId }, e.review, review);
        if (ev) await recordEvent(tx, ev);
      }
    });
    refresh(e.activity.category);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not save that entry.');
  }
}

/** Delete an entry (the page confirms first; there is no Undo). */
export async function deleteDiaryEntry(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const e = await ownEntry(user.id, id);
    if (!e) return { ok: false, error: 'Not found.' };
    await prisma.diaryEntry.delete({ where: { id: e.id } });
    refresh(e.activity.category);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not delete that entry.');
  }
}

/** The details' Review field: edits the latest entry's review (3.4). */
export async function setLatestReview(activityId: string, review: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (typeof review !== 'string' || review.length > 20_000) return { ok: false, error: 'That review is too long.' };
    const a = await ownActivity(user.id, activityId);
    if (!a) return { ok: false, error: 'Not found.' };
    const next = review.trim() || null;
    const changed = await prisma.$transaction(async (tx) => {
      const latest = await latestEntry(tx, a.id);
      if (!latest) return null;
      const ev = reviewEvent({ userId: user.id, activityId: a.id }, latest.review, next);
      if (!ev) return false;
      await tx.diaryEntry.update({ where: { id: latest.id }, data: { review: next } });
      await recordEvent(tx, ev);
      return true;
    });
    if (changed === null) return { ok: false, error: 'Finish it first; the review belongs to a diary entry.' };
    refresh(a.category);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not save the review.');
  }
}

// ── Play sessions (games) ────────────────────────────────────────────────────

const SessionInput = z
  .object({
    date: z.string(),
    minutes: z.number().int().min(1).max(24 * 60).nullable(),
    note: z.string().max(500).nullable(),
  })
  .strict();

/** "Log a session" on one of the caller's games (3.6). */
export async function logPlaySession(
  activityId: string,
  input: z.infer<typeof SessionInput>,
): Promise<ActionResult & { id?: string }> {
  try {
    const user = await requireUser();
    const parsed = SessionInput.safeParse(input);
    if (!parsed.success) return { ok: false, error: 'Minutes must be a whole number from 1 to 1440.' };
    const a = await ownActivity(user.id, activityId);
    if (!a) return { ok: false, error: 'Not found.' };
    if (a.category !== 'GAME') return { ok: false, error: 'Sessions are for games.' };
    const problem = await dayProblem(user.id, parsed.data.date);
    if (problem) return { ok: false, error: problem };
    const s = await prisma.playSession.create({
      data: {
        userId: user.id,
        activityId: a.id,
        date: parsed.data.date,
        minutes: parsed.data.minutes,
        note: parsed.data.note?.trim() || null,
      },
    });
    refresh(a.category);
    return { ok: true, id: s.id };
  } catch (err) {
    return fail(err, 'Could not log that session.');
  }
}

export async function deletePlaySession(id: string): Promise<ActionResult> {
  try {
    const user = await requireUser();
    if (typeof id !== 'string' || !id) return { ok: false, error: 'Not found.' };
    const s = await prisma.playSession.findUnique({ where: { id }, include: { activity: { select: { userId: true, category: true } } } });
    if (!s || s.userId !== user.id || s.activity.userId !== user.id) return { ok: false, error: 'Not found.' };
    await prisma.playSession.delete({ where: { id: s.id } });
    refresh(s.activity.category);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not delete that session.');
  }
}

// ── Ownership and format (3.5) ───────────────────────────────────────────────

/** Set a game's owned platforms, or a book / manga / album's format. */
export async function setOwnership(
  activityId: string,
  input: { ownedPlatforms?: string[]; format?: string | null },
): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const a = await ownActivity(user.id, activityId);
    if (!a) return { ok: false, error: 'Not found.' };
    const slug = slugOf(a.category);
    if (!slug) return { ok: false, error: 'Not found.' };
    const data: { ownedPlatforms?: string[]; format?: string | null } = {};
    if (input?.ownedPlatforms !== undefined) {
      if (slug !== 'games') return { ok: false, error: 'Platforms are for games.' };
      data.ownedPlatforms = cleanPlatforms(input.ownedPlatforms);
    }
    if (input?.format !== undefined) {
      if (!validFormat(slug, input.format)) return { ok: false, error: 'Unknown format.' };
      data.format = input.format;
    }
    if (!Object.keys(data).length) return { ok: true };
    await prisma.userMediaActivity.update({ where: { id: a.id }, data });
    revalidateCategory(slug);
    return { ok: true };
  } catch (err) {
    return fail(err, 'Could not save that.');
  }
}
