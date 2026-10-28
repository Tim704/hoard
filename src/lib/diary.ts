// ───────────────────────────────────────────────────────────────────────────
//  The diary (spec 3.1 / 3.4): one DiaryEntry per finished run of a title.
//
//  Rules (pure planners below, the writers at the bottom):
//  - A diary entry is written when the status moves INTO Completed or Retired
//    from a status that isn't finished (FINISHED_STATUSES: Completed, Retired,
//    Dropped). Dropping a title writes none. Moving between finished statuses
//    (Retired → Completed) writes none either: that run was already logged.
//  - The entry is dated today in the user's time zone (G10), carries the
//    score at that moment and `rewatch = activity.rewatching`; the finish then
//    clears `rewatching`. `finishedAt` keeps its first value (updateActivity).
//  - "Watched, then score": a later score change updates the latest entry's
//    score when that entry is dated today and the title is still finished, so
//    finishing and scoring a moment later yields ONE entry with the score.
//    Older entries keep the score they were logged with.
//  - Imports never write a "today" entry: they write the dated entries their
//    log carries (a Letterboxd diary) or one for the finish day, de-duplicated
//    by day against what the activity already has.
//  - The migration job backfills one entry per Completed / Retired activity
//    with a `finishedAt` and no entry yet, dated in the server's TZ.
// ───────────────────────────────────────────────────────────────────────────

import type { Prisma } from '@prisma/client';

import { scoreValue } from '@/lib/events';
import { effectiveTimeZone, type Prefs } from '@/lib/prefs';
import { isYmd, todayYmd } from '@/lib/release';
import { FINISHED_STATUSES, type Status } from '@/lib/status';

/** Statuses whose arrival logs a diary entry. */
export const DIARY_STATUSES: readonly Status[] = ['COMPLETED', 'RETIRED'];

export const isDiaryStatus = (s: string) => (DIARY_STATUSES as readonly string[]).includes(s);
const isFinished = (s: string) => (FINISHED_STATUSES as readonly string[]).includes(s);

/** Today's calendar day in `timeZone`, as YYYY-MM-DD (00:30 in Berlin is still that Berlin day). */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return todayYmd(timeZone, now);
}

/** True when going from `before` to `after` finishes a run (see the rules above). */
export function isFinishTransition(before: string, after: string | undefined): boolean {
  return after !== undefined && after !== before && isDiaryStatus(after) && !isFinished(before);
}

export interface FinishBefore {
  status: string;
  rating: number | null;
  rewatching: boolean;
}

export interface FinishAfter {
  status?: string;
  /** undefined = not being changed. */
  rating?: number | null;
}

export interface LatestEntry {
  id: string;
  date: string;
  rating: number | null;
}

export interface FinishPlan {
  create?: { date: string; rating: number | null; rewatch: boolean };
  /** Set `rewatching` back to false. */
  clearRewatching: boolean;
  /** "Watched, then score": the latest entry (dated today) takes the new score. */
  rescore?: { id: string; rating: number | null };
}

/** What an activity update means for the diary. Pure. */
export function planFinish(
  before: FinishBefore,
  after: FinishAfter,
  today: string,
  latest: LatestEntry | null,
): FinishPlan {
  const rating = after.rating !== undefined ? after.rating : before.rating;
  if (isFinishTransition(before.status, after.status)) {
    return {
      create: { date: today, rating, rewatch: before.rewatching },
      clearRewatching: before.rewatching,
    };
  }
  const status = after.status ?? before.status;
  if (
    after.rating !== undefined &&
    latest &&
    latest.date === today &&
    isDiaryStatus(status) &&
    scoreValue(latest.rating) !== scoreValue(after.rating)
  ) {
    return { clearRewatching: false, rescore: { id: latest.id, rating: after.rating } };
  }
  return { clearRewatching: false };
}

// ── Imports ──────────────────────────────────────────────────────────────────

export interface ImportDiarySource {
  status: string;
  finishedOn?: string | null;
  rating?: number | null;
  review?: string | null;
  diary?: { date: string; rating?: number; rewatch: boolean; review?: string }[];
}

export interface DiaryDraft {
  date: string;
  rating: number | null;
  rewatch: boolean;
  review: string | null;
}

/**
 * The entries an import row writes: its dated log when it has one, else one
 * entry for its finish day (Completed / Retired only). A rewatch count without
 * dates writes nothing. Days the activity already has, and repeats inside
 * the row, are skipped (de-duplicated by day).
 */
export function planImportDiary(existingDates: Iterable<string>, row: ImportDiarySource): DiaryDraft[] {
  const seen = new Set(existingDates);
  const drafts: DiaryDraft[] = [];
  const push = (d: DiaryDraft) => {
    if (!isYmd(d.date) || seen.has(d.date)) return;
    seen.add(d.date);
    drafts.push(d);
  };
  if (row.diary && row.diary.length) {
    for (const e of row.diary) {
      push({ date: e.date, rating: e.rating ?? null, rewatch: e.rewatch === true, review: e.review?.trim() || null });
    }
  } else if (row.finishedOn && isDiaryStatus(row.status)) {
    push({ date: row.finishedOn, rating: row.rating ?? null, rewatch: false, review: row.review?.trim() || null });
  }
  return drafts.sort((a, b) => a.date.localeCompare(b.date));
}

// ── Backfill (migration job) ─────────────────────────────────────────────────

export interface BackfillCandidate {
  id: string;
  userId: string;
  status: string;
  finishedAt: Date | null;
  rating: number | null;
}

/**
 * Entries for finished activities that have none yet (`withEntries` = the
 * activity ids that already have one): one each, dated `finishedAt` in
 * `timeZone`. Running it again over the result plans nothing.
 */
export function planDiaryBackfill(
  rows: BackfillCandidate[],
  withEntries: ReadonlySet<string>,
  timeZone: string,
): Prisma.DiaryEntryCreateManyInput[] {
  return rows
    .filter((r) => r.finishedAt && isDiaryStatus(r.status) && !withEntries.has(r.id))
    .map((r) => ({
      userId: r.userId,
      activityId: r.id,
      date: todayIn(timeZone, r.finishedAt!),
      rating: r.rating,
      rewatch: false,
    }));
}

// ── Writers (server-only; run inside the caller's transaction) ──────────────

type Tx = Prisma.TransactionClient;

/**
 * Log a finish: a diary entry dated today in the user's zone with the current
 * score and the rewatch flag, then clear `rewatching`. Call it only on a
 * finish transition (`isFinishTransition`); `applyDiaryForUpdate` does both.
 */
export async function onFinished(
  tx: Tx,
  activity: { id: string; userId: string; rating: number | null; rewatching: boolean },
  prefs: Pick<Prefs, 'timeZone'>,
  now: Date = new Date(),
) {
  const entry = await tx.diaryEntry.create({
    data: {
      userId: activity.userId,
      activityId: activity.id,
      date: todayIn(effectiveTimeZone(prefs), now),
      rating: activity.rating,
      rewatch: activity.rewatching,
    },
  });
  if (activity.rewatching) {
    await tx.userMediaActivity.update({ where: { id: activity.id }, data: { rewatching: false } });
  }
  return entry;
}

/** The newest entry of an activity (by day, then creation). */
export function latestEntry(tx: Tx, activityId: string) {
  return tx.diaryEntry.findFirst({
    where: { activityId },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, date: true, rating: true, review: true },
  });
}

/**
 * The diary side of an activity update (status and/or score), after the
 * activity row itself was written in the same transaction.
 */
export async function applyDiaryForUpdate(
  tx: Tx,
  before: { id: string; userId: string; status: string; rating: number | null; rewatching: boolean },
  after: FinishAfter,
  prefs: Pick<Prefs, 'timeZone'>,
  now: Date = new Date(),
): Promise<void> {
  const today = todayIn(effectiveTimeZone(prefs), now);
  const finishing = isFinishTransition(before.status, after.status);
  // Only a score change on a finished title can touch an existing entry.
  const latest = !finishing && after.rating !== undefined ? await latestEntry(tx, before.id) : null;
  const plan = planFinish(before, after, today, latest);
  if (plan.create) {
    await onFinished(
      tx,
      { id: before.id, userId: before.userId, rating: plan.create.rating, rewatching: before.rewatching },
      prefs,
      now,
    );
  }
  if (plan.rescore) {
    await tx.diaryEntry.update({ where: { id: plan.rescore.id }, data: { rating: plan.rescore.rating } });
  }
}

/** Write an import row's entries (see `planImportDiary`). Returns how many were written. */
export async function writeImportDiary(
  tx: Tx,
  userId: string,
  activityId: string,
  row: ImportDiarySource,
): Promise<number> {
  const existing = await tx.diaryEntry.findMany({ where: { activityId }, select: { date: true } });
  const drafts = planImportDiary(
    existing.map((e) => e.date),
    row,
  );
  if (!drafts.length) return 0;
  await tx.diaryEntry.createMany({ data: drafts.map((d) => ({ ...d, userId, activityId })) });
  return drafts.length;
}
